// ── SportMonks v3 Raw API Client ─────────────────────────────────────────────
// All requests go through the Analistas Cloudflare Worker (analistas-proxy).
// The Worker injects the SportMonks API token server-side — it never ships
// inside the app bundle.
//
// Worker URL: https://analistas-proxy.<your-subdomain>.workers.dev/football
// To switch back to direct calls, set USE_PROXY = false and restore API_TOKEN.

// Cloudflare Worker proxy — token is a Worker secret, not in this file
const BASE_URL = 'https://analistas-proxy.marquitojr92.workers.dev/football';

// ── SM Response Wrapper ──────────────────────────────────────────────────────

export interface SMPagination {
  count: number;
  per_page: number;
  current_page: number;
  next_page: string | null;
  has_more: boolean;
}

export interface SMResponse<T> {
  data: T;
  pagination?: SMPagination;
  subscription?: unknown;
  rate_limit?: unknown;
  timezone?: string;
}

// ── SM Domain Types ──────────────────────────────────────────────────────────

export interface SMParticipant {
  id: number;
  sport_id: number;
  country_id: number;
  venue_id: number;
  gender: string;
  name: string;
  short_code: string;
  image_path: string;
  founded: number;
  type: string;
  placeholder: boolean;
  last_played_at: string;
  meta?: {
    location: 'home' | 'away';
    winner?: boolean;
    position?: number;
  };
  /** Populated when include `participants.coach` is requested */
  coach?: SMCoach;
}

export interface SMScore {
  id: number;
  fixture_id: number;
  type_id: number;
  description: string; // "CURRENT", "1ST_HALF", "2ND_HALF", "FT", etc.
  score: {
    goals: number;
    participant: string; // "home" | "away"
  };
  participant_id: number;
}

export interface SMState {
  id: number;
  state: string; // "NS", "1H", "HT", "2H", "FT", "ET", "PEN", etc.
  name: string;
  short_name: string;
  developer_name: string;
}

export interface SMLeague {
  id: number;
  sport_id: number;
  country_id: number;
  name: string;
  active: boolean;
  short_code: string;
  image_path: string;
  type: string;
  sub_type: string;
  last_played_at: string;
  category: number;
  has_jerseys: boolean;
}

export interface SMFixture {
  id: number;
  sport_id: number;
  league_id: number;
  season_id: number;
  stage_id: number;
  group_id: number | null;
  aggregate_id: number | null;
  round_id: number;
  state_id: number;
  venue_id: number;
  name: string;
  starting_at: string; // "2024-03-15 19:00:00"
  result_info: string | null;
  leg: string;
  details: unknown;
  length: number;
  placeholder: boolean;
  has_odds: boolean;
  has_premium_odds: boolean;
  starting_at_timestamp: number;
  // Includes
  participants?: SMParticipant[];
  scores?: SMScore[];
  league?: SMLeague;
  state?: SMState;
  round?: SMRound;
  stage?: SMStage;
  events?: SMEvent[];
  statistics?: SMStatistic[];
  lineups?: SMLineupEntry[];
  expectedlineups?: SMExpectedLineupEntry[]; // add-on: Expected Lineups (type_id = 77614)
  coaches?: SMFixtureCoach[];               // include=coaches — home + away coach with meta.participant_id
  venue?: SMVenue;
  referees?: SMFixtureReferee[];
  tvstations?: SMFixtureTVStation[];
  weatherreport?: SMWeatherReport;
  odds?: SMOdd[];
  periods?: SMPeriod[];                       // include=periods — authoritative live minute
  aggregate?: SMAggregate;                    // include=aggregate — two-legged ties
}

/**
 * SportMonks aggregate object — represents a multi-leg tie (e.g. Champions
 * League QF, Liga MX Liguilla). Includes nested `fixtures` (both legs) when
 * fetched via include=aggregate.fixtures.scores;aggregate.fixtures.participants.
 */
export interface SMAggregate {
  id: number;
  league_id: number;
  season_id: number;
  stage_id: number;
  round_id: number | null;
  fixture_id: number;   // winner's fixture (after tie is decided)
  detailed_id: number | null;
  name: string;         // e.g. "Real Madrid vs Bayern Munich"
  fixtures?: SMFixture[];
}

