// ── SportMonks v3 Raw API Client ─────────────────────────────────────────────
// Direct HTTP calls to SportMonks. No app-type mapping here — that lives in
// sportsApi.ts. This file only deals with SM response shapes.

const API_TOKEN = 'fJSTWbE3MXoQFM8cOTbZcoEomEMx9xJEh9F77IGS7RKjs2wGHd0vQDNanYIN';
const BASE_URL = 'https://api.sportmonks.com/v3/football';

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
  events?: SMEvent[];
  statistics?: SMStatistic[];
  lineups?: SMLineupEntry[];
  venue?: SMVenue;
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
  activeSeasons?: SMSeason[];
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

export const SM_STAT_TYPES = {
  BALL_POSSESSION: 45,
  SHOTS_TOTAL: 34,
  SHOTS_ON_TARGET: 52,
  EXPECTED_GOALS: 1605,
  CORNERS: 84,
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
 * Generic fetch wrapper for SportMonks API.
 * Handles auth, pagination traversal, and error handling.
 */
async function fetchApi<T>(
  endpoint: string,
  params: Record<string, string> = {},
): Promise<T> {
  const queryParams = new URLSearchParams({
    api_token: API_TOKEN,
    ...params,
  });
  const url = `${BASE_URL}/${endpoint}?${queryParams.toString()}`;

  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`SportMonks API error ${response.status}: ${errorText}`);
  }

  const json: SMResponse<T> = await response.json();
  return json.data;
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
    const queryParams = new URLSearchParams({
      api_token: API_TOKEN,
      page: String(page),
      ...params,
    });
    const url = `${BASE_URL}/${endpoint}?${queryParams.toString()}`;

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

/** GET /fixtures/date/{date}?include=participants;scores;league;state */
export async function fetchFixturesByDate(date: string, leagueIds?: string): Promise<SMFixture[]> {
  const params: Record<string, string> = {
    include: 'participants;scores;league;state',
  };
  if (leagueIds) {
    params.filters = `fixtureLeagues:${leagueIds}`;
  }
  return fetchAllPages<SMFixture>(`fixtures/date/${date}`, params);
}

/** GET /fixtures/{id}?include=participants;scores;events;statistics;lineups;venue;league */
export async function fetchFixtureById(id: number): Promise<SMFixture> {
  return fetchApi<SMFixture>(`fixtures/${id}`, {
    include: 'participants;scores;events;statistics;lineups;venue;league',
  });
}

/** GET /livescores?include=participants;scores;league;state */
export async function fetchLivescores(): Promise<SMFixture[]> {
  return fetchApi<SMFixture[]>('livescores', {
    include: 'participants;scores;league;state',
  });
}

/** GET /standings/seasons/{seasonId}?include=participant */
export async function fetchStandings(seasonId: number): Promise<SMStandingGroup[]> {
  return fetchApi<SMStandingGroup[]>(`standings/seasons/${seasonId}`, {
    include: 'participant',
  });
}

/** GET /topscorers/seasons/{seasonId}?include=player */
export async function fetchTopScorers(seasonId: number): Promise<SMTopScorer[]> {
  return fetchApi<SMTopScorer[]>(`topscorers/seasons/${seasonId}`, {
    include: 'player',
  });
}

/** GET /teams/seasons/{seasonId} */
export async function fetchTeamsBySeasonId(seasonId: number): Promise<SMParticipant[]> {
  return fetchApi<SMParticipant[]>(`teams/seasons/${seasonId}`);
}

/** GET /teams/{id}?include=coach;venue;activeSeasons */
export async function fetchTeamById(id: number): Promise<SMTeam> {
  return fetchApi<SMTeam>(`teams/${id}`, {
    include: 'coach;venue;activeSeasons',
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

/** GET /players/{id} */
export async function fetchPlayerById(id: number): Promise<SMPlayer> {
  return fetchApi<SMPlayer>(`players/${id}`);
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
