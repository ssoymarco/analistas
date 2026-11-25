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
  /** Unix ms of the provider fetch behind this doc (see shared/football/freshness.ts). */
  fetchedAt?: number;
  /** Fixture status at that fetch — tells a final detail from a mid-match one. */
  statusShort?: string;
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
  /** Followed PLAYER: goals (not own goals), red cards, starting XI. */
  playerGoals:   (playerId: string) => `fb_player_${playerId}_goals`,
  playerCards:   (playerId: string) => `fb_player_${playerId}_cards`,
  playerLineups: (playerId: string) => `fb_player_${playerId}_lineups`,
  /** "Silenciar este partido": devices subscribed here are excluded in FCM. */
  mute: (matchId: string) => `fb_mute_${matchId}`,
} as const;

// ═════════════════════════════════════════════════════════════════════════════
// On-demand documents (fbOnDemand callable — see functions/src/football/on-demand.ts)
//
// Data that is too large or too rarely needed to sync for every team/league is
// fetched the first time a user opens the screen and cached in Firestore. The
// app reads the doc directly and only calls the function when the doc is
// missing or past `expiresAt`. Collections (public-read, server-write):
//
//   fb_match_previews/{fixtureId}          FbMatchPreviewDoc
//   fb_teams/{teamId}                      FbTeamDoc
//   fb_team_fixtures/{teamId}_{season}     FbTeamFixturesDoc
//   fb_team_stats/{teamId}_{league}_{season} FbTeamStatsDoc
//   fb_players/{playerId}                  FbPlayerDoc
//   fb_coaches/{coachId}                   FbCoachDoc
//   fb_venues/{venueId}                    FbVenueDoc
//   fb_leagues/{leagueId}                  FbLeagueDoc
//   fb_league_fixtures/{leagueId}_{season} FbLeagueFixturesDoc
//   fb_search/{key}                        FbSearchDoc
//   fb_legacy_players/{sportmonksId}       FbLegacyPlayerDoc
// ═════════════════════════════════════════════════════════════════════════════

/** Cache envelope shared by every on-demand doc. Plain numbers (unix ms) so the
 *  client can check freshness without touching Firestore Timestamps. */
export interface FbCached {
  fetchedAt: number;
  expiresAt: number;
}

/** Request kinds accepted by the `fbOnDemand` callable. */
export type FbOnDemandKind =
  | 'match' | 'matchPreview'
  | 'team' | 'teamFixtures' | 'teamStats'
  | 'player' | 'coach' | 'venue'
  | 'league' | 'leagueFixtures' | 'standings' | 'topPlayers'
  | 'search' | 'legacyPlayers';

/** Team crest URL (API-Sports media CDN) — lets slim rows omit the logo. */
export function fbTeamLogo(teamId: string | number): string {
  return `https://media.api-sports.io/football/teams/${teamId}.png`;
}
export function fbLeagueLogo(leagueId: string | number): string {
  return `https://media.api-sports.io/football/leagues/${leagueId}.png`;
}
export function fbPlayerPhoto(playerId: string | number): string {
  return `https://media.api-sports.io/football/players/${playerId}.png`;
}

// ── Slim fixture rows (season calendars) ─────────────────────────────────────

/**
 * A fixture without the fields that are constant per doc or derivable on the
 * client (logos come from `fbTeamLogo`, dates from `timestamp`). Keeps a full
 * league season (300-600 fixtures) comfortably under Firestore's 1 MB doc limit.
 */
export interface FbFixtureLite {
  id: string;
  timestamp: number;
  statusShort: string;
  round: string | null;
  homeId: string;
  homeName: string;
  awayId: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
  homePen?: number | null;
  awayPen?: number | null;
  /** Elapsed minute (live rows only). */
  minute?: number | null;
  venueId?: number | null;
  venueName?: string | null;
  venueCity?: string | null;
  /** 'home' | 'away' when API-Sports flags a winner (decides ties after pens/aggregate). */
  winner?: 'home' | 'away' | null;
  /** Only on team calendars, where rows span several competitions. */
  leagueId?: string;
  league?: string;
  season?: number;
}

export interface FbLeagueFixturesDoc extends FbCached {
  leagueId: string;
  season: number;
  fixtures: FbFixtureLite[];
  /** True when the season had more fixtures than fit and only the window around today was kept. */
  truncated: boolean;
}

export interface FbTeamFixturesDoc extends FbCached {
  teamId: string;
  season: number;
  fixtures: FbFixtureLite[];
}

// ── Match preview ────────────────────────────────────────────────────────────

export interface FbH2HRow {
  matchId: string;
  timestamp: number;
  homeTeam: FbTeamRef;
  awayTeam: FbTeamRef;
  homeScore: number;
  awayScore: number;
  leagueId: string;
  league: string;
  round: string | null;
  venueName: string | null;
}

