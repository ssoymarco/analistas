/**
 * config.ts
 *
 * SportMonks API configuration + league registry for Cloud Functions.
 * When expanding to 120 leagues, add entries to LEAGUES array.
 */
/**
 * SportMonks API token — stored as a Firebase Secret (not in code).
 * Set it once with:  firebase functions:secrets:set SPORTMONKS_TOKEN
 * Every function that calls SportMonks must declare it in its `secrets: [...]` option.
 */
export declare const SPORTMONKS_TOKEN: import("firebase-functions/lib/params/types").SecretParam;
/**
 * Resolve the SportMonks token at runtime. Two sources, in order:
 *   1. Firebase Secret (when running inside a Cloud Function that binds
 *      SPORTMONKS_TOKEN in its `secrets: []` option).
 *   2. `process.env.SPORTMONKS_TOKEN` (for local scripts / CI / one-off
 *      crawls that don't run inside a Firebase function).
 *
 * Throws if neither source has a value.
 */
export declare function getSportmonksToken(): string;
export declare const SM_BASE_URL = "https://api.sportmonks.com/v3/football";
/** Timeout for each SportMonks API request (ms) */
export declare const SM_TIMEOUT = 15000;
/**
 * Seconds between livescore polls within a single Cloud Function invocation.
 * Lowered from 15s → 4s on 2026-05-28 to push score/minute freshness closer
 * to real-time on the client (live tick + push notifications). SportMonks Pro
 * limit is 3000 calls/h per entity → 4s × 15/min × 60 = 900/h = 30% of quota
 * on livescores alone, comfortable margin for other endpoints.
 */
export declare const LIVESCORE_POLL_INTERVAL_SEC = 4;
/**
 * Number of polls per Cloud Function invocation. The scheduled trigger fires
 * every 1 minute, and we sleep LIVESCORE_POLL_INTERVAL_SEC between polls, so
 * POLLS_PER_INVOCATION × LIVESCORE_POLL_INTERVAL_SEC ≈ 60s.
 *
 * 15 × 4s = 60s → fits exactly in one scheduled invocation.
 */
export declare const POLLS_PER_INVOCATION = 15;
/** Max live matches to enrich per invocation (rate limit safety) */
export declare const MAX_ENRICHMENTS_PER_RUN = 20;
export interface LeagueConfig {
    id: number;
    name: string;
    country: string;
    flag: string;
    currentSeasonId: number | null;
}
/**
 * All available leagues.
 * Currently 2 leagues (free plan). Expand to 120 with Pro plan.
 * Update currentSeasonId each season start.
 */
export declare const LEAGUES: LeagueConfig[];
/** Comma-separated league IDs for SportMonks API filter params */
export declare function getLeagueIdsCsv(): string;
/**
 * Split league IDs into chunks for API requests (avoid URL length limits).
 * Returns arrays of comma-separated ID strings, each with max `chunkSize` leagues.
 */
export declare function getLeagueIdChunks(chunkSize?: number): string[];
/** Find a league config by SportMonks id */
export declare function getLeagueConfig(id: number): LeagueConfig | undefined;
/** Get all leagues that have a valid currentSeasonId */
export declare function getLeaguesWithSeason(): LeagueConfig[];
