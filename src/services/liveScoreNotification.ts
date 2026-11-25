// ── liveScoreNotification — "Marcador en tu pantalla de bloqueo" (ANDROID) ───
//
// Equivalente Android de la Live Activity de iOS: una notificación ONGOING
// (persistente, visible en lock screen) que se actualiza con el estado del
// partido. El minuto corre con el CRONÓMETRO nativo de la notificación
// (notifee showChronometer) anclado igual que iOS: periodStartedAt − offset·60
// → formato acumulado 90'/120'. La previa usa cronómetro descendente al kickoff.
//
// Fuentes de actualización (espejo del diseño iOS):
//   • Foreground: useLiveActivity replica cada cambio del Match (Firestore).
//   • Background/app muerta: el data message de FCM (functions/src/
//     live-activities.ts → sendAndroid) llega al background handler de
//     index.ts, que llama aquí. Los `attributes` viajan EN el mensaje para no
//     depender de estado local.
//
// ⚠️ GUARD OTA CROSS-RUNTIME: @notifee/react-native es módulo NATIVO — solo
// existe en binarios 1.4.0+. Este JS se publica por OTA a runtimes viejos
// (1.2.2 Android público) → lazy require + try/catch; todo degrada a no-op.
//
// Vibración: el canal es SILENCIOSO a propósito — los goles ya vibran por la
// notificación FCM normal existente; doble buzz sería molesto.

import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../i18n';
import { translateTeamName } from '../utils/nationalTeams';
import type {
  LiveActivityPhase,
  MatchActivityState,
} from '../data/liveActivityContract';

// Attributes mínimos que necesita la notificación (subset del contrato — el
// backend manda exactamente esta forma en el data message).
export interface LiveScoreAttributes {
  matchId: string;
  home: { name: string; shortName: string; logo?: string };
  away: { name: string; shortName: string; logo?: string };
  leagueName: string;
}

type Notifee = typeof import('@notifee/react-native').default;

// Presencia NATIVA primero (mismo patrón que RNPurchases en
// SubscriptionContext): el JS de notifee puede importar sin lanzar aunque el
// módulo nativo no exista en el binario — sin este check, `supported` daría
// true en los Android viejos (1.2.2/1.3.0 públicos) y el botón aparecería
// muerto. Solo el require exitoso NO basta.
const NOTIFEE_NATIVE_PRESENT =
  Platform.OS === 'android' &&
  !!(NativeModules as { NotifeeApiModule?: unknown }).NotifeeApiModule;

let notifee: Notifee | null = null;
let AndroidImportance: typeof import('@notifee/react-native').AndroidImportance | null = null;
if (NOTIFEE_NATIVE_PRESENT) {
  try {
    const mod = require('@notifee/react-native');
    notifee = mod.default ?? mod;
    AndroidImportance = mod.AndroidImportance;
  } catch {
    notifee = null;
  }
}

/** true solo en Android con el módulo nativo presente (binarios 1.4.0+). */
export function isAndroidLiveScoreSupported(): boolean {
  return Platform.OS === 'android' && !!notifee;
}

const CHANNEL_ID = 'marcador_en_vivo';
const notificationId = (matchId: string) => `live_${matchId}`;

// Marcador de "cancelado por el usuario": un push EN VUELO al momento del
// toggle-off resucitaría la notificación recién cancelada (y quedaría
// congelada). El marcador persiste en AsyncStorage porque el handler headless
// corre en un contexto JS fresco (una memoria in-process no sobrevive).
const canceledKey = (matchId: string) => `liveScore.canceled.${matchId}`;
const CANCELED_MARKER_TTL_MS = 6 * 60 * 60 * 1000;

async function isRecentlyCanceled(matchId: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(canceledKey(matchId));
    if (!raw) return false;
    return Date.now() - Number(raw) < CANCELED_MARKER_TTL_MS;
  } catch {
    return false;
  }
}

/** Canal silencioso (importance LOW: sin sonido/vibración, sí en lock screen).
 *  Idempotente — notifee ignora recreaciones con la misma config. */
