/**
 * football/sync-league-data.ts
 *
 * League-level data: the league catalog (current season per league), standings
 * and top players.
 *
 * Budget:
 *   catalog                     1 call/day
 *   standings, event-driven     1 call per priority league that finished a match
 *                               (debounced through fb_meta/standingsDirty)
 *   standings, daily sweep      ~85 calls (every priority league in season)
 *   top scorers/assists/yellows 3 calls × ~45 leagues (popularity ≥ 50), daily
 */
import type { FbCatalogEntry, FbStandingsDoc, FbTeamIndexDoc } from '../shared/football/model';
/** Shape of `fb_meta/leagueCatalog.leagues[id]` — shared with the app. */
export type CatalogEntry = FbCatalogEntry;
export declare function syncFootballCatalog(): Promise<number>;
/**
 * `fb_meta/teamIndex`: every team that appears in a curated league's table,
 * most popular league first. One small doc the app reads once so team search
 * is instant and offline-friendly (no provider call per keystroke).
 */
export declare function buildTeamIndex(tables: FbStandingsDoc[]): FbTeamIndexDoc['teams'];
/** Event-driven refresh of leagues marked dirty by the live poller. */
export declare function syncDirtyStandings(maxLeagues?: number): Promise<number>;
/** Daily sweep: standings for every priority league, top players for the big ones. */
export declare function syncAllLeagueTables(): Promise<{
    standings: number;
    topPlayers: number;
}>;
