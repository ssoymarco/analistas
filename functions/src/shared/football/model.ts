/**
 * shared/football/model.ts
 *
 * Firestore document shapes written by the API-Sports backend and read by the
 * app (and later the website). This is the contract between the two — the
 * backend normalizes API-Sports into these shapes so clients never see raw
 * provider payloads, never call the provider directly, and never need a key.
 *
 * Collections (all public-read, server-write):
 *   fb_matches/{fixtureId}          FbMatchDoc        — list rows, live scores
 *   fb_match_details/{fixtureId}    FbMatchDetailDoc  — events, stats, lineups
 *   fb_standings/{leagueId}_{season} FbStandingsDoc
 *   fb_topscorers/{leagueId}_{season} FbTopPlayersDoc
 *
 * Field names deliberately mirror the app's domain types in src/data/types.ts
 * (Match, MatchEvent, MatchStatCategory, MatchLineup, PlayerRating) so the
 * client mapping is close to a pass-through.
 *
 * Dependency-free (shared with the app). Timestamps are typed `unknown`: the
 * server writes Firestore Timestamps, the client reads them via its own SDK.
 */

export type Sport = 'football';

export interface FbTeamRef {
  id: string;
  name: string;
  /** 3-letter code when API-Sports has one, else derived from the name. */
  shortName: string;
  logo: string;
}

/** App-level status (drives tabs and styling). `statusShort` keeps the detail. */
export type FbMatchStatus = 'scheduled' | 'live' | 'finished' | 'interrupted';

/**
 * API-Sports `fixture.status.short` codes.
 * TBD/NS scheduled · 1H/HT/2H/ET/BT/P/LIVE in play · SUSP/INT halted ·
 * FT/AET/PEN finished · PST postponed · CANC cancelled · ABD abandoned ·
 * AWD technical loss · WO walkover.
 */
export type FbStatusShort =
  | 'TBD' | 'NS' | '1H' | 'HT' | '2H' | 'ET' | 'BT' | 'P' | 'LIVE'
  | 'SUSP' | 'INT' | 'FT' | 'AET' | 'PEN' | 'PST' | 'CANC' | 'ABD' | 'AWD' | 'WO';

export interface FbLiveClock {
  /** Unix seconds when the current period started ticking. */
  periodStartedAt: number;
  /** Base minute of the period (0 for 1H, 45 for 2H, 90 / 105 for ET halves). */
  periodMinuteOffset: number;
}

export interface FbMatchDoc {
  id: string;
  sport: Sport;
  leagueId: string;
  /** Display name: curated name when the league is in the catalog, else API name. */
  league: string;
  leagueCountry: string;
  leagueLogo: string;
  leagueFlag: string | null;
  /** Global league popularity (0-100) — server-side priority and default ordering. */
  popularity: number;
  season: number;
  /** API-Sports round label, e.g. "Regular Season - 17", "Round of 16", "Group A - 2". */
  round: string | null;

  homeTeam: FbTeamRef;
  awayTeam: FbTeamRef;
  homeScore: number;
  awayScore: number;
  homeScoreHT: number | null;
  awayScoreHT: number | null;
  homePenScore: number | null;
  awayPenScore: number | null;
  homeRedCards: number;
  awayRedCards: number;

  status: FbMatchStatus;
  statusShort: FbStatusShort | string;
  /** Short live label for chips: '1T' | 'HT' | '2T' | 'ET' | 'PEN' (null otherwise). */
  stateLabel: string | null;
  minute: number | null;
  /** Added time minute within the period (e.g. 45+3 → minute 45, extraMinute 3). */
  extraMinute: number | null;
  liveClock: FbLiveClock | null;

  /** Kickoff, unix seconds. Clients group by local day using this. */
  timestamp: number;
  /** Kickoff ISO-8601 in UTC (e.g. "2026-11-25T20:00:00Z"). */
  startingAtUtc: string;
  /** Kickoff calendar date in UTC, 'YYYY-MM-DD'. */
  date: string;

  venueId: number | null;
  venueName: string | null;
  venueCity: string | null;
  referee: string | null;
  winner: 'home' | 'away' | null;

  updatedAt?: unknown;
}

// ── Match detail ─────────────────────────────────────────────────────────────

export type FbEventType =
  | 'goal' | 'own-goal' | 'penalty-goal' | 'penalty-miss'
  | 'shootout-goal' | 'shootout-miss'
  | 'yellow' | 'second-yellow' | 'red'
  | 'sub' | 'var';

export interface FbEvent {
  /** Stable id derived from the event's content (API-Sports events have no id). */
  id: string;
  minute: number;
  addedTime?: number;
  type: FbEventType;
  team: 'home' | 'away';
  player: string;
  playerId?: number;
  /** Assist for goals; player coming ON for substitutions. */
  relatedPlayer?: string;
  relatedPlayerId?: number;
  /** Raw API detail/comments, e.g. "Goal cancelled", "Foul". */
  description?: string;
  /** 1-based kick order (shootout events only). */
  shootoutOrder?: number;
  /** Running shootout tally after this kick, e.g. "4-2" (shootout events only). */
  shootoutResult?: string;
}

