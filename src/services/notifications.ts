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

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Bootstrap: set foreground handler + Android channel.
 * Call once at app startup, BEFORE requesting permissions.
 */
export async function initialize(): Promise<void> {
  configureNotificationHandler();
  await setupAndroidChannel();
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
