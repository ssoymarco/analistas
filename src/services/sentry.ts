/**
 * Sentry – crash reporting & performance monitoring
 *
 * HOW TO GET YOUR DSN:
 *   1. Go to https://sentry.io → Create account → Create Project → React Native
 *   2. Copy the DSN from: Settings → Projects → Analistas → Client Keys (DSN)
 *   3. Replace the placeholder below with your real DSN
 *   4. (Optional) Store it in .env and read via expo-constants
 *
 * IMPORTANT: Disabled in development by default so your local sessions
 * don't pollute production error counts.
 */

import * as Sentry from '@sentry/react-native';

const SENTRY_DSN = 'YOUR_SENTRY_DSN_HERE'; // ← replace with your DSN

export function initSentry(): void {
  // Don't crash the app if DSN hasn't been set yet
  if (!SENTRY_DSN || SENTRY_DSN === 'YOUR_SENTRY_DSN_HERE') {
    if (__DEV__) {
      console.warn('[Sentry] DSN not configured. Set SENTRY_DSN in src/services/sentry.ts');
    }
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,

    // Send 20% of transactions for performance monitoring.
    // Start low; increase once you confirm the data is useful.
    tracesSampleRate: 0.2,

    // Turn off in development — logs to console instead.
    enabled: !__DEV__,

    // Tag every event with environment so you can filter in the dashboard.
    environment: __DEV__ ? 'development' : 'production',

    // Attach native stack frames to JS errors (very useful for RN crashes).
    attachStacktrace: true,

    // Log Sentry SDK activity in dev (remove if too noisy).
    debug: false,

    // Called before every event is sent — perfect for scrubbing PII.
    beforeSend(event) {
      // Example: strip user email from breadcrumbs
      // if (event.user?.email) event.user.email = '[redacted]';
      return event;
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Tag the current user so errors show their ID in the Sentry dashboard.
 * Call this right after login / auth state restored.
 */
export function identifyUser(userId: string, username?: string): void {
  Sentry.setUser({ id: userId, username });
}

/**
 * Clear the user tag on logout.
 */
export function clearUser(): void {
  Sentry.setUser(null);
}

/**
 * Log a handled error without crashing.
 * Use this in catch blocks for non-fatal errors you still want tracked.
 *
 * @example
 *   try { await fetchData() }
 *   catch (err) { captureError(err, { screen: 'PartidosScreen' }) }
 */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (context) {
    Sentry.withScope(scope => {
      Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

/**
 * Add a breadcrumb — a breadcrumb trail that appears before a crash.
 * Helps understand WHAT the user did before the error.
 *
 * @example
 *   addBreadcrumb('navigation', 'Navigated to MatchDetail', { matchId });
 */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  Sentry.addBreadcrumb({ category, message, data, level: 'info' });
}

// Re-export the Sentry namespace so screens can use Sentry.wrap() etc.
export { Sentry };
