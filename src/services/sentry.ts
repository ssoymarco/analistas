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

// In-memory rate-limit counter — resets on each app launch.
const _sentryEventCounts = new Map<string, number>();

const SENTRY_DSN: string = 'https://4b909e1e1c12141e4efc1c001335f321@o4511302084460544.ingest.us.sentry.io/4511302091407360';

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

    // ── beforeSend: noise filter + per-type rate limiter ─────────────────
    // Goals:
    //   1. Drop known-benign errors that are already handled in code.
    //   2. Cap repeated errors so one flapping issue can't burn the monthly quota.
    //   3. Never drop genuine crashes (fatal = level 'fatal' or unhandled).
    beforeSend(event) {
      const ex   = event.exception?.values?.[0];
      const type  = ex?.type  ?? '';
      const value = ex?.value ?? '';

      // ── 1. Always let fatal / unhandled crashes through ───────────────
      // These are the events we actually need to investigate.
      const isFatal = event.level === 'fatal' ||
        event.exception?.values?.some(e => e.mechanism?.handled === false);
      if (isFatal) return event;

      // ── 2. Drop AbortError ────────────────────────────────────────────
      // Intentional fetch aborts via AbortController (timeouts in
      // useUserCountry + sportmonks). Non-fatal, already caught + handled.
      if (type === 'AbortError') return null;

      // ── 3. Drop Firebase offline / permission noise ───────────────────
      // These fire on every session where the device is offline or a
      // public Firestore read races with auth init. Both cases are handled
      // gracefully in the data layer (fallback to cache / retry).
      if (value.includes('client is offline')) return null;
      if (value.includes('Missing or insufficient permissions')) return null;
      if (value.includes('Failed to get document because')) return null;

      // ── 4. Drop generic network errors ───────────────────────────────
      // RN's fetch throws TypeError("Network request failed") on any
      // connectivity blip. Our API layer already retries / shows offline
      // banner. No actionable info for us here.
      if (type === 'TypeError' && value.includes('Network request failed')) return null;

      // ── 5. Per-type rate limit: max 25 events per session ─────────────
      // Prevents a single flapping error from consuming the whole quota.
      // Resets on each app launch (in-memory map). Fatal events are exempt
      // (already returned above).
      const key   = `${type}::${value.substring(0, 80)}`;
      const count = (_sentryEventCounts.get(key) ?? 0) + 1;
      _sentryEventCounts.set(key, count);
      if (count > 25) return null;

      return event;
    },

    ignoreErrors: [
      /AbortError/i,
      /client is offline/i,
      /Missing or insufficient permissions/i,
      /Network request failed/i,
    ],
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
