/**
 * football/on-demand.ts
 *
 * Data fetched the first time somebody asks for it (the `fbOnDemand` callable)
 * instead of on a schedule: team pages, player pages, match previews, season
 * calendars, tables of leagues the scheduled sync doesn't cover, search.
 *
 * Contract with the app (shapes in shared/football/model.ts):
 *   1. the app reads the Firestore doc directly;
 *   2. only when it is missing or past `expiresAt` it calls the function;
 *   3. the function re-checks freshness itself (it is the authority), asks
 *      API-Sports, stores the doc with a TTL and returns it.
 *
 * So API-Sports is hit once per document per TTL no matter how many users
 * open the screen, and the provider key never leaves the server.
 *
 * QUOTA: on-demand work must never starve the live poller. Every fetch first
 * checks the day's remaining requests against a reserve sized for the rest of
 * the day's polling (see `onDemandReserve`). When the reserve is reached the
 * function serves the stale doc if there is one, or fails with
 * `resource-exhausted` — live scores and pushes keep working either way.
 */

import { HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { admin, db } from '../admin-init';
import {
  FbTtl, isExpired, isOutsideSyncWindow, matchDetailNeedsFetch, matchPreviewTtlMs, ON_DEMAND_DAY_RANGE,
  utcDayOffset,
} from '../shared/football/freshness';
import { LEAGUE_POPULARITY } from '../shared/football/leagues';
import legacyPlayerMap from '../shared/football/legacyPlayerMap.json';
import { mapLegacyTeamId } from '../shared/football/legacy';
import type {
  FbCached, FbCatalogEntry, FbCoachDoc, FbLeagueDoc, FbLeagueFixturesDoc, FbLegacyPlayerDoc,
  FbMatchDetailDoc, FbMatchDoc, FbMatchPreviewDoc, FbOnDemandKind, FbPlayerDoc, FbSearchDoc,
  FbStandingsDoc, FbTeamDoc, FbTeamFixturesDoc, FbTeamStatsDoc, FbTopPlayersDoc, FbVenue, FbVenueDoc,
} from '../shared/football/model';
import { afGet, quotaState } from './apisports';
import type {
  AfCoachEntry, AfFixtureCore, AfFixtureFull, AfInjuryEntry, AfLeagueFull, AfPlayerProfileEntry,
  AfPlayerSeasonEntry, AfPlayerTeamsEntry, AfPredictionEntry, AfSquadEntry, AfStandingsResponse,
  AfTeamEntry, AfTeamSeasonStats, AfTopPlayerEntry, AfVenue,
} from './apisports-types';
import {
  isFinishedShort, isLiveShort, mapFixtureToDetail, mapFixtureToMatch, mapStandings, mapTopPlayers,
} from './mapping';
import {
  capFixtures, mapAbsences, mapCoach, mapForm, mapH2H, mapLeague, mapPlayer, mapPrediction,
  mapSearchPlayers, mapSearchTeams, mapTeam, mapTeamStats, mapVenue, toFixtureLite,
} from './on-demand-mapping';
import { COL, loadQuota, saveQuota } from './store';
import { syncFootballFixtures } from './sync-fixtures';

const DAY_MS = 86_400_000;
/** Firestore caps a document at 1 MB; ~450 B per slim fixture row. */
const MAX_SEASON_FIXTURES = 1_400;

const LEGACY_PLAYER_MAP = legacyPlayerMap as Record<string, number>;

// ── Quota guard ──────────────────────────────────────────────────────────────

/**
 * Requests to keep untouched for the scheduled pipeline for the rest of the
 * UTC day: ~3 calls per remaining minute (live polls + enrichment + fixture
 * sync at a busy-evening rate) plus a fixed cushion. Early in the day this
 * leaves ~3,000 of the Pro plan's 7,500 for on-demand work; the share grows as
 * the day goes by and the real polling stays under the worst case.
 */
export function onDemandReserve(nowMs: number): number {
  const minuteOfDay = Math.floor((nowMs % DAY_MS) / 60_000);
  return Math.round((1440 - minuteOfDay) * 3) + 200;
}

function sameUtcDay(a: number, b: number): boolean {
  return Math.floor(a / DAY_MS) === Math.floor(b / DAY_MS);
}

/** Requests left today as far as we know (Infinity when never observed). */
async function remainingToday(nowMs: number): Promise<number> {
  // This instance's own reading, when recent, is the freshest.
  if (quotaState.observedAt > 0 && nowMs - quotaState.observedAt < 120_000 && Number.isFinite(quotaState.remainingDay)) {
    return quotaState.remainingDay;
  }
  const q = await loadQuota().catch(() => null);
  if (!q) return Number.POSITIVE_INFINITY;
  // A reading from yesterday means nothing was spent yet today.
  return sameUtcDay(q.at, nowMs) ? q.remainingDay : (q.limitDay || Number.POSITIVE_INFINITY);
}

/** Calls kept free every minute for the live poller (the plan allows 300/min). */
const MINUTE_RESERVE = 80;
/** Extra headroom low-priority work (search) must leave for pages and matches. */
const LOW_PRIORITY_MARGIN = 500;

export async function budgetAllows(cost: number, nowMs: number, margin = 0): Promise<boolean> {
  // Per-minute limit, shared with the poller: back off when this instance's
  // last reading (if recent) shows the minute is nearly spent.
  if (quotaState.observedAt > 0 && Date.now() - quotaState.observedAt < 60_000
    && Number.isFinite(quotaState.remainingMinute) && quotaState.remainingMinute - cost < MINUTE_RESERVE) {
    return false;
  }
  const remaining = await remainingToday(nowMs);
  return remaining - cost - margin >= onDemandReserve(nowMs);
}

// ── Single flight ────────────────────────────────────────────────────────────

/**
 * Requests for the same thing that arrive while one is being built (a big
 * match's preview expiring with thousands of people on it) share that one
 * build instead of each calling the provider. Per instance — enough, since an
 * instance serves many concurrent requests.
 */
const inflight = new Map<string, Promise<unknown>>();

function singleFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const p = run().finally(() => { inflight.delete(key); });
  inflight.set(key, p);
  return p;
}

