/**
 * Live Activities — push de updates a lock screen / Dynamic Island.
 *
 * Colgado del ciclo de pollLivescores (tras el batch write): para cada partido
 * con registros en `liveActivities`, construye el ContentState del contrato y
 * lo empuja VÍA FCM:
 *   • iOS: `apns.live_activity_token` + header `apns-push-type: liveactivity`
 *     (event update/end + content-state). Sin cliente APNs propio.
 *   • Android: data message (lo consume el background handler — Fase 3).
 *
 * Presupuesto (lección del apagón de billing): solo se envía cuando el estado
 * CAMBIÓ vs `lastState` guardado en el registro; en juego normal eso es ~0
 * pushes/min por partido, con ráfagas solo en gol/fase. 1 query por poll,
 * filtrada por los matchIds del ciclo. NUNCA lanza: cualquier error se loguea
 * y el poll sigue intacto.
 *
 * Contrato: functions/src/live-activity-contract.ts (espejo del cliente y de
 * los structs Swift — keys literales).
 */

import { admin, db } from './admin-init';
import * as logger from 'firebase-functions/logger';
import type { MatchDoc } from './types';
import type {
  LiveActivityPhase,
  LiveActivityRegistration,
  MatchActivityState,
} from './live-activity-contract';

const COLLECTION = 'liveActivities';
/** Registros más viejos que esto se purgan (previa 4h + partido + linger). */
const REGISTRATION_TTL_MS = 12 * 60 * 60 * 1000;
/** El marcador final se queda visible este tiempo tras el `end` (FT natural). */
const END_LINGER_SEC = 30 * 60;

// ── MatchDoc → ContentState (espejo de buildActivityState del cliente) ───────

const TICKING: ReadonlySet<LiveActivityPhase> = new Set(['1H', '2H', 'ET']);

function phaseFromMatchDoc(m: MatchDoc): LiveActivityPhase {
  if (m.status === 'finished') return 'FT';
  if (m.status === 'scheduled') return 'pre';
  switch (m.stateLabel) {
    case '1T':   return '1H';
    case 'HT':   return 'HT';
    case '2T':   return '2H';
    case 'ET':   return 'ET';
    case 'PEN':  return 'PEN';
    case 'SUSP':
    case 'INT':  return 'SUSP';
    default:     return '1H';
  }
}

function kickoffUnixSeconds(m: MatchDoc): number | undefined {
  if (!m.startingAtUtc) return undefined;
  const ms = new Date(m.startingAtUtc.replace(' ', 'T') + 'Z').getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}

export function buildStateFromMatchDoc(m: MatchDoc): MatchActivityState {
  const phase = phaseFromMatchDoc(m);
  const anchor = m.liveClock;
  const ticks = TICKING.has(phase) && !!anchor && anchor.periodStartedAt > 0;
  return {
    homeScore: m.homeScore ?? 0,
    awayScore: m.awayScore ?? 0,
    phase,
    periodStartedAt: ticks ? anchor!.periodStartedAt : undefined,
    periodMinuteOffset: ticks ? anchor!.periodMinuteOffset : undefined,
    kickoffAt: phase === 'pre' ? kickoffUnixSeconds(m) : undefined,
  };
}

/** Clave de deduplicación: si no cambió, no se envía nada. */
function stateKey(s: MatchActivityState): string {
  return JSON.stringify([
    s.homeScore, s.awayScore, s.phase, s.periodStartedAt ?? 0,
    s.periodMinuteOffset ?? 0, s.kickoffAt ?? 0,
  ]);
}

// ── Envío ─────────────────────────────────────────────────────────────────────

interface RegDoc extends LiveActivityRegistration {
  lastState?: string;
}

async function sendIos(
  reg: RegDoc,
  state: MatchActivityState,
  isEnd: boolean,
): Promise<void> {
  if (!reg.fcmToken || !reg.activityPushToken) return; // token de Activity aún no llega
  const nowSec = Math.floor(Date.now() / 1000);
  const aps: Record<string, unknown> = {
    timestamp: nowSec,
    event: isEnd ? 'end' : 'update',
    'content-state': state,
  };
  if (isEnd) aps['dismissal-date'] = nowSec + END_LINGER_SEC;

  const message = {
    token: reg.fcmToken,
    apns: {
      // `live_activity_token` puede faltar en los types de firebase-admin
      // (issue #2875) — el cast lo deja pasar; el backend FCM sí lo soporta.
      live_activity_token: reg.activityPushToken,
      headers: {
        'apns-push-type': 'liveactivity',
        'apns-priority': '10',
      },
      payload: { aps },
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await admin.messaging().send(message as any);
}

async function sendAndroid(
  reg: RegDoc,
  state: MatchActivityState,
  isEnd: boolean,
): Promise<void> {
  if (!reg.fcmToken) return;
  await admin.messaging().send({
    token: reg.fcmToken,
    data: {
      type: isEnd ? 'live_activity_end' : 'live_activity_update',
      matchId: reg.matchId,
      state: JSON.stringify(state),
    },
    android: { priority: 'high' },
  });
}

/**
 * Punto de entrada — llamado desde executeSinglePoll tras el batch write.
 * `matchDocs` = partidos del ciclo (live + próximos a empezar). NUNCA lanza.
 */
export async function sendLiveActivityUpdates(matchDocs: MatchDoc[]): Promise<void> {
  try {
    if (matchDocs.length === 0) return;

    // Firestore 'in' admite máx 30 valores — chunk defensivo.
    const byId = new Map(matchDocs.map(m => [m.id, m]));
    const ids = [...byId.keys()];
    const regs: { ref: FirebaseFirestore.DocumentReference; data: RegDoc }[] = [];
    for (let i = 0; i < ids.length; i += 30) {
      const snap = await db.collection(COLLECTION)
        .where('matchId', 'in', ids.slice(i, i + 30))
        .get();
      snap.forEach(d => regs.push({ ref: d.ref, data: d.data() as RegDoc }));
    }
    if (regs.length === 0) return;

    const now = Date.now();
    let sent = 0;

    await Promise.all(regs.map(async ({ ref, data }) => {
      try {
        // TTL: registros viejos se borran y ya.
        const createdMs = (data.createdAt as FirebaseFirestore.Timestamp | undefined)
          ?.toMillis?.() ?? 0;
        if (createdMs > 0 && now - createdMs > REGISTRATION_TTL_MS) {
          await ref.delete();
          return;
        }
        if (data.ended) return;

        const match = byId.get(data.matchId);
        if (!match) return;

        const state = buildStateFromMatchDoc(match);
        const key = stateKey(state);
        if (data.lastState === key) return; // sin cambios → sin push

        const isEnd = state.phase === 'FT';
        if (data.platform === 'ios') {
          await sendIos(data, state, isEnd);
        } else {
          await sendAndroid(data, state, isEnd);
        }
        sent++;

        await ref.set(
          { lastState: key, ...(isEnd ? { ended: true } : {}) },
          { merge: true },
        );
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code ?? '';
        const msg = (err as Error)?.message ?? String(err);
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-argument'
        ) {
          // Token muerto/basura → limpiar el registro para no reintentar.
          await ref.delete().catch(() => {});
        } else {
          logger.warn('liveActivities: send falló', { matchId: data.matchId, code, msg });
        }
      }
    }));

    if (sent > 0) logger.info(`liveActivities: ${sent} push(es) enviados`);
  } catch (err) {
    // Blindaje total: esto corre dentro del poll de producción.
    logger.warn('liveActivities: sendLiveActivityUpdates falló', { err });
  }
}
