"use strict";
/**
 * poll-livescores.ts
 *
 * Cloud Function: polls SportMonks livescores every 15 seconds.
 * Scheduled to run every 1 minute, executes 4 internal polls with 15s delays.
 *
 * Flow per poll:
 * 1. Fetch all live matches from SportMonks (1 API call)
 * 2. Transform to MatchDoc format
 * 3. Compare against previous snapshot for change detection (goals, starts, ends)
 * 4. Batch write changed matches to Firestore
 * 5. Save new snapshot for next comparison
 * 6. Dispatch notifications for detected changes
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
exports.pollLivescoresHandler = pollLivescoresHandler;
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const config_1 = require("./config");
const sportmonks_1 = require("./sportmonks");
const mappers_1 = require("./mappers");
const detect_changes_1 = require("./detect-changes");
const db = admin.firestore();
/** Utility: sleep for N milliseconds */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Execute a single livescores poll cycle.
 * Returns the number of matches processed.
 */
async function executeSinglePoll(pollIndex) {
    const startMs = Date.now();
    // 1. Fetch live matches from SportMonks
    const smFixtures = await (0, sportmonks_1.fetchLivescores)();
    if (!smFixtures.length) {
        logger.debug(`Poll ${pollIndex}: No live matches`);
        return 0;
    }
    // 2. Transform to MatchDoc format
    const matchDocs = [];
    for (const fixture of smFixtures) {
        const doc = (0, mappers_1.mapFixtureToMatchDoc)(fixture);
        if (doc)
            matchDocs.push(doc);
    }
    // 3. Load previous snapshot and detect changes
    const prevSnapshot = await (0, detect_changes_1.loadSnapshot)();
    const changes = (0, detect_changes_1.detectChanges)(matchDocs, prevSnapshot);
    // 4. Batch write to Firestore (max 500 per batch)
    const batches = [];
    let currentBatch = db.batch();
    let opCount = 0;
    for (const matchDoc of matchDocs) {
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
    // 5. Save snapshot for next poll
    await (0, detect_changes_1.saveSnapshot)(matchDocs);
    // 6. Dispatch notifications for detected changes
    if (changes.length > 0) {
        await (0, detect_changes_1.dispatchNotifications)(changes);
    }
    const elapsed = Date.now() - startMs;
    logger.debug(`Poll ${pollIndex}: ${matchDocs.length} matches, ${changes.length} changes, ${elapsed}ms`);
    return matchDocs.length;
}
/**
 * Main polling function — runs 4 polls with 15-second intervals.
 * Called by the scheduled Cloud Function every 1 minute.
 */
async function pollLivescoresHandler() {
    logger.info('🔄 pollLivescores: starting 4-poll cycle');
    for (let i = 0; i < config_1.POLLS_PER_INVOCATION; i++) {
        try {
            await executeSinglePoll(i + 1);
        }
        catch (err) {
            logger.error(`Poll ${i + 1} failed:`, err);
        }
        // Wait 15 seconds before next poll (skip wait after last poll)
        if (i < config_1.POLLS_PER_INVOCATION - 1) {
            await sleep(config_1.LIVESCORE_POLL_INTERVAL_SEC * 1000);
        }
    }
    logger.info('✅ pollLivescores: 4-poll cycle complete');
}
//# sourceMappingURL=poll-livescores.js.map