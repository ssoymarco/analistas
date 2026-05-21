/**
 * sync-coaches.ts
 *
 * Cloud Function: syncs full coach profiles (career stats + teams managed)
 * for every active coach across the configured leagues. Writes one
 * `coaches/{coachId}` doc per coach.
 *
 * Replaces the per-user `getCoachProfile` proxy call in AlineacionTab.
 *
 * Strategy: rather than crawling all SportMonks coaches, we iterate the
 * `teams/` collection (written by syncTeams), extract each team's active
 * coach (from the fixture-detail enrichment or team page), and fetch their
 * full profile. This keeps the call volume bounded by the number of teams
 * we care about.
 *
 * Schedule: every 24h. Career stats change on a weekly timescale.
 *
 * Cost: ~1,000-1,500 coach fetches per run / day. ~6% of the daily
 * `coaches` entity cap (72k). Sequential with 200ms pauses to be polite.
 */
export declare function syncCoachesHandler(): Promise<void>;
