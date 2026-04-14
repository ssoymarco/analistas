/**
 * navigationRef.ts
 *
 * Singleton navigation ref — allows navigating from outside the React tree
 * (e.g., push notification tap handler in App.tsx).
 *
 * Usage:
 *   1. Attach to NavigationContainer: <NavigationContainer ref={navigationRef}>
 *   2. Call navigateToMatch(match) from any module (including App.tsx effects).
 */

import { createNavigationContainerRef } from '@react-navigation/native';
import type { PartidosStackParamList } from '../navigation/AppNavigator';
import type { Match } from '../data/types';

export const navigationRef = createNavigationContainerRef<PartidosStackParamList>();

/**
 * Navigate to MatchDetailScreen from outside React.
 * Guards against calling before the navigator is mounted.
 */
export function navigateToMatch(match: Match): void {
  if (navigationRef.isReady()) {
    navigationRef.navigate('MatchDetail', { match });
  }
  // If the navigator isn't ready (e.g. app launched from killed state during onboarding),
  // we silently no-op. The user lands on the home screen. Handled in v2 via
  // Notifications.getLastNotificationResponseAsync() after nav becomes ready.
}
