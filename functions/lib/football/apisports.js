"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiSportsError = exports.quotaState = exports.APISPORTS_KEY = void 0;
exports.afGet = afGet;
const params_1 = require("firebase-functions/params");
const logger = __importStar(require("firebase-functions/logger"));
exports.APISPORTS_KEY = (0, params_1.defineSecret)('APISPORTS_KEY');
const BASE_URL = 'https://v3.football.api-sports.io';
const TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
/** Last quota reading seen by this instance (refreshed on every response). */
exports.quotaState = {
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
function resolveKey() {
    try {
        const v = exports.APISPORTS_KEY.value();
        if (v)
            return v;
    }
    catch {
        // Outside a function context (local scripts) — fall through to env.
    }
    const fromEnv = process.env.APISPORTS_KEY;
    if (fromEnv)
        return fromEnv;
    throw new Error('APISPORTS_KEY is not set. Bind the Firebase secret in `secrets: [APISPORTS_KEY]` ' +
        'or export APISPORTS_KEY for local scripts.');
}
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
class ApiSportsError extends Error {
    status;
    endpoint;
    constructor(message, status, endpoint) {
        super(message);
        this.status = status;
        this.endpoint = endpoint;
        this.name = 'ApiSportsError';
    }
}
exports.ApiSportsError = ApiSportsError;
/**
 * GET an API-Sports endpoint and return its `response` array/object.
 *
 * @param path   e.g. '/fixtures'
 * @param params query params (undefined values are dropped)
 */
async function afGet(path, params = {}) {
    const url = new URL(BASE_URL + path);
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== '')
            url.searchParams.set(k, String(v));
    }
    const key = resolveKey();
    let lastErr;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(url.toString(), {
                headers: { 'x-apisports-key': key, Accept: 'application/json' },
                signal: ctrl.signal,
            });
            exports.quotaState.callsThisInstance++;
            readQuotaHeaders(res.headers);
            if (res.status === 429 || res.status >= 500) {
                lastErr = new ApiSportsError(`HTTP ${res.status}`, res.status, path);
                await sleep(attempt * 1_000);
                continue;
            }
            if (!res.ok) {
                throw new ApiSportsError(`HTTP ${res.status}`, res.status, path);
            }
            const body = (await res.json());
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
        }
        catch (err) {
            if (err instanceof ApiSportsError && err.status !== 429 && err.status < 500)
                throw err;
            lastErr = err;
            if (attempt < MAX_ATTEMPTS)
                await sleep(attempt * 1_000);
        }
        finally {
            clearTimeout(timer);
        }
    }
    logger.error(`API-Sports ${path} failed after ${MAX_ATTEMPTS} attempts`, { err: String(lastErr) });
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
function readQuotaHeaders(h) {
    const num = (name) => {
        const v = h.get(name);
        if (v == null || v === '')
            return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    };
    const limitDay = num('x-ratelimit-requests-limit');
    const remainingDay = num('x-ratelimit-requests-remaining');
    const limitMin = num('x-ratelimit-limit');
    const remainingMin = num('x-ratelimit-remaining');
    if (limitDay != null)
        exports.quotaState.limitDay = limitDay;
    if (remainingDay != null)
        exports.quotaState.remainingDay = remainingDay;
    if (limitMin != null)
        exports.quotaState.limitMinute = limitMin;
    if (remainingMin != null)
        exports.quotaState.remainingMinute = remainingMin;
    exports.quotaState.observedAt = Date.now();
}
//# sourceMappingURL=apisports.js.map