"use strict";
/**
 * sync-coaches.ts
 *
 * Cloud Function: syncs full coach profiles (career stats + teams managed)
 * for every active coach across the configured leagues. Writes one
 * `coaches/{coachId}` doc per coach.
 *
 * Replaces the per-user `getCoachProfile` proxy call in AlineacionTab.
 *
 * Strategy: rather than crawling all SportMonks coaches, we iterate the
 * `teams/` collection (written by syncTeams), extract each team's active
 * coach (from the fixture-detail enrichment or team page), and fetch their
 * full profile. This keeps the call volume bounded by the number of teams
 * we care about.
 *
 * Schedule: every 24h. Career stats change on a weekly timescale.
 *
 * Cost: ~1,000-1,500 coach fetches per run / day. ~6% of the daily
 * `coaches` entity cap (72k). Sequential with 200ms pauses to be polite.
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
exports.syncCoachesHandler = syncCoachesHandler;
const admin_init_1 = require("./admin-init");
const logger = __importStar(require("firebase-functions/logger"));
const sportmonks_1 = require("./sportmonks");
const SLEEP_BETWEEN_FETCHES_MS = 200;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
/**
 * Find coach IDs to sync. We pull them from two sources to be thorough:
 *
 *   1. matches/{id}.detail.coaches[].id  — populated by syncMatchEnrichment
 *      from /fixtures/{id} includes. Covers active coaches of teams that
 *      have had a hot-window match recently.
 *   2. matches/{id}.detail.lineups[].coach_id  — same source, redundant
 *      coverage.
 *
 * Deduplicates by coach ID.
 */
async function findCoachIdsToSync() {
    const ids = new Set();
    // Pull from recent enriched matches — covers most active coaches.
    const snap = await admin_init_1.db.collection('matches')
        .where('detailUpdatedAt', '!=', null)
        .limit(500)
        .get();
    for (const docSnap of snap.docs) {
        const detail = docSnap.data()?.detail;
        if (!detail)
            continue;
        const coaches = Array.isArray(detail.coaches) ? detail.coaches : [];
        for (const c of coaches) {
            const id = c?.meta?.coach_id ?? c?.id;
            if (typeof id === 'number' && id > 0)
                ids.add(id);
        }
    }
    return ids;
}
async function syncCoachesHandler() {
    const startMs = Date.now();
    logger.info('👔 syncCoaches: discovering active coach IDs');
    const ids = await findCoachIdsToSync();
    if (ids.size === 0) {
        logger.info('👔 syncCoaches: no coach IDs discovered (matches not enriched yet?)');
        return;
    }
    logger.info(`👔 syncCoaches: ${ids.size} unique coach IDs to refresh`);
    let written = 0;
    let errors = 0;
    for (const coachId of ids) {
        try {
            const raw = await (0, sportmonks_1.fetchCoachFullProfile)(coachId);
            if (!raw)
                continue;
            await admin_init_1.db.collection('coaches').doc(String(coachId)).set({
                id: coachId,
                raw,
                updatedAt: admin_init_1.admin.firestore.Timestamp.now(),
            }, { merge: true });
            written++;
            await sleep(SLEEP_BETWEEN_FETCHES_MS);
        }
        catch (err) {
            errors++;
            logger.error(`👔 coach ${coachId} sync failed:`, err);
        }
    }
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    logger.info(`✅ syncCoaches: ${written} written (${errors} errors) in ${elapsed}s`);
}
//# sourceMappingURL=sync-coaches.js.map