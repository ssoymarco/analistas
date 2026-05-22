"use strict";
/**
 * sync-players.ts
 *
 * Cloud Function: syncs full player profiles (season stats + team history)
 * for every player we know about. Writes one `players/{playerId}` doc.
 *
 * Replaces the per-user usePlayerDetail proxy call.
 *
 * Player discovery sources:
 *   1. squads/{seasonId_teamId}.players[]  — every squad we've synced
 *   2. topscorers/{seasonId}.scorers/assists/cards[]  — top performers
 *
 * Schedule: every 24h.
 *
 * Cost: ~3-5k unique players × 1 SM call = ~3-5k calls/day on `players`
 * entity. ~5-7% of the 72k/day cap.
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
exports.syncPlayersHandler = syncPlayersHandler;
const admin_init_1 = require("./admin-init");
const logger = __importStar(require("firebase-functions/logger"));
const sportmonks_1 = require("./sportmonks");
const SLEEP_BETWEEN_FETCHES_MS = 150;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function findPlayerIdsToSync() {
    const ids = new Set();
    // From squads
    const squadsSnap = await admin_init_1.db.collection('squads').limit(2000).get();
    for (const docSnap of squadsSnap.docs) {
        const players = docSnap.data()?.players;
        if (!Array.isArray(players))
            continue;
        for (const p of players) {
            if (typeof p?.playerId === 'number' && p.playerId > 0)
                ids.add(p.playerId);
        }
    }
    // From topscorers (covers anyone in goleadores tab who isn't on a synced squad)
    const topSnap = await admin_init_1.db.collection('topscorers').limit(200).get();
    for (const docSnap of topSnap.docs) {
        const data = docSnap.data();
        for (const list of [data?.scorers, data?.assists, data?.cards]) {
            if (!Array.isArray(list))
                continue;
            for (const p of list) {
                const id = Number(p?.playerId);
                if (id > 0)
                    ids.add(id);
            }
        }
    }
    return ids;
}
async function syncPlayersHandler() {
    const startMs = Date.now();
    logger.info('🧍 syncPlayers: discovering player IDs');
    const ids = await findPlayerIdsToSync();
    if (ids.size === 0) {
        logger.info('🧍 syncPlayers: nothing to discover (squads not synced yet?)');
        return;
    }
    logger.info(`🧍 syncPlayers: ${ids.size} unique players to refresh`);
    let written = 0;
    let errors = 0;
    for (const playerId of ids) {
        try {
            const raw = await (0, sportmonks_1.fetchPlayerFullProfile)(playerId);
            if (!raw)
                continue;
            await admin_init_1.db.collection('players').doc(String(playerId)).set({
                id: playerId,
                raw,
                updatedAt: admin_init_1.admin.firestore.Timestamp.now(),
            }, { merge: true });
            written++;
            await sleep(SLEEP_BETWEEN_FETCHES_MS);
        }
        catch (err) {
            errors++;
            logger.error(`🧍 player ${playerId} sync failed:`, err);
        }
    }
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    logger.info(`✅ syncPlayers: ${written} written (${errors} errors) in ${elapsed}s`);
}
//# sourceMappingURL=sync-players.js.map