export type FbAbsenceType = 'injury' | 'suspension' | 'international' | 'doubtful' | 'other';

export interface FbAbsence {
  playerId: string;
  name: string;
  photo: string;
  type: FbAbsenceType;
  /** Raw API-Sports reason, e.g. "Knee Injury", "Red Card", "Yellow Cards". */
  reason: string;
}

export interface FbSidePair { home: number; away: number }

export interface FbPrediction {
  /** Win probabilities, 0-100. */
  percent: { home: number; draw: number; away: number };
  advice: string | null;
  winnerTeamId: string | null;
  winOrDraw: boolean | null;
  /** e.g. "-3.5" (under 3.5) / "+1.5" (over 1.5); null when the model has no call. */
  underOver: string | null;
  goalsHome: string | null;
  goalsAway: string | null;
  /** Team comparison, 0-100 shares per side. */
  comparison: {
    form: FbSidePair; attack: FbSidePair; defense: FbSidePair; poisson: FbSidePair;
    h2h: FbSidePair; goals: FbSidePair; total: FbSidePair;
  } | null;
}

export interface FbFormRow {
  matchId: string;
  timestamp: number;
  opponent: FbTeamRef;
  isHome: boolean;
  goalsFor: number;
  goalsAgainst: number;
  result: 'W' | 'D' | 'L';
  league: string;
}

export interface FbVenue {
  id: number;
  name: string;
  city: string | null;
  country: string | null;
  address: string | null;
  capacity: number | null;
  surface: string | null;
  image: string | null;
}

export interface FbVenueDoc extends FbCached, FbVenue {}

export interface FbMatchPreviewDoc extends FbCached {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  /** Previous meetings, newest first. */
  h2h: FbH2HRow[];
  absences: { home: FbAbsence[]; away: FbAbsence[] };
  prediction: FbPrediction | null;
  /** Last finished matches per side, newest first (max 5). */
  form: { home: FbFormRow[]; away: FbFormRow[] };
  /** Unix ms of the last form fetch (form is refreshed less often than absences). */
  formFetchedAt: number;
  venue: FbVenue | null;
}

// ── Team ─────────────────────────────────────────────────────────────────────

export type FbPositionShort = 'POR' | 'DEF' | 'MED' | 'DEL' | 'JUG';

export interface FbSquadPlayer {
  id: string;
  name: string;
  age: number | null;
  number: number | null;
  position: FbPositionShort;
  photo: string;
}

export interface FbCoachRef {
  id: string;
  name: string;
  photo: string | null;
  age: number | null;
  nationality: string | null;
}

export interface FbTeamLeagueRef {
  leagueId: string;
  name: string;
  /** 'League' | 'Cup' */
  type: string;
  country: string;
  logo: string;
  season: number;
}

export interface FbTeamDoc extends FbCached {
  id: string;
  name: string;
  shortName: string;
  logo: string;
  country: string | null;
  founded: number | null;
  national: boolean;
  venue: FbVenue | null;
  coach: FbCoachRef | null;
  squad: FbSquadPlayer[];
  /** Competitions the team is playing this season (current season of each). */
  leagues: FbTeamLeagueRef[];
  /** The team's main competition (domestic league for clubs) — drives its table and calendar. */
  primaryLeagueId: string | null;
  primaryLeagueName: string | null;
  season: number | null;
}

export interface FbMinuteBucket { label: string; total: number; percentage: number }

export interface FbHomeAwayTotal { home: number; away: number; total: number }

export interface FbTeamStatsDoc extends FbCached {
  teamId: string;
  leagueId: string;
  season: number;
  /** Results oldest → newest, e.g. "WDWWL". */
  form: string;
  played: FbHomeAwayTotal;
  wins: FbHomeAwayTotal;
  draws: FbHomeAwayTotal;
  losses: FbHomeAwayTotal;
  goalsFor: FbHomeAwayTotal;
  goalsAgainst: FbHomeAwayTotal;
  goalsForAvg: FbHomeAwayTotal;
  goalsAgainstAvg: FbHomeAwayTotal;
  goalsForByMinute: FbMinuteBucket[];
  goalsAgainstByMinute: FbMinuteBucket[];
  cleanSheets: FbHomeAwayTotal;
  failedToScore: FbHomeAwayTotal;
  penalties: { scored: number; missed: number; total: number };
  biggest: {
    winHome: string | null; winAway: string | null;
    lossHome: string | null; lossAway: string | null;
    streakWins: number; streakDraws: number; streakLosses: number;
  };
  formations: Array<{ formation: string; played: number }>;
  yellowByMinute: FbMinuteBucket[];
  redByMinute: FbMinuteBucket[];
}

// ── Player / coach ───────────────────────────────────────────────────────────

