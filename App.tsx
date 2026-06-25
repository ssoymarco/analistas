import React, { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nextProvider } from 'react-i18next';
import i18n, { applyStoredLanguage } from './src/i18n';
import { initSentry, identifyUser, clearUser, Sentry } from './src/services/sentry';

// Initialize Sentry as early as possible — before any other imports run their
// side effects — so we capture any startup errors too.
initSentry();
import { AppNavigator } from './src/navigation/AppNavigator';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { DarkModeProvider } from './src/contexts/DarkModeContext';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { FavoritesProvider } from './src/contexts/FavoritesContext';
import { NotificationPrefsProvider } from './src/contexts/NotificationPrefsContext';
import { OnboardingProvider } from './src/contexts/OnboardingContext';
import { UserStatsProvider } from './src/contexts/UserStatsContext';
import { NetworkProvider } from './src/contexts/NetworkContext';
import { TimeFormatProvider } from './src/contexts/TimeFormatContext';
import { OfflineBanner } from './src/components/OfflineBanner';
import UpdateModal from './src/components/UpdateModal';
import { useVersionCheck } from './src/hooks/useVersionCheck';
import { initialize } from './src/services/notifications';
import { initializeFCM, initializeFCMAtStartup, attachFCMHandlers } from './src/services/fcmInit';
import { navigateToMatch, buildMatchStubFromPayload } from './src/utils/navigationRef';
import mobileAds from 'react-native-google-mobile-ads';
import { ADMOB_ENABLED } from './src/config/features';
// ── Sentry user sync ──────────────────────────────────────────────────────────
// Sits inside AuthProvider so it can read the current user and tag Sentry
// events with the user ID. Renders nothing.

function SentryUserSync() {
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      identifyUser(user.id, user.username ?? user.name);
    } else {
      clearUser();
    }
  }, [user]);

  return null;
}

// ── Root component ────────────────────────────────────────────────────────────

function AppInner() {
  const { status, storeUrl, latestVersion } = useVersionCheck();
  const [updateDismissed, setUpdateDismissed] = React.useState(false);

  return (
    <>
      <AppNavigator />
      <OfflineBanner />
      <UpdateModal
        visible={status !== 'none' && !updateDismissed}
        status={status}
        storeUrl={storeUrl}
        latestVersion={latestVersion}
        onDismiss={() => setUpdateDismissed(true)}
      />
    </>
  );
}

function App() {
  const notifResponseListener = useRef<Notifications.Subscription | null>(null);
  const detachFcmHandlers = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Restore user's saved language preference (overrides device default).
    applyStoredLanguage().catch(() => {});

    // Initialize the Google Mobile Ads SDK once at startup. Without this call
    // the <BannerAd> components mount and reserve their adaptive height but the
    // ad request never completes — the SDK isn't started, so banners stay blank.
    // Best-effort: ad init must never block or crash app launch.
    if (ADMOB_ENABLED) {
      mobileAds().initialize().catch(() => {});
    }

    // ⚠️ ORDER MATTERS — FCM must register its UNUserNotificationCenter
    // delegate BEFORE expo-notifications swizzles the same delegate.
    // Whichever lib runs first wins on iOS. When expo-notifications won
    // (Build 15), the APNs `didRegisterForRemoteNotificationsWithDeviceToken`
    // callback never reached `[FIRMessaging appDidReceiveMessage]`, so
    // FCM's token was a "phantom" — subscribeToTopic resolved fine, the
    // server-side topic membership filed correctly, but every push got
    // dropped at the APNs layer because the device wasn't bound.
    //
    // We now call `initializeFCMAtStartup` instead of `initializeFCM` to
    // avoid showing the iOS permission dialog on the very first screen.
    //   • Android: full init runs immediately (no dialog — permission granted
    //     at install or managed at API 33+ via expo-notifications separately).
    //   • iOS returning user (permission already granted): full init runs.
    //   • iOS new user: only registers the RNFB delegate; the actual
    //     requestPermission() call is deferred to after the onboarding
    //     notification-preferences screen (goNextFromNotifs in
    //     OnboardingScreen.tsx → initializeFCM()).
    initializeFCMAtStartup().catch(() => {});

    // Foreground + token-refresh handlers — registered BEFORE expo-notifications
    // takes the foreground display reins so onMessage callbacks fire correctly.
    detachFcmHandlers.current = attachFCMHandlers();

    // Bootstrap expo-notifications: configure foreground handler + Android channel
    // (no permissions yet). Runs AFTER FCM init so the delegate ordering is
    // RNFB → expo-notifications → user permission flow.
    initialize().catch(() => {});

    // Handle notification TAP (user tapped the banner/notification center entry).
    // This path covers FOREGROUND-redisplayed FCM messages (re-shown via
    // expo-notifications in fcmInit's onMessage) and, on iOS, APNs-delivered
    // taps that expo-notifications observes through its delegate swizzle.
    // Android background/killed taps are handled by RNFB in fcmInit.ts.
    notifResponseListener.current = Notifications.addNotificationResponseReceivedListener(
      response => {
        const data = response.notification.request.content.data as Record<string, unknown>;
        const match = buildMatchStubFromPayload(data);
        if (match) navigateToMatch(match);
      },
    );

    return () => {
      notifResponseListener.current?.remove();
      detachFcmHandlers.current?.();
    };
  }, []);

  return (
    <ErrorBoundary>
      <I18nextProvider i18n={i18n}>
        <SafeAreaProvider>
          <NetworkProvider>
            <DarkModeProvider>
              <TimeFormatProvider>
                <AuthProvider>
                  <SentryUserSync />
                  <OnboardingProvider>
                    <NotificationPrefsProvider>
                      <FavoritesProvider>
                        <UserStatsProvider>
                          <AppInner />
                        </UserStatsProvider>
                      </FavoritesProvider>
                    </NotificationPrefsProvider>
                  </OnboardingProvider>
                </AuthProvider>
              </TimeFormatProvider>
            </DarkModeProvider>
          </NetworkProvider>
        </SafeAreaProvider>
      </I18nextProvider>
    </ErrorBoundary>
  );
}

// Wrap the root component with Sentry so it captures React render errors
// AND adds Sentry's own ErrorBoundary at the outermost layer.
export default Sentry.wrap(App);
