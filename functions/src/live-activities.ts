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
import { displayLeague } from './league-display';
import type { MatchDoc } from './types';
import type {
  LiveActivityPhase,
  LiveActivityRegistration,
  MatchActivityState,
} from './live-activity-contract';

const COLLECTION = 'liveActivities';
/** Registros más viejos que esto se purgan (previa 4h + partido + linger). */
const REGISTRATION_TTL_MS = 12 * 60 * 60 * 1000;
/** El marcador final se queda visible este tiempo tras el `end` (FT natural).
 *  10 min — feedback del dueño: 30 min se sentía demasiado. */
const END_LINGER_SEC = 10 * 60;

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
    penHome: typeof m.homePenScore === 'number' ? m.homePenScore : undefined,
    penAway: typeof m.awayPenScore === 'number' ? m.awayPenScore : undefined,
  };
}

/** Clave de deduplicación: si no cambió, no se envía nada. */
function stateKey(s: MatchActivityState): string {
  return JSON.stringify([
    s.homeScore, s.awayScore, s.phase, s.periodStartedAt ?? 0,
    s.periodMinuteOffset ?? 0, s.kickoffAt ?? 0, s.penHome ?? -1, s.penAway ?? -1,
  ]);
}

// ── Alert (vibración/pantalla) por transición ─────────────────────────────────
// Los push de TRANSICIÓN real llevan alert para que el iPhone vibre/encienda
// pantalla en gol, MT, 2T, penales y final (petición del dueño). Devuelve null
// (sin alert) en: (a) el PRIMER push de un registro — es solo sincronización
// inicial, no un evento; (b) la fase 'pre' — no hay nada que anunciar antes
// del kickoff. El estado previo viene del lastState (formato de stateKey).

function alertForTransition(
  prevKey: string | undefined,
  s: MatchActivityState,
  m: MatchDoc,
): { title: string; body: string } | null {
  let prev: [number, number, string] | null = null;
  try {
    const arr = prevKey ? (JSON.parse(prevKey) as unknown[]) : null;
    if (Array.isArray(arr)) prev = [Number(arr[0]), Number(arr[1]), String(arr[2])];
  } catch { /* lastState ilegible → tratar como primer push */ }

  if (!prev) return null;          // sync inicial: silencioso
  if (s.phase === 'pre') return null; // previa: nada que anunciar

  const score = `${m.homeTeam?.shortName ?? ''} ${s.homeScore} - ${s.awayScore} ${m.awayTeam?.shortName ?? ''}`;

  if (s.homeScore > prev[0] || s.awayScore > prev[1]) {
    return { title: '⚽ ¡GOOOL!', body: score };
  }
  if (s.homeScore < prev[0] || s.awayScore < prev[1]) {
    return { title: 'Gol anulado', body: score }; // VAR / corrección de SM
  }
  switch (s.phase) {
    case 'HT':   return { title: 'Medio tiempo', body: score };
    case '2H':   return { title: '¡Arranca el 2do tiempo!', body: score };
    case 'ET':   return { title: 'Tiempo extra', body: score };
    case 'PEN':  return { title: '¡Tanda de penales!', body: score };
    case 'SUSP': return { title: 'Partido suspendido', body: score };
    case 'FT': {
      const pens = typeof s.penHome === 'number' && typeof s.penAway === 'number'
        ? ` (${s.penHome}-${s.penAway} pen)` : '';
      return { title: 'Final del partido', body: score + pens };
    }
    // Cambio de anchor sin cambio de fase/marcador (raro): sin alert.
    default:     return null;
  }
}

// ── Envío ─────────────────────────────────────────────────────────────────────

interface RegDoc extends LiveActivityRegistration {
  lastState?: string;
}

/** @returns true solo si hubo entrega real a FCM (false = sin token aún —
 *  el caller NO debe estampar lastState, para que el próximo poll reintente
 *  y haga catch-up en cuanto el token llegue). */