async function ensureChannel(): Promise<void> {
  if (!notifee || !AndroidImportance) return;
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: i18n.t('liveActivity.channelName', { defaultValue: 'Marcador en vivo' }),
    importance: AndroidImportance.LOW,
    vibration: false,
  });
}

// Etiquetas de fase — MISMO copy hardcodeado es que el widget iOS
// (targets/live-activity/index.swift · phaseLabel), por paridad visual.
function phaseLabel(phase: LiveActivityPhase): string {
  switch (phase) {
    case 'pre':  return 'EMPIEZA EN';
    case '1H':   return '1T';
    case 'HT':   return 'MT';
    case '2H':   return '2T';
    case 'ET':   return 'TE';
    case 'PEN':  return 'PENALES';
    case 'SUSP': return 'SUSPENDIDO';
    case 'FT':   return 'FINAL';
    default:     return phase;
  }
}

const TICKING: ReadonlySet<LiveActivityPhase> = new Set(['1H', '2H', 'ET']);

function safeTranslate(name: string): string {
  try {
    return translateTeamName(name);
  } catch {
    return name; // contexto headless sin i18n listo → nombre SM tal cual
  }
}

/**
 * Publica o actualiza (mismo id ⇒ reemplaza, no apila) la notificación de
 * marcador. En FT deja de ser ongoing para que el usuario pueda descartarla
 * (equivalente Android del linger de iOS).
 */
export async function showOrUpdateLiveScore(
  attrs: LiveScoreAttributes,
  state: MatchActivityState,
): Promise<void> {
  if (!notifee) return;
  try {
    await ensureChannel();

    const home = safeTranslate(attrs.home.name) || attrs.home.shortName;
    const away = safeTranslate(attrs.away.name) || attrs.away.shortName;
    const isPre = state.phase === 'pre';
    const isEnd = state.phase === 'FT';

    const title = isPre
      ? `${home} vs ${away}`
      : `${home} ${state.homeScore} - ${state.awayScore} ${away}`;

    const pens =
      typeof state.penHome === 'number' && typeof state.penAway === 'number'
        ? state.phase === 'FT'
          ? ` · ${state.penHome}-${state.penAway} pen`
          : ` · ${state.penHome}-${state.penAway}`
        : '';
    const body = `${phaseLabel(state.phase)}${pens}`;

    // Cronómetro nativo: acumulado 90'/120' en juego; countdown en la previa.
    // ⚠️ Limitación de plataforma (verificada contra el AAR de notifee): el
    // Chronometer de Android renderiza H:MM:SS pasada la hora ("1:30:00" en
    // el minuto 90), no "90:00" como el widget iOS. Sin alternativa nativa
    // sin pushes por minuto — se acepta la divergencia.
    const ticks = TICKING.has(state.phase) && !!state.periodStartedAt;
    const preCountdown = isPre && !!state.kickoffAt;
    const timestamp = ticks
      ? (state.periodStartedAt! - (state.periodMinuteOffset ?? 0) * 60) * 1000
      : preCountdown
        ? state.kickoffAt! * 1000
        : undefined;

    // Timeout DEFENSIVO en todos los estados: si el flujo de pushes muere
    // (token FCM rotado, partido abandonado que sale del poll, backend caído
    // — precedente real: el apagón de billing), una notificación ongoing NO
    // puede quedar clavada para siempre. Cada update legítimo la re-publica y
    // resetea el timeout, así que un partido sano nunca lo alcanza. La previa
    // es kickoff-aware (puede pasar horas sin push antes del arranque).
    const STALE_TIMEOUT_MS = 4 * 60 * 60 * 1000;
    const timeoutAfter = isEnd
      ? 10 * 60 * 1000 // FINAL: paridad con el linger de iOS
      : preCountdown
        ? Math.max(state.kickoffAt! * 1000 - Date.now(), 0) + STALE_TIMEOUT_MS
        : STALE_TIMEOUT_MS;

    await notifee.displayNotification({
      id: notificationId(attrs.matchId),
      title,
      body,
      subtitle: attrs.leagueName || undefined,
      android: {
        channelId: CHANNEL_ID,
        ongoing: !isEnd,          // FINAL → descartable (el "linger" Android)
        autoCancel: false,
        onlyAlertOnce: true,      // updates silenciosos, sin re-alertar
        showTimestamp: !!timestamp,
        timestamp,
        showChronometer: !!timestamp,
        chronometerDirection: preCountdown ? 'down' : 'up',
        timeoutAfter,
        largeIcon: attrs.home.logo && attrs.home.logo.startsWith('http')
          ? attrs.home.logo
          : undefined,
        smallIcon: 'ic_launcher',
        pressAction: { id: 'default', launchActivity: 'default' },
      },
    });
  } catch {
    // Best-effort: jamás romper al caller (foreground hook o headless handler).
  }
}

