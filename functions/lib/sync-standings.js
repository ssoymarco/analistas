"use strict";
/**
 * sync-standings.ts
 *
 * Cloud Function: syncs league standings and top scorers.
 * Scheduled every 6 hours for standings, every 12 hours for top scorers.
 *
 * Iterates through all configured leagues with valid seasonIds,
 * fetches standings/scorers from SportMonks, and writes to Firestore.
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
exports.syncStandingsHandler = syncStandingsHandler;
exports.syncTopScorersHandler = syncTopScorersHandler;
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const config_1 = require("./config");
const sportmonks_1 = require("./sportmonks");
const mappers_1 = require("./mappers");
const db = admin.firestore();
/** Utility: sleep for N milliseconds (rate limit courtesy) */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Sync standings for all configured leagues.
 * Processes 10 leagues at a time with 2-second pauses for rate limiting.
 */
async function syncStandingsHandler() {
    const leagues = (0, config_1.getLeaguesWithSeason)();
    logger.info(`📊 syncStandings: processing ${leagues.length} leagues`);
    let successCount = 0;
    let errorCount = 0;
    for (let i = 0; i < leagues.length; i++) {
        const league = leagues[i];
        try {
            const groups = await (0, sportmonks_1.fetchStandings)(league.currentSeasonId);
            if (groups.length > 0) {
                const doc = (0, mappers_1.mapStandingsToDoc)(league.currentSeasonId, league.id, groups);
                await db.collection('standings').doc(String(league.currentSeasonId)).set(doc);
                successCount++;
            }
        }
        catch (err) {
            logger.error(`Failed standings for ${league.name} (season ${league.currentSeasonId}):`, err);
            errorCount++;
        }
        // Rate limit: pause every 10 leagues
        if ((i + 1) % 10 === 0 && i < leagues.length - 1) {
            await sleep(2000);
        }
    }
    logger.info(`✅ syncStandings: ${successCount} ok, ${errorCount} errors`);
}
/**
 * Sync top scorers for all configured leagues.
 * Same pattern as standings with rate limit courtesy pauses.
 */
async function syncTopScorersHandler() {
    const leagues = (0, config_1.getLeaguesWithSeason)();
    logger.info(`🏅 syncTopScorers: processing ${leagues.length} leagues`);
    let successCount = 0;
    let errorCount = 0;
    for (let i = 0; i < leagues.length; i++) {
        const league = leagues[i];
        try {
            const scorers = await (0, sportmonks_1.fetchTopScorers)(league.currentSeasonId);
            if (scorers.length > 0) {
                const doc = (0, mappers_1.mapTopScorersToDoc)(league.currentSeasonId, league.id, scorers);
                await db.collection('topscorers').doc(String(league.currentSeasonId)).set(doc);
                successCount++;
            }
        }
        catch (err) {
            logger.error(`Failed top scorers for ${league.name} (season ${league.currentSeasonId}):`, err);
            errorCount++;
        }
        // Rate limit: pause every 10 leagues
        if ((i + 1) % 10 === 0 && i < leagues.length - 1) {
            await sleep(2000);
        }
    }
    logger.info(`✅ syncTopScorers: ${successCount} ok, ${errorCount} errors`);
}
//# sourceMappingURL=sync-standings.js.map