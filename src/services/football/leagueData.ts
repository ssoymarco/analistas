/**
 * football/leagueData.ts
 *
 * League-level data: standings, cup groups, top players, the season calendar,
 * the knockout bracket and the list of seasons.
 *
 * Every function takes the app's `seasonId` (a season key: league id × 10000 +
 * season year, see catalog.ts). Tables and top players of the big leagues are
 * kept fresh by scheduled Cloud Functions; for every other league or season the
 * `fbOnDemand` function fills the same Firestore docs the first time someone
 * asks.
 */

import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from '../firebase';
import { isExpired } from '../../../functions/src/shared/football/freshness';
import {
  fbLeagueLogo, fbSeasonKey,
  type FbCached, type FbFixtureLite, type FbLeagueDoc, type FbLeagueFixturesDoc, type FbStandingsDoc,
  type FbTopPlayersDoc,
} from '../../../functions/src/shared/football/model';
import type { CupGroupsResult, LeagueStanding, Match } from '../../data/types';
import { DEAD_STATE_ID } from './base';
import { parseSeasonId, peekCatalogEntry, peekCurrentSeason, peekLeagueLogo, ensureCatalog, seasonLabel } from './catalog';
import {
  cupGroupsFromFb, matchFromLite, standingsFromFb, topPlayerFromFb, type TopPlayerRow,
} from './mappers';
import { getLeagueFixturesBetween } from './matches';
import { callOnDemand, loadCached, readDoc } from './onDemand';
import { buildBracket, type CupRound } from './rounds';

type StandingsDoc = FbStandingsDoc & Partial<FbCached>;
type TopPlayersDoc = FbTopPlayersDoc & Partial<FbCached>;

const standingsPath = (leagueId: number, season: number) => `fb_standings/${leagueId}_${season}`;
const topPlayersPath = (leagueId: number, season: number) => `fb_topscorers/${leagueId}_${season}`;

/**
 * Docs written by a schedule carry no `expiresAt` and are trusted as they are;
 * docs written on demand expire. Missing → always ask.
 */
function needsRefresh(d: Partial<FbCached> | null): boolean {
  if (!d) return true;
  return typeof d.expiresAt === 'number' && isExpired(d as FbCached, Date.now());
}

// ── Standings ────────────────────────────────────────────────────────────────

async function loadStandingsDoc(seasonId: number): Promise<StandingsDoc | null> {
  const key = parseSeasonId(seasonId);
  if (!key) return null;
  let cached: StandingsDoc | null = null;
  try {
    cached = await readDoc<StandingsDoc>(standingsPath(key.leagueId, key.season));
  } catch { /* the function may still answer */ }
  if (!needsRefresh(cached)) return cached;
  try {
    return await callOnDemand<StandingsDoc>({ kind: 'standings', id: key.leagueId, season: key.season });
  } catch {
    return cached;
  }
}

/** League table of a season (empty when the competition has none). */
export async function getStandings(seasonId: number): Promise<LeagueStanding[]> {
  return standingsFromFb(await loadStandingsDoc(seasonId));
}

/** Group-stage tables of a cup season ("Grupo A", "Grupo B"…). */
export async function getCupGroupStandings(seasonId: number): Promise<CupGroupsResult> {
  return cupGroupsFromFb(await loadStandingsDoc(seasonId));
}

/**
 * Real-time league table. Fires with the stored table at once and again
 * whenever the server rewrites it (after each finished match in the big
 * leagues). When the table isn't stored yet, asks the function to fetch it —
 * the snapshot then delivers it.
 */
export function subscribeStandings(
  seasonId: number,
  onChange: (rows: LeagueStanding[], known: boolean) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const key = parseSeasonId(seasonId);
  if (!key) { onChange([], true); return () => {}; }
  let requested = false;
  return onSnapshot(
    doc(db, standingsPath(key.leagueId, key.season)),
    snap => {
      const data = snap.exists() ? (snap.data() as StandingsDoc) : null;
      if (needsRefresh(data) && !requested) {
        requested = true;
        callOnDemand({ kind: 'standings', id: key.leagueId, season: key.season })
          .catch(() => { if (!data) onChange([], true); });
        if (!data) return; // wait for the fetched table instead of flashing "no table"
      }
      onChange(standingsFromFb(data), true);
    },
    err => onError?.(err),
  );
}

// ── Top players ──────────────────────────────────────────────────────────────

export interface TopPlayersByCategory {
  goals: TopPlayerRow[];
  assists: TopPlayerRow[];
  cards: TopPlayerRow[];
}

const EMPTY_TOP: TopPlayersByCategory = { goals: [], assists: [], cards: [] };

function topFromDoc(d: TopPlayersDoc | null): TopPlayersByCategory {
  if (!d) return EMPTY_TOP;
  return {
    goals: (d.scorers ?? []).map(topPlayerFromFb),
    assists: (d.assists ?? []).map(topPlayerFromFb),
    cards: (d.yellowCards ?? []).map(topPlayerFromFb),
  };
}

/** Top scorers, assist leaders and most-booked players of a season. */
export async function getTopPlayers(seasonId: number): Promise<TopPlayersByCategory> {
  const key = parseSeasonId(seasonId);
  if (!key) return EMPTY_TOP;
  let cached: TopPlayersDoc | null = null;
  try {
    cached = await readDoc<TopPlayersDoc>(topPlayersPath(key.leagueId, key.season));
  } catch { /* the function may still answer */ }
  if (!needsRefresh(cached)) return topFromDoc(cached);
  try {
    return topFromDoc(await callOnDemand<TopPlayersDoc>({ kind: 'topPlayers', id: key.leagueId, season: key.season }));
  } catch {
    return topFromDoc(cached);
  }
}

