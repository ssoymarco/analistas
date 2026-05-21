"use strict";
/**
 * sync-match-enrichment.ts
 *
 * Cloud Function: enriches "hot" matches (live, near-kickoff, recently-finished)
 * with the heavy fields that don't fit in the lean /livescores/inplay payload:
 * lineups, venue, referees, predictions, weather, tvstations, aggregate legs,
 * H2H. Writes everything under matches/{id}.detail so the MatchDetail screen
 * can render entirely from Firestore.
 *
 * Architecture rationale: previously useFixtureDetail on the client called
 * SportMonks every 10 seconds while a match was live (360 calls/hour per
 * concurrent viewer). With ~100 viewers on a Liga MX final = 36,000 calls/hour
 * → instantly blown past the 3,000/hour per-entity ceiling. This function
 * runs server-side at a fixed cadence so the user count becomes irrelevant.
 *
 * Schedule: every 5 minutes.
 *
 * Cost: ~30-80 hot matches per run × 1 SM call each = 30-80 calls per run
 *       × 12 runs/hour = 360-960 calls/hour for the `fixtures` entity.
 *       Comfortably below the 3,000/hour cap. H2H adds ~30-80 calls per run
 *       too, but we skip when h2h was fetched in the last 24h (rarely
 *       changes).
 *
 * Hot window definition:
 *   - status === 'live'  (refresh every cycle)
 *   - status === 'scheduled' AND kickoff is within next 6 hours
 *   - status === 'finished' AND kickoff was within last 2 hours
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
exports.syncMatchEnrichmentHandler = syncMatchEnrichmentHandler;
const admin_init_1 = require("./admin-init");
const logger = __importStar(require("firebase-functions/logger"));
const sportmonks_1 = require("./sportmonks");
const HOT_WINDOW_FUTURE_HOURS = 6;
const HOT_WINDOW_PAST_HOURS = 2;
const H2H_REFRESH_HOURS = 24;
const SLEEP_BETWEEN_MATCHES_MS = 200;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
/**
 * Query Firestore for matches that fall in the "hot" window. We do three
 * separate queries (live / upcoming / just-finished) and merge, because
 * Firestore doesn't natively OR across status + time conditions.
 */
async function queryHotMatches() {
    const now = new Date();
    const futureCutoff = new Date(now.getTime() + HOT_WINDOW_FUTURE_HOURS * 3600_000);
    const pastCutoff = new Date(now.getTime() - HOT_WINDOW_PAST_HOURS * 3600_000);
    const futureCutoffStr = futureCutoff.toISOString().replace('T', ' ').slice(0, 19);
    const pastCutoffStr = pastCutoff.toISOString().replace('T', ' ').slice(0, 19);
    const nowStr = now.toISOString().replace('T', ' ').slice(0, 19);
    const matchesRef = admin_init_1.db.collection('matches');
    // Query 1: all live matches
    const liveSnap = await matchesRef
        .where('status', '==', 'live')
        .limit(200)
        .get();
    // Query 2: scheduled matches in next HOT_WINDOW_FUTURE_HOURS
    const upcomingSnap = await matchesRef
        .where('status', '==', 'scheduled')
        .where('startingAtUtc', '>=', nowStr)
        .where('startingAtUtc', '<=', futureCutoffStr)
        .limit(200)
        .get();
    // Query 3: finished matches in last HOT_WINDOW_PAST_HOURS
    const recentSnap = await matchesRef
        .where('status', '==', 'finished')
        .where('startingAtUtc', '>=', pastCutoffStr)
        .where('startingAtUtc', '<=', nowStr)
        .limit(200)
        .get();
    const merged = new Map();
    for (const snap of [liveSnap, upcomingSnap, recentSnap]) {
        for (const d of snap.docs) {
            const data = d.data();
            if (merged.has(d.id))
                continue;
            const homeId = Number(data?.homeTeam?.id ?? 0);
            const awayId = Number(data?.awayTeam?.id ?? 0);
            if (!homeId || !awayId)
                continue;
            const lastDetail = data?.detailUpdatedAt?.toDate?.() ?? null;
            const lastH2h = data?.h2hUpdatedAt?.toDate?.() ?? null;
            merged.set(d.id, {
                id: d.id,
                homeTeamId: homeId,
                awayTeamId: awayId,
                status: data.status,
                startingAtUtc: data.startingAtUtc,
                lastDetailUpdate: lastDetail,
                lastH2hUpdate: lastH2h,
            });
        }
    }
    return Array.from(merged.values());
}
/**
 * Extract the static enrichment fields from a full /fixtures/{id} response.
 * These are the fields useFixtureDetail consumes that aren't already on the
 * lean /livescores/inplay payload.
 */