async function sendIos(
  reg: RegDoc,
  state: MatchActivityState,
  isEnd: boolean,
  alert: { title: string; body: string } | null,
): Promise<boolean> {
  if (!reg.fcmToken || !reg.activityPushToken) return false; // token aún no llega
  const nowSec = Math.floor(Date.now() / 1000);
  const aps: Record<string, unknown> = {
    timestamp: nowSec,
    event: isEnd ? 'end' : 'update',
    'content-state': state,
  };
  // Alert = la Activity "avisa" (vibración + pantalla) SOLO en transiciones
  // reales; el sync inicial y la previa van silenciosos (alert null).
  if (alert) {
    aps.alert = { title: alert.title, body: alert.body, sound: 'default' };
  }
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
  return true;
}

/** @returns true solo si hubo entrega real (ver sendIos). */
async function sendAndroid(
  reg: RegDoc,
  state: MatchActivityState,
  isEnd: boolean,
  match: MatchDoc,
): Promise<boolean> {
  if (!reg.fcmToken) return false;
  // `attributes` viaja en CADA data message: el handler headless de Android
  // pinta la notificación sin depender de estado local (la app puede llevar
  // horas muerta cuando llega el push). Espejo de MatchActivityAttributes.
  const attributes = {
    matchId: reg.matchId,
    home: {
      name: match.homeTeam?.name ?? '',
      shortName: match.homeTeam?.shortName ?? '',
      logo: match.homeTeam?.logo ?? '',
    },
    away: {
      name: match.awayTeam?.name ?? '',
      shortName: match.awayTeam?.shortName ?? '',
      logo: match.awayTeam?.logo ?? '',
    },
    leagueName: displayLeague(match.league),
  };
  await admin.messaging().send({
    token: reg.fcmToken,
    data: {
      type: isEnd ? 'live_activity_end' : 'live_activity_update',
      matchId: reg.matchId,
      state: JSON.stringify(state),
      attributes: JSON.stringify(attributes),
    },
    android: { priority: 'high' },
  });
  return true;
}

/**
 * Punto de entrada — llamado desde executeSinglePoll tras el batch write.
 * `matchDocs` = partidos del ciclo (live + próximos a empezar). NUNCA lanza.
 */
