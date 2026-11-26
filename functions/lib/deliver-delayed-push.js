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
 * Correcciones (gol anulado, roja revocada):
 *   También pasan por aquí, pero solo para los buckets que ya habían recibido
 *   el evento (lo decide quien encola — delayedBucketsFor en football/notify.ts).
 *   Llegan con el mismo retraso del bucket y sin guard: no hay nada que revocar.
 *
 * Builds anteriores al cambio de proveedor:
 *   Sus copias retrasadas son tareas aparte, dirigidas a los topics
 *   `team_{idViejo}_*_d{N}` y con `data.legacy = '1'` (sin matchId).
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
exports.delayedAnalyticsLabel = delayedAnalyticsLabel;
exports.handleDelayedPush = handleDelayedPush;
exports.sendPushToTokens = sendPushToTokens;
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
}, async (req) => { await handleDelayedPush(req.data); });
/** Etiqueta para los Reports de Firebase: "goal-estadio", "legacy-goal-estadio"… */
function delayedAnalyticsLabel(p) {
    const kind = String(p.changeType || 'other').replace(/[^a-zA-Z0-9_.~%-]/g, '').slice(0, 30) || 'other';
    return `${p.data?.legacy === '1' ? 'legacy-' : ''}${kind}-estadio`;
}
/** Cuerpo del handler, separado del wrapper de Cloud Tasks para poder probarlo. */
async function handleDelayedPush(p) {
    // ── VAR guard (goles Y rojas) ────────────────────────────────────────────
    // Si el evento fue revocado entre el encolado y la entrega, se descarta el
    // push: quien está en un bucket retrasado todavía no sabe nada, así que lo
    // correcto es callar, no corregir algo que nunca vio.
    //
    // Las ROJAS no estaban cubiertas (el guard era `changeType === 'goal'`).
    // Resultado real: en Atlante vs América (24 jul 2026) la roja a Rodolfo
    // Cota se revocó, y un usuario en `_d10` la habría recibido diez minutos
    // después, ya revocada, sin nada que lo detuviera. Requiere que mappers.ts
    // escriba homeRedCards/awayRedCards en el doc — antes no existían.
    if (p.changeType === 'goal' || p.changeType === 'redCard') {
        try {
            const snap = await admin_init_1.db.doc(`${p.matchCollection ?? 'matches'}/${p.matchId}`).get();
            if (snap.exists) {
                const curr = snap.data();
                const isGoal = p.changeType === 'goal';
                const currTotal = isGoal
                    ? (curr.homeScore ?? 0) + (curr.awayScore ?? 0)
                    : (curr.homeRedCards ?? 0) + (curr.awayRedCards ?? 0);
                const taskTotal = isGoal
                    ? p.homeScore + p.awayScore
                    : (p.homeRedCards ?? 0) + (p.awayRedCards ?? 0);
                // Rojas: si la tarea no trae el conteo (encolada por una versión
                // anterior del código), no hay contra qué comparar → entregar.
                const comparable = isGoal || p.homeRedCards != null;
                if (comparable && currTotal < taskTotal) {
                    logger.info('🚫 VAR guard: delayed push suppressed', {
                        matchId: p.matchId, target: p.condition ?? p.topic,
                        changeType: p.changeType, taskTotal, currTotal,
                    });
                    return; // drop — el evento fue revocado
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
    // ── Sesiones por partido: entrega directa a cada dispositivo ─────────────
    if (p.tokens?.length) {
        await sendPushToTokens(p.tokens, { title: p.title, body: p.body }, p.data, p.dedupId, delayedAnalyticsLabel(p), p.category);
        return;
    }
    // ── FCM send ─────────────────────────────────────────────────────────────
    const target = p.condition ? { condition: p.condition } : { topic: p.topic };
    try {
        await admin_init_1.admin.messaging().send({
            ...target,
            notification: { title: p.title, body: p.body },
            data: p.data,
            // Reports de Firebase (Messaging → Reports): los avisos retrasados por
            // Modo Estadio se distinguen de los inmediatos ("goal" vs "goal-estadio").
            fcmOptions: { analyticsLabel: delayedAnalyticsLabel(p) },
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
                payload: { aps: { sound: 'default', badge: 0, category: 'MATCH_EVENT' } },
            },
        });
        logger.info(`⏰ Delayed push delivered → ${p.condition ?? p.topic}`, {
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
}
/**
 * Un mismo aviso a una lista de dispositivos (Modo Estadio por partido). Un
 * token que falla no detiene a los demás ni provoca reintento: reintentar la
 * tarea repetiría el aviso a quienes sí lo recibieron.
 */
async function sendPushToTokens(tokens, copy, data, dedupId, analyticsLabel, category = 'MATCH_EVENT') {
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < tokens.length; i += 500) {
        const res = await admin_init_1.admin.messaging().sendEachForMulticast({
            tokens: tokens.slice(i, i + 500),
            notification: { title: copy.title, body: copy.body },
            data,
            fcmOptions: { analyticsLabel },
            android: {
                priority: 'high',
                collapseKey: dedupId,
                notification: { channelId: 'analistas-live', sound: 'default', tag: dedupId },
            },
            apns: {
                headers: { 'apns-collapse-id': dedupId },
                payload: { aps: { sound: 'default', badge: 0, category } },
            },
        });
        ok += res.successCount;
        failed += res.failureCount;
    }
    logger.info(`⏰ Push delivered to ${ok} device(s)${failed ? `, ${failed} failed` : ''}`, {
        matchId: data.matchId, type: data.type,
    });
    return { ok, failed };
}
//# sourceMappingURL=deliver-delayed-push.js.map