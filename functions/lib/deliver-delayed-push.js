"use strict";
/**
 * deliver-delayed-push.ts
 *
 * Cloud Tasks handler for Modo Estadio delayed notifications.
 *
 * Architecture (Modo Estadio — delay-bucket topics):
 *   1. detect-changes.ts detects a live event (goal, halftime, matchEnd, redCard)
 *   2. dispatchNotifications() sends to <base>_d0 immediately AND enqueues one
 *      Cloud Task per delay bucket (d2/d5/d10) pointing at this handler.
 *   3. Cloud Tasks fires this handler at T+N minutes.
 *   4. This handler re-sends the FCM push to <base>_d{N}, which fan-outs to all
 *      devices currently subscribed to that delay bucket.
 *
 * VAR guard (goal events only):
 *   At delivery time we read the current match score from Firestore. If the
 *   total goals decreased since the task was enqueued (VAR cancelled the goal),
 *   we skip the notification. This means _d2/d5/d10 subscribers never learn
 *   about a disallowed goal — better UX than "Gol!" followed by "VAR: anulado".
 *
 * Idempotency:
 *   Tasks are enqueued with a deterministic name (estadio_<base>_<dedupId>_d<N>).
 *   Cloud Tasks silently drops a second enqueue with the same name while the
 *   first is still pending — no double delivery.
 *
 * Kill switch (server-side):
 *   Set ESTADIO_DELAY_ENABLED=false in Cloud Functions env to stop enqueuing
 *   new tasks (no redeploy needed; this handler just never gets called).
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
exports.deliverDelayedPush = void 0;
const tasks_1 = require("firebase-functions/v2/tasks");
const admin_init_1 = require("./admin-init");
const logger = __importStar(require("firebase-functions/logger"));
// ── Handler ─────────────────────────────────────────────────────────────────────
exports.deliverDelayedPush = (0, tasks_1.onTaskDispatched)({
    retryConfig: { maxAttempts: 2, minBackoffSeconds: 5 },
    rateLimits: { maxConcurrentDispatches: 50 },
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (req) => {
    const p = req.data;
    // ── VAR guard (goal events only) ─────────────────────────────────────────
    // If the score has decreased since the task was enqueued, the goal was
    // cancelled by VAR. Skip the notification so delayed-bucket subscribers
    // never receive a spoiler for a disallowed goal.
    if (p.changeType === 'goal') {
        try {
            const snap = await admin_init_1.db.doc(`matches/${p.matchId}`).get();
            if (snap.exists) {
                const curr = snap.data();
                const currTotal = (curr.homeScore ?? 0) + (curr.awayScore ?? 0);
                const taskTotal = p.homeScore + p.awayScore;
                if (currTotal < taskTotal) {
                    logger.info('🚫 VAR guard: delayed push suppressed', {
                        matchId: p.matchId, topic: p.topic,
                        taskTotal, currTotal,
                    });
                    return; // drop — VAR cancelled the goal
                }
            }
        }
        catch (varErr) {
            // Firestore read failed → deliver anyway (availability > correctness here)
            logger.warn('VAR guard read failed — delivering notification', {
                matchId: p.matchId, err: String(varErr),
            });
        }
    }
    // ── FCM send ─────────────────────────────────────────────────────────────
    try {
        await admin_init_1.admin.messaging().send({
            topic: p.topic,
            notification: { title: p.title, body: p.body },
            data: p.data,
            android: {
                priority: 'high',
                collapseKey: p.dedupId,
                notification: {
                    channelId: 'analistas-live',
                    sound: 'default',
                    tag: p.dedupId,
                },
            },
            apns: {
                headers: { 'apns-collapse-id': p.dedupId },
                payload: { aps: { sound: 'default', badge: 0 } },
            },
        });
        logger.info(`⏰ Delayed push delivered → ${p.topic}`, {
            matchId: p.matchId, changeType: p.changeType,
        });
    }
    catch (err) {
        const code = err.code;
        // "No subscribers on this topic" → topic just has no receivers for this bucket
        if (code === 'messaging/invalid-argument' ||
            code === 'messaging/registration-token-not-registered') {
            return; // silent skip — no subscribers on this bucket
        }
        // Any other error → rethrow so Cloud Tasks retries (up to maxAttempts)
        throw err;
    }
});
//# sourceMappingURL=deliver-delayed-push.js.map