export async function sendLiveActivityUpdates(
  matchDocs: MatchDoc[],
  opts?: { deepPass?: boolean },
): Promise<void> {
  try {
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

    // ── Catch-up de HUÉRFANOS (paso profundo, 1×/min) ─────────────────────
    // Incidente España-Bélgica (10 jul 2026): SM saca al partido de la lista
    // en vivo casi de inmediato tras el FT. Si el push del FINAL falló una
    // vez, o el registro llegó tarde, NADIE reintentaba — la Activity quedaba
    // contando para siempre (104' en un partido terminado al 90+14). Aquí se
    // rescatan los registros abiertos (ended=false) cuyo partido YA no está
    // en el ciclo: se lee su doc de Firestore (que syncFixtures mantiene) y
    // si el partido terminó, se entrega el FINAL desde el doc.
    const orphanRegs: { ref: FirebaseFirestore.DocumentReference; data: RegDoc }[] = [];
    if (opts?.deepPass) {
      try {
        const open = await db.collection(COLLECTION)
          .where('ended', '==', false)
          .limit(100)
          .get();
        const orphans = open.docs.filter(d => !byId.has((d.data() as RegDoc).matchId));
        const orphanIds = [...new Set(orphans.map(d => (d.data() as RegDoc).matchId))];
        for (let i = 0; i < orphanIds.length; i += 10) {
          const chunk = orphanIds.slice(i, i + 10);
          const docs = await db.getAll(...chunk.map(id => db.collection('matches').doc(id)));
          for (const snap of docs) {
            if (snap.exists) byId.set(snap.id, snap.data() as MatchDoc);
          }
        }
        for (const d of orphans) {
          if (byId.has((d.data() as RegDoc).matchId)) {
            orphanRegs.push({ ref: d.ref, data: d.data() as RegDoc });
          }
        }
        if (orphanRegs.length > 0) {
          logger.info(`liveActivities: catch-up de ${orphanRegs.length} registro(s) fuera del ciclo`);
        }
      } catch (err) {
        logger.warn('liveActivities: catch-up de huérfanos falló', { err });
      }
    }

    const allRegs = regs.concat(orphanRegs);
    const now = Date.now();
    let sent = 0;

    await Promise.all(allRegs.map(async ({ ref, data }) => {
      try {
        // TTL: registros viejos se borran y ya.
        const createdMs = (data.createdAt as FirebaseFirestore.Timestamp | undefined)
          ?.toMillis?.() ?? 0;
        if (createdMs > 0 && now - createdMs > REGISTRATION_TTL_MS) {
          await ref.delete();
          return;
        }
        const match = byId.get(data.matchId);
        if (!match) return;

        const state = buildStateFromMatchDoc(match);
        const key = stateKey(state);

        if (data.ended) {
          // Flapping de SM (FT→live, visto en producción con syncFixtures):
          // si el partido "revivió", reabrir el registro para que ANDROID
          // retome updates. iOS no puede (una Activity terminada está muerta
          // hasta que el usuario re-siga) — limitación de ActivityKit.
          if (state.phase !== 'FT' && data.platform === 'android') {
            await ref.set({ ended: false, lastState: '' }, { merge: true });
            data.ended = false;
            data.lastState = '';
          } else {
            return;
          }
        }

        if (data.lastState === key) {
          // Sin cambios → sin push. Pero si el estado ya entregado es FT y el
          // flag `ended` no quedó estampado (crash entre el push y el write),
          // ciérralo ahora para que el catch-up no lo revisite cada minuto.
          if (state.phase === 'FT' && !data.ended) {
            await ref.set({ ended: true }, { merge: true }).catch(() => {});
          }
          return;
        }

        const isEnd = state.phase === 'FT';
        const delivered = data.platform === 'ios'
          ? await sendIos(data, state, isEnd, alertForTransition(data.lastState, state, match))
          : await sendAndroid(data, state, isEnd, match);
        // Sin token todavía → NO estampar lastState: el próximo poll reintenta
        // y entrega el estado vigente en cuanto el token llegue (catch-up).
        if (!delivered) return;
        sent++;

        await ref.set(
          { lastState: key, ...(isEnd ? { ended: true } : {}) },
          { merge: true },
        );
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code ?? '';
        const msg = (err as Error)?.message ?? String(err);
        if (code === 'messaging/registration-token-not-registered') {
          // Token FCM muerto → limpiar el registro para no reintentar.
          logger.info('liveActivities: token muerto, registro purgado', {
            matchId: data.matchId,
          });
          await ref.delete().catch(() => {});
        } else {
          // OJO: invalid-argument NO borra el registro — casi siempre señala
          // un payload malformado NUESTRO (borrarlo escondía el error y
          // dejaba al usuario sin updates, sin rastro en logs).
          logger.warn('liveActivities: send falló', {
            matchId: data.matchId, platform: data.platform, code, msg,
          });
        }
      }
    }));

    if (sent > 0) logger.info(`liveActivities: ${sent} push(es) enviados`);

    // Sweep global de TTL — SOLO en el paso profundo (1×/min) y SIN depender
    // de que haya registros en el ciclo actual (antes los early-returns lo
    // saltaban y los registros zombie sobrevivían días — visto el 10 jul con
    // un registro del día 8 aún vivo). Barrido barato (≤50, index automático).
    if (opts?.deepPass) {
      try {
        const cutoff = admin.firestore.Timestamp.fromMillis(now - REGISTRATION_TTL_MS);
        const stale = await db.collection(COLLECTION)
          .where('createdAt', '<', cutoff)
          .limit(50)
          .get();
        if (!stale.empty) {
          await Promise.all(stale.docs.map(d => d.ref.delete().catch(() => {})));
          logger.info(`liveActivities: sweep purgó ${stale.size} registro(s) viejos`);
        }
      } catch {
        // best-effort — el sweep jamás debe afectar el poll
      }
    }
  } catch (err) {
    // Blindaje total: esto corre dentro del poll de producción.
    logger.warn('liveActivities: sendLiveActivityUpdates falló', { err });
  }
}
