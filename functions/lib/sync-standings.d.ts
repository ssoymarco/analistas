/**
 * sync-standings.ts
 *
 * Cloud Function: syncs league standings and top scorers.
 * Scheduled every 6 hours for standings, every 12 hours for top scorers.
 *
 * Iterates through all configured leagues with valid seasonIds,
 * fetches standings/scorers from SportMonks, and writes to Firestore.
 */
/**
 * Sync standings for all configured leagues.
 * Processes 10 leagues at a time with 2-second pauses for rate limiting.
 */
export declare function syncStandingsHandler(): Promise<void>;
/**
 * Sync top scorers for all configured leagues.
 * Same pattern as standings with rate limit courtesy pauses.
 */
export declare function syncTopScorersHandler(): Promise<void>;
