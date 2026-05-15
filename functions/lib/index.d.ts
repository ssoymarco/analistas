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
/**
 * Poll livescores every 1 minute.
 * Internally runs 4 polls with 15-second delays for near-real-time updates.
 * Detects goals, match starts, and match endings.
 *
 * Region: us-central1 (default, lowest latency to SportMonks EU servers)
 * Timeout: 120s (4 polls × ~15s wait + API latency)
 * Memory: 256MB
 */
export declare const pollLivescores: import("firebase-functions/v2/scheduler").ScheduleFunction;
/**
 * Sync all fixtures for yesterday, today, and tomorrow.
 * Keeps the matches collection fresh with scheduled/finished matches.
 *
 * Runs every 30 minutes.
 */
export declare const syncFixtures: import("firebase-functions/v2/scheduler").ScheduleFunction;
/**
 * Sync league standings for all configured leagues.
 * Runs every 6 hours — standings don't change that frequently.
 */
export declare const syncStandings: import("firebase-functions/v2/scheduler").ScheduleFunction;
/**
 * Sync top scorers for all configured leagues.
 * Runs every 12 hours — scorer rankings update slowly.
 */
export declare const syncTopScorers: import("firebase-functions/v2/scheduler").ScheduleFunction;
