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

// ── On-demand endpoints (verified against live responses on 2026-11-25) ──────

export interface AfVenue {
  id: number | null;
  name: string | null;
  address?: string | null;
  city: string | null;
  country?: string | null;
  capacity: number | null;
  surface: string | null;
  image: string | null;
}

/** /teams?id= | ?search= | ?league=&season= */
export interface AfTeamEntry {
  team: {
    id: number; name: string; code: string | null; country: string | null;
    founded: number | null; national: boolean; logo: string;
  };
  venue: AfVenue | null;
}

/** /players/squads?team= */
export interface AfSquadEntry {
  team: { id: number; name: string; logo: string };
  players: Array<{
    id: number; name: string; age: number | null; number: number | null;
    /** 'Goalkeeper' | 'Defender' | 'Midfielder' | 'Attacker' */
    position: string | null; photo: string;
  }>;
}

/** /coachs?id= | ?team= */
export interface AfCoachEntry {
  id: number;
  name: string;
  firstname: string | null;
  lastname: string | null;
  age: number | null;
  birth: { date: string | null; place: string | null; country: string | null };
  nationality: string | null;
  height: string | null;
  weight: string | null;
  photo: string | null;
  team: { id: number | null; name: string | null; logo: string | null } | null;
  career: Array<{
    team: { id: number | null; name: string | null; logo: string | null };
    start: string | null;
    end: string | null;
  }>;
}

export interface AfHomeAwayTotal<T = number> { home: T | null; away: T | null; total: T | null }
export type AfMinuteMap = Record<string, { total: number | null; percentage: string | null }>;

/** /teams/statistics?league=&season=&team= (response is an object, not an array) */
export interface AfTeamSeasonStats {
  league: { id: number; name: string; season: number };
  team: { id: number; name: string; logo: string };
  form: string | null;
  fixtures: {
    played: AfHomeAwayTotal; wins: AfHomeAwayTotal; draws: AfHomeAwayTotal; loses: AfHomeAwayTotal;
  };
  goals: {
    for: { total: AfHomeAwayTotal; average: AfHomeAwayTotal<string>; minute: AfMinuteMap };
    against: { total: AfHomeAwayTotal; average: AfHomeAwayTotal<string>; minute: AfMinuteMap };
  };
  biggest: {
    streak: { wins: number | null; draws: number | null; loses: number | null };
    wins: { home: string | null; away: string | null };
    loses: { home: string | null; away: string | null };
  };
  clean_sheet: AfHomeAwayTotal;
  failed_to_score: AfHomeAwayTotal;
  penalty: {
    scored: { total: number | null }; missed: { total: number | null }; total: number | null;
  };
  lineups: Array<{ formation: string; played: number }>;
  cards: { yellow: AfMinuteMap; red: AfMinuteMap };
}

export interface AfPlayerProfile {
  id: number;
  name: string;
  firstname: string | null;
  lastname: string | null;
  age: number | null;
  birth: { date: string | null; place: string | null; country: string | null };
  nationality: string | null;
  height: string | null;
  weight: string | null;
  injured?: boolean;
  number?: number | null;
  position?: string | null;
  photo: string;
}

export interface AfPlayerSeasonBlock {
  team: { id: number | null; name: string | null; logo: string | null };
  league: { id: number | null; name: string | null; country: string | null; logo: string | null; season: number | null };
  games: {
    appearences: number | null; lineups: number | null; minutes: number | null;
    number: number | null; position: string | null; rating: string | null; captain: boolean;
  };
  substitutes: { in: number | null; out: number | null; bench: number | null };
  shots: { total: number | null; on: number | null };
  goals: { total: number | null; conceded: number | null; assists: number | null; saves: number | null };
  passes: { total: number | null; key: number | null; accuracy: number | string | null };
  tackles: { total: number | null; blocks: number | null; interceptions: number | null };
  duels: { total: number | null; won: number | null };
  dribbles: { attempts: number | null; success: number | null; past: number | null };
  fouls: { drawn: number | null; committed: number | null };
  cards: { yellow: number | null; yellowred: number | null; red: number | null };
  penalty: {
    won: number | null; commited: number | null; scored: number | null;
    missed: number | null; saved: number | null;
  };
}

/** /players?id=&season= */
export interface AfPlayerSeasonEntry {
  player: AfPlayerProfile;
  statistics: AfPlayerSeasonBlock[];
}

/** /players/profiles?search= | ?player= */
export interface AfPlayerProfileEntry {
  player: AfPlayerProfile;
}

/** /players/teams?player= */
export interface AfPlayerTeamsEntry {
  team: { id: number; name: string; logo: string };
  seasons: number[];
}

/** /injuries?fixture= */
export interface AfInjuryEntry {
  player: { id: number; name: string; photo: string; type: string | null; reason: string | null };
  team: { id: number; name: string; logo: string };
  fixture: { id: number; date: string; timestamp: number };
  league: { id: number; season: number; name: string };
}

interface AfPct { home: string | null; away: string | null }

/** /predictions?fixture= */
export interface AfPredictionEntry {
  predictions: {
    winner: { id: number | null; name: string | null; comment: string | null } | null;
    win_or_draw: boolean | null;
    under_over: string | null;
    goals: { home: string | null; away: string | null } | null;
    advice: string | null;
    percent: { home: string | null; draw: string | null; away: string | null } | null;
  };
  comparison?: {
    form: AfPct; att: AfPct; def: AfPct; poisson_distribution: AfPct;
    h2h: AfPct; goals: AfPct; total: AfPct;
  } | null;
  h2h?: AfFixtureCore[];
}

/** /leagues?id= (all seasons with coverage) */
export interface AfLeagueFull {
  league: { id: number; name: string; type: string; logo: string };
  country: { name: string; code: string | null; flag: string | null };
  seasons: Array<{
    year: number; start: string; end: string; current: boolean;
    coverage?: { standings?: boolean };
  }>;
}
