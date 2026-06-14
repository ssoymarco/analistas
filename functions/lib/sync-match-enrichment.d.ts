/**
 * sync-match-enrichment.ts
 *
 * Cloud Function: enriches "hot" matches (live, near-kickoff, recently-finished)
 * with the heavy fields that don't fit in the lean /livescores/inplay payload:
 * lineups, venue, referees, predictions, weather, tvstations, aggregate legs,
 * H2H. Writes everything under matches/{id}.detail so the MatchDetail screen
 * can render entirely from Firestore.
 *
 * Architecture rationale: previously useFixtureDetail on the client called
 * SportMonks every 10 seconds while a match was live (360 calls/hour per
 * concurrent viewer). With ~100 viewers on a Liga MX final = 36,000 calls/hour
 * → instantly blown past the 3,000/hour per-entity ceiling. This function
 * runs server-side at a fixed cadence so the user count becomes irrelevant.
 *
 * Schedule: every 5 minutes.
 *
 * Cost: ~30-80 hot matches per run × 1 SM call each = 30-80 calls per run
 *       × 12 runs/hour = 360-960 calls/hour for the `fixtures` entity.
 *       Comfortably below the 3,000/hour cap. H2H adds ~30-80 calls per run
 *       too, but we skip when h2h was fetched in the last 24h (rarely
 *       changes).
 *
 * Hot window definition:
 *   - status === 'live'  (refresh every cycle)
 *   - status === 'scheduled' AND kickoff is within next 6 hours
 *   - status === 'finished' AND kickoff was within last 2 hours
 */
/**
 * Enrich a specific list of match IDs regardless of the hot window.
 * Used by the `backfillEnrichmentByMatchIds` callable to repair historical
 * matches whose `detail.events` was incomplete (e.g. 2022 WC knockouts that
 * went to ET/penalties — the regulation/ET goals were missing because
 * syncMatchEnrichment never ran outside the 2-hour post-finish window).
 */
export declare function enrichMatchesByIds(matchIds: string[]): Promise<{
    enriched: number;
    errors: number;
}>;
export declare function syncMatchEnrichmentHandler(): Promise<void>;
