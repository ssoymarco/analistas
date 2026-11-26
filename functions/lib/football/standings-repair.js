"use strict";
/**
 * football/standings-repair.ts
 *
 * API-Sports sometimes returns a standings row without the team's id and crest
 * (seen for Club León in Liga MX 2026: `{ id: null, name: "Club Leon", logo:
 * null }`). Such a row can't be opened, highlighted or matched to a followed
 * team, so the missing team is identified before the table is stored:
 *
 *   1. from the previously stored table (no provider call), else
 *   2. from the league's team list (`/teams?league=&season=`, one call).
 *
 * A team is matched by name — the significant words of one name contained in
 * the other ("Club Leon" ↔ "Leon") — among the teams the table doesn't already
 * list; when a single row and a single team are left over they are paired.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasTeamId = void 0;
exports.rowsWithoutTeam = rowsWithoutTeam;
exports.fillMissingTeams = fillMissingTeams;
exports.repairStandings = repairStandings;
const logger = __importStar(require("firebase-functions/logger"));
const apisports_1 = require("./apisports");
const mapping_1 = require("./mapping");
const hasTeamId = (id) => typeof id === 'string' && /^\d+$/.test(id) && id !== '0';
exports.hasTeamId = hasTeamId;
const GENERIC = new Set(['club', 'fc', 'cf', 'cd', 'ca', 'sc', 'ac', 'afc', 'de', 'del', 'la', 'el', 'the', 'deportivo']);
function nameWords(name) {
    const all = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
    const significant = all.filter(w => !GENERIC.has(w));
    return significant.length ? significant : all;
}
function sameTeamName(a, b) {
    const wa = nameWords(a);
    const wb = nameWords(b);
    if (!wa.length || !wb.length)
        return false;
    return wa.every(w => wb.includes(w)) || wb.every(w => wa.includes(w));
}
/** Team ids the table already lists. */
function listedIds(doc) {
    const ids = new Set();
    for (const g of doc.groups)
        for (const r of g.rows)
            if ((0, exports.hasTeamId)(r.team.id))
                ids.add(r.team.id);
    return ids;
}
/** Names of the rows that came without a team id. */
function rowsWithoutTeam(doc) {
    const names = new Set();
    for (const g of doc.groups)
        for (const r of g.rows)
            if (!(0, exports.hasTeamId)(r.team.id))
                names.add(r.team.name);
    return [...names];
}
/**
 * Give the id-less rows the team they belong to, choosing among `candidates`
 * (teams of the league that the table doesn't list). Pure — exported for tests.
 * Returns the names that could not be resolved.
 */
function fillMissingTeams(doc, candidates) {
    const listed = listedIds(doc);
    let pool = candidates.filter(c => (0, exports.hasTeamId)(c.id) && !listed.has(c.id));
    const resolved = new Map();
    const pending = rowsWithoutTeam(doc);
    for (const name of pending) {
        const hits = pool.filter(c => sameTeamName(name, c.name));
        if (hits.length === 1) {
            resolved.set(name, hits[0]);
            pool = pool.filter(c => c.id !== hits[0].id);
        }
    }
    const left = pending.filter(n => !resolved.has(n));
    if (left.length === 1 && pool.length === 1)
        resolved.set(left[0], pool[0]);
    for (const g of doc.groups) {
        for (const r of g.rows) {
            const team = (0, exports.hasTeamId)(r.team.id) ? null : resolved.get(r.team.name);
            if (team)
                r.team = { ...team };
        }
    }
    return pending.filter(n => !resolved.has(n));
}
/**
 * Identify the teams of id-less rows (mutates and returns `doc`). `prev` is the
 * table stored before this refresh, when there is one.
 */
async function repairStandings(doc, prev) {
    if (!rowsWithoutTeam(doc).length)
        return doc;
    let unresolved = rowsWithoutTeam(doc);
    if (prev?.groups?.length) {
        const known = [];
        for (const g of prev.groups)
            for (const r of g.rows)
                if ((0, exports.hasTeamId)(r.team.id))
                    known.push(r.team);
        unresolved = fillMissingTeams(doc, known);
    }
    if (unresolved.length) {
        try {
            const teams = await (0, apisports_1.afGet)('/teams', { league: doc.leagueId, season: doc.season });
            unresolved = fillMissingTeams(doc, teams.map(t => ({
                id: String(t.team.id),
                name: t.team.name,
                shortName: t.team.code || (0, mapping_1.deriveShortName)(t.team.name),
                logo: t.team.logo,
            })));
        }
        catch (err) {
            logger.warn('standings: could not load the league teams to repair a row', { league: doc.leagueId, err: String(err) });
        }
    }
    if (unresolved.length) {
        logger.warn('standings: rows left without a team id', { league: doc.leagueId, season: doc.season, unresolved });
        // Never store the literal "null": the app treats an empty id as "no team page".
        for (const g of doc.groups)
            for (const r of g.rows)
                if (!(0, exports.hasTeamId)(r.team.id))
                    r.team = { ...r.team, id: '', logo: r.team.logo ?? '' };
    }
    return doc;
}
//# sourceMappingURL=standings-repair.js.map