/** Android 13+: el permiso de notificaciones puede estar negado — pedirlo
 *  antes de mostrar (si ya está concedido es no-op). false = negado. */
export async function requestLiveScorePermission(): Promise<boolean> {
  if (!notifee) return false;
  try {
    const settings = await notifee.requestPermission();
    // authorizationStatus: 1 = AUTHORIZED, 2 = PROVISIONAL (ambos sirven).
    return settings.authorizationStatus >= 1;
  } catch {
    return false;
  }
}

/**
 * Dispatcher compartido de los data messages FCM (`live_activity_update|end`).
 * Lo usan el background handler Y el onMessage de foreground (index.ts) — sin
 * el de foreground, la notificación se congelaba cuando el usuario navegaba en
 * OTRA pantalla del app con el partido seguido (el hook solo vive en la
 * pantalla del partido y el background handler no corre en foreground).
 */
export async function handleLiveScoreDataMessage(
  data: Record<string, string> | undefined,
): Promise<void> {
  try {
    if (!data?.type?.startsWith('live_activity_')) return;
    // Carrera toggle-off vs push en vuelo: si el usuario canceló hace poco,
    // un update remoto rezagado NO debe resucitar la notificación. (El
    // marcador se limpia solo cuando el usuario re-sigue: clearCanceledMarker
    // desde el start() del hook.)
    if (data.matchId && (await isRecentlyCanceled(data.matchId))) return;
    if (data.type === 'live_activity_update' && data.attributes && data.state) {
      await showOrUpdateLiveScore(JSON.parse(data.attributes), JSON.parse(data.state));
    } else if (data.type === 'live_activity_end') {
      // El 'end' llega CON estado final → mostrar FINAL descartable; sin
      // estado → retirar sin más.
      if (data.attributes && data.state) {
        await showOrUpdateLiveScore(JSON.parse(data.attributes), JSON.parse(data.state));
      } else if (data.matchId) {
        await cancelLiveScore(data.matchId);
      }
    }
  } catch {
    // payload inesperado — jamás romper al caller (headless/foreground)
  }
}

/** Retira la notificación del partido (toggle manual del usuario) y deja el
 *  marcador anti-resurrección para pushes en vuelo. */
export async function cancelLiveScore(matchId: string): Promise<void> {
  if (!notifee) return;
  try {
    await AsyncStorage.setItem(canceledKey(matchId), String(Date.now()));
    await notifee.cancelNotification(notificationId(matchId));
  } catch {}
}

/** Re-follow del usuario → volver a aceptar updates remotos del partido. */
export async function clearCanceledMarker(matchId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(canceledKey(matchId));
  } catch {}
}

/** ¿Hay notificación viva para este partido? (estado del botón tras reinicios). */
export async function isLiveScoreDisplayed(matchId: string): Promise<boolean> {
  if (!notifee) return false;
  try {
    const displayed = await notifee.getDisplayedNotifications();
    const id = notificationId(matchId);
    return displayed.some(n => n.id === id);
  } catch {
    return false;
  }
}
