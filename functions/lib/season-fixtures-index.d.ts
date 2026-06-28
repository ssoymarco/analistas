import { admin } from './admin-init';
/**
 * Fields the client's matchFromDoc() reads. MUST be a superset of everything
 * matchFromDoc touches — omitting a present field would silently break the
 * fixtures list or the cup bracket. Selecting a field that doesn't exist on a
 * given doc is harmless (Firestore just omits it). Deliberately EXCLUDES the
 * heavy fields: detail, detailUpdatedAt, h2h, h2hUpdatedAt, sidelinedHome,
 * sidelinedAway, lineupsSent, updatedAt.
 */
export declare const SEASON_FIXTURE_LIGHT_FIELDS: readonly ["id", "homeTeam", "awayTeam", "homeScore", "awayScore", "homeScoreHT", "awayScoreHT", "homePenScore", "awayPenScore", "status", "stateId", "stateLabel", "minute", "time", "league", "leagueId", "leagueLogo", "date", "startingAtUtc", "seasonId", "liveClock", "stageId", "roundId", "groupId", "stage", "round", "group", "venueId", "venueName", "venueCity"];
export interface SeasonFixturesDoc {
    seasonId: number;
    count: number;
    fixtures: Record<string, unknown>[];
    updatedAt: admin.firestore.Timestamp;
}
/**
 * Rebuild season_fixtures/{seasonId} from the matches collection using a
 * light-field projection. Returns the number of fixtures written.
 */
export declare function rebuildSeasonFixturesIndex(seasonId: number): Promise<number>;
/**
 * Rebuild the index for a set of seasons (deduped). Called after syncFixtures /
 * backfill batch writes. Failures are isolated per season so one bad season
 * doesn't abort the rest.
 */
export declare function rebuildSeasonFixturesForSeasons(seasonIds: Iterable<number>): Promise<void>;
