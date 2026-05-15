/**
 * poll-livescores.ts
 *
 * Cloud Function: polls SportMonks livescores every 15 seconds.
 * Scheduled to run every 1 minute, executes 4 internal polls with 15s delays.
 *
 * Flow per poll:
 * 1. Fetch all live matches from SportMonks (1 API call)
 * 2. Transform to MatchDoc format
 * 3. Compare against previous snapshot for change detection (goals, starts, ends)
 * 4. Batch write changed matches to Firestore
 * 5. Save new snapshot for next comparison
 * 6. Dispatch notifications for detected changes
 */

import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { LIVESCORE_POLL_INTERVAL_SEC, POLLS_PER_INVOCATION } from './config';
import { fetchLivescores } from './sportmonks';
import { mapFixtureToMatchDoc } from './mappers';
import { loadSnapshot, saveSnapshot, detectChanges, dispatchNotifications } from './detect-changes';
import type { MatchDoc } from './types';

const db = admin.firestore();

/** Utility: sleep for N milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a single livescores poll cycle.
 * Returns the number of matches processed.
 */
async function executeSinglePoll(pollIndex: number): Promise<number> {
  const startMs = Date.now();

  // 1. Fetch live matches from SportMonks
  const smFixtures = await fetchLivescores();

  if (!smFixtures.length) {
    logger.debug(`Poll ${pollIndex}: No live matches`);
    return 0;
  }

  // 2. Transform to MatchDoc format
  const matchDocs: MatchDoc[] = [];
  for (const fixture of smFixtures) {
    const doc = mapFixtureToMatchDoc(fixture);
    if (doc) matchDocs.push(doc);
  }

  // 3. Load previous snapshot and detect changes
  const prevSnapshot = await loadSnapshot();
  const changes = detectChanges(matchDocs, prevSnapshot);

  // 4. Batch write to Firestore (max 500 per batch)
  const batches: admin.firestore.WriteBatch[] = [];
  let currentBatch = db.batch();
  let opCount = 0;

  for (const matchDoc of matchDocs) {
    const ref = db.collection('matches').doc(matchDoc.id);
    currentBatch.set(ref, matchDoc, { merge: true });
    opCount++;

    if (opCount >= 499) {
      batches.push(currentBatch);
      currentBatch = db.batch();
      opCount = 0;
    }
  }
  if (opCount > 0) batches.push(currentBatch);

  await Promise.all(batches.map(b => b.commit()));

  // 5. Save snapshot for next poll
  await saveSnapshot(matchDocs);

  // 6. Dispatch notifications for detected changes
  if (changes.length > 0) {
    await dispatchNotifications(changes);
  }

  const elapsed = Date.now() - startMs;
  logger.debug(`Poll ${pollIndex}: ${matchDocs.length} matches, ${changes.length} changes, ${elapsed}ms`);

  return matchDocs.length;
}

/**
 * Main polling function — runs 4 polls with 15-second intervals.
 * Called by the scheduled Cloud Function every 1 minute.
 */
export async function pollLivescoresHandler(): Promise<void> {
  logger.info('🔄 pollLivescores: starting 4-poll cycle');

  for (let i = 0; i < POLLS_PER_INVOCATION; i++) {
    try {
      await executeSinglePoll(i + 1);
    } catch (err) {
      logger.error(`Poll ${i + 1} failed:`, err);
    }

    // Wait 15 seconds before next poll (skip wait after last poll)
    if (i < POLLS_PER_INVOCATION - 1) {
      await sleep(LIVESCORE_POLL_INTERVAL_SEC * 1000);
    }
  }

  logger.info('✅ pollLivescores: 4-poll cycle complete');
}
