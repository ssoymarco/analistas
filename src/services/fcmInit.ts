/**
 * fcmInit.ts
 *
 * Firebase Cloud Messaging initialization for @react-native-firebase/messaging.
 *
 * ⚠️ WHY THIS MODULE EXISTS — this fixed a critical silent-failure bug.
 *
 * The first release of the notifications system (Build 13) wired up:
 *   - `expo-notifications` for local permission + Expo Push Token
 *   - `@react-native-firebase/messaging` for FCM topic subscriptions
 *
 * Those two SDKs don't share a permission state on iOS. expo-notifications
 * calls `UNUserNotificationCenter.requestAuthorization` directly, which IS
 * what unlocks the system permission. But until @react-native-firebase's
 * `messaging().requestPermission()` or `messaging().getToken()` is invoked
 * AT LEAST ONCE, the Firebase Messaging delegate never observes the APNs
 * token, so:
 *
 *   1. `messaging().getToken()` returns null / never resolves.
 *   2. `messaging().subscribeToTopic('team_X_goals')` resolves successfully
 *      (it's client-side caching) but FCM's server-side topic membership
 *      table NEVER LEARNS about this device — the FCM token doesn't exist
 *      yet, so there's no token to add to the topic.
 *   3. Every push the Cloud Function dispatches via `messaging().send({
 *      topic, … })` reaches no one.
 *   4. Sentry sees nothing because the failure mode is "I subscribed and
 *      got a resolved promise" — silent.
 *
 * The user reported: Cerro Porteño 1-0 Sporting Cristal at min 51, no
 * notification. Palmeiras 4-1 Junior with goals at 6/40/45/51, no
 * notification. Permissions were ON, app was active. The bug existed
 * because no code path ever bound the FCM token to APNs.
 *
 * Fix: call `messaging().requestPermission()` and `messaging().getToken()`
 * at app startup, after the expo-notifications permission grant. The
 * underlying iOS permission is already granted, so `requestPermission()`
 * is a no-op that just hooks the Firebase delegate in.
 */

import messaging, {
  FirebaseMessagingTypes,
} from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const FCM_TOKEN_KEY = 'analistas_fcm_token';
/** Bump this string whenever a release ships an FCM-init change that
 *  requires re-subscribing every device fresh. Build 13 had the bug where
 *  topic subs were silent no-ops; bumping to '1' on Build 15+ wipes the
 *  legacy "subscribed" record so the next reconcile re-subscribes the
 *  user's teams through the now-properly-bound FCM token. */
const FCM_INIT_VERSION_KEY = 'analistas_fcm_init_version';
const FCM_INIT_VERSION     = '1';
const SUBSCRIBED_TOPICS_KEY = 'analistas_fcm_subscribed_topics';

// Singleton promise so callers can `await fcmReady()` instead of racing
// the root App useEffect — see FavoritesContext.reconcileSubscriptions.
let fcmInitPromise: Promise<string | null> | null = null;

/**
 * Initialize Firebase Messaging — request permission via the Firebase SDK
 * path, wait for APNs binding, fetch the FCM token, and persist it.
 *
 * Safe to call multiple times; idempotent (returns the cached promise on
 * subsequent calls). Returns the FCM token on success, null when
 * permission is denied or the platform can't deliver push (simulator,
 * Expo Go, etc.).
 */
export function initializeFCM(): Promise<string | null> {
  if (!fcmInitPromise) fcmInitPromise = doInitializeFCM();
  return fcmInitPromise;
}

/**
 * Wait for the in-flight FCM initialization to settle (or fall back to
 * null after `timeoutMs`). Callers that depend on the FCM token being
 * bound — primarily `FavoritesContext.reconcileSubscriptions` — should
 * `await fcmReady()` before calling `messaging().subscribeToTopic()`,
 * otherwise the subscribe is a server-side no-op (it goes to a token
 * that doesn't yet exist).
 */
