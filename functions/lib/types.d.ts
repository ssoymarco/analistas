/**
 * types.ts
 *
 * Firestore document interfaces + SportMonks response types for Cloud Functions.
 * These mirror the client-side types but are optimized for server-side storage.
 */
import { Timestamp } from 'firebase-admin/firestore';
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
    /** Penalty shootout final score. Populated ONLY when the fixture's
     *  state_id reaches FT_PEN (8) — extracted from `scores[]` entries with
     *  `description: 'PENALTIES'` in `extractScores()`. UI surfaces these as
     *  the FotMob-style `"3-3 (4-2 pen)"` suffix and the 365scores-style
     *  "Argentina ganó en penales" caption. Absent / null on every other
     *  fixture, including ones still in regulation, ET, or that ended in
     *  a regular FT / AET decision. */
    homePenScore: number | null;
    awayPenScore: number | null;
    status: 'live' | 'finished' | 'scheduled';
    stateId: number;
    stateLabel: string | null;
    minute: number | null;
    time: string;
    league: string;
    leagueId: string;
    leagueLogo: string;
    date: string;
    startingAtUtc: string;
    seasonId: number | null;
    updatedAt: Timestamp;
    liveClock?: {
        periodStartedAt: number;
        periodMinuteOffset: number;
    };
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
    id: string;
    name: string;
    shortName: string;
    logo: string;
    /** Trinational teams have `country: ''` (no single country). */
    country: string;
    founded: number;
    venueName: string;
    venueCity: string;
    venueCapacity: number;
    venueImage: string;
    coachName: string;
    coachImage: string;
    coachAge: number;
    /** League this team is associated with — derived from the seed season used
     *  by syncTeams. Most teams belong to exactly one league, so this is fine
     *  as a denormalised field. */
    leagueId: number;
    leagueName: string;
    currentSeasonId: number | null;
    updatedAt: Timestamp;
}
/** One player's membership in a team's squad for a given season — stored
 *  inside SquadDoc.players. */
export interface SquadPlayerDoc {
    /** Squad entry id (unique per player-season-team) */
    id: number;
    playerId: number;
    name: string;
    displayName: string;
    number: number;
    positionId: number;
    /** ISO date of birth — empty string when unknown. Client computes age. */
    dateOfBirth: string;
    image: string;
    isCaptain: boolean;
    /** Current club (non-national) when this is a national-team squad — used
     *  to show e.g. "Real Madrid" next to a Brazil player. Empty for club
     *  squads (where the squad's own team IS the player's club). */
    clubName: string;
    clubLogo: string;
}
/** Full squad for a given (seasonId, teamId) — stored in squads/{seasonId}_{teamId}.
 *  Written by syncSquads (~daily). Replaces per-user fetchSquad calls. */
export interface SquadDoc {
    seasonId: number;
    teamId: number;
    players: SquadPlayerDoc[];
    updatedAt: Timestamp;
}
/** Snapshot for diff detection — stored in _meta/livescoresSnapshot.
 *  Counts track running totals per side so the detector can fire a change
 *  event when any count goes up since the last poll. */