/**
 * SportMonks period object — one per game phase (1st half, HT, 2nd half, ET, PEN).
 * The period with `ticking: true` is the currently running phase; `minutes` holds
 * the authoritative in-game clock (e.g. 45 means 45:00, while stoppage time
 * is exposed separately and the real broadcaster minute stays at 45+).
 */
export interface SMPeriod {
  id: number;
  fixture_id: number;
  type_id: number;          // 1=1H, 2=HT, 3=2H, 4=ET, 5=PEN, …
  started: number | null;   // epoch seconds — when this period kicked off
  ended: number | null;
  counts_from: number;      // 0, 45, 60, 75, 90 — base minute
  ticking: boolean;         // true if this period is the one currently running
  sort_order: number;
  description?: string;     // "1st-half", "Half-time", "2nd-half", etc.
  time_added?: number | null;
  period_length?: number;
  minutes?: number;         // current in-game minute
  seconds?: number | null;
  has_timer?: boolean;
}

export interface SMFixtureReferee {
  id: number;
  fixture_id: number;
  referee_id: number;
  type_id: number; // 6=referee, 7=1st assistant, 8=2nd assistant, 9=4th official
  referee?: {
    id: number;
    common_name: string;
    display_name: string;
    firstname: string;
    lastname: string;
    image_path: string;
  };
}

export interface SMFixtureTVStation {
  id: number;
  fixture_id: number;
  tvstation_id: number;
  country_id: number;
  tvstation?: {
    id: number;
    name: string;
    url: string | null;
    image_path: string | null;
  };
}

export interface SMWeatherReport {
  id: number;
  fixture_id: number;
  venue_id: number;
  temperature: { day: number; morning: number; evening: number; night: number };
  feels_like: { day: number; morning: number; evening: number; night: number };
  wind: { speed: number; direction: number };
  humidity: string;
  pressure: number;
  clouds: string;
  description: string;
  icon: string;
  type: string;
  metric: string;
  current?: {
    temp: number;
    wind: number;
    humidity: string;
    pressure: number;
    direction: number;
    feels_like: number;
    description: string;
  };
}

export interface SMEvent {
  id: number;
  fixture_id: number;
  period_id: number;
  participant_id: number;
  type_id: number;
  section: string;
  player_id: number;
  related_player_id: number | null;
  player_name: string;
  related_player_name: string | null;
  result: string | null;
  info: string | null;
  addition: string | null;
  minute: number;
  extra_minute: number | null;
  injured: boolean | null;
  on_bench: boolean;
  coach_id: number | null;
  sub_type_id: number | null;
}

export interface SMStatistic {
  id: number;
  fixture_id: number;
  type_id: number;
  participant_id: number;
  data: {
    value: number | string | null;
  };
  location: string; // "home" | "away"
}

export interface SMLineupEntry {
  id: number;
  fixture_id: number;
  player_id: number;
  team_id: number;
  position_id: number;
  formation_field: string | null;
  type_id: number; // 11 = starter, 12 = bench
  formation_position: number | null;
  player_name: string;
  jersey_number: number;
  player?: SMPlayer;
}

/** Expected lineup entry — same shape as SMLineupEntry, type_id is always 77614 */
export type SMExpectedLineupEntry = SMLineupEntry;

/** Coach entry returned inside a fixture when include=coaches is used */
export interface SMFixtureCoach extends SMCoach {
  meta: {
    fixture_id: number;
    coach_id: number;
    /** Links to SMParticipant.id — use to find home/away coach */
    participant_id: number;
  };
}

export interface SMRound {
  id: number;
  sport_id: number;
  league_id: number;
  season_id: number;
  stage_id: number;
  name: string;
  finished: boolean;
  is_current: boolean;
  sort_order: number;
  starting_at?: string;
  ending_at?: string;
}

export interface SMStage {
  id: number;
  sport_id: number;
  league_id: number;
  season_id: number;
  type_id: number;
  name: string;
  sort_order: number;
  finished: boolean;
  is_current: boolean;
}