export async function getTopScorers(seasonId: number): Promise<TopPlayerRow[]> {
  return (await getTopPlayers(seasonId)).goals;
}

// ── Season calendar ──────────────────────────────────────────────────────────

const HOUR = 3600;

/** In-memory copy for the session: the league screen, its bracket and the match "Tabla" tab share it. */
const seasonRowsMem = new Map<number, { rows: FbFixtureLite[]; at: number }>();
const seasonRowsInflight = new Map<number, Promise<FbFixtureLite[]>>();
const SEASON_ROWS_MEM_TTL = 60_000;

/** Patch scores/status of calendar rows with fresher `fb_matches` rows. */
function patchRows(rows: FbFixtureLite[], fresh: Match[]): FbFixtureLite[] {
  if (!fresh.length) return rows;
  const byId = new Map(fresh.map(m => [m.id, m]));
  return rows.map(r => {
    const m = byId.get(r.id);
    if (!m || !m.statusShort) return r;
    const played = m.status !== 'scheduled' && !(m.statusShort in DEAD_STATE_ID);
    return {
      ...r,
      statusShort: m.statusShort,
      timestamp: m.timestamp ?? r.timestamp,
      homeScore: played ? m.homeScore : r.homeScore,
      awayScore: played ? m.awayScore : r.awayScore,
      homePen: m.homePenScore ?? r.homePen,
      awayPen: m.awayPenScore ?? r.awayPen,
      minute: m.minute ?? null,
    };
  });
}

/**
 * Every fixture of a league season as slim rows, chronological. The cached
 * calendar (refreshed every few hours) is overlaid with the live rows of the
 * last/next day and a half, so scores are current the moment the screen opens.
 */
export async function getSeasonFixtureRows(seasonId: number): Promise<FbFixtureLite[]> {
  const mem = seasonRowsMem.get(seasonId);
  if (mem && Date.now() - mem.at < SEASON_ROWS_MEM_TTL) return mem.rows;
  const pending = seasonRowsInflight.get(seasonId);
  if (pending) return pending;

  const key = parseSeasonId(seasonId);
  if (!key) return [];
  const promise = (async () => {
    const docData = await loadCached<FbLeagueFixturesDoc>(
      `fb_league_fixtures/${key.leagueId}_${key.season}`,
      { kind: 'leagueFixtures', id: key.leagueId, season: key.season },
    );
    let rows = docData.fixtures ?? [];
    await ensureCatalog();
    const current = peekCurrentSeason(key.leagueId);
    if (current === null || current === key.season) {
      const nowSec = Math.floor(Date.now() / 1000);
      const fresh = await getLeagueFixturesBetween(key.leagueId, nowSec - 36 * HOUR, nowSec + 36 * HOUR).catch(() => []);
      rows = patchRows(rows, fresh);
    }
    seasonRowsMem.set(seasonId, { rows, at: Date.now() });
    return rows;
  })();
  seasonRowsInflight.set(seasonId, promise);
  try {
    return await promise;
  } finally {
    seasonRowsInflight.delete(seasonId);
  }
}

/** Every fixture of a league season as Match objects, chronological. */
export async function getSeasonFixtures(seasonId: number): Promise<Match[]> {
  const key = parseSeasonId(seasonId);
  if (!key) return [];
  const rows = await getSeasonFixtureRows(seasonId);
  const entry = peekCatalogEntry(key.leagueId);
  const ctx = {
    leagueId: String(key.leagueId),
    league: entry?.n ?? '',
    leagueLogo: peekLeagueLogo(key.leagueId) ?? undefined,
    season: key.season,
  };
  return rows.map(r => matchFromLite(r, ctx));
}

// ── Bracket ──────────────────────────────────────────────────────────────────

/**
 * Knockout bracket of a season: the whole cup, or the playoffs of a league
 * that has them (Liguilla, MLS Playoffs). `currentFixtureId` highlights the
 * tie being viewed.
 */
export async function getCupBracket(seasonId: number, currentFixtureId?: string): Promise<CupRound[]> {
  const key = parseSeasonId(seasonId);
  if (!key) return [];
  const rows = await getSeasonFixtureRows(seasonId);
  return buildBracket(rows, { currentFixtureId, leagueId: key.leagueId });
}

// ── Seasons ──────────────────────────────────────────────────────────────────

/** One selectable season of a league (season picker). */
export interface AvailableSeason {
  /** Season key (`seasonId`). */
  id: number;
  /** "2026/27" or "2026". */
  name: string;
  year: number;
  current: boolean;
  finished: boolean;
  pending: boolean;
}

/** Seasons the provider has for a league, newest first. */
export async function getAvailableSeasons(leagueId: number): Promise<AvailableSeason[]> {
  const league = await loadCached<FbLeagueDoc>(`fb_leagues/${leagueId}`, { kind: 'league', id: leagueId });
  const today = new Date().toISOString().slice(0, 10);
  return (league.seasons ?? []).map(s => ({
    id: fbSeasonKey(leagueId, s.year),
    name: seasonLabel(leagueId, s.year, s),
    year: s.year,
    current: s.current,
    finished: !s.current && s.end < today,
    pending: s.start > today,
  }));
}

/** Logo for a league: catalog first (respects trademark rules), CDN convention otherwise. */
export function leagueLogoFor(leagueId: number | string): string {
  return peekLeagueLogo(leagueId) ?? fbLeagueLogo(leagueId);
}
