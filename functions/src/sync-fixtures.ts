/**
 * sync-fixtures.ts
 *
 * Cloud Function: syncs all fixtures for yesterday, today, and tomorrow.
 * Scheduled every 30 minutes to keep the Firestore matches collection
 * up to date with scheduled, live, and finished matches.
 *
 * This ensures PartidosScreen has fresh data even if pollLivescores
 * hasn't picked up a match yet (e.g., a match that just got scheduled).
 */

import { admin, db } from './admin-init';
import * as logger from 'firebase-functions/logger';
import { fetchFixturesByDate } from './sportmonks';
import { mapFixtureToMatchDoc } from './mappers';
import type { MatchDoc } from './types';

/**
 * Format a Date as 'YYYY-MM-DD' in UTC.
 */
function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Get yesterday, today, and tomorrow date strings.
 */
function getTargetDates(): string[] {
  const now = new Date();

  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  return [
    formatDate(yesterday),
    formatDate(now),
    formatDate(tomorrow),
  ];
}

/**
 * Main handler: fetch all fixtures for 3 dates across ALL leagues SportMonks
 * covers (no league filter). Writes/updates every fixture as a
 * matches/{matchId} document.
 *
 * Why no filter: the previous version restricted to the 51 leagues in
 * config.ts to keep API calls lean, but this caused the Firestore-backed
 * "Hoy" tab to silently drop ~10-15 matches/day from leagues outside the
 * config (women's leagues, lower divisions, regional friendlies, etc.).
 * Pull-to-refresh used the proxy with no filter and showed them, which
 * looked like a sync bug to users. The proxy and Firestore now have parity.
 */
export async function syncFixturesHandler(): Promise<void> {
  const dates = getTargetDates();

  logger.info(`📅 syncFixtures: syncing ${dates.length} dates (all leagues)`);

  const allMatchDocs: MatchDoc[] = [];

  for (const date of dates) {
    try {
      const fixtures = await fetchFixturesByDate(date);

      for (const fixture of fixtures) {
        const doc = mapFixtureToMatchDoc(fixture);
        if (doc) allMatchDocs.push(doc);
      }
    } catch (err) {
      logger.error(`Failed to fetch fixtures for ${date}:`, err);
    }
  }

  // Batch write all match documents
  if (allMatchDocs.length === 0) {
    logger.info('📅 syncFixtures: no fixtures found');
    return;
  }

  const batches: admin.firestore.WriteBatch[] = [];
  let currentBatch = db.batch();
  let opCount = 0;

  for (const matchDoc of allMatchDocs) {
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

  logger.info(`✅ syncFixtures: wrote ${allMatchDocs.length} matches across ${dates.join(', ')}`);
}
