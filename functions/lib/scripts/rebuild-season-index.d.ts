/**
 * rebuild-season-index.ts
 *
 * Standalone script that (re)builds the `season_index/{leagueId}` documents
 * in Firestore. Those docs power the season picker dropdown in
 * LeagueDetailScreen — a single read per league returns every historical
 * edition we have access to.
 *
 * Schema written per league:
 *   season_index/{leagueId}
 *     leagueId:   number
 *     leagueName: string
 *     seasons: [
 *       { id: number, name: string, year: number, current: boolean,
 *         finished: boolean, pending: boolean }, …
 *     ]   // sorted newest → oldest
 *     updatedAt: Timestamp
 *
 * Run after a crawl, after adding new leagues to config, or any time the
 * season list seems stale:
 *
 *   cd functions && npm run rebuild:index
 *
 * Setup (same as the crawl): see crawl-historical.ts file header.
 */
export {};
