import { useEffect, useRef } from 'react';
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
import { initialize } from './src/services/notifications';
import { navigateToMatch } from './src/utils/navigationRef';
import type { NotificationPayload } from './src/services/notifications';
import type { Match } from './src/data/types';

// ── Notification tap → navigation ─────────────────────────────────────────────

/**
 * Build a minimal Match stub from a notification payload.
 * MatchDetailScreen only needs id + team names + score + status to render its
 * header while the real fixture data loads via useFixtureDetail(match.id).
 */
function buildMatchStubFromPayload(payload: NotificationPayload): Match | null {
  const base = {
    homeTeam: { id: '', name: payload.homeTeam, shortName: payload.homeTeam, logo: '' },
    awayTeam: { id: '', name: payload.awayTeam, shortName: payload.awayTeam, logo: '' },
    leagueId: '',
    date: new Date().toISOString().slice(0, 10),
    isFavorite: false,
  };

  switch (payload.type) {
    case 'goal':
      return {
        ...base,
        id: payload.matchId,
        homeScore: payload.homeScore,
        awayScore: payload.awayScore,
        status: 'live',
        time: `${payload.minute}'`,
        league: '',
      };
    case 'finalResult':
      return {
        ...base,
        id: payload.matchId,
        homeScore: payload.homeScore,
        awayScore: payload.awayScore,
        status: 'finished',
        time: 'FT',
        league: payload.league,
      };
    case 'matchStart':
      return {
        ...base,
        id: payload.matchId,
        homeScore: 0,
        awayScore: 0,
        status: 'scheduled',
        time: '',
        league: payload.league,
        startingAtUtc: payload.kickoffUtc,
      };
    case 'lineups':
      return {
        ...base,
        id: payload.matchId,
        homeScore: 0,
        awayScore: 0,
        status: 'scheduled',
        time: '',
        league: payload.league,
      };
    default:
      return null;
  }
}

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

function App() {
  const notifResponseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    // Restore user's saved language preference (overrides device default).
    applyStoredLanguage().catch(() => {});

    // Bootstrap: configure foreground handler + Android channel (no permissions yet).
    initialize().catch(() => {});

    // Handle notification TAP (user tapped the banner/notification center entry).
    notifResponseListener.current = Notifications.addNotificationResponseReceivedListener(
      response => {
        const data = response.notification.request.content.data as unknown;
        if (!data || typeof data !== 'object') return;

        const payload = data as NotificationPayload;
        if (!payload.type || !payload.matchId) return;

        const match = buildMatchStubFromPayload(payload);
        if (match) navigateToMatch(match);
      },
    );

    return () => {
      notifResponseListener.current?.remove();
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
                          <AppNavigator />
                          <OfflineBanner />
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
