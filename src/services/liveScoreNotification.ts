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

import { Platform } from 'react-native';
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

let notifee: Notifee | null = null;
let AndroidImportance: typeof import('@notifee/react-native').AndroidImportance | null = null;
if (Platform.OS === 'android') {
  try {
    // Lazy require: binarios sin el módulo (runtimes OTA viejos) caen al catch.
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
    const ticks = TICKING.has(state.phase) && !!state.periodStartedAt;
    const preCountdown = isPre && !!state.kickoffAt;
    const timestamp = ticks
      ? (state.periodStartedAt! - (state.periodMinuteOffset ?? 0) * 60) * 1000
      : preCountdown
        ? state.kickoffAt! * 1000
        : undefined;

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

/** Retira la notificación del partido (toggle manual del usuario). */
export async function cancelLiveScore(matchId: string): Promise<void> {
  if (!notifee) return;
  try {
    await notifee.cancelNotification(notificationId(matchId));
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