// ── Unknown ids ──────────────────────────────────────────────────────────────

/** How long an id the provider doesn't know is answered without asking again. */
const NOT_FOUND_TTL_MS = 6 * 3600_000;
const notFoundRef = (path: string) => db.doc(`${COL.meta}/nf_${path.replace(/[^A-Za-z0-9_]/g, '_')}`);

async function isKnownMissing(path: string, nowMs: number): Promise<boolean> {
  const s = await notFoundRef(path).get().catch(() => null);
  return !!s?.exists && nowMs < Number(s.data()?.expiresAt ?? 0);
}

async function persistQuota(): Promise<void> {
  if (quotaState.observedAt > 0 && Number.isFinite(quotaState.remainingDay)) {
    await saveQuota({ limitDay: quotaState.limitDay, remainingDay: quotaState.remainingDay, at: quotaState.observedAt })
      .catch(() => {});
  }
}

// ── Cache helper ─────────────────────────────────────────────────────────────

type Body<T> = Omit<T, 'fetchedAt' | 'expiresAt'>;

interface BuildResult<T> {
  doc: Body<T>;
  ttlMs: number;
}

/**
 * Read-through cache for one Firestore document.
 *  - fresh doc → returned as is (no provider call);
 *  - otherwise `build` runs (if the quota reserve allows `cost` calls) and the
 *    result is stored with its TTL;
 *  - on a provider failure or an exhausted budget the stale doc is returned
 *    when there is one.
 */
function cached<T extends FbCached>(
  path: string,
  nowMs: number,
  cost: number,
  build: (prev: T | null) => Promise<BuildResult<T>>,
  margin = 0,
): Promise<T> {
  return singleFlight(path, () => buildCached(path, nowMs, cost, build, margin));
}

async function buildCached<T extends FbCached>(
  path: string,
  nowMs: number,
  cost: number,
  build: (prev: T | null) => Promise<BuildResult<T>>,
  margin: number,
): Promise<T> {
  const ref = db.doc(path);
  const snap = await ref.get();
  const prev = (snap.exists ? snap.data() : null) as T | null;
  if (prev && !isExpired(prev, nowMs)) return prev;
  // An id the provider recently said it doesn't have: don't pay to hear it again.
  if (!prev && await isKnownMissing(path, nowMs)) throw new HttpsError('not-found', 'Not found');

  if (!(await budgetAllows(cost, nowMs, margin))) {
    if (prev) return prev;
    logger.warn('fbOnDemand: quota reserve reached', { path, cost, reserve: onDemandReserve(nowMs) });
    throw new HttpsError('resource-exhausted', 'Daily data budget reached — try again later.');
  }

  let built: BuildResult<T>;
  try {
    built = await build(prev);
  } catch (err) {
    await persistQuota();
    if (err instanceof HttpsError) {
      if (prev && err.code !== 'not-found' && err.code !== 'invalid-argument') return prev;
      if (!prev && err.code === 'not-found') {
        await notFoundRef(path).set({ path, at: nowMs, expiresAt: nowMs + NOT_FOUND_TTL_MS }).catch(() => {});
      }
      throw err;
    }
    if (prev) {
      logger.warn('fbOnDemand: provider failed, serving stale', { path, err: String(err) });
      return prev;
    }
    logger.error('fbOnDemand: provider failed', { path, err: String(err) });
    throw new HttpsError('unavailable', 'Could not load this right now.');
  }

  const doc = { ...built.doc, fetchedAt: nowMs, expiresAt: nowMs + built.ttlMs } as T;
  await ref.set({ ...doc, updatedAt: admin.firestore.Timestamp.now() });
  await persistQuota();
  return doc;
}

// ── Input validation ─────────────────────────────────────────────────────────

function idParam(v: unknown, name: string): number {
  const n = typeof v === 'string' && /^\d{1,9}$/.test(v) ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0 || n > 999_999_999) {
    throw new HttpsError('invalid-argument', `${name} must be a positive integer`);
  }
  return n;
}

function seasonParam(v: unknown, nowMs: number): number {
  const n = idParam(v, 'season');
  const maxYear = new Date(nowMs).getUTCFullYear() + 1;
  if (n < 2008 || n > maxYear) throw new HttpsError('invalid-argument', 'season out of range');
  return n;
}

/** Lowercase ASCII letters/digits/spaces — the only characters API-Sports' search accepts. */
export function normalizeSearch(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 40);
}

// ── League catalog (current season per league) ───────────────────────────────

let catalogCache: { at: number; leagues: Record<string, FbCatalogEntry> } | null = null;

