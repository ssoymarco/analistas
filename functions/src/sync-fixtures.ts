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

import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { getLeagueIdChunks } from './config';
import { fetchFixturesByDate } from './sportmonks';
import { mapFixtureToMatchDoc } from './mappers';
import type { MatchDoc } from './types';

const db = admin.firestore();

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
 * Main handler: fetch all fixtures for 3 dates across all leagues.
 * Writes/updates every fixture as a matches/{matchId} document.
 */
export async function syncFixturesHandler(): Promise<void> {
  const dates = getTargetDates();
  const leagueChunks = getLeagueIdChunks(25);

  logger.info(`📅 syncFixtures: syncing ${dates.length} dates × ${leagueChunks.length} league chunks`);

  const allMatchDocs: MatchDoc[] = [];

  for (const date of dates) {
    for (const leagueIds of leagueChunks) {
      try {
        const fixtures = await fetchFixturesByDate(date, leagueIds);

        for (const fixture of fixtures) {
          const doc = mapFixtureToMatchDoc(fixture);
          if (doc) allMatchDocs.push(doc);
        }
      } catch (err) {
        logger.error(`Failed to fetch fixtures for ${date} (leagues: ${leagueIds.slice(0, 40)}...):`, err);
      }
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