export function fcmReady(timeoutMs = 10_000): Promise<string | null> {
  const p = initializeFCM();
  return Promise.race([
    p,
    new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

async function doInitializeFCM(): Promise<string | null> {
  try {
    // Step 1 — Permission gate. On iOS this triggers UNUserNotificationCenter
    // *via* Firebase's delegate, which is what binds APNs → FCM. On Android
    // it's a no-op (notification permission is granted at install time on
    // < API 33, and we handle the API 33+ runtime permission elsewhere
    // via expo-notifications).
    const authStatus = await messaging().requestPermission({
      alert: true, sound: true, badge: false,
    });
    const granted =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;
    if (!granted) {
      // User declined. The expo-notifications local notifications still
      // work for foreground display, but no remote push can arrive.
      return null;
    }

    // Step 2 — APNs token (iOS only). FCM's getToken() will block-wait
    // for this, but on a TestFlight production build the APNs handshake
    // can take a beat after permission. Poll a few times so we don't
    // race the first launch.
    if (Platform.OS === 'ios') {
      let apnsToken = await messaging().getAPNSToken();
      let attempts = 0;
      while (!apnsToken && attempts < 10) {
        await new Promise(r => setTimeout(r, 500));
        apnsToken = await messaging().getAPNSToken();
        attempts++;
      }
      if (!apnsToken) {
        // 5 s elapsed with no APNs token — likely a sandbox/production
        // mismatch in Firebase Console (.p8 key needs to cover both
        // environments) or running in the simulator. Log and continue;
        // FCM topic subs will be no-ops but the app shouldn't crash.
        // eslint-disable-next-line no-console
        console.warn('[FCM] APNs token did not arrive within 5 s — push delivery may be broken.');
      }
    }

    // Step 3 — FCM token. This is the device address Firebase routes
    // pushes to. Topic subscriptions reference this token internally;
    // until getToken() returns a value, every subscribe call is a no-op
    // on the server side.
    const fcmToken = await messaging().getToken();
    if (fcmToken) {
      await AsyncStorage.setItem(FCM_TOKEN_KEY, fcmToken).catch(() => {});
    }

    // Step 4 — One-shot subscription reset for users upgrading from
    // Build 13 (where every topic sub was a silent no-op because FCM
    // was never initialised). If we've never recorded a successful
    // FCM init at this version, clear the stale "subscribed" set so
    // FavoritesContext's reconcileSubscriptions re-fires every
    // subscribe through the now-properly-bound FCM token.
    const storedVersion = await AsyncStorage.getItem(FCM_INIT_VERSION_KEY).catch(() => null);
    if (storedVersion !== FCM_INIT_VERSION) {
      await AsyncStorage.removeItem(SUBSCRIBED_TOPICS_KEY).catch(() => {});
      await AsyncStorage.setItem(FCM_INIT_VERSION_KEY, FCM_INIT_VERSION).catch(() => {});
    }

    return fcmToken ?? null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[FCM] initializeFCM failed:', err);
    return null;
  }
}

/**
 * Attach the foreground + token-refresh handlers. Call once at app startup,
 * after `initializeFCM` (or in parallel — it's safe).
 *
 * Foreground messages arrive via `messaging().onMessage`; FCM does NOT
 * auto-display them while the app is open. We forward them to
 * expo-notifications which DOES display them (using the foreground
 * handler configured in notifications.ts).
 *
 * Background / killed-state messages are delivered by APNs/FCM directly
 * to the OS — no JS handler needed for the notification banner to show.
 */
export function attachFCMHandlers(): () => void {
  // Foreground messages. The expo-notifications foreground handler
  // (notifications.ts → configureNotificationHandler) governs whether
  // they render as a banner.
  const unsubMessage = messaging().onMessage(async (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
    if (!remoteMessage.notification) return;
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: remoteMessage.notification.title ?? 'Analistas',
          body:  remoteMessage.notification.body  ?? '',
          data:  (remoteMessage.data ?? {}) as Record<string, unknown>,
          sound: 'default',
        },
        trigger: null,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[FCM] foreground display failed:', err);
    }
  });

  // Token refresh — FCM occasionally rotates the device token (e.g. after
  // a system reset or app reinstall). Persist the new token; topic subs
  // are preserved by FCM across the rotation, no re-subscribe needed.
  const unsubRefresh = messaging().onTokenRefresh(async token => {
    await AsyncStorage.setItem(FCM_TOKEN_KEY, token).catch(() => {});
  });

  return () => {
    unsubMessage();
    unsubRefresh();
  };
}

/** Read the cached FCM token (use for diagnostics / Sentry breadcrumbs). */
export async function getSavedFCMToken(): Promise<string | null> {
  return AsyncStorage.getItem(FCM_TOKEN_KEY).catch(() => null);
}
