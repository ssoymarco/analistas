/**
 * types.ts
 *
 * Firestore document interfaces + SportMonks response types for Cloud Functions.
 * These mirror the client-side types but are optimized for server-side storage.
 */

import { Timestamp } from 'firebase-admin/firestore';

// ── Firestore Document Types ────────────────────────────────────────────────

export interface TeamDoc {
  id: string;
  name: string;
  shortName: string;
  logo: string;
}

export interface MatchDoc {
  id: string;
  homeTeam: TeamDoc;
  awayTeam: TeamDoc;
  homeScore: number;
  awayScore: number;
  homeScoreHT: number | null;
  awayScoreHT: number | null;
  status: 'live' | 'finished' | 'scheduled';
  stateId: number;
  stateLabel: string | null;
  minute: number | null;
  time: string;
  league: string;
  leagueId: string;
  leagueLogo: string;
  date: string;               // 'YYYY-MM-DD'
  startingAtUtc: string;      // raw SM starting_at
  seasonId: number | null;
  updatedAt: Timestamp;

  // ── Live clock anchor (populated by pollLivescores during in-play) ──
  // Lets the client smoothly tick the displayed minute between server polls.
  // periodStartedAt = unix seconds when the current period kicked off.
  // periodMinuteOffset = base minute for the period (0 for 1H, 45 for 2H, etc.).
  // Absent for scheduled, halftime, and finished matches (the client falls back
  // to `minute` in those cases).
  liveClock?: {
    periodStartedAt: number;
    periodMinuteOffset: number;
  };

  // ── Enrichment (populated by syncMatchEnrichment + pollLivescores) ──
  // Raw SM fixture payload with all includes. Stored as opaque JSON because
  // the shape is complex (20+ sub-types) and the client already knows how to
  // unpack a raw SMFixture into MatchDetail via the existing sportsApi mapper.
  // Null when the match hasn't been enriched yet (will be populated by the
  // next sync run if the match is in the hot window: live, near-kickoff, or
  // recently-finished).
  detail?: unknown;
  /** ISO/Timestamp of last enrichment fetch — used by the sync to skip
   *  matches that were updated very recently. */
  detailUpdatedAt?: Timestamp;
  /** H2H fixtures between home and away — fetched separately because
   *  /fixtures/{id} doesn't include it. Lightweight payload. */
  h2h?: unknown[];
  /** Cached injury / suspension lists per team. Updated alongside detail. */
  sidelinedHome?: unknown[];
  sidelinedAway?: unknown[];
}

export interface StandingRowDoc {
  position: number;
  team: TeamDoc;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  groupId: number | null;
}

export interface StandingsDoc {
  seasonId: number;
  leagueId: number;
  rows: StandingRowDoc[];
  updatedAt: Timestamp;
}

export interface TopScorerDoc {
  playerId: string;
  playerName: string;
  playerImage: string;
  teamName: string;
  teamLogo: string;
  goals: number;
  assists: number;
  position: number;
}

export interface TopScorersDoc {
  seasonId: number;
  leagueId: number;
  /** Goal scorers (SM type_id 208) — historical primary field. */
  scorers: TopScorerDoc[];
  /** Top assists (SM type_id 209). Optional — populated by syncTopScorers
   *  when the season has assists data. */
  assists?: TopScorerDoc[];
  /** Top yellow-card receivers (SM type_id 84). Optional. */
  cards?: TopScorerDoc[];
  updatedAt: Timestamp;
}

/** Full team info — stored in teams/{teamId}. Written by syncTeams (~daily).
 *  Replaces per-user fetchTeamById calls from the client. */
export interface TeamFullDoc {
  id:           string;
  name:         string;
  shortName:    string;
  logo:         string;
  /** Trinational teams have `country: ''` (no single country). */
  country:      string;
  founded:      number;            // 0 when unknown
  venueName:    string;
  venueCity:    string;
  venueCapacity: number;
  venueImage:   string;
  coachName:    string;
  coachImage:   string;
  coachAge:     number;            // 0 when unknown
  /** League this team is associated with — derived from the seed season used
   *  by syncTeams. Most teams belong to exactly one league, so this is fine
   *  as a denormalised field. */
  leagueId:     number;
  leagueName:   string;
  currentSeasonId: number | null;
  updatedAt:    Timestamp;
}

