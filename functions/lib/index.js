"use strict";
/**
 * index.ts
 *
 * Cloud Functions entry point for Analistas.
 * Exports all scheduled functions that power the real-time backend.
 *
 * Functions:
 * - pollLivescores:   Every 1 min → 4 polls × 15s = real-time live scores
 * - syncFixtures:     Every 30 min → all matches for yesterday/today/tomorrow
 * - syncStandings:    Every 6 hours → league tables for all configured leagues
 * - syncTopScorers:   Every 12 hours → top scorers for all configured leagues
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
exports.syncTopScorers = exports.syncStandings = exports.syncFixtures = exports.pollLivescores = void 0;
const admin = __importStar(require("firebase-admin"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
const poll_livescores_1 = require("./poll-livescores");
const sync_fixtures_1 = require("./sync-fixtures");
const sync_standings_1 = require("./sync-standings");
// ── Initialize Firebase Admin ───────────────────────────────────────────────
admin.initializeApp();
// ── Scheduled Functions ─────────────────────────────────────────────────────
/**
 * Poll livescores every 1 minute.
 * Internally runs 4 polls with 15-second delays for near-real-time updates.
 * Detects goals, match starts, and match endings.
 *
 * Region: us-central1 (default, lowest latency to SportMonks EU servers)
 * Timeout: 120s (4 polls × ~15s wait + API latency)
 * Memory: 256MB
 */
exports.pollLivescores = (0, scheduler_1.onSchedule)({
    schedule: 'every 1 minutes',
    timeoutSeconds: 120,
    memory: '256MiB',
    region: 'us-central1',
    retryCount: 0, // Don't retry — next invocation will run in 1 min anyway
}, async () => {
    await (0, poll_livescores_1.pollLivescoresHandler)();
});
/**
 * Sync all fixtures for yesterday, today, and tomorrow.
 * Keeps the matches collection fresh with scheduled/finished matches.
 *
 * Runs every 30 minutes.
 */
exports.syncFixtures = (0, scheduler_1.onSchedule)({
    schedule: 'every 30 minutes',
    timeoutSeconds: 300,
    memory: '512MiB',
    region: 'us-central1',
    retryCount: 1,
}, async () => {
    await (0, sync_fixtures_1.syncFixturesHandler)();
});
/**
 * Sync league standings for all configured leagues.
 * Runs every 6 hours — standings don't change that frequently.
 */
exports.syncStandings = (0, scheduler_1.onSchedule)({
    schedule: 'every 6 hours',
    timeoutSeconds: 540,
    memory: '256MiB',
    region: 'us-central1',
    retryCount: 1,
}, async () => {
    await (0, sync_standings_1.syncStandingsHandler)();
});
/**
 * Sync top scorers for all configured leagues.
 * Runs every 12 hours — scorer rankings update slowly.
 */
exports.syncTopScorers = (0, scheduler_1.onSchedule)({
    schedule: 'every 12 hours',
    timeoutSeconds: 540,
    memory: '256MiB',
    region: 'us-central1',
    retryCount: 1,
}, async () => {
    await (0, sync_standings_1.syncTopScorersHandler)();
});
//# sourceMappingURL=index.js.map