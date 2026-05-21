"use strict";
/**
 * crawl-historical.ts
 *
 * One-shot crawl that pulls every historical season we have API access to
 * (Pro plan + Historical Data add-on) into Firestore, so the app can serve
 * past fixtures, standings and topscorers without ever calling SportMonks
 * again for that data.
 *
 * Coverage per league (51 leagues total):
 *   • All seasons returned by /seasons?filters=seasonLeagues:{leagueId}
 *   • Fixtures → matches/{matchId}            (full participants + scores)
 *   • Standings → standings/{seasonId}
 *   • Topscorers → topscorers/{seasonId}
 *
 * What we deliberately SKIP (fetched on-demand later if a user opens that
 * specific past match): lineups, events, detailed stats, odds, predictions.
 *
 * Resilience:
 *   • Idempotent — every write uses .set({merge:true}); re-running picks
 *     up where it left off.
 *   • Progress file (.crawl-progress.json) tracks finished {leagueId}_{seasonId}
 *     pairs so a Ctrl-C or network blip never costs more than the
 *     in-flight season.
 *   • Per-season errors are caught and logged; the crawl never aborts
 *     for one bad league.
 *
 * Rate limit: 600ms pause between SportMonks calls (~100 req/min) keeps
 * us at ~3% of the Pro plan's 3,000/hour-per-entity ceiling.
 *
 * Setup (one-time):
 *   1. Download a Firebase service account key from
 *      console.firebase.google.com/project/analistas-8ba26/settings/serviceaccounts/adminsdk
 *      Save it as functions/.crawl-service-account.json (gitignored).
 *   2. export GOOGLE_APPLICATION_CREDENTIALS="$PWD/functions/.crawl-service-account.json"
 *      export SPORTMONKS_TOKEN="<your-token>"
 *
 * Run:
 *   cd functions && npm run crawl
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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const config_1 = require("../config");
const sportmonks_1 = require("../sportmonks");
const mappers_1 = require("../mappers");
const config_2 = require("../config");
// ── Constants ────────────────────────────────────────────────────────────────
const SM_BASE_URL = 'https://api.sportmonks.com/v3/football';
const REQUEST_PAUSE_MS = 600; // ~100 req/min, well under Pro limits
const PROGRESS_FILE = path.resolve(__dirname, '../../.crawl-progress.json');
const FIRESTORE_BATCH_LIMIT = 499; // Firestore caps batch writes at 500
function loadProgress() {
    if (!fs.existsSync(PROGRESS_FILE)) {
        return { done: [], lastUpdated: new Date().toISOString() };
    }
    try {
        return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
    catch {
        return { done: [], lastUpdated: new Date().toISOString() };
    }
}
function saveProgress(p) {
    p.lastUpdated = new Date().toISOString();
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2), 'utf8');
}
function markDone(p, leagueId, seasonId) {
    const key = `${leagueId}_${seasonId}`;
    if (!p.done.includes(key))
        p.done.push(key);
    saveProgress(p);
}
function isDone(p, leagueId, seasonId) {
    return p.done.includes(`${leagueId}_${seasonId}`);
}
// ── SportMonks helpers (script-local; uses native fetch on Node 18+) ────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function buildQS(params) {
    return Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
}
async function smGet(endpoint, params = {}) {
    const qs = buildQS({ api_token: (0, config_2.getSportmonksToken)(), ...params });
    const url = `${SM_BASE_URL}${endpoint}?${qs}`;
    const res = await fetch(url);
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`SportMonks ${res.status} on ${endpoint}: ${text.slice(0, 200)}`);
    }
    return (await res.json());
}
/** Paginated GET — follows pagination.has_more, applies the rate-limit pause between pages. */
async function smGetAllPages(endpoint, params = {}) {
    const all = [];
    let page = 1;
    const maxPages = 200; // safety cap; SM has never returned more than ~50 in practice
    while (page <= maxPages) {
        const res = await smGet(endpoint, { per_page: '50', ...params, page: String(page) });
        if (Array.isArray(res.data))
            all.push(...res.data);
        if (!res.pagination?.has_more)
            break;
        page++;
        await sleep(REQUEST_PAUSE_MS);
    }
    return all;
}
// ── Firestore batch writer ───────────────────────────────────────────────────
class BatchWriter {
    db;
    current;
    opCount = 0;
    totalCount = 0;
    pending = [];
    constructor(db) {
        this.db = db;
        this.current = db.batch();
    }
    add(ref, data) {
        this.current.set(ref, data, { merge: true });
        this.opCount++;
        this.totalCount++;
        if (this.opCount >= FIRESTORE_BATCH_LIMIT) {
            this.flush();
        }
    }
    flush() {
        if (this.opCount === 0)
            return;
        this.pending.push(this.current.commit());
        this.current = this.db.batch();
        this.opCount = 0;
    }
    async drain() {
        this.flush();
        await Promise.all(this.pending);
        this.pending = [];
        return this.totalCount;
    }
}
async function crawlSeason(db, leagueId, season) {
    const seasonId = season.id;
    const stats = { fixturesWritten: 0, standingsWritten: false, topscorersWritten: false };
    // 1. Fixtures
    const fixtures = await smGetAllPages('/fixtures', {
        filters: `fixtureSeasons:${seasonId}`,
        include: 'participants;scores;league;state',
    });
    await sleep(REQUEST_PAUSE_MS);
    const writer = new BatchWriter(db);
    for (const f of fixtures) {
        const doc = (0, mappers_1.mapFixtureToMatchDoc)(f);
        if (doc)
            writer.add(db.collection('matches').doc(doc.id), doc);
    }
    stats.fixturesWritten = await writer.drain();
    // 2. Standings (final tables for finished seasons)
    try {
        const groups = await (0, sportmonks_1.fetchStandings)(seasonId);
        await sleep(REQUEST_PAUSE_MS);
        if (groups.length > 0) {
            const doc = (0, mappers_1.mapStandingsToDoc)(seasonId, leagueId, groups);
            await db.collection('standings').doc(String(seasonId)).set(doc, { merge: true });
            stats.standingsWritten = true;
        }
    }
    catch (err) {
        console.warn(`  ⚠️  standings failed for season ${seasonId}:`, err.message);
    }
    // 3. Topscorers
    try {
        const scorers = await (0, sportmonks_1.fetchTopScorers)(seasonId);
        await sleep(REQUEST_PAUSE_MS);
        if (scorers.length > 0) {
            const doc = (0, mappers_1.mapTopScorersToDoc)(seasonId, leagueId, scorers);
            await db.collection('topscorers').doc(String(seasonId)).set(doc, { merge: true });
            stats.topscorersWritten = true;
        }
    }
    catch (err) {
        console.warn(`  ⚠️  topscorers failed for season ${seasonId}:`, err.message);
    }
    return stats;
}
// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('🌍 Analistas historical crawl starting');
    console.log(`   ${config_1.LEAGUES.length} leagues configured`);
    // Initialise Firebase Admin. Uses GOOGLE_APPLICATION_CREDENTIALS env var
    // when running locally — see the file header for setup instructions.
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    const db = admin.firestore();
    // Verify SM token before doing anything else
    try {
        (0, config_2.getSportmonksToken)();
    }
    catch (err) {
        console.error('❌', err.message);
        process.exit(1);
    }
    const progress = loadProgress();
    console.log(`   resuming with ${progress.done.length} season(s) already done\n`);
    let totalFixtures = 0;
    let totalSeasons = 0;
    let leagueIndex = 0;
    for (const league of config_1.LEAGUES) {
        leagueIndex++;
        console.log(`\n[${leagueIndex}/${config_1.LEAGUES.length}] 🏆 ${league.name} (id=${league.id})`);
        let seasons;
        try {
            const res = await smGet('/seasons', {
                filters: `seasonLeagues:${league.id}`,
            });
            seasons = Array.isArray(res.data) ? res.data : [];
            await sleep(REQUEST_PAUSE_MS);
        }
        catch (err) {
            console.warn(`  ⚠️  could not list seasons:`, err.message);
            continue;
        }
        if (seasons.length === 0) {
            console.log('  (no seasons returned — license may not cover this league)');
            continue;
        }
        // Sort oldest → newest so an interrupted crawl resumes naturally
        seasons.sort((a, b) => (a.starting_at || '').localeCompare(b.starting_at || ''));
        console.log(`  ${seasons.length} season(s) available, oldest: ${seasons[0].starting_at?.slice(0, 4)}`);
        for (const season of seasons) {
            if (isDone(progress, league.id, season.id)) {
                process.stdout.write(`  · ${season.name} (skipped, done)\n`);
                continue;
            }
            const startMs = Date.now();
            try {
                const stats = await crawlSeason(db, league.id, season);
                const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
                const standingsMark = stats.standingsWritten ? 'S' : '-';
                const topscorersMark = stats.topscorersWritten ? 'T' : '-';
                process.stdout.write(`  ✓ ${season.name.padEnd(12)}  ${String(stats.fixturesWritten).padStart(4)} fixtures  [${standingsMark}${topscorersMark}]  ${elapsedSec}s\n`);
                totalFixtures += stats.fixturesWritten;
                totalSeasons++;
                markDone(progress, league.id, season.id);
            }
            catch (err) {
                console.error(`  ❌  ${season.name} failed:`, err.message);
            }
            await sleep(REQUEST_PAUSE_MS);
        }
    }
    console.log(`\n✅ Crawl complete`);
    console.log(`   ${totalSeasons} seasons processed`);
    console.log(`   ${totalFixtures} fixtures written to Firestore`);
    console.log(`   Progress file: ${PROGRESS_FILE}`);
    process.exit(0);
}
main().catch(err => {
    console.error('❌ Crawl crashed:', err);
    process.exit(1);
});
//# sourceMappingURL=crawl-historical.js.map