/** One player's membership in a team's squad for a given season — stored
 *  inside SquadDoc.players. */
export interface SquadPlayerDoc {
  /** Squad entry id (unique per player-season-team) */
  id:           number;
  playerId:     number;
  name:         string;
  displayName:  string;
  number:       number;
  positionId:   number;
  /** ISO date of birth — empty string when unknown. Client computes age. */
  dateOfBirth:  string;
  image:        string;
  isCaptain:    boolean;
  /** Current club (non-national) when this is a national-team squad — used
   *  to show e.g. "Real Madrid" next to a Brazil player. Empty for club
   *  squads (where the squad's own team IS the player's club). */
  clubName:     string;
  clubLogo:     string;
}

/** Full squad for a given (seasonId, teamId) — stored in squads/{seasonId}_{teamId}.
 *  Written by syncSquads (~daily). Replaces per-user fetchSquad calls. */
export interface SquadDoc {
  seasonId:  number;
  teamId:    number;
  players:   SquadPlayerDoc[];
  updatedAt: Timestamp;
}

/** Snapshot for diff detection — stored in _meta/livescoresSnapshot.
 *  redCardsHome / redCardsAway track the running count of red cards per side
 *  so the detector can fire a 'redCard' DetectedChange when the count goes up. */
export interface LivescoresSnapshot {
  matches: Record<string, {
    homeScore: number;
    awayScore: number;
    status: string;
    stateId: number;
    redCardsHome: number;
    redCardsAway: number;
  }>;
  updatedAt: Timestamp;
}

// ── Change Detection Types ──────────────────────────────────────────────────

export type ChangeType =
  | 'goal'         // Regular goal (subtype carries 'normal' | 'penalty' | 'own')
  | 'goalCancelled'// Goal scored then disallowed (VAR overturned)
  | 'matchStart'   // Kickoff (transition: scheduled → live, state 1)
  | 'halftime'     // First-half ended (state 12)
  | 'matchEnd'     // Final whistle (transition: live → finished)
  | 'redCard'      // Red card shown (count went up since last poll)
  | 'statusChange';// Catch-all for any other state transition (paused, suspended, etc.)

export interface DetectedChange {
  type: ChangeType;
  matchId: string;
  homeTeam: TeamDoc;
  awayTeam: TeamDoc;
  homeScore: number;
  awayScore: number;
  league: string;
  leagueId: string;
  /** Which side caused the event (for goal/redCard) */
  scoringTeamSide?: 'home' | 'away';
  /** Subtype for goals: 'normal' | 'penalty' | 'own'. Default = 'normal'. */
  goalKind?: 'normal' | 'penalty' | 'own';
  /** Goal scorer name + minute (best-effort — may be missing if SportMonks
   *  hasn't published the event payload yet, in which case the notification
   *  goes out without the name). */
  scorerName?: string;
  /** For red cards: the player who was sent off (best-effort, may be missing). */
  playerName?: string;
  /** Match minute when the event occurred. */
  minute?: number | null;
}

// ── SportMonks Response Types (server-side) ─────────────────────────────────

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
}

export interface SMParticipant {
  id: number;
  name: string;
  short_code: string;
  image_path: string;
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
  description: string;
  score: {
    goals: number;
    participant: string;
  };
  participant_id: number;
}

export interface SMState {
  id: number;
  state: string;
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
  category: number;
}

/** SportMonks period — one phase of the match (1H, HT, 2H, ET, PEN). */
export interface SMPeriod {
  id: number;
  fixture_id: number;
  type_id: number;          // 1=1H, 2=HT, 3=2H, 4=ET, 5=PEN
  started: number | null;   // epoch seconds — when this period kicked off
  ended: number | null;
  counts_from: number;      // 0, 45, 60, 75, 90 — base minute for this period
  ticking: boolean;         // true if this period is currently running
  sort_order: number;
  description?: string;
  time_added?: number | null;
  period_length?: number;
  minutes?: number;
  seconds?: number | null;
  has_timer?: boolean;
}

