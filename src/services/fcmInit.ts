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
import { Sentry, addBreadcrumb, captureError } from './sentry';

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
 * ⚠️  WHEN TO CALL THIS:
 *   - On Android: call from App.tsx startup (the permission dialog was shown
 *     at install time, so requestPermission() is a silent no-op here).
 *   - On iOS: ONLY call AFTER the user has explicitly chosen their notification
 *     preferences in the onboarding (Screen 7). Calling it at app startup
 *     triggers the iOS system permission dialog ("Analistas quiere enviarte
 *     notificaciones") on the very first screen the user sees, with zero
 *     context about why they're being asked. The correct call site on iOS
 *     is `goNextFromNotifs` in OnboardingScreen.tsx (for first-time users) or
 *     at auth-restore time when permission was already granted in a prior session.
 *
 * Safe to call multiple times; idempotent (returns the cached promise on
 * subsequent calls). Returns the FCM token on success, null when
 * permission is denied or the platform can't deliver push.
 */
export function initializeFCM(): Promise<string | null> {
  if (!fcmInitPromise) fcmInitPromise = doInitializeFCM();
  return fcmInitPromise;
}

/**
 * Lightweight startup hook for App.tsx that:
 *   1. Registers the Firebase Messaging delegate (Android + iOS) so it owns
 *      the UNUserNotificationCenter slot BEFORE expo-notifications.
 *   2. On Android, immediately proceeds with full FCM init (permission is
 *      granted at install, no dialog shown).
 *   3. On iOS, SKIPS the permission request — deferred to after the
 *      onboarding notification-preferences screen. If permission was already
 *      granted in a prior session (returning user), full init runs immediately.
 *
 * Never shows the iOS permission dialog at startup.
 */
export async function initializeFCMAtStartup(): Promise<void> {
  if (Platform.OS === 'android') {
    // Android: full init at startup, no dialog involved.
    initializeFCM().catch(() => {});
    return;
  }

  // iOS — check existing permission first.
  try {
    const status = await messaging().hasPermission();
    const alreadyGranted =
      status === messaging.AuthorizationStatus.AUTHORIZED ||
      status === messaging.AuthorizationStatus.PROVISIONAL;

    if (alreadyGranted) {
      // Returning user who already said "Permitir" — full init is safe.
      initializeFCM().catch(() => {});
    }
    // First-time user: do NOT call initializeFCM() here. The onboarding's
    // goNextFromNotifs (Screen 7 → 8) will call it after the user has
    // seen and configured their notification preferences.
  } catch {
    // If hasPermission() fails (e.g. fresh install cold crash), stay silent —
    // the onboarding will trigger the permission flow.
  }
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
  addBreadcrumb('fcm', 'initializeFCM started', { platform: Platform.OS });
  try {
    // ── Step 0 (NEW): wipe the legacy subscription record FIRST. ──────────
    // This used to live at the END of init (after the slow APNs/FCM token
    // wait), which produced a race condition: FavoritesContext's
    // reconcileSubscriptions runs as soon as AsyncStorage loads the
    // follow-list (~10 ms after mount), well before the FCM token wait
    // completed (~3-5 s). reconcile saw the stale "subscribed" set from
    // Build 13/14 (every entry phantom because FCM was never bound),
    // computed wanted === current, and exited without re-subscribing.
    // Doing the wipe FIRST means even if reconcile runs early it sees an
    // empty list and triggers fresh safeSubscribe calls — which then
    // await fcmReady() and dispatch through the freshly-bound FCM token.
    const storedVersion = await AsyncStorage.getItem(FCM_INIT_VERSION_KEY).catch(() => null);
    if (storedVersion !== FCM_INIT_VERSION) {
      await AsyncStorage.removeItem(SUBSCRIBED_TOPICS_KEY).catch(() => {});
      await AsyncStorage.setItem(FCM_INIT_VERSION_KEY, FCM_INIT_VERSION).catch(() => {});
      addBreadcrumb('fcm', 'legacy subscribed-topics wiped');
    }

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
    addBreadcrumb('fcm', 'permission resolved', { authStatus, granted });
    if (!granted) {
      Sentry.setContext('fcm', { granted: false, authStatus });
      return null;
    }

    // Step 2 — APNs token (iOS only). FCM's getToken() will block-wait
    // for this, but on a TestFlight production build the APNs handshake
    // can take a beat after permission. Poll a few times so we don't
    // race the first launch.
    let apnsHadToken = false;
    if (Platform.OS === 'ios') {
      let apnsToken = await messaging().getAPNSToken();
      let attempts = 0;
      while (!apnsToken && attempts < 10) {
        await new Promise(r => setTimeout(r, 500));
        apnsToken = await messaging().getAPNSToken();
        attempts++;
      }
      apnsHadToken = !!apnsToken;
      addBreadcrumb('fcm', 'APNs token result', { hasToken: apnsHadToken, attempts });
      if (!apnsToken) {
        // 5 s elapsed with no APNs token — historically this meant the
        // IPA was missing the `aps-environment` entitlement (Build 15
        // bug, fixed in app.json for Build 16). On any future occurrence,
        // it's still useful as a diagnostic flag.
        Sentry.setContext('fcm', { apns_token_missing: true });
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
    addBreadcrumb('fcm', 'FCM token result', { hasToken: !!fcmToken });
    Sentry.setContext('fcm', {
      apns_token_obtained: apnsHadToken,
      fcm_token_obtained:  !!fcmToken,
      fcm_token_first12:   fcmToken?.substring(0, 12) ?? null,
    });

    // Final guaranteed Sentry event — captureMessage always sends a payload
    // (unlike setContext which only attaches to other events). Tags carry
    // the booleans so dashboard filters can find broken devices instantly.
    Sentry.captureMessage('fcm-init result', {
      level: !!fcmToken ? 'info' : 'warning',
      tags: {
        fcm_apns_obtained: String(apnsHadToken),
        fcm_token_obtained: String(!!fcmToken),
      },
      extra: {
        fcm_token_first12: fcmToken?.substring(0, 12) ?? null,
        platform: Platform.OS,
      },
    });

    return fcmToken ?? null;
  } catch (err) {
    captureError(err, { component: 'fcm-init' });
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
  // Foreground dedup cache. The server already dedups background pushes via
  // apns-collapse-id / android tag (see functions/src/detect-changes.ts), but
  // those OS-level mechanisms only apply to notifications the OS displays —
  // i.e. when the app is backgrounded/killed. When the app is in the
  // FOREGROUND, FCM hands the message to our onMessage handler instead and we
  // schedule a local notification ourselves, bypassing the collapse logic.
  // So a user subscribed to both a team and its league would see the same
  // goal twice while the app is open. We replicate the dedup here with an
  // in-memory "recently shown" map keyed by the same id the server uses.
  const recentlyShown = new Map<string, number>();
  const DEDUP_WINDOW_MS = 30_000;

  const buildDedupId = (data: Record<string, unknown> | undefined): string | null => {
    if (!data) return null;
    const matchId   = data.matchId;
    const type      = data.type;
    const homeScore = data.homeScore;
    const awayScore = data.awayScore;
    if (matchId == null || type == null) return null;
    return `${matchId}_${type}_${homeScore ?? ''}-${awayScore ?? ''}`;
  };

  // Foreground messages. The expo-notifications foreground handler
  // (notifications.ts → configureNotificationHandler) governs whether
  // they render as a banner.
  const unsubMessage = messaging().onMessage(async (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
    if (!remoteMessage.notification) return;

    // ── Foreground dedup ──
    const dedupId = buildDedupId(remoteMessage.data as Record<string, unknown> | undefined);
    if (dedupId) {
      const now = Date.now();
      const last = recentlyShown.get(dedupId);
      if (last && now - last < DEDUP_WINDOW_MS) {
        // Duplicate of an event shown within the window — suppress.
        return;
      }
      recentlyShown.set(dedupId, now);
      // Prune old entries so the map doesn't grow unbounded over a long session.
      for (const [k, t] of recentlyShown) {
        if (now - t > DEDUP_WINDOW_MS) recentlyShown.delete(k);
      }
    }

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