async function loadCatalog(nowMs: number): Promise<Record<string, FbCatalogEntry>> {
  if (catalogCache && nowMs - catalogCache.at < 30 * 60_000) return catalogCache.leagues;
  const s = await db.doc(`${COL.meta}/leagueCatalog`).get();
  const leagues = ((s.exists ? s.data()?.leagues : undefined) as Record<string, FbCatalogEntry> | undefined) ?? {};
  catalogCache = { at: nowMs, leagues };
  return leagues;
}

/** A season other than the league's current one is over: cache it for long. */
async function isPastSeason(leagueId: number, season: number, nowMs: number): Promise<boolean> {
  const cur = (await loadCatalog(nowMs))[String(leagueId)]?.s;
  return typeof cur === 'number' && season < cur;
}

// ── match ────────────────────────────────────────────────────────────────────

export interface MatchResult {
  match: FbMatchDoc | null;
  detail: FbMatchDetailDoc | null;
}

async function readMatch(id: number): Promise<MatchResult> {
  const [m, d] = await db.getAll(db.doc(`${COL.matches}/${id}`), db.doc(`${COL.details}/${id}`));
  return {
    match: (m.exists ? m.data() : null) as FbMatchDoc | null,
    detail: (d.exists ? d.data() : null) as FbMatchDetailDoc | null,
  };
}

/**
 * Make sure `fb_matches/{id}` and `fb_match_details/{id}` exist and are as
 * fresh as the shared rules ask. Matches of priority leagues are enriched by
 * the live poller; this covers everything else (minor leagues, fixtures older
 * than the sync window, lineups before kickoff).
 */
export function ensureMatch(id: number, nowMs: number): Promise<MatchResult> {
  return singleFlight(`match:${id}`, () => buildMatch(id, nowMs));
}

async function buildMatch(id: number, nowMs: number): Promise<MatchResult> {
  const cur = await readMatch(id);
  if (!matchDetailNeedsFetch(cur.match, cur.detail, nowMs)) return cur;
  if (!cur.match && await isKnownMissing(`${COL.matches}/${id}`, nowMs)) throw new HttpsError('not-found', 'Unknown fixture');
  // Said out loud (not a silent "nothing new") so the app backs off instead of
  // asking again every minute while the budget is spent.
  if (!(await budgetAllows(1, nowMs))) {
    throw new HttpsError('resource-exhausted', 'Daily data budget reached — try again later.');
  }

  let list: AfFixtureFull[];
  try {
    list = await afGet<AfFixtureFull[]>('/fixtures', { id });
  } catch (err) {
    logger.warn('fbOnDemand match: provider failed', { id, err: String(err) });
    await persistQuota();
    return cur;
  }
  const f = list[0];
  if (!f) {
    await persistQuota();
    if (!cur.match) {
      await notFoundRef(`${COL.matches}/${id}`).set({ at: nowMs, expiresAt: nowMs + NOT_FOUND_TTL_MS }).catch(() => {});
      throw new HttpsError('not-found', 'Unknown fixture');
    }
    return cur;
  }

  const nowSec = Math.floor(nowMs / 1000);
  const short = f.fixture.status.short;
  const row = mapFixtureToMatch(f, { nowSec, prevClock: cur.match?.liveClock ?? null });
  const detail: FbMatchDetailDoc = {
    ...mapFixtureToDetail(f, cur.detail?.pressure ?? null),
    fetchedAt: nowMs,
  };

  const batch = db.batch();
  const stamp = admin.firestore.Timestamp.now();
  batch.set(db.doc(`${COL.details}/${id}`), { ...detail, updatedAt: stamp }, { merge: true });
  // The live poller owns the rows of matches in play (score, minute, clock
  // anchor); only write the row when it isn't live or doesn't exist yet.
  const writeRow = !cur.match || !isLiveShort(short);
  if (writeRow) batch.set(db.doc(`${COL.matches}/${id}`), { ...row, updatedAt: stamp }, { merge: true });
  await batch.commit();
  await persistQuota();
  return { match: writeRow ? row : cur.match, detail };
}

// ── day ──────────────────────────────────────────────────────────────────────

export interface DayResult {
  date: string;
  /** Fixtures the provider has for that date (0 when the schedule owns it). */
  fixtures: number;
  synced: boolean;
}

/**
 * Store every fixture of a UTC date the scheduled sync doesn't cover (results
 * from before the window, fixtures further ahead than two weeks). One provider
 * call per date: past dates are final once fetched, future ones are refreshed
 * at most once a day. The rows land in `fb_matches`, so the app's listeners
 * pick them up.
 */
export async function ensureDay(dateArg: unknown, nowMs: number): Promise<DayResult> {
  if (typeof dateArg !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateArg) || Number.isNaN(Date.parse(`${dateArg}T00:00:00Z`))) {
    throw new HttpsError('invalid-argument', 'date must be YYYY-MM-DD');
  }
  const date = dateArg;
  const off = utcDayOffset(date, nowMs);
  if (off < -ON_DEMAND_DAY_RANGE.past || off > ON_DEMAND_DAY_RANGE.future) {
    throw new HttpsError('invalid-argument', 'date out of range');
  }
  // Inside the window the schedule owns the date.
  if (!isOutsideSyncWindow(date, nowMs)) return { date, fixtures: 0, synced: false };
  return singleFlight(`day:${date}`, () => buildDay(date, off, nowMs));
}

