/**
 * config.ts
 *
 * SportMonks API configuration + league registry for Cloud Functions.
 * When expanding to 120 leagues, add entries to LEAGUES array.
 */
export declare const SM_API_TOKEN = "fJSTWbE3MXoQFM8cOTbZcoEomEMx9xJEh9F77IGS7RKjs2wGHd0vQDNanYIN";
export declare const SM_BASE_URL = "https://api.sportmonks.com/v3/football";
/** Timeout for each SportMonks API request (ms) */
export declare const SM_TIMEOUT = 15000;
/** Seconds between livescore polls within a single Cloud Function invocation */
export declare const LIVESCORE_POLL_INTERVAL_SEC = 15;
/** Number of polls per Cloud Function invocation (1 invocation = 1 minute) */
export declare const POLLS_PER_INVOCATION = 4;
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
