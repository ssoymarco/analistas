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
 * Sync top scorers for all configured leagues. Fetches THREE separate stat
 * categories per league — goals (208), assists (209), yellow cards (84) —
 * and writes them all to the same topscorers/{seasonId} document so
 * useLeagueDetail can render all three tabs from Firestore in one read.
 *
 * Cost: 51 leagues × 3 categories = 153 SM calls per run on the
 * `topscorers` entity. ~3.6k/day at the hourly schedule. ~5% of cap.
 */
export declare function syncTopScorersHandler(): Promise<void>;
