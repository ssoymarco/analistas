/**
 * sportmonks.ts
 *
 * Server-side SportMonks v3 API client for Cloud Functions.
 * No CORS proxy needed — server-to-server direct calls.
 */

import { getSportmonksToken, SM_BASE_URL, SM_TIMEOUT } from './config';
import type {
  SMResponse, SMFixture, SMStandingGroup, SMTopScorer,
} from './types';

// ── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Build a query string preserving SM's special characters (semicolons, commas).
 * Node's URLSearchParams would encode semicolons, which SM needs as literal chars.
 */
function buildQueryString(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

/**
 * Single authenticated API request with timeout.
 * Token is read at runtime from the SPORTMONKS_TOKEN secret — every function
 * that calls this must declare the secret in its `secrets: [SPORTMONKS_TOKEN]` option.
 */
async function fetchApi<T>(
  endpoint: string,
  params: Record<string, string> = {},
): Promise<SMResponse<T>> {
  const qs = buildQueryString({ api_token: getSportmonksToken(), ...params });
  const url = `${SM_BASE_URL}${endpoint}?${qs}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SM_TIMEOUT);

  try {
    const res = await fetch(url, { signal: controller.signal });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`SportMonks ${res.status}: ${text.slice(0, 200)}`);
    }

    return (await res.json()) as SMResponse<T>;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch ALL pages of a paginated SM endpoint, following `pagination.has_more`.
 * Uses `per_page=50` (SM max) to minimise request count.
 *
 * @param maxPages  Generous safety cap (default 200 = 10,000 records). Hitting
 *                  it logs a warning so we notice if a real dataset is bigger.
 */
async function fetchAllPages<T>(
  endpoint: string,
  params: Record<string, string> = {},
  maxPages = 200,
): Promise<T[]> {
  const allData: T[] = [];
  let page = 1;

  while (page <= maxPages) {
    const res = await fetchApi<T[]>(endpoint, {
      per_page: '50',
      ...params,
      page: String(page),
    });
    if (Array.isArray(res.data)) {
      allData.push(...res.data);
    }
    if (!res.pagination?.has_more) break;
    page++;
  }

  if (page > maxPages) {
    // eslint-disable-next-line no-console
    console.warn(`fetchAllPages: hit maxPages=${maxPages} on ${endpoint} — data may be truncated`);
  }

  return allData;
}

// ── Public API Functions ────────────────────────────────────────────────────

/**
 * GET /livescores — all currently live matches across all leagues.
 * Single API call returns everything.
 */
export async function fetchLivescores(): Promise<SMFixture[]> {
  // `events;statistics` are included so the per-user MatchDetail polling
  // (every 10s) can be replaced by Firestore onSnapshot reads. Payload is
  // bigger (~300KB on busy match days) but it's still ONE API call.
  const res = await fetchApi<SMFixture[]>('/livescores/inplay', {
    include: 'participants;scores;league;state;events;statistics;periods',
  });
  return Array.isArray(res.data) ? res.data : [];
}

/**
 * GET /fixtures/date/{date} — all matches for a specific date.
 * @param date - 'YYYY-MM-DD'
 * @param leagueIds - optional comma-separated league IDs to filter
 */
export async function fetchFixturesByDate(
  date: string,
  leagueIds?: string,
): Promise<SMFixture[]> {
  const params: Record<string, string> = {
    include: 'participants;scores;league;state',
  };
  if (leagueIds) {
    params.filters = `fixtureLeagues:${leagueIds}`;
  }
  return fetchAllPages<SMFixture>(`/fixtures/date/${date}`, params);
}

/**
 * GET /fixtures/{id} — single match with full detail.
 * Used for match detail enrichment.
 */
export async function fetchFixtureById(id: number): Promise<SMFixture | null> {
  try {
    const res = await fetchApi<SMFixture>(`/fixtures/${id}`, {
      include: 'participants;scores;events;statistics;lineups.player;venue;league;referees.referee;tvstations.tvstation;weatherreport',
    });
    return res.data ?? null;
  } catch {
    return null;
  }
}

/**
 * GET /standings/seasons/{seasonId} — full league standings, all pages.
 * Group-stage cups (WC, UCL) can have many entries — pagination is required.
 */
export async function fetchStandings(seasonId: number): Promise<SMStandingGroup[]> {
  return fetchAllPages<SMStandingGroup>(`/standings/seasons/${seasonId}`, {
    include: 'participant;details',
  });
}

/**
 * GET /topscorers/seasons/{seasonId} — Goal Topscorer ranking, all pages.
 *
 * SportMonks returns rankings across MULTIPLE types per season (goals, assists,
 * cards, etc.). We filter to type_id 208 (Goal Topscorer) at the API level
 * with the `seasontopscorerTypes` filter — NOT `topScorerTypes` (camelCase),
 * which SportMonks silently ignores and falls back to whatever default ranking
 * it has on hand (usually cards). See sibling note in src/services/sportmonks.ts.
 *
 * Includes `participant` so we get the team name/logo alongside the player.
 */
export async function fetchTopScorers(seasonId: number): Promise<SMTopScorer[]> {
  return fetchAllPages<SMTopScorer>(`/topscorers/seasons/${seasonId}`, {
    include: 'player;participant',
    filters: 'seasontopscorerTypes:208',
  });
}

/**
 * GET /fixtures/{id} with full enrichment includes — fetches everything the
 * MatchDetailScreen needs in a single call. Used by syncMatchEnrichment
 * to populate matches/{id}.detail so the client never has to hit SportMonks
 * for match detail.
 *
 * Note: `odds` is omitted — 403 on Pro plan. Fetch separately if needed.
 */
export async function fetchFixtureFullDetail(id: number): Promise<SMFixture | null> {
  try {
    const res = await fetchApi<SMFixture>(`/fixtures/${id}`, {
      include: [
        'participants',
        'scores',
        'events',
        'statistics',
        'lineups.player',
        'expectedLineups.player',
        'coaches.nationality',
        'venue',
        'league',
        'referees.referee',
        'tvstations.tvstation',
        'weatherreport',
        'predictions',
        'periods',
        'aggregate.fixtures.scores',
        'aggregate.fixtures.participants',
      ].join(';'),
    });
    return res.data ?? null;
  } catch {
    return null;
  }
}

/**
 * GET /fixtures/head-to-head/{id1}/{id2} — direct historical meetings.
 * Used by syncMatchEnrichment to populate the H2H section.
 */
export async function fetchH2H(teamId1: number, teamId2: number): Promise<SMFixture[]> {
  return fetchAllPages<SMFixture>(
    `/fixtures/head-to-head/${teamId1}/${teamId2}`,
    { include: 'participants;scores' },
  );
}

/**
 * GET /sidelined/seasons/{seasonId}/teams/{teamId} — injuries / suspensions
 * for a team in a given season. Used by syncMatchEnrichment.
 */
export async function fetchSidelined(seasonId: number, teamId: number): Promise<unknown[]> {
  try {
    const res = await fetchApi<unknown[]>(
      `/sidelined/seasons/${seasonId}/teams/${teamId}`,
      { include: 'player' },
    );
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

/**
 * GET /teams/seasons/{seasonId} — every team in a season.
 *
 * Uses `include=venue;coaches` so the response carries enough info to fill
 * a team-detail page (stadium + coach). Returns ~20-50 teams per league
 * (or 48 for the World Cup) in a single paginated call.
 */
export interface SMTeamFull {
  id:               number;
  name:             string;
  short_code?:      string;
  image_path:       string;
  country_id?:      number;
  founded?:         number;
  venue?: {
    id?:         number;
    name?:       string;
    city_name?:  string;
    capacity?:   number;
    image_path?: string;
  };
  coaches?: Array<{
    id?:            number;
    display_name?:  string;
    common_name?:   string;
    name?:          string;
    image_path?:    string;
    date_of_birth?: string;
    active?:        boolean;
  }>;
}

export async function fetchTeamsForSeason(seasonId: number): Promise<SMTeamFull[]> {
  return fetchAllPages<SMTeamFull>(`/teams/seasons/${seasonId}`, {
    include: 'venue;coaches',
  });
}

/**
 * GET /squads/seasons/{seasonId}/teams/{teamId} — full roster for a team in
 * a given season. Used by syncSquads. Includes player metadata + the
 * player's other team memberships (so we can show "current club" alongside
 * a national-team player).
 */
export interface SMSquadPlayerFull {
  id:             number;
  player_id:      number;
  jersey_number:  number;
  position_id:    number;
  captain:        boolean;
  player?: {
    id?:            number;
    name?:          string;
    common_name?:   string;
    display_name?:  string;
    date_of_birth?: string;
    image_path?:    string;
    teams?: Array<{
      end?:  string;
      team?: {
        id?:         number;
        name?:       string;
        image_path?: string;
        type?:       string; // 'national' | 'domestic'
      };
    }>;
  };
}

export async function fetchSquadForSeasonAndTeam(
  seasonId: number,
  teamId: number,
): Promise<SMSquadPlayerFull[]> {
  return fetchAllPages<SMSquadPlayerFull>(
    `/squads/seasons/${seasonId}/teams/${teamId}`,
    { include: 'player;player.teams.team' },
  );
}
