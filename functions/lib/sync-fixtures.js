"use strict";
/**
 * sync-fixtures.ts
 *
 * Cloud Function: syncs all fixtures for yesterday, today, and tomorrow.
 * Scheduled every 30 minutes to keep the Firestore matches collection
 * up to date with scheduled, live, and finished matches.
 *
 * This ensures PartidosScreen has fresh data even if pollLivescores
 * hasn't picked up a match yet (e.g., a match that just got scheduled).
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
exports.syncFixturesHandler = syncFixturesHandler;
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const config_1 = require("./config");
const sportmonks_1 = require("./sportmonks");
const mappers_1 = require("./mappers");
const db = admin.firestore();
/**
 * Format a Date as 'YYYY-MM-DD' in UTC.
 */
function formatDate(d) {
    return d.toISOString().slice(0, 10);
}
/**
 * Get yesterday, today, and tomorrow date strings.
 */
function getTargetDates() {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    return [
        formatDate(yesterday),
        formatDate(now),
        formatDate(tomorrow),
    ];
}
/**
 * Main handler: fetch all fixtures for 3 dates across all leagues.
 * Writes/updates every fixture as a matches/{matchId} document.
 */
async function syncFixturesHandler() {
    const dates = getTargetDates();
    const leagueChunks = (0, config_1.getLeagueIdChunks)(25);
    logger.info(`📅 syncFixtures: syncing ${dates.length} dates × ${leagueChunks.length} league chunks`);
    const allMatchDocs = [];
    for (const date of dates) {
        for (const leagueIds of leagueChunks) {
            try {
                const fixtures = await (0, sportmonks_1.fetchFixturesByDate)(date, leagueIds);
                for (const fixture of fixtures) {
                    const doc = (0, mappers_1.mapFixtureToMatchDoc)(fixture);
                    if (doc)
                        allMatchDocs.push(doc);
                }
            }
            catch (err) {
                logger.error(`Failed to fetch fixtures for ${date} (leagues: ${leagueIds.slice(0, 40)}...):`, err);
            }
        }
    }
    // Batch write all match documents
    if (allMatchDocs.length === 0) {
        logger.info('📅 syncFixtures: no fixtures found');
        return;
    }
    const batches = [];
    let currentBatch = db.batch();
    let opCount = 0;
    for (const matchDoc of allMatchDocs) {
        const ref = db.collection('matches').doc(matchDoc.id);
        currentBatch.set(ref, matchDoc, { merge: true });
        opCount++;
        if (opCount >= 499) {
            batches.push(currentBatch);
            currentBatch = db.batch();
            opCount = 0;
        }
    }
    if (opCount > 0)
        batches.push(currentBatch);
    await Promise.all(batches.map(b => b.commit()));
    logger.info(`✅ syncFixtures: wrote ${allMatchDocs.length} matches across ${dates.join(', ')}`);
}
//# sourceMappingURL=sync-fixtures.js.map