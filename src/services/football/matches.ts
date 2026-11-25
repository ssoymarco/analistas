/**
 * football/matches.ts
 *
 * Matches as the app reads them from Firestore (`fb_matches`,
 * `fb_match_details`, `fb_match_previews` — written by the Cloud Functions in
 * functions/src/football). Real-time where it matters (lists, live scores, an
 * open match), one-shot elsewhere.
 *
 * A day is the DEVICE-LOCAL day: fixtures are selected by kickoff `timestamp`
 * between local midnight and the next, never by the UTC `date` field.
 *
 * The day list is loaded in two tiers so an ordinary app open doesn't download
 * every fixture on the planet:
 *   - curated leagues (popularity ≥ CURATED_MIN_POPULARITY) — subscribed at once;
 *   - every other league — subscribed only when the user gets that far.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection, doc, getCountFromServer, getDoc, getDocs, limit, onSnapshot, orderBy, query, where,
  type QueryConstraint, type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import { matchDetailNeedsFetch } from '../../../functions/src/shared/football/freshness';
import { getFootballLeague } from '../../../functions/src/shared/football/leagues';
import type {
  FbMatchDetailDoc, FbMatchDoc, FbMatchPreviewDoc,
} from '../../../functions/src/shared/football/model';
import type { League, Match, MatchDetail } from '../../data/types';
import { localDayRange } from './base';
import { detailFromFb, matchFromFb } from './mappers';
import { callOnDemand, loadCached } from './onDemand';

const MATCHES = 'fb_matches';
const DETAILS = 'fb_match_details';
const PREVIEWS = 'fb_match_previews';

/** Curated leagues score 5-100; the heuristic for the rest tops out at 4. */
export const CURATED_MIN_POPULARITY = 5;

// ── Grouping ─────────────────────────────────────────────────────────────────

export interface LeagueWithMatches extends League {
  matches: Match[];
  /** False for the ~1,200 leagues outside the curated catalog. */
  curated?: boolean;
}

/** Group matches by league, keeping the order in which leagues first appear. */
export function groupMatchesByLeague(matches: Match[]): LeagueWithMatches[] {
  const leagues: LeagueWithMatches[] = [];
  const byId = new Map<string, LeagueWithMatches>();
  for (const m of matches) {
    let lw = byId.get(m.leagueId);
    if (!lw) {
      const config = getFootballLeague(m.leagueId);
      lw = {
        id: m.leagueId,
        name: m.league,
        country: config?.country ?? m.leagueCountry ?? '',
        logo: m.leagueLogo || config?.flag || '⚽',
        curated: !!config,
        matches: [],
      };
      byId.set(m.leagueId, lw);
      leagues.push(lw);
    }
    lw.matches.push(m);
  }
  return leagues;
}

// ── Local cache (instant first paint) ────────────────────────────────────────
//
// The Firebase web SDK has no persistent cache on React Native, so a cold
// start would wait for the network before showing anything. We mirror the
// last list per query in AsyncStorage and paint it immediately.

const CACHE_PREFIX = 'cache:fb:matches:';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_WRITE_INTERVAL_MS = 20_000;

async function readMatchCache(key: string): Promise<Match[] | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: Match[]; at: number };
    if (typeof parsed?.at !== 'number' || Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return Array.isArray(parsed.data) ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Throttled writer: live lists change every few seconds; persisting each change would thrash storage. */
function makeCacheWriter(key: string): { write: (data: Match[]) => void; flush: () => void } {
  let lastWrite = 0;
  let pending: Match[] | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const persist = () => {
    timer = null;
    if (!pending) return;
    const data = pending;
    pending = null;
    lastWrite = Date.now();
    AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, at: lastWrite })).catch(() => {});
  };
  return {
    write: data => {
      pending = data;
      if (timer) return;
      const wait = Math.max(0, CACHE_WRITE_INTERVAL_MS - (Date.now() - lastWrite));
      timer = setTimeout(persist, wait);
    },
    flush: () => {
      if (timer) { clearTimeout(timer); timer = null; }
      persist();
    },
  };
}

// ── Day lists ────────────────────────────────────────────────────────────────

type Tier = 'curated' | 'other';

function dayConstraints(localDate: string, tier: Tier): QueryConstraint[] {
  const { start, end } = localDayRange(localDate);
  return [
    where('timestamp', '>=', start),
    where('timestamp', '<', end),
    tier === 'curated'
      ? where('popularity', '>=', CURATED_MIN_POPULARITY)
      : where('popularity', '<', CURATED_MIN_POPULARITY),
    orderBy('timestamp', 'asc'),
  ];
}

