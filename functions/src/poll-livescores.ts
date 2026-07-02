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

import { admin, db } from './admin-init';
import * as logger from 'firebase-functions/logger';
import { LIVESCORE_POLL_INTERVAL_SEC, POLLS_PER_INVOCATION } from './config';
import { fetchLivescores } from './sportmonks';
import { mapFixtureToMatchDoc } from './mappers';
import { loadSnapshot, saveSnapshot, detectChanges, dispatchNotifications } from './detect-changes';
import type { MatchDoc } from './types';

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

  // 2. Transform live matches to MatchDoc format
  const matchDocs: MatchDoc[] = [];
  for (const fixture of smFixtures) {
    const doc = mapFixtureToMatchDoc(fixture);
    if (doc) matchDocs.push(doc);
  }

  // 2b. Also include scheduled matches starting within the next 20 minutes so
  //     the reminder detection in detectChanges (match.status === 'scheduled')
  //     can fire. pollLivescores only fetches live fixtures from SportMonks, so
  //     pre-match reminders would never trigger without this Firestore query.
  //     We only add each match once (live matches take precedence if somehow
  //     both appear).
  try {
    const nowIso  = new Date(startMs).toISOString();
    const soonIso = new Date(startMs + 20 * 60 * 1000).toISOString();
    const liveIds = new Set(matchDocs.map(m => m.id));
    const upcomingSnap = await db.collection('matches')
      .where('status', '==', 'scheduled')
      .where('startingAtUtc', '>=', nowIso)
      .where('startingAtUtc', '<=', soonIso)
      .get();
    for (const doc of upcomingSnap.docs) {
      if (!liveIds.has(doc.id)) {
        matchDocs.push(doc.data() as MatchDoc);
      }
    }
  } catch (err) {
    // Non-fatal — reminder may fire on the next poll if this query fails.
    logger.warn('pollLivescores: upcoming-matches query failed', { err });
  }

  if (!matchDocs.length) {
    logger.debug(`Poll ${pollIndex}: No live or upcoming matches`);
    return 0;
  }

  // 3. Load previous snapshot and detect changes. We pass the raw SMFixtures
  //    too so the detector can pull scorer names and red-card events from
  //    the events array on the same response.
  const prevSnapshot = await loadSnapshot();
  const changes = detectChanges(matchDocs, prevSnapshot, smFixtures);

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

  // 5. Save snapshot for next poll. The detector reads event counts off
  //    the fixtures' events array; we also pass the previous snapshot so
  //    one-time flags (reminderSent, lineupsSent) are preserved across polls.
  await saveSnapshot(matchDocs, smFixtures, prevSnapshot);

  // 6. Dispatch notifications for detected changes
  if (changes.length > 0) {
    await dispatchNotifications(changes);
  }

  const elapsed = Date.now() - startMs;
  logger.debug(`Poll ${pollIndex}: ${matchDocs.length} matches, ${changes.length} changes, ${elapsed}ms`);

  return matchDocs.length;
}

/**
 * Main polling function — runs POLLS_PER_INVOCATION (15) polls spaced
 * LIVESCORE_POLL_INTERVAL_SEC (4s) apart, so one invocation continuously
 * covers the full ~60s until the next scheduled trigger. Net effect: an
 * effective ~4-second livescore poll cadence (goal → push in seconds), not
 * the 1-minute scheduler heartbeat.
 */
export async function pollLivescoresHandler(): Promise<void> {
  logger.info(`🔄 pollLivescores: starting ${POLLS_PER_INVOCATION}-poll cycle (${LIVESCORE_POLL_INTERVAL_SEC}s apart)`);

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

  logger.info(`✅ pollLivescores: ${POLLS_PER_INVOCATION}-poll cycle complete`);
}
