import { admin } from './admin-init';
/**
 * Fields the client's matchFromDoc() reads. MUST be a superset of everything
 * matchFromDoc touches — omitting a present field would silently break the
 * fixtures list or the cup bracket. Selecting a field that doesn't exist on a
 * given doc is harmless (Firestore just omits it). Deliberately EXCLUDES the
 * heavy fields: detail, detailUpdatedAt, h2h, h2hUpdatedAt, sidelinedHome,
 * sidelinedAway, lineupsSent, updatedAt.
 */
export declare const SEASON_FIXTURE_LIGHT_FIELDS: readonly ["id", "homeTeam", "awayTeam", "homeScore", "awayScore", "homeScoreHT", "awayScoreHT", "homePenScore", "awayPenScore", "status", "stateId", "stateLabel", "minute", "time", "league", "leagueId", "leagueLogo", "date", "startingAtUtc", "seasonId", "liveClock", "stageId", "roundId", "groupId", "stage", "round", "group", "venueId", "venueName", "venueCity", "details", "homePlaceholder", "awayPlaceholder"];
/**
 * Upper bound on shards per season. 8 × 750 KB is far more than any real
 * competition needs; it exists so a runaway season (a bad seasonId mapping,
 * an SM data glitch) can't quietly turn one league into megabytes of client
 * egress. Overflow past this is dropped AND logged — never silently.
 */
export declare const MAX_SEASON_FIXTURE_SHARDS = 8;
/**
 * Byte size Firestore attributes to a single field value.
 *
 * Exported so the packing math can be checked against production data without
 * a write: fed the 2,000 fixtures that produced the 2026-08-05 failure, this
 * reproduces Firestore's reported 1,798,204 bytes exactly.
 */
export declare function firestoreValueBytes(v: unknown): number;
/** Total size Firestore will bill/enforce for a season_fixtures shard. */
export declare function shardDocBytes(docId: string, payload: Record<string, unknown>): number;
/**
 * Shrink one fixture to what the client actually consumes.
 *
 * Every transformation here is backward compatible with app builds already in
 * the wild: `matchFromDoc` maps each optional field through `?? undefined`, so
 * an omitted key is indistinguishable from an explicit null.
 *
 * Measured on season 26740: 899 B → 691 B per fixture (−23%).
 */
export declare function compactFixture(raw: Record<string, unknown>): Record<string, unknown>;
export interface SeasonFixturesDoc {
    seasonId: number;
    /** TOTAL fixtures for the season, across every shard. */
    count: number;
    /** Fixtures in THIS shard. */
    shardFixtureCount: number;
    /** How many shards make up this season. 1 = unsharded. Published on shard 0. */
    shardCount: number;
    /** 0-based position of this shard. */
    shardIndex: number;
    fixtures: Record<string, unknown>[];
    updatedAt: admin.firestore.Timestamp;
}
export interface SeasonIndexRebuildStats {
    seasonId: number;
    /** Fixtures actually written (after any shard-overflow drop). */
    count: number;
    /** Fixtures read from `matches` before packing. */
    fetched: number;
    shardCount: number;
    /** Total bytes written across shards. */
    bytes: number;
    /** Largest single shard, in bytes. */
    maxShardBytes: number;
    /** Fixtures dropped because the season exceeded MAX_SEASON_FIXTURE_SHARDS. */
    dropped: number;
    /** True when the `matches` read hit MAX_FIXTURES_PER_SEASON. */
    readTruncated: boolean;
}
/** Doc id for a shard. Shard 0 keeps the bare `{seasonId}` id, so a reader
 *  that knows nothing about sharding still finds a valid index. */
export declare function shardDocId(seasonId: number, shardIndex: number): string;
/**
 * Rebuild season_fixtures/{seasonId} (+ overflow shards) from the matches
 * collection using a light-field projection.
 *
 * Throws on write failure — the caller is responsible for making that visible
 * (see rebuildSeasonFixturesForSeasons).
 */
export declare function rebuildSeasonFixturesIndex(seasonId: number): Promise<SeasonIndexRebuildStats>;
/**
 * Rebuild the index for a set of seasons (deduped). Called after syncFixtures /
 * backfill batch writes. Failures are isolated per season so one bad season
 * doesn't abort the rest — but they are NOT swallowed: each one is logged at
 * error level with the seasonId, the fixture count and the measured byte size,
 * and the failing set is mirrored to `_meta/seasonFixturesHealth`.
 */
export declare function rebuildSeasonFixturesForSeasons(seasonIds: Iterable<number>): Promise<void>;
