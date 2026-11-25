/**
 * football/apisports-types.ts
 *
 * The subset of API-Sports (api-football v3) response shapes we read.
 * Verified against live responses on 2026-11-25. Fields are optional/nullable
 * where the API is known to omit or null them.
 */

export interface AfEnvelope<T> {
  get: string;
  parameters: Record<string, string>;
  /** Array when empty, object keyed by field when there are errors. */
  errors: unknown[] | Record<string, string>;
  results: number;
  paging?: { current: number; total: number };
  response: T;
}

export interface AfTeamBrief {
  id: number;
  name: string;
  logo: string;
  winner?: boolean | null;
}

export interface AfFixtureCore {
  fixture: {
    id: number;
    referee: string | null;
    timezone: string;
    date: string;          // ISO with offset
    timestamp: number;     // unix seconds
    periods: { first: number | null; second: number | null };
    venue: { id: number | null; name: string | null; city: string | null };
    status: { long: string; short: string; elapsed: number | null; extra?: number | null };
  };
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
    flag: string | null;
    season: number;
    round: string | null;
    standings?: boolean;
  };
  teams: { home: AfTeamBrief; away: AfTeamBrief };
  goals: { home: number | null; away: number | null };
  score: {
    halftime: { home: number | null; away: number | null };
    fulltime: { home: number | null; away: number | null };
    extratime: { home: number | null; away: number | null };
    penalty: { home: number | null; away: number | null };
  };
}

export interface AfEvent {
  time: { elapsed: number | null; extra: number | null };
  team: { id: number; name: string; logo: string };
  player: { id: number | null; name: string | null };
  assist: { id: number | null; name: string | null };
  /** 'Goal' | 'Card' | 'subst' | 'Var' */
  type: string;
  /** 'Normal Goal' | 'Own Goal' | 'Penalty' | 'Missed Penalty' | 'Yellow Card' |
   *  'Red Card' | 'Second Yellow card' | 'Substitution N' | 'Goal cancelled' | … */
  detail: string;
  /** e.g. 'Penalty Shootout', 'Foul' */
  comments: string | null;
}

export interface AfLineupPlayer {
  player: { id: number; name: string; number: number | null; pos: string | null; grid: string | null };
}

export interface AfLineup {
  team: { id: number; name: string; logo: string; colors?: unknown };
  formation: string | null;
  coach: { id: number | null; name: string | null; photo: string | null };
  startXI: AfLineupPlayer[];
  substitutes: AfLineupPlayer[];
}

export interface AfTeamStatistics {
  team: { id: number; name: string; logo: string };
  statistics: Array<{ type: string; value: number | string | null }>;
}

export interface AfPlayerMatchStats {
  player: { id: number; name: string; photo: string };
  statistics: Array<{
    games: { minutes: number | null; number: number | null; position: string | null;
             rating: string | null; captain: boolean; substitute: boolean };
    offsides: number | null;
    shots: { total: number | null; on: number | null };
    goals: { total: number | null; conceded: number | null; assists: number | null; saves: number | null };
    passes: { total: number | null; key: number | null; accuracy: string | number | null };
    tackles: { total: number | null; blocks: number | null; interceptions: number | null };
    duels: { total: number | null; won: number | null };
    dribbles: { attempts: number | null; success: number | null; past: number | null };
    fouls: { drawn: number | null; committed: number | null };
    cards: { yellow: number | null; red: number | null };
    penalty: { won: number | null; commited: number | null; scored: number | null;
               missed: number | null; saved: number | null };
  }>;
}

export interface AfTeamPlayers {
  team: { id: number; name: string; logo: string; update?: string };
  players: AfPlayerMatchStats[];
}

/** /fixtures?id= or ?ids= — the core plus the detail blocks. */
export interface AfFixtureFull extends AfFixtureCore {
  events?: AfEvent[];
  lineups?: AfLineup[];
  statistics?: AfTeamStatistics[];
  players?: AfTeamPlayers[];
}

export interface AfStandingEntry {
  rank: number;
  team: { id: number; name: string; logo: string };
  points: number;
  goalsDiff: number;
  group: string;
  form: string | null;
  status: string | null;
  description: string | null;
  all: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
}

export interface AfStandingsResponse {
  league: {
    id: number; name: string; country: string; logo: string; flag: string | null; season: number;
    standings: AfStandingEntry[][];
  };
}

export interface AfLeagueEntry {
  league: { id: number; name: string; type: string; logo: string };
  country: { name: string; code: string | null; flag: string | null };
  seasons: Array<{ year: number; start: string; end: string; current: boolean; coverage?: unknown }>;
}

export interface AfTopPlayerEntry {
  player: { id: number; name: string; photo: string };
  statistics: Array<{
    team: { id: number; name: string; logo: string };
    goals: { total: number | null; assists: number | null };
    cards: { yellow: number | null; red: number | null };
  }>;
}
