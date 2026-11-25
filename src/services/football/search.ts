/**
 * football/search.ts
 *
 * What the search box, onboarding and the favorites picker list:
 *   - instantly, with no network: the curated popular teams / national teams /
 *     players (popular.ts) and the curated leagues;
 *   - after one small Firestore read: every team of the curated leagues
 *     (`fb_meta/teamIndex`) and every league of the catalog;
 *   - for anything else: `searchRemote`, which asks the backend to search the
 *     data provider (answers are cached server-side per query).
 */

import { getFootballLeague, FOOTBALL_LEAGUES, COPYRIGHT_SENSITIVE_LEAGUE_IDS, getLeaguePopularity } from '../../../functions/src/shared/football/leagues';
import {
  fbLeagueLogo, fbTeamLogo,
  type FbSearchDoc, type FbTeamIndexDoc,
} from '../../../functions/src/shared/football/model';
import { normalize } from '../../utils/normalize';
import { AppCache } from '../cache';
import { deriveShortName } from './base';
import { ensureCatalog, getCatalogLeagues, peekCurrentSeasonId, peekLeagueLogo } from './catalog';
import { loadCached, readDoc } from './onDemand';
import {
  NATIONAL_TEAM_LEAGUE_NAME, POPULAR_NATIONAL_TEAMS, POPULAR_PLAYERS, POPULAR_TEAMS,
  type SearchableLeague, type SearchablePlayer, type SearchableTeam,
} from './popular';

export type { SearchableLeague, SearchablePlayer, SearchableTeam };

const DAY = 24 * 60 * 60 * 1000;

// ── Leagues ──────────────────────────────────────────────────────────────────

/** The curated leagues (onboarding picker, favorites). Synchronous. */
export function getSearchableLeagues(): SearchableLeague[] {
  return FOOTBALL_LEAGUES.map(l => {
    const sensitive = COPYRIGHT_SENSITIVE_LEAGUE_IDS.has(l.id);
    return {
      id: l.id,
      name: l.name,
      country: l.country,
      flag: l.flag,
      image: sensitive ? '' : (peekLeagueLogo(l.id) ?? fbLeagueLogo(l.id)),
      seasonId: peekCurrentSeasonId(l.id) ?? undefined,
      searchAliases: l.searchAliases,
      suppressLogo: sensitive,
    };
  });
}

/**
 * Every league the data covers: curated ones first (in catalog order), then
 * the rest of the provider's catalog ordered by the popularity heuristic.
 */
export async function getAllSearchableLeagues(): Promise<SearchableLeague[]> {
  const curated = getSearchableLeagues();
  await ensureCatalog().catch(() => {});
  const seen = new Set(curated.map(l => l.id));
  const rest = getCatalogLeagues()
    .filter(l => !seen.has(l.id))
    .sort((a, b) =>
      getLeaguePopularity(b.id, undefined, { name: b.name, country: b.country, type: b.type }) -
      getLeaguePopularity(a.id, undefined, { name: a.name, country: a.country, type: a.type }) ||
      a.country.localeCompare(b.country) || a.name.localeCompare(b.name))
    .map<SearchableLeague>(l => ({
      id: l.id,
      name: l.name,
      country: l.country,
      flag: '🏆',
      image: l.logo,
      seasonId: peekCurrentSeasonId(l.id) ?? undefined,
    }));
  return [...curated, ...rest];
}

// ── Teams ────────────────────────────────────────────────────────────────────

/** Popular clubs — instant. */
export async function getSearchableTeams(): Promise<SearchableTeam[]> {
  return POPULAR_TEAMS;
}

/** Popular national teams — instant. */
export async function getSearchableNationalTeams(): Promise<SearchableTeam[]> {
  return POPULAR_NATIONAL_TEAMS;
}

const TEAM_INDEX_CACHE_KEY = 'fb_team_index_v1';

async function loadTeamIndex(): Promise<SearchableTeam[]> {
  const cached = await AppCache.get<SearchableTeam[]>(TEAM_INDEX_CACHE_KEY);
  if (cached?.length) return cached;
  const data = await readDoc<FbTeamIndexDoc>('fb_meta/teamIndex').catch(() => null);
  const teams = (data?.teams ?? []).map<SearchableTeam>(t => ({
    id: Number(t.i),
    name: t.n,
    shortName: deriveShortName(t.n),
    logo: fbTeamLogo(t.i),
    leagueName: getFootballLeague(t.l)?.name ?? '',
    leagueId: Number(t.l),
  }));
  if (teams.length) AppCache.set(TEAM_INDEX_CACHE_KEY, teams, 3 * DAY).catch(() => {});
  return teams;
}

/**
 * The complete local team index: popular clubs, national teams and every team
 * of the curated leagues (one Firestore read, cached for days).
 */
export async function getAllSearchableTeams(): Promise<SearchableTeam[]> {
  const seen = new Set<number>();
  const merged: SearchableTeam[] = [];
  const push = (t: SearchableTeam) => { if (!seen.has(t.id)) { seen.add(t.id); merged.push(t); } };
  POPULAR_TEAMS.forEach(push);
  POPULAR_NATIONAL_TEAMS.forEach(push);
  (await loadTeamIndex().catch(() => [] as SearchableTeam[])).forEach(push);
  return merged;
}

// ── Players ──────────────────────────────────────────────────────────────────

/** Popular players — instant. Anyone else is found through `searchRemote`. */
export async function getSearchablePlayers(): Promise<SearchablePlayer[]> {
  return POPULAR_PLAYERS;
}

export async function getAllSearchablePlayers(): Promise<SearchablePlayer[]> {
  return POPULAR_PLAYERS;
}

// ── Remote search ────────────────────────────────────────────────────────────

/** Minimum letters the provider's search accepts. */
export const REMOTE_SEARCH_MIN_CHARS = 3;

/** Same normalization as the server (lowercase ASCII letters, digits, spaces). */
export function searchKey(raw: string): string {
  return normalize(raw).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
}

export interface RemoteSearchResult {
  teams: SearchableTeam[];
  players: SearchablePlayer[];
}

const EMPTY_RESULT: RemoteSearchResult = { teams: [], players: [] };

/**
 * Search teams and players in the data provider's full database (any club, any
 * player). Cheap to call per debounced query: each distinct query hits the
 * provider once ever and is then served from Firestore.
 */
export async function searchRemote(rawQuery: string): Promise<RemoteSearchResult> {
  const q = searchKey(rawQuery);
  if (q.length < REMOTE_SEARCH_MIN_CHARS) return EMPTY_RESULT;
  let data: FbSearchDoc;
  try {
    data = await loadCached<FbSearchDoc>(`fb_search/${q.replace(/ /g, '_')}`, { kind: 'search', q });
  } catch {
    return EMPTY_RESULT;
  }
  return {
    teams: (data.teams ?? []).map(t => ({
      id: Number(t.id),
      name: t.name,
      shortName: t.shortName,
      logo: t.logo,
      leagueName: t.national ? NATIONAL_TEAM_LEAGUE_NAME : (t.country ?? ''),
      leagueId: 0,
    })),
    players: (data.players ?? []).map(p => ({
      id: Number(p.id),
      name: p.name,
      image: p.photo || undefined,
      teamName: p.nationality ?? undefined,
      position: p.position ?? undefined,
    })),
  };
}
