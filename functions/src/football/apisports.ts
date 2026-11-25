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

import { defineSecret } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import type { AfEnvelope } from './apisports-types';

export const APISPORTS_KEY = defineSecret('APISPORTS_KEY');

const BASE_URL = 'https://v3.football.api-sports.io';
const TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;

/** Last quota reading seen by this instance (refreshed on every response). */
export const quotaState = {
  /** Daily request limit of the plan (7,500 on Pro). */
  limitDay: 0,
  /** Requests left today, as of `observedAt`. */
  remainingDay: Number.POSITIVE_INFINITY,
  /** Per-minute limit (300 on Pro). */
  limitMinute: 0,
  remainingMinute: Number.POSITIVE_INFINITY,
  observedAt: 0,
  /** Calls made by this instance since it started (for logging). */
  callsThisInstance: 0,
};

function resolveKey(): string {
  try {
    const v = APISPORTS_KEY.value();
    if (v) return v;
  } catch {
    // Outside a function context (local scripts) — fall through to env.
  }
  const fromEnv = process.env.APISPORTS_KEY;
  if (fromEnv) return fromEnv;
  throw new Error(
    'APISPORTS_KEY is not set. Bind the Firebase secret in `secrets: [APISPORTS_KEY]` ' +
    'or export APISPORTS_KEY for local scripts.',
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export class ApiSportsError extends Error {
  constructor(message: string, readonly status: number, readonly endpoint: string) {
    super(message);
    this.name = 'ApiSportsError';
  }
}

/**
 * GET an API-Sports endpoint and return its `response` array/object.
 *
 * @param path   e.g. '/fixtures'
 * @param params query params (undefined values are dropped)
 */
export async function afGet<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }
  const key = resolveKey();

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url.toString(), {
        headers: { 'x-apisports-key': key, Accept: 'application/json' },
        signal: ctrl.signal,
      });
      quotaState.callsThisInstance++;
      readQuotaHeaders(res.headers);

      if (res.status === 429 || res.status >= 500) {
        lastErr = new ApiSportsError(`HTTP ${res.status}`, res.status, path);
        await sleep(attempt * 1_000);
        continue;
      }
      if (!res.ok) {
        throw new ApiSportsError(`HTTP ${res.status}`, res.status, path);
      }
      const body = (await res.json()) as AfEnvelope<T>;
      // API-Sports reports logical errors with HTTP 200 + a non-empty `errors`.
      const errors = body.errors;
      const hasErrors = Array.isArray(errors) ? errors.length > 0 : errors && Object.keys(errors).length > 0;
      if (hasErrors) {
        const msg = JSON.stringify(errors);
        // Rate limit errors come back this way too — retry those.
        if (/rate ?limit|too many/i.test(msg)) {
          lastErr = new ApiSportsError(msg, 429, path);
          await sleep(attempt * 1_500);
          continue;
        }
        throw new ApiSportsError(msg, 200, path);
      }
      return body.response;
    } catch (err) {
      if (err instanceof ApiSportsError && err.status !== 429 && err.status < 500) throw err;
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) await sleep(attempt * 1_000);
    } finally {
      clearTimeout(timer);
    }
  }
  logger.error(`API-Sports ${path} failed after ${MAX_ATTEMPTS} attempts`, { err: String(lastErr) });
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function readQuotaHeaders(h: Headers): void {
  const num = (name: string): number | null => {
    const v = h.get(name);
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const limitDay = num('x-ratelimit-requests-limit');
  const remainingDay = num('x-ratelimit-requests-remaining');
  const limitMin = num('x-ratelimit-limit');
  const remainingMin = num('x-ratelimit-remaining');
  if (limitDay != null) quotaState.limitDay = limitDay;
  if (remainingDay != null) quotaState.remainingDay = remainingDay;
  if (limitMin != null) quotaState.limitMinute = limitMin;
  if (remainingMin != null) quotaState.remainingMinute = remainingMin;
  quotaState.observedAt = Date.now();
}
