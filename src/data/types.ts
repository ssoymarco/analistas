// ── Core Types ────────────────────────────────────────────────────────────────
// These interfaces mirror the shape of SportMonks API v3 responses.
// When integrating the real API, map the API response to these types in
// src/services/sportsApi.ts — no component code should change.

export interface Team {
  id: string;
  name: string;
  shortName: string;
  logo: string; // emoji or image URL
}

export type MatchStatus = 'live' | 'finished' | 'scheduled';

export interface Match {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number;
  awayScore: number;
  status: MatchStatus;
  time: string;           // display time: "20:00", "45'", "FT"
  minute?: number;        // live minute
  league: string;         // display name
  leagueId: string;
  date: string;           // ISO "YYYY-MM-DD"
  isFavorite?: boolean;
  startingAtUtc?: string; // raw SM "YYYY-MM-DD HH:MM:SS" UTC — used for countdown
  seasonId?: number;      // SM season ID — used for standings tab
  homeScoreHT?: number;   // half-time score (home)
  awayScoreHT?: number;   // half-time score (away)
  stateLabel?: string;    // "1T" | "HT" | "2T" | "ET" | "PEN" — live state
}

export interface LeagueStanding {
  position: number;
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface League {
  id: string;
  name: string;
  country: string;
  logo: string; // emoji or image URL
}

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  content?: string;   // full article body (paragraphs separated by \n\n)
  image: string;
  source: string;
  time: string;
  category: string;
  sections?: Array<'para-ti' | 'siguiendo' | 'ultimas'>;
  timeAgo?: number; // minutes ago
}

// ── Player & Team Detail ──────────────────────────────────────────────────────

export interface PlayerDetail {
  id: string;
  name: string;
  shortName: string;
  nationality: string;
  nationalityFlag: string;
  position: string;
  positionShort: string;
  age: number;
  height: string;
  weight: string;
  foot: string;
  teamId: string;
  teamName: string;
  teamLogo: string;
  leagueName: string;
  number: number;
  emoji: string;
  stats: {
    appearances: number;
    goals: number;
    assists: number;
    minutesPlayed: number;
    yellowCards: number;
    redCards: number;
    rating: number;
  };
  seasonStats: {
    season: string;
    team: string;
    appearances: number;
    goals: number;
    assists: number;
  }[];
}

export interface TeamDetailData {
  id: string;
  name: string;
  shortName: string;
  logo: string;
  founded: number;
  country: string;
  countryFlag: string;
  stadium: string;
  stadiumCapacity: number;
  leagueId: string;
  leagueName: string;
  coach: string;
  standing?: LeagueStanding;
  recentMatches: Match[];
  topPlayers: PlayerDetail[];
}

// ── Match Detail ──────────────────────────────────────────────────────────────

export interface MatchVenue {
  name: string;
  city: string;
  capacity: number;
  attendance?: number;
  surface: string;
  image?: string;
}

export interface MatchReferee {
  name: string;
  nationality: string;
  flag: string;
}

export interface MatchWeather {
  temp: number;
  description: string;
  icon: string;
  wind: number;
  humidity: number;
}

export type MatchEventType =
  | 'goal'
  | 'own-goal'
  | 'penalty-goal'
  | 'penalty-miss'
  | 'yellow'
  | 'second-yellow'
  | 'red'
  | 'sub'
  | 'var';

export interface MatchEvent {
  id: string;
  minute: number;
  addedTime?: number;
  type: MatchEventType;
  team: 'home' | 'away';
  player: string;
  relatedPlayer?: string;
  description?: string;
  xG?: number;
}

export interface MatchStatCategory {
  category: string;
  stats: {
    label: string;
    home: number;
    away: number;
    unit?: string;
    type?: 'percentage' | 'number';
  }[];
}

export interface PlayerRating {
  name: string;
  number: number;
  position: string;
  rating: number;
  goals?: number;
  assists?: number;
  shots?: number;
  keyPasses?: number;
  tackles?: number;
  saves?: number;
  touches: number;
  passAccuracy: number;
  duelsWon?: number;
  isMOTM?: boolean;
}

export interface OddsMarket {
  name: string;
  options: {
    label: string;
    value: number;
    trend?: 'up' | 'down' | 'stable';
  }[];
}

export interface H2HResult {
  date: string;
  homeScore: number;
  awayScore: number;
  competition: string;
  venue: string;
}

export interface MissingPlayer {
  name: string;
  reason: 'injury' | 'suspension' | 'international' | 'other';
  detail: string;
}

export interface LineupPlayer {
  id: string;
  name: string;
  shortName: string;
  number: number;
  position: string;
  positionShort: string;
  x: number; // 0–100 percentage on pitch width
  y: number; // 0–100 percentage on pitch height (0 = own goal, 50 = midfield)
  formationRow?: number;  // SM row number (1=GK, 2=def, etc.)
  formationCol?: number;  // column index within row
  formationRowSize?: number; // total players in this row
  rating?: number;
  isCaptain?: boolean;
  isSubstituted?: boolean;
  substituteMinute?: number;
  yellowCard?: boolean;
  redCard?: boolean;
  goals?: number;
  assists?: number;
  nationality?: string;
  nationalityFlag?: string;
  imageUrl?: string;
}

export interface MatchLineup {
  formation: string;
  starters: LineupPlayer[];
  bench: LineupPlayer[];
  coach: string;
  coachNationality: string;
}

export interface TVStation {
  name: string;
  country?: string;
  logo?: string;
}

export interface MatchCommentary {
  minute: number | null;
  extraMinute: number | null;
  comment: string;
  important: boolean;
}

export interface MatchPrediction {
  type: string;     // "Fulltime Result", "BTTS", "Over/Under 2.5"
  homeWin?: number; // probability 0-100
  draw?: number;
  awayWin?: number;
  yes?: number;
  no?: number;
}

export interface TeamFormEntry {
  matchId: string;
  opponent: string;
  opponentLogo: string;
  isHome: boolean;
  goalsFor: number;
  goalsAgainst: number;
  result: 'W' | 'D' | 'L';
  date: string;
  league: string;
}

export interface RefereeStats {
  yellowCardsPerMatch: number;
  redCardsPerMatch: number;
  foulsPerMatch: number;
  penaltiesPerMatch: number;
  totalMatches: number;
}

export interface PressureIndex {
  home: number; // 0-100 dominance %
  away: number;
  homeAttacks: number;
  awayAttacks: number;
  homeDangerousAttacks: number;
  awayDangerousAttacks: number;
}

export interface MatchDetail {
  matchId: string;
  venue: MatchVenue;
  referee: MatchReferee;
  assistantReferees?: string[];
  fourthOfficial?: string;
  refereeStats?: RefereeStats;
  weather?: MatchWeather;
  events: MatchEvent[];
  statistics: MatchStatCategory[];
  homeLineup: MatchLineup;
  awayLineup: MatchLineup;
  homePlayerRatings: PlayerRating[];
  awayPlayerRatings: PlayerRating[];
  odds: OddsMarket[];
  h2h: {
    homeTeam: string;
    awayTeam: string;
    results: H2HResult[];
  };
  missingPlayers: {
    home: MissingPlayer[];
    away: MissingPlayer[];
  };
  tvStations?: TVStation[];
  commentaries?: MatchCommentary[];
  resultInfo?: string;
  predictions?: MatchPrediction[];
  homeForm?: TeamFormEntry[];
  awayForm?: TeamFormEntry[];
  pressureIndex?: PressureIndex;
}
