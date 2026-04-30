/**
 * sync-standings.ts
 *
 * Cloud Function: syncs league standings and top scorers.
 * Scheduled every 6 hours for standings, every 12 hours for top scorers.
 *
 * Iterates through all configured leagues with valid seasonIds,
 * fetches standings/scorers from SportMonks, and writes to Firestore.
 */

import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { getLeaguesWithSeason } from './config';
import { fetchStandings, fetchTopScorers } from './sportmonks';
import { mapStandingsToDoc, mapTopScorersToDoc } from './mappers';

const db = admin.firestore();

/** Utility: sleep for N milliseconds (rate limit courtesy) */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Sync standings for all configured leagues.
 * Processes 10 leagues at a time with 2-second pauses for rate limiting.
 */
export async function syncStandingsHandler(): Promise<void> {
  const leagues = getLeaguesWithSeason();
  logger.info(`📊 syncStandings: processing ${leagues.length} leagues`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < leagues.length; i++) {
    const league = leagues[i];

    try {
      const groups = await fetchStandings(league.currentSeasonId!);

      if (groups.length > 0) {
        const doc = mapStandingsToDoc(league.currentSeasonId!, league.id, groups);
        await db.collection('standings').doc(String(league.currentSeasonId)).set(doc);
        successCount++;
      }
    } catch (err) {
      logger.error(`Failed standings for ${league.name} (season ${league.currentSeasonId}):`, err);
      errorCount++;
    }

    // Rate limit: pause every 10 leagues
    if ((i + 1) % 10 === 0 && i < leagues.length - 1) {
      await sleep(2000);
    }
  }

  logger.info(`✅ syncStandings: ${successCount} ok, ${errorCount} errors`);
}

/**
 * Sync top scorers for all configured leagues.
 * Same pattern as standings with rate limit courtesy pauses.
 */
export async function syncTopScorersHandler(): Promise<void> {
  const leagues = getLeaguesWithSeason();
  logger.info(`🏅 syncTopScorers: processing ${leagues.length} leagues`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < leagues.length; i++) {
    const league = leagues[i];

    try {
      const scorers = await fetchTopScorers(league.currentSeasonId!);

      if (scorers.length > 0) {
        const doc = mapTopScorersToDoc(league.currentSeasonId!, league.id, scorers);
        await db.collection('topscorers').doc(String(league.currentSeasonId)).set(doc);
        successCount++;
      }
    } catch (err) {
      logger.error(`Failed top scorers for ${league.name} (season ${league.currentSeasonId}):`, err);
      errorCount++;
    }

    // Rate limit: pause every 10 leagues
    if ((i + 1) % 10 === 0 && i < leagues.length - 1) {
      await sleep(2000);
    }
  }

  logger.info(`✅ syncTopScorers: ${successCount} ok, ${errorCount} errors`);
}