async function buildDay(date: string, off: number, nowMs: number): Promise<DayResult> {
  const ref = db.doc(`${COL.meta}/day_${date}`);
  const snap = await ref.get();
  const prev = (snap.exists ? snap.data() : null) as { syncedAt?: number; fixtures?: number } | null;
  // Past days are final once fetched with data; an empty answer or a future
  // day is asked again after a day.
  const final = off < 0 && (prev?.fixtures ?? 0) > 0;
  const fresh = !!prev?.syncedAt && (final || nowMs - prev.syncedAt < DAY_MS);
  if (fresh) return { date, fixtures: prev?.fixtures ?? 0, synced: false };

  if (!(await budgetAllows(1, nowMs))) {
    throw new HttpsError('resource-exhausted', 'Daily data budget reached — try again later.');
  }
  const res = await syncFootballFixtures([date], nowMs);
  // A failed provider call must not mark the day as done (a past day is never
  // fetched again once marked).
  if (res.failed.length) throw new HttpsError('unavailable', 'Could not load that day — try again.');
  await ref.set({ syncedAt: nowMs, fixtures: res.fixtures });
  return { date, fixtures: res.fixtures, synced: true };
}

// ── matchPreview ─────────────────────────────────────────────────────────────

async function ensureVenue(venueId: number | null | undefined, nowMs: number): Promise<FbVenue | null> {
  if (!venueId) return null;
  try {
    const doc = await cached<FbVenueDoc>(`${COL.venues}/${venueId}`, nowMs, 1, async () => {
      const list = await afGet<AfVenue[]>('/venues', { id: venueId });
      const v = mapVenue(list[0]);
      if (!v) throw new HttpsError('not-found', 'Unknown venue');
      return { doc: v, ttlMs: FbTtl.venue };
    });
    const { fetchedAt: _f, expiresAt: _e, ...venue } = doc;
    return venue;
  } catch {
    return null; // a missing stadium card must not break the preview
  }
}

export async function ensureMatchPreview(id: number, nowMs: number): Promise<FbMatchPreviewDoc> {
  const path = `${COL.previews}/${id}`;
  // Cheap freshness check first — most calls end here without touching the match row.
  const existing = (await db.doc(path).get()).data() as FbMatchPreviewDoc | undefined;
  if (existing && !isExpired(existing, nowMs)) return existing;

  let { match } = await readMatch(id);
  if (!match) match = (await ensureMatch(id, nowMs)).match;
  if (!match) throw new HttpsError('not-found', 'Unknown fixture');
  const row = match;
  const homeId = Number(row.homeTeam.id);
  const awayId = Number(row.awayTeam.id);
  const started = isLiveShort(row.statusShort) || isFinishedShort(row.statusShort);
  // A preview that already exists is frozen once the ball rolls: no provider call.
  if (existing && started) {
    const frozen: FbMatchPreviewDoc = { ...existing, expiresAt: nowMs + matchPreviewTtlMs(row, nowMs) };
    await db.doc(path).set({ expiresAt: frozen.expiresAt }, { merge: true });
    return frozen;
  }
  // Form "as of now" is only meaningful around the match itself.
  const formRelevant = row.timestamp * 1000 > nowMs - 2 * DAY_MS;

  return cached<FbMatchPreviewDoc>(path, nowMs, 4, async prev => {
    const formFresh = !!prev && nowMs - (prev.formFetchedAt ?? 0) < 12 * 3_600_000;
    const wantForm = formRelevant && !formFresh;

    const [pred, injuries, homeLast, awayLast, venue] = await Promise.all([
      afGet<AfPredictionEntry[]>('/predictions', { fixture: id }).catch(() => [] as AfPredictionEntry[]),
      afGet<AfInjuryEntry[]>('/injuries', { fixture: id }).catch(() => [] as AfInjuryEntry[]),
      wantForm ? afGet<AfFixtureCore[]>('/fixtures', { team: homeId, last: 6 }).catch(() => null) : Promise.resolve(null),
      wantForm ? afGet<AfFixtureCore[]>('/fixtures', { team: awayId, last: 6 }).catch(() => null) : Promise.resolve(null),
      ensureVenue(row.venueId, nowMs),
    ]);

    const beforeThis = (list: AfFixtureCore[] | undefined) =>
      (list ?? []).filter(f => f.fixture.id !== id && f.fixture.timestamp < row.timestamp);
    const form = {
      home: homeLast ? mapForm(beforeThis(homeLast), homeId) : (prev?.form.home ?? []),
      away: awayLast ? mapForm(beforeThis(awayLast), awayId) : (prev?.form.away ?? []),
    };

    return {
      doc: {
        matchId: String(id),
        homeTeamId: row.homeTeam.id,
        awayTeamId: row.awayTeam.id,
        h2h: mapH2H(beforeThis(pred[0]?.h2h), id),
        absences: mapAbsences(injuries, homeId),
        prediction: mapPrediction(pred[0]),
        form,
        formFetchedAt: homeLast || awayLast ? nowMs : (prev?.formFetchedAt ?? 0),
        venue,
      },
      ttlMs: matchPreviewTtlMs(row, nowMs),
    };
  });
}

// ── team ─────────────────────────────────────────────────────────────────────