export interface SMFixture {
  id: number;
  sport_id: number;
  league_id: number;
  season_id: number;
  stage_id: number;
  round_id: number;
  state_id: number;
  venue_id: number;
  name: string;
  starting_at: string;
  result_info: string;
  leg: string;
  details: string;
  length: number;
  placeholder: boolean;
  has_odds: boolean;
  starting_at_timestamp: number;
  participants?: SMParticipant[];
  scores?: SMScore[];
  state?: SMState;
  league?: SMLeague;
  /** include=periods — required for live clock extrapolation. */
  periods?: SMPeriod[];
  /** include=events — required for red card / scorer detection. */
  events?: SMFixtureEvent[];
}

export interface SMStandingDetail {
  id: number;
  standing_id: number;
  type_id: number;
  value: number;
}

export interface SMStandingEntry {
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
  result: string;
  points: number;
  participant?: SMParticipant;
  details?: SMStandingDetail[];
}

export interface SMStandingGroup {
  id: number;
  name: string;
  league_id: number;
  season_id: number;
  stage_id: number;
  standings?: { data: SMStandingEntry[] };
}

export interface SMTopScorer {
  id: number;
  season_id: number;
  player_id: number;
  type_id: number;
  participant_id: number;
  position: number;
  total: number;
  player?: {
    id: number;
    sport_id: number;
    country_id: number;
    nationality_id: number;
    city_id: number;
    position_id: number;
    common_name: string;
    display_name: string;
    image_path: string;
  };
  /** Team the scorer plays for — included via `participant` query param */
  participant?: {
    id: number;
    name: string;
    short_code?: string;
    image_path?: string;
  };
}

// ── SM State & Event Constants ──────────────────────────────────────────────

/**
 * SportMonks v3 Football API state IDs.
 *
 * Verified 2026-05-28 against docs.sportmonks.com/v3/tutorials-and-guides/
 * tutorials/includes/states — the OFFICIAL state developer_name table.
 *
 * ⚠️ HISTORICAL NOTE — the previous map was scrambled (BREAK=8, SECOND_HALF=4,
 * FINISHED_PENALTIES=10, etc.) which caused a critical production bug: live
 * 2nd-half matches were misclassified as `scheduled` because SportMonks
 * reports `state_id: 22` for INPLAY_2ND_HALF, but our LIVE_STATE_IDS set only
 * had {2, 3, 4, 6, 7, 8}. Every match silently reverted to the "Previa"
 * screen ~2-3 min into the second half (when SM finalized the transition).
 * Source of the wrong map: appears to have come from an unrelated reference,
 * not SportMonks docs.
 */
export const SM_STATE_IDS = {
  // ── Pre-match ──────────────────────────────────────────────────────────
  NOT_STARTED: 1,

  // ── Live, regulation ───────────────────────────────────────────────────
  FIRST_HALF: 2,                  // INPLAY_1ST_HALF
  HALF_TIME: 3,                   // HT
  SECOND_HALF: 22,                // INPLAY_2ND_HALF — was wrongly 4

  // ── Live, beyond regulation ────────────────────────────────────────────
  ET_BREAK: 4,                    // BREAK: regulation over, awaiting ET start (was wrongly 8)
  EXTRA_TIME: 6,                  // INPLAY_ET
  EXTRA_TIME_BREAK: 21,           // Between ET halves
  PENALTIES: 9,                   // INPLAY_PENALTIES — was wrongly 7
  PEN_BREAK: 25,                  // Between penalty rounds — was wrongly TBD

  // ── Finished ───────────────────────────────────────────────────────────
  FULL_TIME: 5,                   // FT
  FINISHED_AET: 7,                // AET — was wrongly 9
  FINISHED_PENALTIES: 8,          // FT_PEN — was wrongly 10
  AWARDED: 17,                    // Winner decided administratively (was wrongly ABANDONED)

  // ── Dead / not-played ──────────────────────────────────────────────────
  POSTPONED: 10,                  // was wrongly 13
  SUSPENDED: 11,                  // will continue later (was wrongly 15)
  CANCELLED: 12,                  // was wrongly 14
  TBA: 13,                        // To Be Announced (was wrongly TBD=25)
  WALK_OVER: 14,                  // WO
  ABANDONED: 15,                  // was wrongly 17
  DELAYED: 16,                    // kick-off pushed (new)
  INTERRUPTED: 18,                // was wrongly 16
  AWAITING_UPDATES: 19,           // SM has no recent data (new)
  DELETED: 20,                    // was wrongly 22
  PENDING: 26,                    // awaiting data/verification (new)

  // ── Aliases kept for backwards-compatible imports ──────────────────────
  /** @deprecated use SECOND_HALF — kept as alias so existing imports compile. */
  BREAK: 4,
  /** @deprecated use FINISHED_PENALTIES — kept as alias. */
  FINISHED_PEN: 8,
  /** @deprecated use TBA — kept as alias. */
  TBD: 13,
} as const;