/**
 * SportMonks group entity — represents one group within a group-stage
 * competition (e.g. "Group A" in Copa Libertadores, "Grupo B" in CONCACAF).
 */
export interface SMGroup {
  id: number;
  name: string;       // "Group A", "Grupo A", etc. — as stored by SportMonks
  stage_id: number;
  league_id: number;
  season_id: number;
  sort_order: number;
}

export interface SMStandingGroup {
  id: number;
  participant_id: number;
  sport_id: number;
  league_id: number;
  season_id: number;
  stage_id: number;
  group_id: number | null;
  round_id: number;
  standing_rule_id: number;
  position: number;
  result: string | null;
  points: number;
  participant?: SMParticipant;
  details?: SMStandingDetail[];
}

export interface SMStandingDetail {
  id: number;
  standing_id: number;
  standing_rule_id: number;
  type_id: number;
  value: number;
}

export interface SMCountry {
  id: number;
  continent_id?: number;
  name: string;            // canonical English name, e.g. "France"
  official_name?: string;
  fifa_name?: string;      // 3-letter, e.g. "FRA"
  iso2?: string;           // 2-letter ISO code, e.g. "FR"
  iso3?: string;           // 3-letter ISO code, e.g. "FRA"
  image_path?: string;     // CDN URL of the flag PNG
}

export interface SMPlayerTeamMembership {
  id: number;
  player_id: number;
  team_id: number;
  start: string | null;
  end: string | null;
  active?: boolean;
  jersey_number?: number | null;
  team?: {
    id: number;
    name: string;
    short_code?: string;
    image_path?: string;
    country_id?: number;
    type?: 'national' | 'club' | 'domestic' | string;
  };
}

export interface SMPlayer {
  id: number;
  sport_id: number;
  country_id: number;
  nationality_id: number;
  city_id: number | null;
  position_id: number;
  detailed_position_id: number | null;
  type_id: number;
  common_name: string;
  firstname: string;
  lastname: string;
  name: string;
  display_name: string;
  image_path: string;
  height: number | null;
  weight: number | null;
  date_of_birth: string;
  gender: string;
  // Optional includes (request via ?include=nationality;teams.team)
  nationality?: SMCountry;
  country?: SMCountry;
  teams?: SMPlayerTeamMembership[];
}

export interface SMVenue {
  id: number;
  country_id: number;
  city_id: number;
  name: string;
  address: string | null;
  zipcode: string | null;
  latitude: string | null;
  longitude: string | null;
  capacity: number | null;
  image_path: string | null;
  city_name: string;
  surface: string | null;
}

export interface SMTopScorer {
  id: number;
  season_id: number;
  player_id: number;
  type_id: number;
  position: number;
  total: number;
  participant_id: number;
  player?: SMPlayer;
}

export interface SMCoach {
  id: number;
  player_id: number;
  sport_id: number;
  country_id: number;
  nationality_id: number;
  city_id: number | null;
  common_name: string;
  firstname: string;
  lastname: string;
  name: string;
  display_name: string;
  image_path: string;
  height: number | null;
  weight: number | null;
  date_of_birth: string;
  gender: string;
}

export interface SMTeam extends SMParticipant {
  coach?: SMCoach;
  venue?: SMVenue;
  /** SM returns this as `activeseasons` (lowercase) */
  activeSeasons?: SMSeason[];
  activeseasons?: SMSeason[];
}

export interface SMSeason {
  id: number;
  sport_id: number;
  league_id: number;
  tie_breaker_rule_id: number;
  name: string;
  finished: boolean;
  pending: boolean;
  is_current: boolean;
  starting_at: string;
  ending_at: string;
  standings_recalculated_at: string;
  games_in_current_week: boolean;
}

export interface SMCommentary {
  id: number;
  fixture_id: number;
  important: boolean;
  order: number;
  comment: string;
  minute: number | null;
  extra_minute: number | null;
}

export interface SMSquadPlayer {
  id: number;
  transfer_id: number | null;
  player_id: number;
  team_id: number;
  position_id: number;
  detailed_position_id: number | null;
  start: string;
  end: string | null;
  captain: boolean;
  jersey_number: number;
  player?: SMPlayer;
}

