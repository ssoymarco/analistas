/**
 * analytics.ts — thin wrapper around Firebase Analytics (Google Analytics).
 *
 * Free, cross-platform usage analytics: active users (DAU/MAU), screen views,
 * custom events, retention, funnels, demographics. Viewed in the Firebase
 * Console → Analytics, and in the linked Google Analytics property.
 *
 * Design notes:
 *  - Every call is wrapped in try/catch and never throws — analytics must never
 *    crash the app or block a user action.
 *  - Calls are no-ops on platforms where analytics isn't available (e.g. Expo
 *    Go / simulator without the native module), so screens can call freely.
 *  - Screen tracking is wired centrally in AppNavigator's NavigationContainer
 *    (onReady + onStateChange) — individual screens don't log screen_view.
 *  - Custom events use a fixed ANALYTICS_EVENTS catalog so names stay
 *    consistent and queryable (Firebase treats each distinct name as a metric).
 */

import analytics from '@react-native-firebase/analytics';
import { addBreadcrumb } from './sentry';

/** Canonical custom-event names. Keep snake_case (Firebase convention) and
 *  stable — renaming an event splits its history in the dashboard. */
export const ANALYTICS_EVENTS = {
  FOLLOW_TEAM: 'follow_team',
  UNFOLLOW_TEAM: 'unfollow_team',
  FOLLOW_LEAGUE: 'follow_league',
  FOLLOW_PLAYER: 'follow_player',
  OPEN_MATCH: 'open_match',
  STADIUM_MODE_TOGGLE: 'stadium_mode_toggle',
  SEARCH: 'search_performed',
  NEWS_READ: 'news_read',
  ONBOARDING_COMPLETE: 'onboarding_complete',
  SHARE: 'share_content',
} as const;

type EventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/** Log a custom event. Params must be flat string/number values (Firebase
 *  rejects nested objects). Safe to call anywhere; never throws. */
export async function logEvent(
  name: EventName,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<void> {
  try {
    // Strip undefined values — Firebase rejects them.
    const clean: Record<string, string | number | boolean> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) clean[k] = v;
      }
    }
    await analytics().logEvent(name, clean);
  } catch (err) {
    addBreadcrumb('analytics', `logEvent failed: ${name}`);
  }
}

/** Log a screen view. Called centrally from the navigation container. */
export async function logScreenView(screenName: string): Promise<void> {
  try {
    await analytics().logScreenView({
      screen_name: screenName,
      screen_class: screenName,
    });
  } catch (err) {
    addBreadcrumb('analytics', `logScreenView failed: ${screenName}`);
  }
}

/** Tag the current user with a stable id (the Firebase auth uid or anon id) so
 *  Analytics can compute returning-user retention. Never logs PII. */
export async function setAnalyticsUserId(userId: string | null): Promise<void> {
  try {
    await analytics().setUserId(userId);
  } catch {
    /* no-op */
  }
}

/** Set a user property (e.g. favorite team, fan level) for segmentation. */
export async function setAnalyticsUserProperty(name: string, value: string | null): Promise<void> {
  try {
    await analytics().setUserProperty(name, value);
  } catch {
    /* no-op */
  }
}