export interface LivescoresSnapshot {
    matches: Record<string, {
        homeScore: number;
        awayScore: number;
        status: string;
        stateId: number;
        redCardsHome: number;
        redCardsAway: number;
        yellowCardsHome: number;
        yellowCardsAway: number;
        substitutionsHome: number;
        substitutionsAway: number;
        reminderSent?: boolean;
        lineupsSent?: boolean;
    }>;
    updatedAt: Timestamp;
}
export type ChangeType = 'goal' | 'goalCancelled' | 'matchStart' | 'halftime' | 'matchEnd' | 'extraTimeStart' | 'penaltiesStart' | 'redCard' | 'yellowCard' | 'substitution' | 'matchSuspended' | 'matchReminder' | 'lineups' | 'statusChange';
export interface DetectedChange {
    type: ChangeType;
    matchId: string;
    homeTeam: TeamDoc;
    awayTeam: TeamDoc;
    homeScore: number;
    awayScore: number;
    league: string;
    leagueId: string;
    /** Which side caused the event (goal / card / substitution) */
    scoringTeamSide?: 'home' | 'away';
    /** Subtype for goals: 'normal' | 'penalty' | 'own'. Default = 'normal'. */
    goalKind?: 'normal' | 'penalty' | 'own';
    /** Goal scorer / card recipient (best-effort, may be missing). */
    scorerName?: string;
    /** Player involved in the event (red cards, yellow cards). */
    playerName?: string;
    /** For substitutions: the player coming ON (replacing playerName). */
    relatedPlayerName?: string;
    /** Match minute when the event occurred. */
    minute?: number | null;
}
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
    type_id: number;
    started: number | null;
    ended: number | null;
    counts_from: number;
    ticking: boolean;
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
    standings?: {
        data: SMStandingEntry[];
    };
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
export declare const SM_STATE_IDS: {
    readonly NOT_STARTED: 1;
    readonly FIRST_HALF: 2;
    readonly HALF_TIME: 3;
    readonly SECOND_HALF: 22;
    readonly ET_BREAK: 4;
    readonly EXTRA_TIME: 6;
    readonly EXTRA_TIME_BREAK: 21;
    readonly PENALTIES: 9;
    readonly PEN_BREAK: 25;
    readonly FULL_TIME: 5;
    readonly FINISHED_AET: 7;
    readonly FINISHED_PENALTIES: 8;
    readonly AWARDED: 17;
    readonly POSTPONED: 10;
    readonly SUSPENDED: 11;
    readonly CANCELLED: 12;
    readonly TBA: 13;
    readonly WALK_OVER: 14;
    readonly ABANDONED: 15;
    readonly DELAYED: 16;
    readonly INTERRUPTED: 18;
    readonly AWAITING_UPDATES: 19;
    readonly DELETED: 20;
    readonly PENDING: 26;
    /** @deprecated use SECOND_HALF — kept as alias so existing imports compile. */
    readonly BREAK: 4;
    /** @deprecated use FINISHED_PENALTIES — kept as alias. */
    readonly FINISHED_PEN: 8;
    /** @deprecated use TBA — kept as alias. */
    readonly TBD: 13;
};
/** State IDs where the match is actively being played — UI shows live tab. */
export declare const LIVE_STATE_IDS: Set<number>;
/** State IDs where the match has concluded normally — UI shows summary tab. */
export declare const FINISHED_STATE_IDS: Set<number>;
/** State IDs where the match will NOT proceed normally — never infer "live"
 *  from time even if kickoff was hours ago. Keeps the time-based fallback in
 *  `getMatchStatus` from second-guessing a definitive "won't happen" signal. */
export declare const DEAD_STATE_IDS: Set<number>;
/** Standing detail type_id → meaning */
export declare const STANDING_DETAIL_TYPES: {
    readonly GP: 129;
    readonly W: 130;
    readonly D: 131;
    readonly L: 132;
    readonly GF: 133;
    readonly GA: 134;
    readonly GD: 179;
};
/** SportMonks event type_id → semantic meaning. Mirrors the client-side
 *  SM_EVENT_TYPES in src/services/sportmonks.ts — keep both in sync.
 *
 *  ⚠️ Verified 2026-05-29 against docs.sportmonks.com/v3/definitions/types/events.
 *  PENALTY_GOAL↔OWN_GOAL (15/16) and RED_CARD↔SECOND_YELLOW (20/21) were
 *  previously swapped. Red-card DETECTION here was unaffected (countRedCards
 *  matches the {RED_CARD, SECOND_YELLOW} set, identical either way), but the
 *  goalKind label and timeline icons were wrong. */
export declare const SM_EVENT_TYPES: {
    readonly GOAL: 14;
    readonly PENALTY_GOAL: 16;
    readonly OWN_GOAL: 15;
    readonly PENALTY_MISS: 17;
    readonly SUBSTITUTION: 18;
    readonly YELLOW_CARD: 19;
    readonly SECOND_YELLOW: 21;
    readonly RED_CARD: 20;
    /** Penalty shootout kick — missed (type_id 22). Distinct from in-play
     *  PENALTY_MISS (17). Only appears on fixtures that go to a shootout. */
    readonly PENALTY_SHOOTOUT_MISS: 22;
    /** Penalty shootout kick — scored (type_id 23). Distinct from in-play
     *  PENALTY_GOAL (16). Pair with PENALTY_SHOOTOUT_MISS to render the
     *  full kick-by-kick shootout timeline. */
    readonly PENALTY_SHOOTOUT_GOAL: 23;
    readonly VAR: 24;
};
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
