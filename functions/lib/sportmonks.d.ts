/**
 * sportmonks.ts
 *
 * Server-side SportMonks v3 API client for Cloud Functions.
 * No CORS proxy needed — server-to-server direct calls.
 */
import type { SMFixture, SMStandingGroup, SMTopScorer } from './types';
/**
 * GET /livescores — all currently live matches across all leagues.
 * Single API call returns everything.
 */
export declare function fetchLivescores(): Promise<SMFixture[]>;
/**
 * GET /fixtures/date/{date} — all matches for a specific date.
 * @param date - 'YYYY-MM-DD'
 * @param leagueIds - optional comma-separated league IDs to filter
 */
export declare function fetchFixturesByDate(date: string, leagueIds?: string): Promise<SMFixture[]>;
/**
 * GET /fixtures/{id} — single match with full detail.
 * Used for match detail enrichment.
 */
export declare function fetchFixtureById(id: number): Promise<SMFixture | null>;
/**
 * GET /standings/seasons/{seasonId} — full league standings, all pages.
 * Group-stage cups (WC, UCL) can have many entries — pagination is required.
 */
export declare function fetchStandings(seasonId: number): Promise<SMStandingGroup[]>;
/**
 * GET /topscorers/seasons/{seasonId} — Goal Topscorer ranking, all pages.
 *
 * SportMonks returns rankings across MULTIPLE types per season (goals, assists,
 * cards, etc.). We filter to type_id 208 (Goal Topscorer) at the API level
 * with the `seasontopscorerTypes` filter — NOT `topScorerTypes` (camelCase),
 * which SportMonks silently ignores and falls back to whatever default ranking
 * it has on hand (usually cards). See sibling note in src/services/sportmonks.ts.
 *
 * Includes `participant` so we get the team name/logo alongside the player.
 */
export declare function fetchTopScorers(seasonId: number): Promise<SMTopScorer[]>;
