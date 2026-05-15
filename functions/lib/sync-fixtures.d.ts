/**
 * sync-fixtures.ts
 *
 * Cloud Function: syncs all fixtures for yesterday, today, and tomorrow.
 * Scheduled every 30 minutes to keep the Firestore matches collection
 * up to date with scheduled, live, and finished matches.
 *
 * This ensures PartidosScreen has fresh data even if pollLivescores
 * hasn't picked up a match yet (e.g., a match that just got scheduled).
 */
/**
 * Main handler: fetch all fixtures for 3 dates across all leagues.
 * Writes/updates every fixture as a matches/{matchId} document.
 */
export declare function syncFixturesHandler(): Promise<void>;
