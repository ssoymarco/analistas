"use strict";
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
exports.buildStateFromMatchDoc = buildStateFromMatchDoc;
exports.sendLiveActivityUpdates = sendLiveActivityUpdates;
const admin_init_1 = require("./admin-init");
const logger = __importStar(require("firebase-functions/logger"));
const COLLECTION = 'liveActivities';
/** Registros más viejos que esto se purgan (previa 4h + partido + linger). */
const REGISTRATION_TTL_MS = 12 * 60 * 60 * 1000;
/** El marcador final se queda visible este tiempo tras el `end` (FT natural).
 *  10 min — feedback del dueño: 30 min se sentía demasiado. */
const END_LINGER_SEC = 10 * 60;
// ── MatchDoc → ContentState (espejo de buildActivityState del cliente) ───────
const TICKING = new Set(['1H', '2H', 'ET']);
function phaseFromMatchDoc(m) {
    if (m.status === 'finished')
        return 'FT';
    if (m.status === 'scheduled')
        return 'pre';
    switch (m.stateLabel) {
        case '1T': return '1H';
        case 'HT': return 'HT';
        case '2T': return '2H';
        case 'ET': return 'ET';
        case 'PEN': return 'PEN';
        case 'SUSP':
        case 'INT': return 'SUSP';
        default: return '1H';
    }
}
function kickoffUnixSeconds(m) {
    if (!m.startingAtUtc)
        return undefined;
    const ms = new Date(m.startingAtUtc.replace(' ', 'T') + 'Z').getTime();
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}
function buildStateFromMatchDoc(m) {
    const phase = phaseFromMatchDoc(m);
    const anchor = m.liveClock;
    const ticks = TICKING.has(phase) && !!anchor && anchor.periodStartedAt > 0;
    return {
        homeScore: m.homeScore ?? 0,
        awayScore: m.awayScore ?? 0,
        phase,
        periodStartedAt: ticks ? anchor.periodStartedAt : undefined,
        periodMinuteOffset: ticks ? anchor.periodMinuteOffset : undefined,
        kickoffAt: phase === 'pre' ? kickoffUnixSeconds(m) : undefined,
        penHome: typeof m.homePenScore === 'number' ? m.homePenScore : undefined,
        penAway: typeof m.awayPenScore === 'number' ? m.awayPenScore : undefined,
    };
}
/** Clave de deduplicación: si no cambió, no se envía nada. */
function stateKey(s) {
    return JSON.stringify([
        s.homeScore, s.awayScore, s.phase, s.periodStartedAt ?? 0,
        s.periodMinuteOffset ?? 0, s.kickoffAt ?? 0, s.penHome ?? -1, s.penAway ?? -1,
    ]);
}
// ── Alert (vibración/pantalla) por transición ─────────────────────────────────
// Cada push ES un cambio real (dedup) → todos llevan alert para que el iPhone
// vibre/encienda pantalla en gol, MT, 2T, penales y final (petición del dueño).
// El estado previo viene del lastState guardado (mismo formato de stateKey).
function alertForTransition(prevKey, s, m) {
    const score = `${m.homeTeam?.shortName ?? ''} ${s.homeScore} - ${s.awayScore} ${m.awayTeam?.shortName ?? ''}`;
    let prev = null;
    try {
        const arr = prevKey ? JSON.parse(prevKey) : null;
        if (Array.isArray(arr))
            prev = [Number(arr[0]), Number(arr[1]), String(arr[2])];
    }
    catch { /* primer push del registro */ }
    if (prev && (s.homeScore > prev[0] || s.awayScore > prev[1])) {
        return { title: '⚽ ¡GOOOL!', body: score };
    }
    if (prev && (s.homeScore < prev[0] || s.awayScore < prev[1])) {
        return { title: 'Gol anulado', body: score }; // VAR / corrección de SM
    }
    switch (s.phase) {
        case 'HT': return { title: 'Medio tiempo', body: score };
        case '2H': return { title: '¡Arranca el 2do tiempo!', body: score };
        case 'ET': return { title: 'Tiempo extra', body: score };
        case 'PEN': return { title: '¡Tanda de penales!', body: score };
        case 'SUSP': return { title: 'Partido suspendido', body: score };
        case 'FT': {
            const pens = typeof s.penHome === 'number' && typeof s.penAway === 'number'
                ? ` (${s.penHome}-${s.penAway} pen)` : '';
            return { title: 'Final del partido', body: score + pens };
        }
        default: return { title: 'Partido en vivo', body: score };
    }
}
async function sendIos(reg, state, isEnd, alert) {
    if (!reg.fcmToken || !reg.activityPushToken)
        return; // token de Activity aún no llega
    const nowSec = Math.floor(Date.now() / 1000);
    const aps = {
        timestamp: nowSec,
        event: isEnd ? 'end' : 'update',
        'content-state': state,
        // Alert = la Activity "avisa": vibración + pantalla encendida en el
        // evento (gol/MT/2T/PEN/final). Cada push es un cambio real (dedup).
        alert: { title: alert.title, body: alert.body, sound: 'default' },
    };
    if (isEnd)
        aps['dismissal-date'] = nowSec + END_LINGER_SEC;
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
    await admin_init_1.admin.messaging().send(message);
}
async function sendAndroid(reg, state, isEnd, match) {
    if (!reg.fcmToken)
        return;
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
        leagueName: match.league ?? '',
    };
    await admin_init_1.admin.messaging().send({
        token: reg.fcmToken,
        data: {
            type: isEnd ? 'live_activity_end' : 'live_activity_update',
            matchId: reg.matchId,
            state: JSON.stringify(state),
            attributes: JSON.stringify(attributes),
        },
        android: { priority: 'high' },
    });
}
/**
 * Punto de entrada — llamado desde executeSinglePoll tras el batch write.
 * `matchDocs` = partidos del ciclo (live + próximos a empezar). NUNCA lanza.
 */
