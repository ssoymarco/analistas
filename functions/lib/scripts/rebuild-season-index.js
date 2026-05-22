"use strict";
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
const admin = __importStar(require("firebase-admin"));
const config_1 = require("../config");
const config_2 = require("../config");
const SM_BASE_URL = 'https://api.sportmonks.com/v3/football';
const REQUEST_PAUSE_MS = 300; // rebuild is small — can be faster than the crawl
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function fetchSeasonsForLeague(leagueId) {
    const all = [];
    let page = 1;
    while (page <= 5) {
        const url = `${SM_BASE_URL}/seasons?api_token=${(0, config_2.getSportmonksToken)()}` +
            `&filters=seasonLeagues:${leagueId}&per_page=50&page=${page}`;
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`SportMonks ${res.status} on seasons (league ${leagueId})`);
        }
        const body = (await res.json());
        if (Array.isArray(body.data))
            all.push(...body.data);
        if (!body.pagination?.has_more)
            break;
        page++;
        await sleep(REQUEST_PAUSE_MS);
    }
    return all;
}
function buildEntries(seasons) {
    return seasons
        .map(s => {
        const yearFromStart = (s.starting_at ?? '').slice(0, 4);
        const yearFromName = (s.name ?? '').match(/(\d{4})/)?.[1] ?? '';
        const year = parseInt(yearFromStart || yearFromName, 10) || 0;
        return {
            id: s.id,
            name: s.name || String(s.id),
            year,
            current: Boolean(s.is_current),
            finished: Boolean(s.finished),
            pending: Boolean(s.pending),
        };
    })
        .sort((a, b) => b.year - a.year || b.id - a.id); // newest first
}
async function main() {
    console.log('📋 Rebuilding season_index for all leagues');
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    const db = admin.firestore();
    try {
        (0, config_2.getSportmonksToken)();
    }
    catch (e) {
        console.error('❌', e.message);
        process.exit(1);
    }
    let totalSeasons = 0;
    let i = 0;
    for (const league of config_1.LEAGUES) {
        i++;
        process.stdout.write(`  [${String(i).padStart(2)}/${config_1.LEAGUES.length}] ${league.name.padEnd(35)} `);
        try {
            const raw = await fetchSeasonsForLeague(league.id);
            const seasons = buildEntries(raw);
            await db.collection('season_index').doc(String(league.id)).set({
                leagueId: league.id,
                leagueName: league.name,
                seasons,
                updatedAt: admin.firestore.Timestamp.now(),
            });
            totalSeasons += seasons.length;
            process.stdout.write(`${seasons.length} seasons\n`);
        }
        catch (err) {
            process.stdout.write(`failed: ${err.message}\n`);
        }
        await sleep(REQUEST_PAUSE_MS);
    }
    console.log(`\n✅ Done. ${totalSeasons} season entries across ${config_1.LEAGUES.length} leagues.`);
    process.exit(0);
}
main().catch(err => {
    console.error('❌ Crashed:', err);
    process.exit(1);
});
//# sourceMappingURL=rebuild-season-index.js.map