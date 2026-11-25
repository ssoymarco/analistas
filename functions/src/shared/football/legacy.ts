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

import legacyTeamMap from './legacyTeamMap.json';
import { SM_TO_AF_LEAGUE } from './leagues';

const TEAM_MAP = legacyTeamMap as Record<string, number>;

let reverseTeamMap: Map<number, string> | null = null;

/** API-Sports team id for a Sportmonks team id, or undefined when unmapped. */
export function mapLegacyTeamId(smTeamId: string | number): number | undefined {
  return TEAM_MAP[String(smTeamId)];
}

/** API-Sports league id for a Sportmonks league id, or undefined when unmapped. */
export function mapLegacyLeagueId(smLeagueId: string | number): number | undefined {
  return SM_TO_AF_LEAGUE[Number(smLeagueId)];
}

/** Sportmonks team id for an API-Sports team id (legacy push dual-send). */
export function legacyTeamIdFor(afTeamId: string | number): string | undefined {
  if (!reverseTeamMap) {
    reverseTeamMap = new Map();
    for (const [sm, af] of Object.entries(TEAM_MAP)) reverseTeamMap.set(af, sm);
  }
  return reverseTeamMap.get(Number(afTeamId));
}

export interface LegacyMigrationResult {
  /** Translated API-Sports ids (deduplicated, order preserved). */
  mapped: string[];
  /** Legacy ids we could not translate (kept for a later server-side retry). */
  unmapped: string[];
}

/** Translate a list of saved legacy ids with the given mapper. */
export function migrateLegacyIds(
  legacyIds: ReadonlyArray<string | number>,
  mapper: (id: string | number) => number | undefined,
): LegacyMigrationResult {
  const mapped: string[] = [];
  const unmapped: string[] = [];
  const seen = new Set<string>();
  for (const id of legacyIds) {
    const af = mapper(id);
    if (af === undefined) { unmapped.push(String(id)); continue; }
    const s = String(af);
    if (!seen.has(s)) { seen.add(s); mapped.push(s); }
  }
  return { mapped, unmapped };
}