export interface FbStatRow {
  label: string;
  home: number;
  away: number;
  type?: 'percentage' | 'decimal' | 'number';
}

export interface FbStatCategory {
  category: string;
  stats: FbStatRow[];
}

export interface FbLineupPlayer {
  id: string;
  name: string;
  shortName: string;
  number: number;
  /** Full position name (Portero, Defensa, Medio, Delantero). */
  position: string;
  /** App short code: POR | DEF | MED | DEL (JUG when unknown). */
  positionShort: string;
  /** Pitch coordinates 0-100 (x = width, y = depth from own goal). Starters only. */
  x: number;
  y: number;
  formationRow?: number;
  formationCol?: number;
  formationRowSize?: number;
  rating?: number;
  isCaptain?: boolean;
  isSubstituted?: boolean;
  substituteMinute?: number;
  yellowCard?: boolean;
  redCard?: boolean;
  goals?: number;
  assists?: number;
  imageUrl?: string;
}

export interface FbLineup {
  teamId: string;
  formation: string;
  starters: FbLineupPlayer[];
  bench: FbLineupPlayer[];
  coach: string;
  coachId?: number;
  coachImageUrl?: string;
}

export interface FbPlayerRating {
  playerId: string;
  name: string;
  number: number;
  position: string;
  rating: number;
  minutes: number;
  goals?: number;
  assists?: number;
  shots?: number;
  keyPasses?: number;
  tackles?: number;
  saves?: number;
  passAccuracy: number;
  duelsWon?: number;
  isMOTM?: boolean;
}

/**
 * Our own pressure index (API-Sports has none). 0-100 dominance share per side,
 * computed from the live statistics; `series` keeps one point per enrichment
 * so the UI can draw the momentum curve.
 */
export interface FbPressure {
  home: number;
  away: number;
  series: Array<{ minute: number; home: number; away: number }>;
}

export interface FbMatchDetailDoc {
  matchId: string;
  events: FbEvent[];
  statistics: FbStatCategory[];
  lineups: { home: FbLineup | null; away: FbLineup | null };
  playerRatings: { home: FbPlayerRating[]; away: FbPlayerRating[] };
  pressure: FbPressure | null;
  updatedAt?: unknown;
}

// ── Standings / top players ──────────────────────────────────────────────────

export interface FbStandingRow {
  position: number;
  team: FbTeamRef;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** Last results, newest last, e.g. "WWDLW". */
  form: string | null;
  /** API-Sports qualification description, e.g. "Promotion - Champions League". */
  description: string | null;
}

export interface FbStandingsGroup {
  name: string;
  rows: FbStandingRow[];
}

export interface FbStandingsDoc {
  leagueId: string;
  season: number;
  groups: FbStandingsGroup[];
  updatedAt?: unknown;
}

export interface FbTopPlayer {
  playerId: string;
  name: string;
  photo: string;
  teamId: string;
  teamName: string;
  teamLogo: string;
  value: number;
  position: number;
}

export interface FbTopPlayersDoc {
  leagueId: string;
  season: number;
  scorers: FbTopPlayer[];
  assists: FbTopPlayer[];
  yellowCards: FbTopPlayer[];
  updatedAt?: unknown;
}

// ── Push topics ──────────────────────────────────────────────────────────────

/** Modo Estadio delay bucket. */
export type FbDelayBucket = 'd0' | 'd2' | 'd5' | 'd10';

/**
 * FCM topic names for football. Must be used verbatim by both the backend
 * (send) and the app (subscribe). Prefixed with `fb_` so they never collide
 * with the legacy Sportmonks-era `team_{id}_*` topics (different id space)
 * or with other sports later.
 */
export const FbTopics = {
  goals:     (teamId: string, b: FbDelayBucket) => `fb_team_${teamId}_goals_${b}`,
  cards:     (teamId: string, b: FbDelayBucket) => `fb_team_${teamId}_cards_${b}`,
  live:      (teamId: string, b: FbDelayBucket) => `fb_team_${teamId}_live_${b}`,
  kickoff:   (teamId: string) => `fb_team_${teamId}_kickoff`,
  lineups:   (teamId: string) => `fb_team_${teamId}_lineups`,
  reminders: (teamId: string) => `fb_team_${teamId}_reminders`,
  rivalLoss:       (teamId: string) => `fb_team_${teamId}_rival_loss`,
  rivalBigLoss:    (teamId: string) => `fb_team_${teamId}_rival_bigloss`,
  rivalRedCard:    (teamId: string) => `fb_team_${teamId}_rival_redcard`,
  rivalPenMiss:    (teamId: string) => `fb_team_${teamId}_rival_penmiss`,
} as const;
