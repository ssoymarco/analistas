/**
 * shared/football/legacy.ts
 *
 * One-time bridge from the previous data provider (Sportmonks) to API-Sports.
 * Used by:
 *   - the app, on first launch of the API-Sports build, to translate the IDs
 *     a user saved (followed teams/leagues, rivals) and re-subscribe push topics;
 *   - the backend, to also deliver pushes to the legacy `team_{smId}_*` topics
 *     so users still on an old build keep getting goal alerts until they update.
 *
 * Dependency-free (shared with the app) — see leagues.ts header.
 *
 * legacyTeamMap.json was generated on 2026-11-25 by matching the 2,601
 * Sportmonks teams stored in Firestore `teams/*` against API-Sports
 * `/teams?league&season` (current + previous season of every mapped league)
 * plus `/teams?search` for the leftovers. Matching used normalized name +
 * country + founded year + venue, then 39 manual overrides. Result: 2,413 of
 * 2,478 real teams mapped (123 bracket placeholders such as "Winner Match 73"
 * were skipped). Unmapped teams are minor amateur / women's sides.
 */
/** API-Sports team id for a Sportmonks team id, or undefined when unmapped. */
export declare function mapLegacyTeamId(smTeamId: string | number): number | undefined;
/** API-Sports league id for a Sportmonks league id, or undefined when unmapped. */
export declare function mapLegacyLeagueId(smLeagueId: string | number): number | undefined;
/** Sportmonks team id for an API-Sports team id (legacy push dual-send). */
export declare function legacyTeamIdFor(afTeamId: string | number): string | undefined;
export interface LegacyMigrationResult {
    /** Translated API-Sports ids (deduplicated, order preserved). */
    mapped: string[];
    /** Legacy ids we could not translate (kept for a later server-side retry). */
    unmapped: string[];
}
/** Translate a list of saved legacy ids with the given mapper. */
export declare function migrateLegacyIds(legacyIds: ReadonlyArray<string | number>, mapper: (id: string | number) => number | undefined): LegacyMigrationResult;