async function sendLiveActivityUpdates(matchDocs) {
    try {
        if (matchDocs.length === 0)
            return;
        // Firestore 'in' admite máx 30 valores — chunk defensivo.
        const byId = new Map(matchDocs.map(m => [m.id, m]));
        const ids = [...byId.keys()];
        const regs = [];
        for (let i = 0; i < ids.length; i += 30) {
            const snap = await admin_init_1.db.collection(COLLECTION)
                .where('matchId', 'in', ids.slice(i, i + 30))
                .get();
            snap.forEach(d => regs.push({ ref: d.ref, data: d.data() }));
        }
        if (regs.length === 0)
            return;
        const now = Date.now();
        let sent = 0;
        await Promise.all(regs.map(async ({ ref, data }) => {
            try {
                // TTL: registros viejos se borran y ya.
                const createdMs = data.createdAt
                    ?.toMillis?.() ?? 0;
                if (createdMs > 0 && now - createdMs > REGISTRATION_TTL_MS) {
                    await ref.delete();
                    return;
                }
                if (data.ended)
                    return;
                const match = byId.get(data.matchId);
                if (!match)
                    return;
                const state = buildStateFromMatchDoc(match);
                const key = stateKey(state);
                if (data.lastState === key)
                    return; // sin cambios → sin push
                const isEnd = state.phase === 'FT';
                if (data.platform === 'ios') {
                    await sendIos(data, state, isEnd, alertForTransition(data.lastState, state, match));
                }
                else {
                    await sendAndroid(data, state, isEnd, match);
                }
                sent++;
                await ref.set({ lastState: key, ...(isEnd ? { ended: true } : {}) }, { merge: true });
            }
            catch (err) {
                const code = err?.code ?? '';
                const msg = err?.message ?? String(err);
                if (code === 'messaging/registration-token-not-registered') {
                    // Token FCM muerto → limpiar el registro para no reintentar.
                    logger.info('liveActivities: token muerto, registro purgado', {
                        matchId: data.matchId,
                    });
                    await ref.delete().catch(() => { });
                }
                else {
                    // OJO: invalid-argument NO borra el registro — casi siempre señala
                    // un payload malformado NUESTRO (borrarlo escondía el error y
                    // dejaba al usuario sin updates, sin rastro en logs).
                    logger.warn('liveActivities: send falló', {
                        matchId: data.matchId, platform: data.platform, code, msg,
                    });
                }
            }
        }));
        if (sent > 0)
            logger.info(`liveActivities: ${sent} push(es) enviados`);
    }
    catch (err) {
        // Blindaje total: esto corre dentro del poll de producción.
        logger.warn('liveActivities: sendLiveActivityUpdates falló', { err });
    }
}
//# sourceMappingURL=live-activities.js.map