// ── Known Stat Type IDs ──────────────────────────────────────────────────────
// Verified against https://api.sportmonks.com/v3/core/types (April 2026)

export const SM_STAT_TYPES = {
  // General
  BALL_POSSESSION:            45,   // "Ball Possession %"
  GOALS:                      52,   // "Goals"
  // Shooting
  GOAL_ATTEMPTS:              54,   // "Goal Attempts" (total shots)
  SHOTS_ON_TARGET:            86,   // "Shots On Target"
  SHOTS_BLOCKED:              58,   // "Shots Blocked"
  GOAL_KICKS:                 53,   // "Goal Kicks"
  OFFSIDES:                   51,   // "Offsides"
  // Passes & creation
  ASSISTS:                    79,   // "Assists"
  FREE_KICKS:                 55,   // "Free Kicks"
  THROWINS:                   60,   // "Throwins"
  SUCCESSFUL_DRIBBLES_PCT:  1605,   // "Successful Dribbles Percentage"
  // Defence
  CORNERS:                    34,   // "Corners"
  SAVES:                      57,   // "Saves"
  // Discipline
  FOULS:                      56,   // "Fouls"
  YELLOWCARDS:                84,   // "Yellowcards"
  REDCARDS:                   83,   // "Redcards"
  // xG family (available on some plans/leagues)
  EXPECTED_GOALS:           5304,   // "Expected Goals (xG)"
  EXPECTED_GOALS_ON_TARGET: 5305,   // "Expected Goals on Target (xGoT)"
  NP_EXPECTED_GOALS:        7943,   // "Expected Non-Penalty Goals (npxG)"
  // Advanced
  BIG_CHANCES_CREATED:       580,   // "Big Chances Created"
  BIG_CHANCES_MISSED:        581,   // "Big Chances Missed"
} as const;

// ── Known Event Type IDs ─────────────────────────────────────────────────────

export const SM_EVENT_TYPES = {
  GOAL: 14,
  OWN_GOAL: 16,
  PENALTY_GOAL: 15,
  PENALTY_MISS: 17,
  YELLOW_CARD: 19,
  SECOND_YELLOW: 20,
  RED_CARD: 21,
  SUBSTITUTION: 18,
  VAR: 24,
} as const;

// ── State ID mapping ─────────────────────────────────────────────────────────

export const SM_STATE_IDS = {
  NOT_STARTED: 1,
  FIRST_HALF: 2,
  HALF_TIME: 3,
  SECOND_HALF: 4,
  FULL_TIME: 5,
  EXTRA_TIME: 6,
  PENALTIES: 7,
  BREAK: 8,
  FINISHED_AET: 9,
  FINISHED_PEN: 10,
  POSTPONED: 13,
  CANCELLED: 14,
  SUSPENDED: 15,
  INTERRUPTED: 16,
  ABANDONED: 17,
  DELETED: 22,
  TBD: 25,
} as const;

// ── Generic Fetch Helper ─────────────────────────────────────────────────────

/**
 * Build a query string WITHOUT encoding special chars that SportMonks
 * needs as literals (semicolons in `include`, colons/commas in `filters`).
 * URLSearchParams would encode them as %3B / %3A / %2C, which SM rejects.
 */
