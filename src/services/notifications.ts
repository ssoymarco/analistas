/**
 * notifications.ts
 *
 * Centralized push notification service for Analistas.
 * Pure singleton module — no React, no hooks — safe to call from anywhere.
 *
 * Architecture:
 *  - Client-side only (v1). No backend required for local notifications.
 *  - Remote push tokens stored in AsyncStorage until Firebase is wired up.
 *  - Firebase Functions will use the stored Expo Push Token to send remote
 *    notifications via the Expo Push API or FCM directly.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../i18n';
import {
  ESTADIO_ACTION_OFF, ESTADIO_ACTION_ON, ESTADIO_ACTION_SPOILED, ESTADIO_PUSH_CATEGORY,
} from '../../functions/src/shared/football/estadio';

// ── Constants ─────────────────────────────────────────────────────────────────

export const PUSH_TOKEN_KEY = 'analistas_push_token';
const CHANNEL_ID = 'analistas-live';

// ── Payload types (discriminated union) ───────────────────────────────────────

export interface GoalPayload {
  type: 'goal';
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  scorerName: string;
  minute: number;
  teamSide: 'home' | 'away';
}

export interface MatchStartPayload {
  type: 'matchStart';
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoffUtc: string;
}

export interface LineupsPayload {
  type: 'lineups';
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  homeFormation: string;
  awayFormation: string;
}

export interface FinalResultPayload {
  type: 'finalResult';
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  league: string;
}

export type NotificationPayload =
  | GoalPayload
  | MatchStartPayload
  | LineupsPayload
  | FinalResultPayload;

// ── Android channel setup ─────────────────────────────────────────────────────

async function setupAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Alertas de partido',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#00E096',
    sound: 'default',
    enableLights: true,
    enableVibrate: true,
    showBadge: true,
  });
}

// ── Foreground handler ────────────────────────────────────────────────────────

function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// ── Acciones de notificación (iOS) ───────────────────────────────────────────
// Long-press sobre una notificación de partido → botón "🔕 Silenciar este
// partido". El servidor etiqueta cada push con category MATCH_EVENT
// (aps.category); iOS muestra las acciones registradas aquí. La acción se
// maneja en el response listener de App.tsx (actionIdentifier MUTE_MATCH) y
// aplica el mute REAL de la Fase 2 (topic mute_{matchId}) SIN abrir la app.
// Android ignora las categorías (los banners del OS no aceptan botones) —
// llegará con el binario 1.4.0 vía notifee si se decide.
//
// 🏟️ Modo Estadio por partido (services/estadio.ts) añade botones:
//   • MATCH_EVENT (los avisos normales de un partido, el de inicio incluido):
//     "Activar Modo Estadio" → los avisos de ese partido pasan a llegar tarde.
//   • MATCH_ESTADIO (los avisos que ya llegan con retraso): "Me spoileó"
//     (más retraso) y "Apagar Modo Estadio".
// Ninguno abre la app; el servidor confirma con otra notificación.
async function registerNotificationCategories(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  const quiet = { opensAppToForeground: false };
  const mute = {
    identifier: 'MUTE_MATCH',
    buttonTitle: `🔕 ${i18n.t('notifications.matchSheet.muteTitle')}`,
    options: quiet,
  };
  try {
    await Notifications.setNotificationCategoryAsync('MATCH_EVENT', [
      { identifier: ESTADIO_ACTION_ON, buttonTitle: i18n.t('estadioMode.actionOn'), options: quiet },
      mute,
    ]);
    await Notifications.setNotificationCategoryAsync(ESTADIO_PUSH_CATEGORY, [
      { identifier: ESTADIO_ACTION_SPOILED, buttonTitle: i18n.t('estadioMode.actionSpoiled'), options: quiet },
      { identifier: ESTADIO_ACTION_OFF, buttonTitle: i18n.t('estadioMode.actionOff'), options: quiet },
      mute,
    ]);
  } catch {
    // Best-effort: sin categoría, la notificación se comporta como siempre.
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Bootstrap: set foreground handler + Android channel + iOS action categories.
 * Call once at app startup, BEFORE requesting permissions.
 */
export async function initialize(): Promise<void> {
  configureNotificationHandler();
  await setupAndroidChannel();
  await registerNotificationCategories();
}

/**
 * Request OS permission to show notifications, then obtain the Expo Push Token.
 * Persists the token to AsyncStorage.
 * Returns the token string, or null if the user denied permission.
 */
export async function requestPermissionsAndGetToken(): Promise<string | null> {
  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowSound: true,
      allowBadge: false,
    },
  });

  if (status !== 'granted') return null;

  try {
    // In managed Expo Go without a projectId the token is temporary but functional.
    // For EAS production builds, add projectId from app.json.extra.eas.projectId.
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    return token;
  } catch {
    // Expo Go without projectId can throw — silently continue.
    return null;
  }
}

/**
 * Read the previously obtained push token from AsyncStorage.
 * Returns null if permissions were never granted or token was never stored.
 */
