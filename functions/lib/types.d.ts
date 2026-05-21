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
/** Snapshot for diff detection — stored in _meta/livescoresSnapshot */
export interface LivescoresSnapshot {
    matches: Record<string, {
        homeScore: number;
        awayScore: number;
        status: string;
        stateId: number;
    }>;
    updatedAt: Timestamp;
}
export type ChangeType = 'goal' | 'matchStart' | 'matchEnd' | 'statusChange';
export interface DetectedChange {
    type: ChangeType;
    matchId: string;
    homeTeam: TeamDoc;
    awayTeam: TeamDoc;
    homeScore: number;
    awayScore: number;
    league: string;
    leagueId: string;
    /** Which side scored (for goal events) */
    scoringTeamSide?: 'home' | 'away';
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
export declare const SM_STATE_IDS: {
    readonly NOT_STARTED: 1;
    readonly FIRST_HALF: 2;
    readonly HALF_TIME: 3;
    readonly SECOND_HALF: 4;
    readonly FULL_TIME: 5;
    readonly EXTRA_TIME: 6;
    readonly PENALTIES: 7;
    readonly BREAK: 8;
    readonly FINISHED_AET: 9;
    readonly FINISHED_PENALTIES: 10;
    readonly POSTPONED: 13;
    readonly CANCELLED: 14;
    readonly SUSPENDED: 15;
    readonly INTERRUPTED: 16;
    readonly ABANDONED: 17;
    readonly DELETED: 22;
    readonly TBD: 25;
};
export declare const LIVE_STATE_IDS: Set<4 | 8 | 2 | 3 | 6 | 7>;
export declare const FINISHED_STATE_IDS: Set<9 | 5 | 10>;
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