export async function ensureTeam(id: number, nowMs: number): Promise<FbTeamDoc> {
  return cached<FbTeamDoc>(`${COL.teams}/${id}`, nowMs, 4, async () => {
    const [teams, squads, coaches, leagues] = await Promise.all([
      afGet<AfTeamEntry[]>('/teams', { id }),
      afGet<AfSquadEntry[]>('/players/squads', { team: id }).catch(() => [] as AfSquadEntry[]),
      afGet<AfCoachEntry[]>('/coachs', { team: id }).catch(() => [] as AfCoachEntry[]),
      afGet<AfLeagueFull[]>('/leagues', { team: id, current: 'true' }).catch(() => [] as AfLeagueFull[]),
    ]);
    if (!teams[0]) throw new HttpsError('not-found', 'Unknown team');
    return { doc: mapTeam(teams[0], squads[0], coaches, leagues, nowMs), ttlMs: FbTtl.team };
  });
}

export async function ensureTeamFixtures(id: number, seasonArg: number | undefined, nowMs: number): Promise<FbTeamFixturesDoc> {
  // The season that matters depends on the team's league (calendar-year vs
  // split-year), so it comes from the team doc unless the caller names one.
  const season = seasonArg ?? (await ensureTeam(id, nowMs)).season ?? new Date(nowMs).getUTCFullYear();
  return cached<FbTeamFixturesDoc>(`${COL.teamFixtures}/${id}_${season}`, nowMs, 1, async () => {
    const list = await afGet<AfFixtureCore[]>('/fixtures', { team: id, season });
    const nowSec = Math.floor(nowMs / 1000);
    const { rows } = capFixtures(list.map(f => toFixtureLite(f, true)), MAX_SEASON_FIXTURES, nowSec);
    const last = rows[rows.length - 1]?.timestamp ?? 0;
    const over = rows.length > 0 && rows.every(r => isFinishedShort(r.statusShort)) && nowSec - last > 45 * 86_400;
    return {
      doc: { teamId: String(id), season, fixtures: rows },
      ttlMs: over ? FbTtl.finishedSeason : rows.length ? FbTtl.teamFixtures : FbTtl.empty,
    };
  });
}

export async function ensureTeamStats(id: number, leagueId: number, season: number, nowMs: number): Promise<FbTeamStatsDoc> {
  return cached<FbTeamStatsDoc>(`${COL.teamStats}/${id}_${leagueId}_${season}`, nowMs, 1, async () => {
    // This endpoint answers with an object (or an empty array when it has nothing).
    const res = await afGet<AfTeamSeasonStats | unknown[]>('/teams/statistics', { team: id, league: leagueId, season });
    if (Array.isArray(res) || !res?.team?.id) throw new HttpsError('not-found', 'No statistics for this team/league/season');
    const past = await isPastSeason(leagueId, season, nowMs);
    return { doc: mapTeamStats(res), ttlMs: past ? FbTtl.finishedSeason : FbTtl.teamStats };
  });
}

// ── player / coach / venue ───────────────────────────────────────────────────

export async function ensurePlayer(id: number, nowMs: number): Promise<FbPlayerDoc> {
  return cached<FbPlayerDoc>(`${COL.players}/${id}`, nowMs, 3, async () => {
    // API-Sports labels a season by its starting year, so "this year and the
    // one before" always covers the running season of every league.
    const y = new Date(nowMs).getUTCFullYear();
    const seasons = [y, y - 1];
    const [cur, prevSeason, teams] = await Promise.all([
      afGet<AfPlayerSeasonEntry[]>('/players', { id, season: seasons[0] }).catch(() => [] as AfPlayerSeasonEntry[]),
      afGet<AfPlayerSeasonEntry[]>('/players', { id, season: seasons[1] }).catch(() => [] as AfPlayerSeasonEntry[]),
      afGet<AfPlayerTeamsEntry[]>('/players/teams', { player: id }).catch(() => [] as AfPlayerTeamsEntry[]),
    ]);
    const entries = [...cur, ...prevSeason];
    let profile = entries[0]?.player;
    if (!profile) {
      // No statistics in the last two seasons (retired, or a league without
      // player coverage) — the profile endpoint still knows who this is.
      const list = await afGet<AfPlayerProfileEntry[]>('/players/profiles', { player: id });
      profile = list[0]?.player;
    }
    const doc = mapPlayer(entries, profile, teams, seasons);
    if (!doc) throw new HttpsError('not-found', 'Unknown player');
    return { doc, ttlMs: FbTtl.player };
  });
}

export async function ensureCoach(id: number, nowMs: number): Promise<FbCoachDoc> {
  return cached<FbCoachDoc>(`${COL.coaches}/${id}`, nowMs, 1, async () => {
    const list = await afGet<AfCoachEntry[]>('/coachs', { id });
    if (!list[0]) throw new HttpsError('not-found', 'Unknown coach');
    return { doc: mapCoach(list[0]), ttlMs: FbTtl.coach };
  });
}

// ── league ───────────────────────────────────────────────────────────────────

export async function ensureLeague(id: number, nowMs: number): Promise<FbLeagueDoc> {
  return cached<FbLeagueDoc>(`${COL.leagues}/${id}`, nowMs, 1, async () => {
    const list = await afGet<AfLeagueFull[]>('/leagues', { id });
    if (!list[0]) throw new HttpsError('not-found', 'Unknown league');
    return { doc: mapLeague(list[0]), ttlMs: FbTtl.league };
  });
}