export interface FbPlayerSeasonStat {
  season: number;
  leagueId: string;
  league: string;
  leagueLogo: string;
  teamId: string;
  team: string;
  teamLogo: string;
  number: number | null;
  position: string | null;
  captain: boolean;
  appearances: number;
  lineups: number;
  minutes: number;
  rating: number | null;
  subIn: number;
  subOut: number;
  bench: number;
  goals: number;
  assists: number;
  conceded: number;
  saves: number;
  shots: number;
  shotsOn: number;
  passes: number;
  keyPasses: number;
  /** Accurate passes per match as API-Sports reports it (not a percentage on recent seasons). */
  passAccuracy: number;
  tackles: number;
  blocks: number;
  interceptions: number;
  duels: number;
  duelsWon: number;
  dribbles: number;
  dribblesWon: number;
  foulsDrawn: number;
  foulsCommitted: number;
  yellow: number;
  yellowRed: number;
  red: number;
  penWon: number;
  penScored: number;
  penMissed: number;
  penSaved: number;
}

export interface FbPlayerCareerEntry {
  teamId: string;
  team: string;
  teamLogo: string;
  seasons: number[];
}

export interface FbPlayerDoc extends FbCached {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  photo: string;
  age: number | null;
  birthDate: string | null;
  birthPlace: string | null;
  birthCountry: string | null;
  nationality: string | null;
  heightCm: number | null;
  weightKg: number | null;
  injured: boolean;
  position: string | null;
  number: number | null;
  /** Club the player currently plays for (null when unknown / free agent). */
  currentTeam: FbTeamRef | null;
  nationalTeam: FbTeamRef | null;
  /** Per competition rows for the loaded seasons, newest season first. */
  stats: FbPlayerSeasonStat[];
  seasonsLoaded: number[];
  career: FbPlayerCareerEntry[];
}

export interface FbCoachDoc extends FbCached {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  photo: string | null;
  age: number | null;
  birthDate: string | null;
  birthPlace: string | null;
  birthCountry: string | null;
  nationality: string | null;
  team: FbTeamRef | null;
  /** Newest first. `end` null = current job. */
  career: Array<{ team: FbTeamRef; start: string | null; end: string | null }>;
}

// ── League ───────────────────────────────────────────────────────────────────

export interface FbLeagueSeason {
  year: number;
  start: string;
  end: string;
  current: boolean;
  standings: boolean;
}

export interface FbLeagueDoc extends FbCached {
  id: string;
  name: string;
  /** 'League' | 'Cup' */
  type: string;
  country: string;
  logo: string;
  flag: string | null;
  /** Newest first. */
  seasons: FbLeagueSeason[];
}

/** Entry of `fb_meta/leagueCatalog.leagues[leagueId]` (written nightly). */
export interface FbCatalogEntry {
  /** API name */ n: string;
  /** country */ c: string;
  /** 'League' | 'Cup' */ t: string;
  logo: string;
  flag: string | null;
  /** current season year */ s: number | null;
  /** current season has standings coverage */ st: boolean;
  /** current season start / end dates, 'YYYY-MM-DD' (absent on catalogs written before Nov 2026) */
  b?: string | null;
  e?: string | null;
}

// ── Search ───────────────────────────────────────────────────────────────────

export interface FbSearchTeam {
  id: string;
  name: string;
  shortName: string;
  logo: string;
  country: string | null;
  national: boolean;
}

export interface FbSearchPlayer {
  id: string;
  name: string;
  photo: string;
  nationality: string | null;
  position: string | null;
  age: number | null;
}

export interface FbSearchDoc extends FbCached {
  q: string;
  teams: FbSearchTeam[];
  players: FbSearchPlayer[];
}

/** `fb_meta/teamIndex` — every team of the curated leagues, for instant local search. */
export interface FbTeamIndexDoc {
  /** [teamId, name, leagueId] */
  teams: Array<{ i: string; n: string; l: string }>;
  updatedAt?: unknown;
}

// ── Legacy (Sportmonks) player ids ───────────────────────────────────────────

export interface FbLegacyPlayerDoc {
  smId: string;
  /** API-Sports player id, or null when no confident match was found. */
  afId: string | null;
  name: string | null;
  resolvedAt: number;
}

/** Synthetic numeric season key the app uses where it used to carry a provider
 *  season id: leagueId * 10000 + season year (e.g. Liga MX 2026 → 2622026). */
export function fbSeasonKey(leagueId: string | number, season: number): number {
  return Number(leagueId) * 10000 + season;
}
export function parseFbSeasonKey(key: number): { leagueId: number; season: number } | null {
  if (!Number.isFinite(key) || key < 10000) return null;
  const season = key % 10000;
  const leagueId = Math.floor(key / 10000);
  if (season < 1900 || season > 2200 || leagueId <= 0) return null;
  return { leagueId, season };
}
