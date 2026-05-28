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
 * Main handler: fetch all fixtures for 3 dates across ALL leagues SportMonks
 * covers (no league filter). Writes/updates every fixture as a
 * matches/{matchId} document.
 *
 * Why no filter: the previous version restricted to the 51 leagues in
 * config.ts to keep API calls lean, but this caused the Firestore-backed
 * "Hoy" tab to silently drop ~10-15 matches/day from leagues outside the
 * config (women's leagues, lower divisions, regional friendlies, etc.).
 * Pull-to-refresh used the proxy with no filter and showed them, which
 * looked like a sync bug to users. The proxy and Firestore now have parity.
 *
 * @param explicitDates Optional override — when present, the function will
 *   sync exactly these dates instead of yesterday/today/tomorrow. Used by
 *   the on-demand `backfillFixturesByDates` callable (see index.ts) to repair
 *   historical matches stuck with stale mappings (e.g. the 2022 World Cup
 *   penalty matches whose status was written under the old, scrambled
 *   SM_STATE_IDS map and never got re-touched by the scheduled pollLivescores).
 */
export declare function syncFixturesHandler(explicitDates?: string[]): Promise<void>;
