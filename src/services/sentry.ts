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

    // Called before every event is sent. Used for two things:
    //   1. Scrubbing PII (email, etc.) — none today, hook is here for later.
    //   2. Dropping known-benign noise that the auto-fetch instrumentation
    //      captures even though our code already handles it (see below).
    beforeSend(event) {
      // ── Drop AbortError ────────────────────────────────────────────────
      // The Sentry React-Native SDK auto-instruments `fetch()` and reports
      // EVERY rejection, including intentional aborts via AbortController.
      // We use timeouts in two places and both already catch + fall back:
      //
      //   • useUserCountry.ts        4s timeout on the Cloudflare /geo Worker
      //                              → returns null, falls back to device locale.
      //
      //   • services/sportmonks.ts  15s timeout on SportMonks calls
      //                              → throws cleanly, caller decides how to
      //                                react (typically retry or use cache).
      //
      // Both are non-fatal and already log/handle. Reporting them to Sentry
      // produces noise that drowns out real bugs, so we drop the event here.
      // We match conservatively: the exception's `type` is "AbortError" AND
      // its `value` is "Aborted" (DOM spec exact wording).
      const ex = event.exception?.values?.[0];
      if (ex?.type === 'AbortError' && ex?.value === 'Aborted') {
        return null;
      }

      return event;
    },

    // Belt-and-suspenders: even if `beforeSend` somehow misses the event
    // (e.g. error thrown outside a fetch wrapper), this regex stops Sentry
    // from capturing it at SDK level. Cheap and idempotent.
    ignoreErrors: [
      /AbortError/i,
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
