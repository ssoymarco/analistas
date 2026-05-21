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
 * GET /topscorers/seasons/{seasonId} — full top scorers list, all pages.
 * SM returns one row per stat type per player; many leagues exceed 50 rows.
 */
export declare function fetchTopScorers(seasonId: number): Promise<SMTopScorer[]>;