export async function ensureLeagueFixtures(id: number, season: number, nowMs: number): Promise<FbLeagueFixturesDoc> {
  return cached<FbLeagueFixturesDoc>(`${COL.leagueFixtures}/${id}_${season}`, nowMs, 1, async () => {
    const list = await afGet<AfFixtureCore[]>('/fixtures', { league: id, season });
    const nowSec = Math.floor(nowMs / 1000);
    const { rows, truncated } = capFixtures(list.map(f => toFixtureLite(f, false)), MAX_SEASON_FIXTURES, nowSec);
    const past = await isPastSeason(id, season, nowMs);
    return {
      doc: { leagueId: String(id), season, fixtures: rows, truncated },
      ttlMs: past ? FbTtl.finishedSeason : rows.length ? FbTtl.leagueFixtures : FbTtl.empty,
    };
  });
}

type StandingsCached = FbStandingsDoc & Partial<FbCached>;
type TopPlayersCached = FbTopPlayersDoc & Partial<FbCached>;

/** Docs kept fresh by a schedule carry no `expiresAt`; trust them for a day. */
function scheduledDocFresh(doc: { updatedAt?: unknown } | null, nowMs: number): boolean {
  const ts = doc?.updatedAt as { toMillis?: () => number } | undefined;
  const at = typeof ts?.toMillis === 'function' ? ts.toMillis() : 0;
  return at > 0 && nowMs - at < 36 * 3_600_000;
}

export async function ensureStandings(id: number, season: number, nowMs: number): Promise<StandingsCached> {
  const path = `${COL.standings}/${id}_${season}`;
  const snap = await db.doc(path).get();
  const prev = (snap.exists ? snap.data() : null) as StandingsCached | null;
  const cat = (await loadCatalog(nowMs))[String(id)];
  const scheduled = (LEAGUE_POPULARITY[id] ?? 0) >= 20 && cat?.s === season;
  if (prev && typeof prev.expiresAt === 'number' && prev.expiresAt > nowMs) return prev;
  // Tables of priority leagues are refreshed by fbSyncStandings / fbDailyLeagues.
  if (prev && scheduled && scheduledDocFresh(prev, nowMs)) return prev;
  if (!(await budgetAllows(1, nowMs))) {
    if (prev) return prev;
    throw new HttpsError('resource-exhausted', 'Daily data budget reached — try again later.');
  }
  let doc: FbStandingsDoc;
  try {
    const res = await afGet<AfStandingsResponse[]>('/standings', { league: id, season });
    doc = res[0] ? mapStandings(res[0]) : { leagueId: String(id), season, groups: [] };
  } catch (err) {
    await persistQuota();
    if (prev) return prev;
    logger.warn('fbOnDemand standings: provider failed', { id, season, err: String(err) });
    throw new HttpsError('unavailable', 'Could not load this right now.');
  }
  const past = typeof cat?.s === 'number' && season < cat.s;
  const ttl = past ? FbTtl.finishedSeason : doc.groups.length ? FbTtl.standings : FbTtl.empty;
  const out: StandingsCached = { ...doc, fetchedAt: nowMs, expiresAt: nowMs + ttl };
  await db.doc(path).set({ ...out, updatedAt: admin.firestore.Timestamp.now() });
  await persistQuota();
  return out;
}

export async function ensureTopPlayers(id: number, season: number, nowMs: number): Promise<TopPlayersCached> {
  const path = `${COL.topscorers}/${id}_${season}`;
  const snap = await db.doc(path).get();
  const prev = (snap.exists ? snap.data() : null) as TopPlayersCached | null;
  const cat = (await loadCatalog(nowMs))[String(id)];
  const scheduled = (LEAGUE_POPULARITY[id] ?? 0) >= 50 && cat?.s === season;
  if (prev && typeof prev.expiresAt === 'number' && prev.expiresAt > nowMs) return prev;
  if (prev && scheduled && scheduledDocFresh(prev, nowMs)) return prev;
  if (!(await budgetAllows(3, nowMs))) {
    if (prev) return prev;
    throw new HttpsError('resource-exhausted', 'Daily data budget reached — try again later.');
  }
  let body: FbTopPlayersDoc;
  try {
    const [scorers, assists, yellows] = await Promise.all([
      afGet<AfTopPlayerEntry[]>('/players/topscorers', { league: id, season }),
      afGet<AfTopPlayerEntry[]>('/players/topassists', { league: id, season }).catch(() => [] as AfTopPlayerEntry[]),
      afGet<AfTopPlayerEntry[]>('/players/topyellowcards', { league: id, season }).catch(() => [] as AfTopPlayerEntry[]),
    ]);
    body = {
      leagueId: String(id), season,
      scorers: mapTopPlayers(scorers, 'goals'),
      assists: mapTopPlayers(assists, 'assists'),
      yellowCards: mapTopPlayers(yellows, 'yellow'),
    };
  } catch (err) {
    await persistQuota();
    if (prev) return prev;
    logger.warn('fbOnDemand topPlayers: provider failed', { id, season, err: String(err) });
    throw new HttpsError('unavailable', 'Could not load this right now.');
  }
  const past = typeof cat?.s === 'number' && season < cat.s;
  const empty = !body.scorers.length && !body.assists.length && !body.yellowCards.length;
  const ttl = past ? FbTtl.finishedSeason : empty ? FbTtl.empty : FbTtl.topPlayers;
  const out: TopPlayersCached = { ...body, fetchedAt: nowMs, expiresAt: nowMs + ttl };
  await db.doc(path).set({ ...out, updatedAt: admin.firestore.Timestamp.now() });
  await persistQuota();
  return out;
}

