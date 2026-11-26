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

import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { admin, db } from './admin-init';
import * as logger from 'firebase-functions/logger';

// ── Payload shape ──────────────────────────────────────────────────────────────
// Must stay in sync with the enqueue call in detect-changes.ts.

export interface DelayedPushPayload {
  /** Single-team topic (e.g. "team_1234_goals_d5"). Mutually exclusive with condition. */
  topic?:     string;
  /** Modo Estadio por partido: tokens de los dispositivos con sesión activa en
   *  el partido (football/estadio.ts). Con tokens no se usa topic ni condition. */
  tokens?:    string[];
  /** Categoría de iOS (botones al mantener presionado). Default MATCH_EVENT. */
  category?:  string;
  /** FCM topic condition for events that affect both teams — eliminates double delivery
   *  when a user follows both. e.g. "'team_A_goals_d5' in topics || 'team_B_goals_d5' in topics" */
  condition?: string;
  title:      string;
  body:       string;
  data:       Record<string, string>;
  dedupId:    string;               // same apns-collapse-id / android tag as _d0
  changeType: string;               // 'goal' | 'halftime' | 'matchEnd' | 'redCard' | 'goalCancelled' …
  matchId:    string;
  homeScore:  number;               // score AT THE TIME OF THE EVENT
  awayScore:  number;
  /** Collection holding the match doc for the VAR guard. Defaults to the
   *  legacy 'matches'; API-Sports pushes use 'fb_matches'. */
  matchCollection?: 'matches' | 'fb_matches';
  /** Expulsados por lado AL MOMENTO DEL EVENTO. Solo se llena para
   *  changeType 'redCard'; es la referencia del guard de VAR para saber si la
   *  roja sigue vigente al entregar. Opcional: las tareas encoladas antes de
   *  este cambio no lo traen y se entregan sin comparar. */
  homeRedCards?: number;
  awayRedCards?: number;
}

// ── Handler ─────────────────────────────────────────────────────────────────────

export const deliverDelayedPush = onTaskDispatched(
  {
    retryConfig:  { maxAttempts: 2, minBackoffSeconds: 5 },
    rateLimits:   { maxConcurrentDispatches: 50 },
    region:       'us-central1',
    memory:       '256MiB',
    timeoutSeconds: 30,
  },
  async (req) => { await handleDelayedPush(req.data as DelayedPushPayload); },
);

/** Etiqueta para los Reports de Firebase: "goal-estadio", "legacy-goal-estadio"… */
export function delayedAnalyticsLabel(p: Pick<DelayedPushPayload, 'changeType' | 'data'>): string {
  const kind = String(p.changeType || 'other').replace(/[^a-zA-Z0-9_.~%-]/g, '').slice(0, 30) || 'other';
  return `${p.data?.legacy === '1' ? 'legacy-' : ''}${kind}-estadio`;
}

/** Cuerpo del handler, separado del wrapper de Cloud Tasks para poder probarlo. */
export async function handleDelayedPush(p: DelayedPushPayload): Promise<void> {
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
      const snap = await db.doc(`${p.matchCollection ?? 'matches'}/${p.matchId}`).get();
      if (snap.exists) {
        const curr = snap.data() as {
          homeScore?: number; awayScore?: number;
          homeRedCards?: number; awayRedCards?: number;
        };
        const isGoal    = p.changeType === 'goal';
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
    } catch (varErr) {
      // Firestore read failed → deliver anyway (availability > correctness here)
      logger.warn('VAR guard read failed — delivering notification', {
        matchId: p.matchId, err: String(varErr),
      });
    }
  }

  // ── Sesiones por partido: entrega directa a cada dispositivo ─────────────
  if (p.tokens?.length) {
    await sendPushToTokens(p.tokens, { title: p.title, body: p.body }, p.data, p.dedupId,
      delayedAnalyticsLabel(p), p.category);
    return;
  }

  // ── FCM send ─────────────────────────────────────────────────────────────
  const target = p.condition ? { condition: p.condition } : { topic: p.topic! };
  try {
    await admin.messaging().send({
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
          sound:     'default',
          tag:       p.dedupId,
        },
      },
      apns: {
        headers:  { 'apns-collapse-id': p.dedupId },
        payload:  { aps: { sound: 'default', badge: 0, category: 'MATCH_EVENT' } },
      },
    });
    logger.info(`⏰ Delayed push delivered → ${p.condition ?? p.topic}`, {
      matchId: p.matchId, changeType: p.changeType,
    });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    // "No subscribers on this topic" → topic just has no receivers for this bucket
    if (
      code === 'messaging/invalid-argument' ||
      code === 'messaging/registration-token-not-registered'
    ) {
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
export async function sendPushToTokens(
  tokens: string[],
  copy: { title: string; body: string },
  data: Record<string, string>,
  dedupId: string,
  analyticsLabel: string,
  category = 'MATCH_EVENT',
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  for (let i = 0; i < tokens.length; i += 500) {
    const res = await admin.messaging().sendEachForMulticast({
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
