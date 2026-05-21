/**
 * sync-players.ts
 *
 * Cloud Function: syncs full player profiles (season stats + team history)
 * for every player we know about. Writes one `players/{playerId}` doc.
 *
 * Replaces the per-user usePlayerDetail proxy call.
 *
 * Player discovery sources:
 *   1. squads/{seasonId_teamId}.players[]  — every squad we've synced
 *   2. topscorers/{seasonId}.scorers/assists/cards[]  — top performers
 *
 * Schedule: every 24h.
 *
 * Cost: ~3-5k unique players × 1 SM call = ~3-5k calls/day on `players`
 * entity. ~5-7% of the 72k/day cap.
 */
export declare function syncPlayersHandler(): Promise<void>;
