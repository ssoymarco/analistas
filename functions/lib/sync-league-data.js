"use strict";
/**
 * sync-league-data.ts
 *
 * Event-driven sync: when pollLivescores detects a goal or match end,
 * immediately refresh standings + topscorers for the affected league
 * instead of waiting for the next hourly cron.
 *
 * Why two separate functions:
 *   • Goals change topscorers but NOT standings (match isn't over yet).
 *   • Match endings change both — points awarded + final goals tallied.
 *
 * Concurrency: callers should dedupe by leagueId and run the syncs in
 * parallel via Promise.allSettled. We don't enforce a global lock — the
 * worst case is two syncs racing on the same Firestore doc, where the
 * later write wins (and both contain the same fresh SportMonks data
 * anyway, so the outcome is identical).
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
exports.syncLeagueStandings = syncLeagueStandings;
exports.syncLeagueTopScorers = syncLeagueTopScorers;
exports.triggerLeagueSyncForChanges = triggerLeagueSyncForChanges;
const logger = __importStar(require("firebase-functions/logger"));
const admin_init_1 = require("./admin-init");
const sportmonks_1 = require("./sportmonks");
const mappers_1 = require("./mappers");
const config_1 = require("./config");
/**
 * Refresh standings for a single league. Silent no-op if the league has
 * no configured seasonId (e.g. friendlies). Errors are caught + logged —
 * we never throw, so a failed sync of one league cannot block others.
 */
async function syncLeagueStandings(leagueId) {
    const cfg = (0, config_1.getLeagueConfig)(leagueId);
    if (!cfg?.currentSeasonId) {
        logger.debug(`[event-sync] no seasonId for league ${leagueId} — skipping standings`);
        return;
    }
    try {
        const groups = await (0, sportmonks_1.fetchStandings)(cfg.currentSeasonId);
        if (groups.length === 0)
            return;
        const doc = (0, mappers_1.mapStandingsToDoc)(cfg.currentSeasonId, cfg.id, groups);
        await admin_init_1.db.collection('standings').doc(String(cfg.currentSeasonId)).set(doc);
        logger.info(`📊 event-driven standings refreshed for ${cfg.name}`);
    }
    catch (err) {
        logger.error(`[event-sync] standings failed for league ${leagueId} (${cfg.name}):`, err);
    }
}
/**
 * Refresh top scorers for a single league. Same error/skip semantics as
 * syncLeagueStandings.
 */
async function syncLeagueTopScorers(leagueId) {
    const cfg = (0, config_1.getLeagueConfig)(leagueId);
    if (!cfg?.currentSeasonId) {
        logger.debug(`[event-sync] no seasonId for league ${leagueId} — skipping topscorers`);
        return;
    }
    try {
        const scorers = await (0, sportmonks_1.fetchTopScorers)(cfg.currentSeasonId);
        if (scorers.length === 0)
            return;
        const doc = (0, mappers_1.mapTopScorersToDoc)(cfg.currentSeasonId, cfg.id, scorers);
        await admin_init_1.db.collection('topscorers').doc(String(cfg.currentSeasonId)).set(doc);
        logger.info(`🏅 event-driven topscorers refreshed for ${cfg.name}`);
    }
    catch (err) {
        logger.error(`[event-sync] topscorers failed for league ${leagueId} (${cfg.name}):`, err);
    }
}
/**
 * Inspect a batch of detected changes and fire the appropriate syncs.
 *
 *   matchEnd → refresh standings AND topscorers for that league
 *   goal     → refresh topscorers for that league (standings unchanged)
 *
 * Multiple events for the same league collapse to a single sync per
 * type, even within the same invocation (Set dedup). All syncs run in
 * parallel via Promise.allSettled — one league's failure can't block the
 * rest, and a slow league can't delay the next poll cycle by more than
 * the duration of the slowest sync.
 */
async function triggerLeagueSyncForChanges(changes) {
    const standingsLeagues = new Set();
    const topscorersLeagues = new Set();
    for (const c of changes) {
        const lid = parseInt(c.leagueId, 10);
        if (!Number.isFinite(lid))
            continue;
        switch (c.type) {
            case 'matchEnd':
                standingsLeagues.add(lid);
                topscorersLeagues.add(lid);
                break;
            case 'goal':
                topscorersLeagues.add(lid);
                break;
            // matchStart and statusChange don't affect standings or topscorers
        }
    }
    if (standingsLeagues.size === 0 && topscorersLeagues.size === 0)
        return;
    const tasks = [];
    for (const lid of standingsLeagues)
        tasks.push(syncLeagueStandings(lid));
    for (const lid of topscorersLeagues)
        tasks.push(syncLeagueTopScorers(lid));
    await Promise.allSettled(tasks);
    logger.info(`⚡ event-driven sync: ${standingsLeagues.size} standings + ${topscorersLeagues.size} topscorers`, {
        standingsLeagueIds: Array.from(standingsLeagues),
        topscorersLeagueIds: Array.from(topscorersLeagues),
    });
}
//# sourceMappingURL=sync-league-data.js.map