function extractStaticEnrichment(fixture) {
    const f = fixture;
    const out = {};
    if (Array.isArray(f.events))
        out.events = f.events;
    if (Array.isArray(f.statistics))
        out.statistics = f.statistics;
    if (Array.isArray(f.lineups))
        out.lineups = f.lineups;
    if (Array.isArray(f.expectedLineups))
        out.expectedLineups = f.expectedLineups;
    if (Array.isArray(f.coaches))
        out.coaches = f.coaches;
    if (f.venue != null)
        out.venue = f.venue;
    if (Array.isArray(f.referees))
        out.referees = f.referees;
    if (Array.isArray(f.tvstations))
        out.tvstations = f.tvstations;
    if (f.weatherreport != null)
        out.weatherreport = f.weatherreport;
    if (Array.isArray(f.predictions))
        out.predictions = f.predictions;
    if (Array.isArray(f.periods))
        out.periods = f.periods;
    if (f.aggregate != null)
        out.aggregate = f.aggregate;
    if (f.aggregate_id != null)
        out.aggregate_id = f.aggregate_id;
    if (f.stage_id != null)
        out.stage_id = f.stage_id;
    if (f.league != null)
        out.league = f.league;
    if (Array.isArray(f.participants))
        out.participants = f.participants;
    if (Array.isArray(f.scores))
        out.scores = f.scores;
    if (f.state != null)
        out.state = f.state;
    if (f.state_id != null)
        out.state_id = f.state_id;
    if (f.starting_at != null)
        out.starting_at = f.starting_at;
    if (f.starting_at_timestamp != null)
        out.starting_at_timestamp = f.starting_at_timestamp;
    if (f.id != null)
        out.id = f.id;
    if (f.league_id != null)
        out.league_id = f.league_id;
    if (f.season_id != null)
        out.season_id = f.season_id;
    return out;
}
async function syncMatchEnrichmentHandler() {
    const startMs = Date.now();
    logger.info('🎯 syncMatchEnrichment: querying hot window');
    const hot = await queryHotMatches();
    logger.info(`🎯 syncMatchEnrichment: ${hot.length} hot matches`);
    if (hot.length === 0) {
        logger.info('🎯 syncMatchEnrichment: nothing to do');
        return;
    }
    const now = new Date();
    const h2hSkipCutoff = new Date(now.getTime() - H2H_REFRESH_HOURS * 3600_000);
    let detailsWritten = 0;
    let h2hWritten = 0;
    let errors = 0;
    for (const m of hot) {
        try {
            // ── Detail (/fixtures/{id} with full includes) ──
            const fixture = await (0, sportmonks_1.fetchFixtureFullDetail)(Number(m.id));
            const seasonId = fixture?.season_id ?? null;
            if (fixture) {
                const enrichment = extractStaticEnrichment(fixture);
                await admin_init_1.db.collection('matches').doc(m.id).set({
                    detail: enrichment,
                    detailUpdatedAt: admin_init_1.admin.firestore.Timestamp.now(),
                }, { merge: true });
                detailsWritten++;
            }
            // ── Sidelined for both teams (only if we have a seasonId) ──
            if (seasonId) {
                const [sidelinedHome, sidelinedAway] = await Promise.all([
                    (0, sportmonks_1.fetchSidelined)(seasonId, m.homeTeamId),
                    (0, sportmonks_1.fetchSidelined)(seasonId, m.awayTeamId),
                ]);
                await admin_init_1.db.collection('matches').doc(m.id).set({ sidelinedHome, sidelinedAway }, { merge: true });
            }
            // ── H2H (skip if fetched within H2H_REFRESH_HOURS) ──
            const needsH2h = !m.lastH2hUpdate || m.lastH2hUpdate < h2hSkipCutoff;
            if (needsH2h) {
                const h2h = await (0, sportmonks_1.fetchH2H)(m.homeTeamId, m.awayTeamId).catch(() => []);
                await admin_init_1.db.collection('matches').doc(m.id).set({
                    h2h,
                    h2hUpdatedAt: admin_init_1.admin.firestore.Timestamp.now(),
                }, { merge: true });
                h2hWritten++;
            }
            await sleep(SLEEP_BETWEEN_MATCHES_MS);
        }
        catch (err) {
            errors++;
            logger.error(`🎯 enrichment failed for match ${m.id}:`, err);
        }
    }
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    logger.info(`✅ syncMatchEnrichment: ${detailsWritten} details + ${h2hWritten} h2h written ` +
        `(${errors} errors) in ${elapsed}s`);
}
//# sourceMappingURL=sync-match-enrichment.js.map