"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapLegacyTeamId = mapLegacyTeamId;
exports.mapLegacyLeagueId = mapLegacyLeagueId;
exports.legacyTeamIdFor = legacyTeamIdFor;
exports.migrateLegacyIds = migrateLegacyIds;
const legacyTeamMap_json_1 = __importDefault(require("./legacyTeamMap.json"));
const leagues_1 = require("./leagues");
const TEAM_MAP = legacyTeamMap_json_1.default;
let reverseTeamMap = null;
/** API-Sports team id for a Sportmonks team id, or undefined when unmapped. */
function mapLegacyTeamId(smTeamId) {
    return TEAM_MAP[String(smTeamId)];
}
/** API-Sports league id for a Sportmonks league id, or undefined when unmapped. */
function mapLegacyLeagueId(smLeagueId) {
    return leagues_1.SM_TO_AF_LEAGUE[Number(smLeagueId)];
}
/** Sportmonks team id for an API-Sports team id (legacy push dual-send). */
function legacyTeamIdFor(afTeamId) {
    if (!reverseTeamMap) {
        reverseTeamMap = new Map();
        for (const [sm, af] of Object.entries(TEAM_MAP))
            reverseTeamMap.set(af, sm);
    }
    return reverseTeamMap.get(Number(afTeamId));
}
/** Translate a list of saved legacy ids with the given mapper. */
function migrateLegacyIds(legacyIds, mapper) {
    const mapped = [];
    const unmapped = [];
    const seen = new Set();
    for (const id of legacyIds) {
        const af = mapper(id);
        if (af === undefined) {
            unmapped.push(String(id));
            continue;
        }
        const s = String(af);
        if (!seen.has(s)) {
            seen.add(s);
            mapped.push(s);
        }
    }
    return { mapped, unmapped };
}
//# sourceMappingURL=legacy.js.map