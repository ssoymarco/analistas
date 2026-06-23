/**
 * navigationRef.ts
 *
 * Singleton navigation ref — allows navigating from outside the React tree
 * (e.g., push-notification tap handlers in App.tsx / fcmInit.ts).
 *
 * Usage:
 *   1. Attach to NavigationContainer: <NavigationContainer ref={navigationRef}>
 *   2. Call navigateToMatch(match) from any module (including effects/handlers).
 *   3. On NavigationContainer onReady, call flushPendingMatchNavigation() so a
 *      cold-start tap that arrived before the navigator mounted still lands.
 */

import { createNavigationContainerRef } from '@react-navigation/native';
import type { PartidosStackParamList } from '../navigation/AppNavigator';
import type { Match } from '../data/types';

export const navigationRef = createNavigationContainerRef<PartidosStackParamList>();

// ── Cold-start queue + tap dedup ──────────────────────────────────────────────
// A notification tapped while the app is KILLED fires its handler before the
// NavigationContainer mounts. navigateToMatch() can't navigate yet, so it stashes
// the target here; flushPendingMatchNavigation() (called from onReady) replays it.
let pendingMatch: Match | null = null;

// On iOS a single tap can surface through BOTH the expo-notifications response
// listener AND the RNFB onNotificationOpenedApp/getInitialNotification handlers.
// Dedup by matchId within a short window so we navigate exactly once.
let lastNavMatchId = '';
let lastNavAtMs = 0;
const DEDUP_WINDOW_MS = 3000;

/**
 * Navigate to MatchDetailScreen from outside React. If the navigator isn't
 * mounted yet (cold start), the target is queued and replayed on onReady.
 */
export function navigateToMatch(match: Match): void {
  const now = Date.now();
  if (match.id && match.id === lastNavMatchId && now - lastNavAtMs < DEDUP_WINDOW_MS) {
    return; // duplicate tap from a second delivery path — ignore
  }

  if (navigationRef.isReady()) {
    lastNavMatchId = match.id;
    lastNavAtMs = now;
    navigationRef.navigate('MatchDetail', { match });
  } else {
    pendingMatch = match;
  }
}

/** Replay a queued cold-start navigation once the navigator is ready. */
export function flushPendingMatchNavigation(): void {
  if (pendingMatch && navigationRef.isReady()) {
    const m = pendingMatch;
    pendingMatch = null;
    navigateToMatch(m);
  }
}

/**
 * Build a minimal Match stub from a notification's `data` payload so we can
 * navigate to MatchDetailScreen. The screen immediately loads the real fixture
 * via useFixtureDetail(match.id), so the stub only needs `id` plus enough to
 * render the header for the first frame.
 *
 * Accepts the RAW notification data record (both expo-notifications and RNFB
 * hand us `Record<string, string>` — every value is a string, so numeric
 * fields are coerced here). Returns null when there's no usable matchId/type.
 */
export function buildMatchStubFromPayload(
  data: Record<string, unknown> | null | undefined,
): Match | null {
  if (!data || typeof data !== 'object') return null;

  const matchId = data.matchId != null ? String(data.matchId) : '';
  const type    = typeof data.type === 'string' ? data.type : '';
  if (!matchId || !type) return null;

  const toNum = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const homeName = data.homeTeam != null ? String(data.homeTeam) : '';
  const awayName = data.awayTeam != null ? String(data.awayTeam) : '';
  const homeScore = toNum(data.homeScore);
  const awayScore = toNum(data.awayScore);

  const base = {
    homeTeam: { id: '', name: homeName, shortName: homeName, logo: '' },
    awayTeam: { id: '', name: awayName, shortName: awayName, logo: '' },
    league:   typeof data.league === 'string' ? data.league : '',
    leagueId: data.leagueId != null ? String(data.leagueId) : '',
    date:     new Date().toISOString().slice(0, 10),
    isFavorite: false,
  };

  // Map the event type to a sensible placeholder status for the first frame.
  switch (type) {
    case 'matchEnd':
    case 'finalResult':
      return { ...base, id: matchId, homeScore, awayScore, status: 'finished', time: 'FT' };

    case 'matchStart':
    case 'matchReminder':
    case 'lineups':
      return {
        ...base, id: matchId, homeScore, awayScore, status: 'scheduled', time: '',
        startingAtUtc: typeof data.kickoffUtc === 'string' ? data.kickoffUtc : undefined,
      };

    // goal, goalCancelled, halftime, redCard, yellowCard, substitution,
    // extraTimeStart, penaltiesStart, matchSuspended → match is in progress.
    default:
      return {
        ...base, id: matchId, homeScore, awayScore, status: 'live',
        time: data.minute != null ? `${toNum(data.minute)}'` : '',
      };
  }
}