/** State IDs where the match is actively being played — UI shows live tab. */
export const LIVE_STATE_IDS = new Set<number>([
  SM_STATE_IDS.FIRST_HALF,        // 2
  SM_STATE_IDS.HALF_TIME,         // 3
  SM_STATE_IDS.SECOND_HALF,       // 22 ← the fix
  SM_STATE_IDS.ET_BREAK,          // 4
  SM_STATE_IDS.EXTRA_TIME,        // 6
  SM_STATE_IDS.EXTRA_TIME_BREAK,  // 21
  SM_STATE_IDS.PENALTIES,         // 9
  SM_STATE_IDS.PEN_BREAK,         // 25
]);

/** State IDs where the match has concluded normally — UI shows summary tab. */
export const FINISHED_STATE_IDS = new Set<number>([
  SM_STATE_IDS.FULL_TIME,         // 5
  SM_STATE_IDS.FINISHED_AET,      // 7
  SM_STATE_IDS.FINISHED_PENALTIES,// 8
  SM_STATE_IDS.AWARDED,           // 17
]);

/** State IDs where the match will NOT proceed normally — never infer "live"
 *  from time even if kickoff was hours ago. Keeps the time-based fallback in
 *  `getMatchStatus` from second-guessing a definitive "won't happen" signal. */
export const DEAD_STATE_IDS = new Set<number>([
  SM_STATE_IDS.POSTPONED,         // 10
  SM_STATE_IDS.SUSPENDED,         // 11
  SM_STATE_IDS.CANCELLED,         // 12
  SM_STATE_IDS.WALK_OVER,         // 14
  SM_STATE_IDS.ABANDONED,         // 15
  SM_STATE_IDS.DELAYED,           // 16
  SM_STATE_IDS.INTERRUPTED,       // 18
  SM_STATE_IDS.DELETED,           // 20
]);

/** Standing detail type_id → meaning */
export const STANDING_DETAIL_TYPES = {
  GP: 129,   // Games Played
  W: 130,    // Won
  D: 131,    // Drawn
  L: 132,    // Lost
  GF: 133,   // Goals For
  GA: 134,   // Goals Against
  GD: 179,   // Goal Difference
} as const;

/** SportMonks event type_id → semantic meaning. Mirrors the client-side
 *  SM_EVENT_TYPES in src/services/sportmonks.ts — keep both in sync. */
export const SM_EVENT_TYPES = {
  GOAL: 14,
  PENALTY_GOAL: 15,
  OWN_GOAL: 16,
  PENALTY_MISS: 17,
  SUBSTITUTION: 18,
  YELLOW_CARD: 19,
  SECOND_YELLOW: 20,
  RED_CARD: 21,
  VAR: 24,
} as const;

/** Subset of a SportMonks event payload we care about for change detection.
 *  The full payload has more fields; we only type what we read. */
export interface SMFixtureEvent {
  id: number;
  fixture_id: number;
  type_id: number;
  participant_id?: number;
  minute?: number | null;
  extra_minute?: number | null;
  player_id?: number | null;
  player_name?: string | null;
  related_player_id?: number | null;
  related_player_name?: string | null;
  result?: string | null;
  /** SportMonks sometimes marks goals as cancelled by VAR. */
  cancelled?: boolean;
  /** Some VAR events have an `info` string explaining the call. */
  info?: string | null;
}