export async function getSavedToken(): Promise<string | null> {
  return AsyncStorage.getItem(PUSH_TOKEN_KEY);
}

// ── Notification content builder ──────────────────────────────────────────────

function buildNotificationContent(
  payload: NotificationPayload,
): Pick<Notifications.NotificationContentInput, 'title' | 'body'> {
  switch (payload.type) {
    case 'goal':
      return {
        title: `Gol ⚽ — ${payload.scorerName} ${payload.minute}'`,
        body: `${payload.homeTeam} ${payload.homeScore} – ${payload.awayScore} ${payload.awayTeam}`,
      };
    case 'matchStart':
      return {
        title: 'Partido en 5 minutos 📣',
        body: `${payload.homeTeam} vs ${payload.awayTeam} · ${payload.league}`,
      };
    case 'lineups':
      return {
        title: 'Alineaciones confirmadas 📋',
        body: `${payload.homeTeam} (${payload.homeFormation}) vs ${payload.awayTeam} (${payload.awayFormation})`,
      };
    case 'finalResult':
      return {
        title: 'Resultado final 🏆',
        body: `${payload.homeTeam} ${payload.homeScore} – ${payload.awayScore} ${payload.awayTeam}`,
      };
  }
}

// ── Local notifications (for dev testing without a backend) ───────────────────

/**
 * Schedule a local notification that mimics a remote push.
 * The payload is embedded in `data` — the tap handler reads it from there.
 *
 * @param payload  Typed notification payload (goal, matchStart, lineups, finalResult)
 * @param delaySeconds  Seconds before the notification fires. 0 = immediate.
 * @returns The notification identifier (use to cancel it later).
 */
export async function scheduleLocalNotification(
  payload: NotificationPayload,
  delaySeconds = 5,
): Promise<string> {
  const content = buildNotificationContent(payload);
  return Notifications.scheduleNotificationAsync({
    content: {
      ...content,
      data: payload as unknown as Record<string, unknown>,
      sound: 'default',
    },
    trigger:
      delaySeconds === 0
        ? null
        : {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: delaySeconds,
          },
  });
}

/**
 * Returns the delay in seconds to use when scheduling a notification.
 *
 * 🏟️ Modo Estadio: delays live-event notifications so they don't spoil
 * goals for users watching on TV.
 *
 * Pre-match notifications (matchStart, lineups) are NEVER delayed —
 * they're informational and arrive before the action starts.
 *
 * @param estadioMode   Whether Modo Estadio is enabled
 * @param estadioDelay  Configured delay in minutes
 * @param type          Notification type
 */
export function getNotificationDelay(
  estadioMode: boolean,
  estadioDelayMinutes: number,
  type: NotificationPayload['type'],
): number {
  // Pre-match info → always immediate (5 s default for local notification)
  if (type === 'matchStart' || type === 'lineups') return 5;
  // Live events (goals, red cards, final result) → apply Modo Estadio delay
  if (estadioMode) return estadioDelayMinutes * 60;
  return 5;
}

/**
 * Cancel all scheduled local notifications for a given matchId.
 * Called when the user mutes a match.
 */
export async function cancelAllNotificationsForMatch(matchId: string): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter(n => {
          const data = n.content.data as Record<string, unknown> | null;
          return data?.matchId === matchId;
        })
        .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    // Silent failure — notification cancellation is best-effort.
  }
}

// ── Botones de Modo Estadio en las notificaciones ────────────────────────────

const ESTADIO_ACTIONS: Record<string, 'on' | 'spoiled' | 'off'> = {
  [ESTADIO_ACTION_ON]: 'on',
  [ESTADIO_ACTION_SPOILED]: 'spoiled',
  [ESTADIO_ACTION_OFF]: 'off',
};

/**
 * Atiende un botón de Modo Estadio de una notificación. Devuelve true si la
 * respuesta era uno de esos botones (quien llama no debe abrir el partido).
 *
 * El éxito lo confirma el servidor con otra notificación; si la petición
 * falla no hay pantalla donde decirlo, así que se avisa con una local.
 */
export function handleEstadioNotificationResponse(response: Notifications.NotificationResponse): boolean {
  const action = ESTADIO_ACTIONS[response.actionIdentifier];
  if (!action) return false;
  const request = response.notification.request;
  const data = request.content.data as Record<string, unknown> | null;
  // Imported here: this module is loaded before the rest of the app boots.
  import('./estadio')
    .then(m => m.handleEstadioAction(action, data, request.identifier))
    .then(ok => {
      if (ok !== false) return undefined;
      return Notifications.scheduleNotificationAsync({
        content: {
          title: i18n.t('estadioMode.actionFailedTitle'),
          body: i18n.t('estadioMode.actionFailedBody'),
          data: (data ?? {}) as Record<string, unknown>,
        },
        trigger: null,
      });
    })
    .catch(() => {});
  return true;
}
