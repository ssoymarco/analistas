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

// IMPORTANT: admin-init must be imported first — it calls admin.initializeApp()
// before any other module touches admin.firestore().
import './admin-init';

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { SPORTMONKS_TOKEN } from './config';
import { pollLivescoresHandler } from './poll-livescores';
import { syncFixturesHandler } from './sync-fixtures';
import { syncStandingsHandler, syncTopScorersHandler } from './sync-standings';

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
export const pollLivescores = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeoutSeconds: 120,
    memory: '256MiB',
    region: 'us-central1',
    retryCount: 0,  // Don't retry — next invocation will run in 1 min anyway
    secrets: [SPORTMONKS_TOKEN],
  },
  async () => {
    await pollLivescoresHandler();
  },
);

/**
 * Sync all fixtures for yesterday, today, and tomorrow.
 * Keeps the matches collection fresh with scheduled/finished matches.
 *
 * Runs every 30 minutes.
 */
export const syncFixtures = onSchedule(
  {
    schedule: 'every 30 minutes',
    timeoutSeconds: 300,
    memory: '512MiB',
    region: 'us-central1',
    retryCount: 1,
    secrets: [SPORTMONKS_TOKEN],
  },
  async () => {
    await syncFixturesHandler();
  },
);

/**
 * Sync league standings for all configured leagues.
 * Runs every 1 hour — keeps tables fresh after match days.
 * Cost: 51 leagues × 24 executions/day = 1,224 calls/day (1.7% of Pro limit).
 * Future improvement: switch to event-driven sync from pollLivescores matchEnd.
 */
export const syncStandings = onSchedule(
  {
    schedule: 'every 1 hours',
    timeoutSeconds: 540,
    memory: '256MiB',
    region: 'us-central1',
    retryCount: 1,
    secrets: [SPORTMONKS_TOKEN],
  },
  async () => {
    await syncStandingsHandler();
  },
);

/**
 * Sync top scorers for all configured leagues.
 * Runs every 1 hour — keeps scorer rankings near-real-time so a goal at
 * 18:42 shows up in the table by 19:00 at the latest.
 * Cost: 51 leagues × 24 executions/day = 1,224 calls/day (1.7% of Pro limit).
 * Future improvement: switch to event-driven sync from pollLivescores matchEnd.
 */
export const syncTopScorers = onSchedule(
  {
    schedule: 'every 1 hours',
    timeoutSeconds: 540,
    memory: '256MiB',
    region: 'us-central1',
    retryCount: 1,
    secrets: [SPORTMONKS_TOKEN],
  },
  async () => {
    await syncTopScorersHandler();
  },
);
