/**
 * football/apisports.ts
 *
 * Minimal API-Sports (api-football v3) HTTP client for Cloud Functions.
 *
 * - The key lives in the Firebase secret APISPORTS_KEY (set once with
 *   `firebase functions:secrets:set APISPORTS_KEY`). Every function that calls
 *   API-Sports must list APISPORTS_KEY in its `secrets: [...]`.
 * - Tracks the daily quota from the response headers so callers can degrade
 *   gracefully (see quota.ts) instead of hard-failing at 0 remaining.
 * - Retries 429 / 5xx / network errors with a short backoff.
 */
export declare const APISPORTS_KEY: import("firebase-functions/lib/params/types").SecretParam;
/** Last quota reading seen by this instance (refreshed on every response). */
export declare const quotaState: {
    /** Daily request limit of the plan (7,500 on Pro). */
    limitDay: number;
    /** Requests left today, as of `observedAt`. */
    remainingDay: number;
    /** Per-minute limit (300 on Pro). */
    limitMinute: number;
    remainingMinute: number;
    observedAt: number;
    /** Calls made by this instance since it started (for logging). */
    callsThisInstance: number;
};
export declare class ApiSportsError extends Error {
    readonly status: number;
    readonly endpoint: string;
    constructor(message: string, status: number, endpoint: string);
}
/**
 * GET an API-Sports endpoint and return its `response` array/object.
 *
 * @param path   e.g. '/fixtures'
 * @param params query params (undefined values are dropped)
 */
export declare function afGet<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T>;
