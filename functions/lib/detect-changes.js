"use strict";
/**
 * detect-changes.ts
 *
 * Compares current livescores against the previous snapshot in Firestore.
 * Detects goals, match starts, and match endings.
 * Queues FCM notifications for each detected change.
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
exports.loadSnapshot = loadSnapshot;
exports.saveSnapshot = saveSnapshot;
exports.detectChanges = detectChanges;
exports.dispatchNotifications = dispatchNotifications;
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const db = admin.firestore();
/**
 * Load the previous livescores snapshot from _meta/livescoresSnapshot.
 * Returns an empty snapshot if none exists yet.
 */
async function loadSnapshot() {
    const snap = await db.doc('_meta/livescoresSnapshot').get();
    if (!snap.exists)
        return {};
    return snap.data()?.matches ?? {};
}
/**
 * Save the current livescores snapshot for next comparison.
 */
async function saveSnapshot(matches) {
    const snapshot = {};
    for (const m of matches) {
        snapshot[m.id] = {
            homeScore: m.homeScore,
            awayScore: m.awayScore,
            status: m.status,
            stateId: m.stateId,
        };
    }
    await db.doc('_meta/livescoresSnapshot').set({
        matches: snapshot,
        updatedAt: admin.firestore.Timestamp.now(),
    });
}
/**
 * Compare current matches against previous snapshot.
 * Returns a list of detected changes (goals, match starts, match endings).
 */
function detectChanges(currentMatches, previousSnapshot) {
    const changes = [];
    for (const match of currentMatches) {
        const prev = previousSnapshot[match.id];
        if (!prev) {
            // New live match — check if it just started
            if (match.status === 'live') {
                changes.push({
                    type: 'matchStart',
                    matchId: match.id,
                    homeTeam: match.homeTeam,
                    awayTeam: match.awayTeam,
                    homeScore: match.homeScore,
                    awayScore: match.awayScore,
                    league: match.league,
                    leagueId: match.leagueId,
                    minute: match.minute,
                });
            }
            continue;
        }
        // ── Goal Detection ────────────────────────────────────────────────────
        const prevTotal = prev.homeScore + prev.awayScore;
        const newTotal = match.homeScore + match.awayScore;
        if (newTotal > prevTotal) {
            // Determine which side scored
            const homeScored = match.homeScore > prev.homeScore;
            const awayScored = match.awayScore > prev.awayScore;
            if (homeScored) {
                changes.push({
                    type: 'goal',
                    matchId: match.id,
                    homeTeam: match.homeTeam,
                    awayTeam: match.awayTeam,
                    homeScore: match.homeScore,
                    awayScore: match.awayScore,
                    league: match.league,
                    leagueId: match.leagueId,
                    scoringTeamSide: 'home',
                    minute: match.minute,
                });
            }
            if (awayScored) {
                changes.push({
                    type: 'goal',
                    matchId: match.id,
                    homeTeam: match.homeTeam,
                    awayTeam: match.awayTeam,
                    homeScore: match.homeScore,
                    awayScore: match.awayScore,
                    league: match.league,
                    leagueId: match.leagueId,
                    scoringTeamSide: 'away',
                    minute: match.minute,
                });
            }
        }
        // ── Match Start Detection ─────────────────────────────────────────────
        if (prev.status === 'scheduled' && match.status === 'live') {
            changes.push({
                type: 'matchStart',
                matchId: match.id,
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
                homeScore: match.homeScore,
                awayScore: match.awayScore,
                league: match.league,
                leagueId: match.leagueId,
                minute: match.minute,
            });
        }
        // ── Match End Detection ───────────────────────────────────────────────
        if (prev.status === 'live' && match.status === 'finished') {
            changes.push({
                type: 'matchEnd',
                matchId: match.id,
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
                homeScore: match.homeScore,
                awayScore: match.awayScore,
                league: match.league,
                leagueId: match.leagueId,
                minute: match.minute,
            });
        }
    }
    return changes;
}
/**
 * Dispatch FCM notifications for detected changes.
 * Uses FCM topics: team_{teamId}_goal, team_{teamId}_matchStart, etc.
 *
 * Phase 2: Full implementation with FCM topic sends.
 * For now: logs changes for monitoring.
 */
async function dispatchNotifications(changes) {
    for (const change of changes) {
        const homeId = change.homeTeam.id;
        const awayId = change.awayTeam.id;
        switch (change.type) {
            case 'goal': {
                const scorer = change.scoringTeamSide === 'home' ? change.homeTeam.name : change.awayTeam.name;
                logger.info(`⚽ GOL — ${scorer} | ${change.homeTeam.name} ${change.homeScore}-${change.awayScore} ${change.awayTeam.name} (${change.minute ?? '?'}')`, {
                    matchId: change.matchId,
                    scoringTeam: change.scoringTeamSide,
                });
                // TODO Phase 2: Send FCM to topics
                // await admin.messaging().send({
                //   topic: `team_${change.scoringTeamSide === 'home' ? homeId : awayId}_goal`,
                //   notification: {
                //     title: `Gol ⚽ — ${change.minute}'`,
                //     body: `${change.homeTeam.name} ${change.homeScore} - ${change.awayScore} ${change.awayTeam.name}`,
                //   },
                //   data: { type: 'goal', matchId: change.matchId },
                // });
                break;
            }
            case 'matchStart': {
                logger.info(`📣 INICIO — ${change.homeTeam.name} vs ${change.awayTeam.name} · ${change.league}`, {
                    matchId: change.matchId,
                });
                break;
            }
            case 'matchEnd': {
                logger.info(`🏆 FINAL — ${change.homeTeam.name} ${change.homeScore}-${change.awayScore} ${change.awayTeam.name} · ${change.league}`, {
                    matchId: change.matchId,
                });
                break;
            }
        }
    }
    if (changes.length > 0) {
        logger.info(`📊 Total changes detected: ${changes.length}`, {
            goals: changes.filter(c => c.type === 'goal').length,
            starts: changes.filter(c => c.type === 'matchStart').length,
            ends: changes.filter(c => c.type === 'matchEnd').length,
        });
    }
}
//# sourceMappingURL=detect-changes.js.map