// ── search ───────────────────────────────────────────────────────────────────

export async function ensureSearch(rawQuery: unknown, nowMs: number): Promise<FbSearchDoc> {
  const q = normalizeSearch(rawQuery);
  if (q.length < 3) throw new HttpsError('invalid-argument', 'search needs at least 3 letters');
  const key = q.replace(/ /g, '_');
  // Lowest priority: search only spends what pages and matches won't need.
  return cached<FbSearchDoc>(`${COL.search}/${key}`, nowMs, 2, async () => {
    const tokens = q.split(' ').filter(t => t.length >= 3);
    // API-Sports matches players by surname: search the last usable word and
    // rank by how many of the other words also appear in the full name.
    const playerTerm = tokens[tokens.length - 1] ?? q;
    const [teams, players] = await Promise.all([
      afGet<AfTeamEntry[]>('/teams', { search: q }).catch(() => [] as AfTeamEntry[]),
      afGet<AfPlayerProfileEntry[]>('/players/profiles', { search: playerTerm }).catch(() => [] as AfPlayerProfileEntry[]),
    ]);
    const words = q.split(' ');
    const score = (e: AfPlayerProfileEntry): number => {
      const full = normalizeSearch(`${e.player.firstname ?? ''} ${e.player.lastname ?? ''} ${e.player.name ?? ''}`);
      return words.filter(w => full.includes(w)).length;
    };
    const ranked = players
      .map((e, i) => ({ e, i, s: score(e) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map(x => x.e);
    // Team search also matches the country ("mexico" → every Mexican club):
    // name matches first, the rest in API order.
    const byName = (e: AfTeamEntry) => (normalizeSearch(e.team.name).includes(q) ? 0 : 1);
    const teamRows = [...teams].sort((a, b) => byName(a) - byName(b));
    const doc = { q, teams: mapSearchTeams(teamRows), players: mapSearchPlayers(ranked) };
    const empty = !doc.teams.length && !doc.players.length;
    return { doc, ttlMs: empty ? FbTtl.empty : FbTtl.search };
  }, LOW_PRIORITY_MARGIN);
}

// ── legacy player ids (favorites migration) ──────────────────────────────────

interface LegacyPlayerRaw {
  firstname?: string; lastname?: string; name?: string; common_name?: string; display_name?: string;
  date_of_birth?: string;
  teams?: Array<{ team_id?: number; end?: string | null; active?: boolean; team?: { type?: string } }>;
}

function asciiWords(s: string | undefined): string[] {
  return normalizeSearch(s ?? '').split(' ').filter(w => w.length >= 3);
}

/**
 * Find the API-Sports player for a Sportmonks player id, using the Sportmonks
 * profile archived in Firestore `players/{id}` (surname + date of birth; the
 * current club's squad as a tie-breaker). Returns null when there is no
 * confident match — a wrong player would be worse than none.
 */
async function resolveLegacyPlayer(smId: string): Promise<{ afId: string | null; name: string | null }> {
  const snap = await db.doc(`players/${smId}`).get();
  const raw = (snap.exists ? snap.data()?.raw : null) as LegacyPlayerRaw | null;
  if (!raw) return { afId: null, name: null };
  const name = raw.display_name || raw.common_name || raw.name || null;
  const dob = (raw.date_of_birth ?? '').slice(0, 10);
  const surnameWords = asciiWords(raw.lastname).length ? asciiWords(raw.lastname) : asciiWords(raw.name).slice(-1);
  const firstWords = asciiWords(raw.firstname);
  if (!surnameWords.length) return { afId: null, name };

  const matches = (p: AfPlayerProfileEntry['player']): boolean => {
    if (dob && p.birth?.date) return p.birth.date === dob;
    return false;
  };

  if (dob) {
    for (const term of [...new Set([surnameWords[0], surnameWords[surnameWords.length - 1]])]) {
      for (let page = 1; page <= 3; page++) {
        const list = await afGet<AfPlayerProfileEntry[]>('/players/profiles', { search: term, page })
          .catch(() => [] as AfPlayerProfileEntry[]);
        const hits = list.filter(e => matches(e.player));
        if (hits.length === 1) return { afId: String(hits[0].player.id), name };
        if (hits.length > 1) {
          // Same surname and birthday (twins, namesakes): the first name decides.
          const byFirst = hits.filter(e => asciiWords(e.player.firstname ?? '').some(w => firstWords.includes(w)));
          if (byFirst.length === 1) return { afId: String(byFirst[0].player.id), name };
          return { afId: null, name };
        }
        if (list.length < 250) break;
      }
    }
  }

  // No birthday match: look for the surname in his current club's squad.
  const today = new Date().toISOString().slice(0, 10);
  const club = (raw.teams ?? []).find(t => t.team?.type !== 'national' && (t.active === true || !t.end || t.end > today));
  const afTeam = club?.team_id ? mapLegacyTeamId(club.team_id) : undefined;
  if (afTeam) {
    const squads = await afGet<AfSquadEntry[]>('/players/squads', { team: afTeam }).catch(() => [] as AfSquadEntry[]);
    const hits = (squads[0]?.players ?? []).filter(p => {
      const words = asciiWords(p.name);
      return surnameWords.some(w => words.includes(w));
    });
    if (hits.length === 1) return { afId: String(hits[0].id), name };
  }
  return { afId: null, name };
}

/** Time one legacyPlayers request may spend on provider lookups. */
const LEGACY_LOOKUP_BUDGET_MS = 15_000;

export async function mapLegacyPlayers(idsArg: unknown, nowMs: number): Promise<Record<string, string | null>> {
  if (!Array.isArray(idsArg) || idsArg.length === 0 || idsArg.length > 40) {
    throw new HttpsError('invalid-argument', 'ids must be 1-40 player ids');
  }
  const ids = [...new Set(idsArg.map(v => String(idParam(v, 'id'))))];
  const out: Record<string, string | null> = {};
  const pending: string[] = [];

  for (const id of ids) {
    const fixed = LEGACY_PLAYER_MAP[id];
    if (fixed) out[id] = String(fixed);
    else pending.push(id);
  }
  if (pending.length) {
    const snaps = await db.getAll(...pending.map(id => db.doc(`${COL.legacyPlayers}/${id}`)));
    const todo: string[] = [];
    snaps.forEach((s, i) => {
      const d = (s.exists ? s.data() : null) as FbLegacyPlayerDoc | null;
      // Failed lookups are retried after a week (the provider adds players over time).
      if (d && (d.afId || nowMs - d.resolvedAt < 7 * DAY_MS)) out[pending[i]] = d.afId;
      else todo.push(pending[i]);
    });
    const startedAt = Date.now();
    for (const id of todo) {
      // Up to 7 calls each (two surname searches of three pages + a squad). The
      // rest is left for a later launch when the budget or the caller's
      // patience (its request times out at 25 s) runs short.
      if (Date.now() - startedAt > LEGACY_LOOKUP_BUDGET_MS) break;
      if (!(await budgetAllows(7, nowMs, LOW_PRIORITY_MARGIN))) break;
      let res: { afId: string | null; name: string | null };
      try {
        res = await resolveLegacyPlayer(id);
      } catch (err) {
        logger.warn('fbOnDemand legacyPlayers: lookup failed', { id, err: String(err) });
        continue;
      }
      const doc: FbLegacyPlayerDoc = { smId: id, afId: res.afId, name: res.name, resolvedAt: nowMs };
      await db.doc(`${COL.legacyPlayers}/${id}`).set(doc);
      out[id] = res.afId;
    }
    await persistQuota();
  }
  return out;
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

const KINDS: ReadonlySet<FbOnDemandKind> = new Set<FbOnDemandKind>([
  'match', 'matchPreview', 'day', 'team', 'teamFixtures', 'teamStats', 'player', 'coach', 'venue',
  'league', 'leagueFixtures', 'standings', 'topPlayers', 'search', 'legacyPlayers',
]);

export interface OnDemandRequest {
  kind?: unknown;
  id?: unknown;
  leagueId?: unknown;
  season?: unknown;
  q?: unknown;
  ids?: unknown;
  date?: unknown;
}

/** Route one request. Always resolves to `{ kind, data }` or throws an HttpsError. */
export async function handleOnDemand(req: OnDemandRequest | null | undefined, nowMs = Date.now()): Promise<{ kind: FbOnDemandKind; data: unknown }> {
  const kind = req?.kind as FbOnDemandKind;
  if (typeof kind !== 'string' || !KINDS.has(kind)) throw new HttpsError('invalid-argument', 'unknown kind');
  const r = req as OnDemandRequest;
  const season = () => seasonParam(r.season, nowMs);

  switch (kind) {
    case 'match':
      return { kind, data: await ensureMatch(idParam(r.id, 'id'), nowMs) };
    case 'matchPreview':
      return { kind, data: await ensureMatchPreview(idParam(r.id, 'id'), nowMs) };
    case 'day':
      return { kind, data: await ensureDay(r.date, nowMs) };
    case 'team':
      return { kind, data: await ensureTeam(idParam(r.id, 'id'), nowMs) };
    case 'teamFixtures':
      return { kind, data: await ensureTeamFixtures(idParam(r.id, 'id'), r.season === undefined || r.season === null ? undefined : season(), nowMs) };
    case 'teamStats':
      return { kind, data: await ensureTeamStats(idParam(r.id, 'id'), idParam(r.leagueId, 'leagueId'), season(), nowMs) };
    case 'player':
      return { kind, data: await ensurePlayer(idParam(r.id, 'id'), nowMs) };
    case 'coach':
      return { kind, data: await ensureCoach(idParam(r.id, 'id'), nowMs) };
    case 'venue': {
      const v = await ensureVenue(idParam(r.id, 'id'), nowMs);
      if (!v) throw new HttpsError('not-found', 'Unknown venue');
      return { kind, data: v };
    }
    case 'league':
      return { kind, data: await ensureLeague(idParam(r.id, 'id'), nowMs) };
    case 'leagueFixtures':
      return { kind, data: await ensureLeagueFixtures(idParam(r.id, 'id'), season(), nowMs) };
    case 'standings':
      return { kind, data: await ensureStandings(idParam(r.id, 'id'), season(), nowMs) };
    case 'topPlayers':
      return { kind, data: await ensureTopPlayers(idParam(r.id, 'id'), season(), nowMs) };
    case 'search':
      return { kind, data: await ensureSearch(r.q, nowMs) };
    case 'legacyPlayers':
      return { kind, data: await mapLegacyPlayers(r.ids, nowMs) };
  }
}

/** Callable results must be plain JSON: drop Firestore Timestamps (`updatedAt`). */
export function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (k, v) => (k === 'updatedAt' ? undefined : v))) as T;
}