function subscribeDayTier(
  localDate: string,
  tier: Tier,
  onChange: (matches: Match[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const cacheKey = `day:${localDate}:${tier}`;
  const cache = makeCacheWriter(cacheKey);
  let live = false;
  readMatchCache(cacheKey).then(cached => { if (cached && !live) onChange(cached); });

  const unsub = onSnapshot(
    query(collection(db, MATCHES), ...dayConstraints(localDate, tier)),
    snap => {
      live = true;
      const matches = snap.docs.map(d => matchFromFb(d.data() as FbMatchDoc));
      onChange(matches);
      cache.write(matches);
    },
    err => onError?.(err),
  );
  return () => { unsub(); cache.flush(); };
}

/** Real-time fixtures of a local day in the curated leagues. */
export function subscribeFixturesByDate(
  localDate: string,
  onChange: (matches: Match[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return subscribeDayTier(localDate, 'curated', onChange, onError);
}

/** Real-time fixtures of a local day in every league outside the curated catalog. */
export function subscribeOtherFixturesByDate(
  localDate: string,
  onChange: (matches: Match[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return subscribeDayTier(localDate, 'other', onChange, onError);
}

/** How many fixtures the non-curated tier has that day (one aggregate read, no documents). */
export async function countOtherFixturesByDate(localDate: string): Promise<number> {
  const { start, end } = localDayRange(localDate);
  const snap = await getCountFromServer(query(
    collection(db, MATCHES),
    where('timestamp', '>=', start),
    where('timestamp', '<', end),
    where('popularity', '<', CURATED_MIN_POPULARITY),
    orderBy('timestamp', 'asc'), // same (timestamp, popularity) index as the list queries
  ));
  return snap.data().count;
}

/** One-shot: every fixture of a local day, all leagues. */
export async function getFixturesByDate(localDate: string): Promise<Match[]> {
  const { start, end } = localDayRange(localDate);
  const snap = await getDocs(query(
    collection(db, MATCHES),
    where('timestamp', '>=', start),
    where('timestamp', '<', end),
    orderBy('timestamp', 'asc'),
  ));
  return snap.docs.map(d => matchFromFb(d.data() as FbMatchDoc));
}

// ── Team fixtures inside the synced window ───────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Fixtures of the given teams with kickoff in [fromSec, toSec), from
 * `fb_matches` (yesterday … +14 days are always there, live scores included).
 * Two queries per 30 teams (home side, away side).
 */
export async function getTeamsFixturesBetween(teamIds: string[], fromSec: number, toSec: number): Promise<Match[]> {
  const ids = [...new Set(teamIds.map(String))].filter(Boolean);
  if (!ids.length) return [];
  const byId = new Map<string, Match>();
  await Promise.all(chunk(ids, 30).flatMap(group =>
    (['homeTeam.id', 'awayTeam.id'] as const).map(async field => {
      const snap = await getDocs(query(
        collection(db, MATCHES),
        where(field, 'in', group),
        where('timestamp', '>=', fromSec),
        where('timestamp', '<', toSec),
        orderBy('timestamp', 'asc'),
      ));
      for (const d of snap.docs) {
        const m = matchFromFb(d.data() as FbMatchDoc);
        byId.set(m.id, m);
      }
    })));
  return [...byId.values()].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
}

/** Fixtures of the given teams on a local day (covers followed teams in non-curated leagues). */
export function getTeamsFixturesByDate(teamIds: string[], localDate: string): Promise<Match[]> {
  const { start, end } = localDayRange(localDate);
  return getTeamsFixturesBetween(teamIds, start, end);
}

/** Fixtures of one league with kickoff in [fromSec, toSec) — the fresh overlay for a cached season calendar. */
export async function getLeagueFixturesBetween(leagueId: string | number, fromSec: number, toSec: number): Promise<Match[]> {
  const snap = await getDocs(query(
    collection(db, MATCHES),
    where('leagueId', '==', String(leagueId)),
    where('timestamp', '>=', fromSec),
    where('timestamp', '<', toSec),
    orderBy('timestamp', 'asc'),
    limit(400),
  ));
  return snap.docs.map(d => matchFromFb(d.data() as FbMatchDoc));
}

// ── Live ─────────────────────────────────────────────────────────────────────

const LIVE_STATUSES = ['live', 'interrupted'];

/** One-shot: matches in play right now, all leagues. */
export async function getLivescores(): Promise<Match[]> {
  const snap = await getDocs(query(collection(db, MATCHES), where('status', 'in', LIVE_STATUSES)));
  return snap.docs.map(d => matchFromFb(d.data() as FbMatchDoc));
}

/** Real-time: matches in play right now, all leagues. */
export function subscribeLivescores(
  onChange: (matches: Match[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const cache = makeCacheWriter('live');
  let live = false;
  readMatchCache('live').then(cached => { if (cached && !live) onChange(cached); });
  const unsub = onSnapshot(
    query(collection(db, MATCHES), where('status', 'in', LIVE_STATUSES)),
    snap => {
      live = true;
      const matches = snap.docs.map(d => matchFromFb(d.data() as FbMatchDoc));
      onChange(matches);
      cache.write(matches);
    },
    err => onError?.(err),
  );
  return () => { unsub(); cache.flush(); };
}

// ── Match detail ─────────────────────────────────────────────────────────────

export interface MatchDetailSubscription {
  /** The match row (score, status, clock). Null until the row is known. */
  match: Match | null;
  /** Events, lineups, statistics, H2H… assembled from whatever has arrived so far. */
  detail: MatchDetail | null;
  /** True once the row snapshot arrived (the screen can stop showing a skeleton). */
  ready: boolean;
}

/** While a match without poller coverage is open and in play, re-check its detail this often. */
const LIVE_RECHECK_MS = 60_000;

/**
 * Everything behind the match screen, in real time:
 *   fb_matches/{id}          score · status · clock      (server pushes every change)
 *   fb_match_details/{id}    events · lineups · stats     (poller for big leagues; fetched
 *                                                          on demand for the rest)
 *   fb_match_previews/{id}   H2H · absences · form · prediction · stadium (on demand)
 *
 * The callback fires whenever any of the three changes. The on-demand fetches
 * are triggered here following the shared freshness rules, so opening a match
 * of a league the poller doesn't enrich still fills in — once for everybody.
 */
export function subscribeMatchDetail(
  matchId: string,
  onChange: (sub: MatchDetailSubscription) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  let row: FbMatchDoc | null = null;
  let rowKnown = false;
  let detail: FbMatchDetailDoc | null = null;
  let detailKnown = false;
  let preview: FbMatchPreviewDoc | null = null;
  let closed = false;
  let fetching = false;
  let lastFetchAt = 0;
  let previewRequested = false;

  const emit = () => {
    if (closed || !rowKnown) return;
    const match = row ? matchFromFb(row) : null;
    onChange({
      match,
      detail: match ? detailFromFb(match, row, detail, preview) : null,
      ready: true,
    });
  };

  const maybeFetchDetail = () => {
    if (closed || fetching || !rowKnown || !detailKnown) return;
    const now = Date.now();
    if (now - lastFetchAt < 20_000) return; // never hammer the function
    if (!matchDetailNeedsFetch(row, detail, now)) return;
    fetching = true;
    lastFetchAt = now;
    // The function writes the docs; the snapshots above deliver them.
    callOnDemand({ kind: 'match', id: matchId })
      .catch(() => { /* offline or budget reached — keep what we have */ })
      .finally(() => { fetching = false; });
  };

  const maybeLoadPreview = () => {
    if (closed || previewRequested || !row) return;
    previewRequested = true;
    loadCached<FbMatchPreviewDoc>(`${PREVIEWS}/${matchId}`, { kind: 'matchPreview', id: matchId }, {
      onStale: stale => { if (!closed) { preview = stale; emit(); } },
    })
      .then(doc => { if (!closed) { preview = doc; emit(); } })
      .catch(() => { /* preview is optional */ });
  };

  const unsubRow = onSnapshot(
    doc(db, MATCHES, matchId),
    snap => {
      row = snap.exists() ? (snap.data() as FbMatchDoc) : null;
      rowKnown = true;
      emit();
      maybeFetchDetail();
      maybeLoadPreview();
    },
    err => onError?.(err),
  );
  const unsubDetail = onSnapshot(
    doc(db, DETAILS, matchId),
    snap => {
      detail = snap.exists() ? (snap.data() as FbMatchDetailDoc) : null;
      detailKnown = true;
      emit();
      maybeFetchDetail();
    },
    () => { detailKnown = true; maybeFetchDetail(); },
  );
  const timer = setInterval(maybeFetchDetail, LIVE_RECHECK_MS);

  return () => {
    closed = true;
    clearInterval(timer);
    unsubRow();
    unsubDetail();
  };
}

/** One-shot match row (deep links, notification taps). Fetches it on demand when it isn't stored. */
export async function getMatch(matchId: string): Promise<Match | null> {
  try {
    const snap = await getDoc(doc(db, MATCHES, String(matchId)));
    if (snap.exists()) return matchFromFb(snap.data() as FbMatchDoc);
  } catch { /* fall through to the function */ }
  try {
    const res = await callOnDemand<{ match: FbMatchDoc | null }>({ kind: 'match', id: matchId });
    return res.match ? matchFromFb(res.match) : null;
  } catch {
    return null;
  }
}