function buildQueryString(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${v}`)
    .join('&');
}

/**
 * Generic fetch wrapper for SportMonks API.
 * Handles auth, pagination traversal, and error handling.
 */
export async function fetchApi<T>(
  endpoint: string,
  params: Record<string, string> = {},
): Promise<T> {
  const qs = buildQueryString(params);
  const url = `${BASE_URL}/${endpoint}?${qs}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`SportMonks API error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const json: SMResponse<T> = await response.json();

    // Some SM endpoints return HTTP 200 with no data (e.g. commentaries on free plan)
    if (json.data === undefined || json.data === null) {
      throw new Error(`SportMonks: no data in response for ${endpoint}`);
    }

    return json.data;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch with automatic pagination — collects all pages into one array.
 */
async function fetchAllPages<T>(
  endpoint: string,
  params: Record<string, string> = {},
): Promise<T[]> {
  const allData: T[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const qs = buildQueryString({ page: String(page), per_page: '150', ...params });
    const url = `${BASE_URL}/${endpoint}?${qs}`;

    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`SportMonks API error ${response.status}: ${errorText}`);
    }

    const json: SMResponse<T[]> = await response.json();
    if (Array.isArray(json.data)) {
      allData.push(...json.data);
    }

    hasMore = json.pagination?.has_more ?? false;
    page++;

    // Safety: never fetch more than 10 pages
    if (page > 10) break;
  }

  return allData;
}

// ── Endpoint Functions ───────────────────────────────────────────────────────

/** GET /fixtures/date/{date}?include=participants;scores;league;state;statistics */
export async function fetchFixturesByDate(date: string, leagueIds?: string): Promise<SMFixture[]> {
  const params: Record<string, string> = {
    include: 'participants;scores;league;state;periods;statistics',
  };
  if (leagueIds) {
    params.filters = `fixtureLeagues:${leagueIds}`;
  }
  return fetchAllPages<SMFixture>(`fixtures/date/${date}`, params);
}

/** GET /fixtures/{id} — full detail with ALL available includes (Pro plan) */
export async function fetchFixtureById(id: number): Promise<SMFixture> {
  return fetchApi<SMFixture>(`fixtures/${id}`, {
    // Note: 'odds' causes 403 on Pro plan — omitted. Fetch separately if needed.
    include: 'participants;scores;events;statistics;lineups.player;expectedLineups.player;coaches;venue;league;referees.referee;tvstations.tvstation;weatherreport;predictions;periods;aggregate.fixtures.scores;aggregate.fixtures.participants',
  });
}

/**
 * GET /aggregates/{id}?include=fixtures.scores;fixtures.participants
 * Fetches the aggregate entity for a knockout tie, with both legs and their scores.
 * Used as a fallback when the fixture's own `aggregate.fixtures` include doesn't
 * return both legs (e.g. Coppa Italia, where SportMonks omits AGGREGATE score entries).
 */
export async function fetchAggregateById(aggregateId: number): Promise<SMAggregate> {
  return fetchApi<SMAggregate>(`aggregates/${aggregateId}`, {
    include: 'fixtures.scores;fixtures.participants',
  });
}

/** GET /livescores?include=participants;scores;league;state;statistics */
export async function fetchLivescores(): Promise<SMFixture[]> {
  return fetchApi<SMFixture[]>('livescores', {
    include: 'participants;scores;league;state;periods;statistics',
  });
}

/**
 * GET /livescores/latest — only fixtures updated in the last 10 seconds.
 * Much lighter than /livescores: returns nothing when nothing changed.
 * Recommended by SportMonks for 10-second polling intervals.
 */
export async function fetchLivescoresLatest(): Promise<SMFixture[]> {
  return fetchApi<SMFixture[]>('livescores/latest', {
    include: 'participants;scores;state;periods;statistics',
  });
}

/** GET /standings/seasons/{seasonId}?include=participant;details */
export async function fetchStandings(seasonId: number): Promise<SMStandingGroup[]> {
  // Standings don't paginate like fixtures — use direct fetchApi
  const data = await fetchApi<SMStandingGroup[]>(`standings/seasons/${seasonId}`, {
    include: 'participant;details',
  });
  return Array.isArray(data) ? data : [];
}

/**
 * GET /fixtures/seasons/{seasonId} — all fixtures for a season (cup brackets).
 * Uses pagination to handle large seasons. Includes round data for grouping.
 */
export async function fetchFixturesBySeasonId(seasonId: number): Promise<SMFixture[]> {
  // The /fixtures?filters=fixtureSeasonIds:{id} filter is BROKEN in SM v3 (returns wrong data).
  // Instead, use /seasons/{id}?include=fixtures.* which returns correct data in one call.
  const season = await fetchApi<{ fixtures?: SMFixture[] }>(`seasons/${seasonId}`, {
    include: 'fixtures.participants;fixtures.scores;fixtures.state;fixtures.stage',
  });
  return season.fixtures ?? [];
}

/**
 * GET /stages/{stageId}?include=fixtures.participants;fixtures.scores
 * Returns all fixtures in a specific stage (e.g. "Semifinales", "Final").
 * Used to find the other leg of a two-legged cup tie when H2H coverage is
 * insufficient — e.g. Coppa Italia where SportMonks omits AGGREGATE entries.
 */
export async function fetchFixturesByStage(stageId: number): Promise<SMFixture[]> {
  const stage = await fetchApi<{ fixtures?: SMFixture[] }>(`stages/${stageId}`, {
    include: 'fixtures.participants;fixtures.scores',
  });
  return stage.fixtures ?? [];
}

/**
 * GET /topscorers/seasons/{seasonId}?include=player
 * @param typeId  SM type_id filter: 208=goals, 209=assists, 84=yellow cards.
 *                Omit to return all types (caller must filter by type_id).
 */
export async function fetchTopScorers(seasonId: number, typeId?: number): Promise<SMTopScorer[]> {
  const params: Record<string, string> = { include: 'player' };
  if (typeId !== undefined) params.filters = `topScorerTypes:${typeId}`;
  return fetchApi<SMTopScorer[]>(`topscorers/seasons/${seasonId}`, params);
}

/** GET /coaches/{id} — full coach profile with nationality & photo */
export async function fetchCoachById(id: number): Promise<SMCoach> {
  return fetchApi<SMCoach>(`coaches/${id}`);
}

/** GET /teams/seasons/{seasonId} */
export async function fetchTeamsBySeasonId(seasonId: number): Promise<SMParticipant[]> {
  return fetchApi<SMParticipant[]>(`teams/seasons/${seasonId}`);
}

/**
 * GET /groups/seasons/{seasonId}
 * Returns the named groups for a season (e.g. "Group A", "Group B").
 * Only available for competitions with a group stage (Copa Libertadores,
 * CONCACAF Champions Cup, etc.). Returns [] for knockout-only competitions.
 */
export async function fetchGroupsBySeason(seasonId: number): Promise<SMGroup[]> {
  try {
    const data = await fetchApi<SMGroup[]>(`groups/seasons/${seasonId}`);
    return Array.isArray(data) ? data : [];
  } catch {
    // Not all competitions have groups — treat 404/empty as "no groups"
    return [];
  }
}

/** GET /teams/{id}?include=coach;venue;activeSeasons */
export async function fetchTeamById(id: number): Promise<SMTeam> {
  return fetchApi<SMTeam>(`teams/${id}`, {
    include: 'venue;activeSeasons',
  });
}

/** GET /squads/seasons/{seasonId}/teams/{teamId}?include=player */
export async function fetchSquad(seasonId: number, teamId: number): Promise<SMSquadPlayer[]> {
  return fetchApi<SMSquadPlayer[]>(`squads/seasons/${seasonId}/teams/${teamId}`, {
    include: 'player',
  });
}

/** GET /fixtures/head-to-head/{teamId1}/{teamId2}?include=participants;scores */
export async function fetchH2H(teamId1: number, teamId2: number): Promise<SMFixture[]> {
  return fetchApi<SMFixture[]>(`fixtures/head-to-head/${teamId1}/${teamId2}`, {
    include: 'participants;scores',
  });
}

/** GET /players/{id} — optionally with includes (e.g. 'teams.team;nationality') */
export async function fetchPlayerById(id: number, includes?: string): Promise<SMPlayer> {
  return fetchApi<SMPlayer>(
    `players/${id}`,
    includes ? { include: includes } : {},
  );
}

/**
 * GET /players/search/{query}
 * Returns up to 25 players matching the search query, sorted by relevance.
 *
 * Includes `nationality` (used to disambiguate same-name players — e.g. the
 * Manchester-City Bernardo Silva from his Lithuanian namesake) and
 * `teams.team` (current club, when the search endpoint honors it).
 */
export async function fetchPlayersBySearch(query: string): Promise<SMPlayer[]> {
  return fetchApi<SMPlayer[]>(
    `players/search/${encodeURIComponent(query)}`,
    { include: 'nationality;teams.team' },
  );
}

/** GET /venues/{id} */
export async function fetchVenueById(id: number): Promise<SMVenue> {
  return fetchApi<SMVenue>(`venues/${id}`);
}

/** GET /leagues/{id}?include=currentSeason */
export async function fetchSeasonsByLeagueId(leagueId: number): Promise<{ id: number; currentSeason?: SMSeason } & Record<string, unknown>> {
  return fetchApi<{ id: number; currentSeason?: SMSeason } & Record<string, unknown>>(`leagues/${leagueId}`, {
    include: 'currentSeason',
  });
}

/** GET /commentaries/fixtures/{fixtureId} */
export async function fetchCommentaries(fixtureId: number): Promise<SMCommentary[]> {
  return fetchApi<SMCommentary[]>(`commentaries/fixtures/${fixtureId}`);
}

// ── Odds Types ──────────────────────────────────────────────────────────────

export interface SMOdd {
  id: number;
  fixture_id: number;
  market_id: number;
  bookmaker_id: number;
  label: string;           // "1", "X", "2", "Over 2.5", etc.
  value: string;            // odds value like "2.10"
  name: string | null;
  sort_order: number | null;
  market_description: string | null;
  dp3: string;
  fractional: string;
  american: string;
  winning: boolean | null;
  stopped: boolean;
  total: string | null;
  handicap: string | null;
  participants: string | null;
  original_label: string | null;
  latest_bookmaker_update: string | null;
}

export interface SMOddsMarket {
  id: number;
  legacy_id: number | null;
  name: string;           // "Fulltime Result", "Over/Under", "Both Teams To Score"
  developer_name: string;
  has_winning_calculations: boolean;
}

// ── Predictions ─────────────────────────────────────────────────────────────

export interface SMPrediction {
  id: number;
  fixture_id: number;
  predictions: {
    yes: number;
    no: number;
  } | null;
  type_id: number;
  type: {
    id: number;
    name: string;          // "Fulltime Result", "BTTS", "Over/Under 2.5"
    code: string;
    developer_name: string;
  } | null;
}

/** GET /predictions/probabilities/fixtures/{fixtureId} */
export async function fetchPredictions(fixtureId: number): Promise<SMPrediction[]> {
  return fetchApi<SMPrediction[]>(`predictions/probabilities/fixtures/${fixtureId}`);
}

// ── Sidelined (Injuries & Suspensions) ──────────────────────────────────────

export interface SMSidelined {
  id: number;
  player_id: number;
  team_id: number;
  type_id: number;
  season_id: number;
  category: string;       // "injury" | "suspension" | "other"
  start_date: string;
  end_date: string | null;
  games_missed: number | null;
  completed: boolean;
  player?: SMPlayer;
}

/** GET /sidelined/seasons/{seasonId}/teams/{teamId}?include=player */
export async function fetchSidelinedByTeam(seasonId: number, teamId: number): Promise<SMSidelined[]> {
  return fetchApi<SMSidelined[]>(`sidelined/seasons/${seasonId}/teams/${teamId}`, {
    include: 'player',
  });
}

// ── Team Recent Fixtures ────────────────────────────────────────────────────

/**
 * GET /fixtures/between/{start}/{end}/{teamId}
 * Free plan doesn't have /fixtures/latest/by-team, so we use date range instead.
 */
export async function fetchTeamRecentFixtures(teamId: number): Promise<SMFixture[]> {
  // Look back 60 days and forward 30 days
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 60);
  const end = new Date(now);
  end.setDate(end.getDate() + 30);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return fetchApi<SMFixture[]>(
    `fixtures/between/${fmt(start)}/${fmt(end)}/${teamId}`,
    { include: 'participants;scores;league' },
  );
}

// ── Referee Stats ───────────────────────────────────────────────────────────

export interface SMRefereeStats {
  id: number;
  referee_id: number;
  season_id: number;
  type_id: number;
  value: { total: number; average: string } | number;
}

/** GET /referees/{id}?include=statistics */
export async function fetchRefereeStats(refereeId: number): Promise<{ id: number; statistics?: SMRefereeStats[] } & Record<string, unknown>> {
  return fetchApi<{ id: number; statistics?: SMRefereeStats[] } & Record<string, unknown>>(`referees/${refereeId}`, {
    include: 'statistics',
  });
}
