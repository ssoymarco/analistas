/**
 * sync-standings.ts
 *
 * Cloud Function: syncs league standings and top scorers.
 * Scheduled every 6 hours for standings, every 12 hours for top scorers.
 *
 * Iterates through all configured leagues with valid seasonIds,
 * fetches standings/scorers from SportMonks, and writes to Firestore.
 */

import { db } from './admin-init';
import * as logger from 'firebase-functions/logger';
import { getLeaguesWithSeason } from './config';
import { fetchStandings, fetchTopScorers } from './sportmonks';
import { mapStandingsToDoc, mapTopScorersToDoc } from './mappers';

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
 * Sync top scorers for all configured leagues. Fetches THREE separate stat
 * categories per league — goals (208), assists (209), yellow cards (84) —
 * and writes them all to the same topscorers/{seasonId} document so
 * useLeagueDetail can render all three tabs from Firestore in one read.
 *
 * Cost: 51 leagues × 3 categories = 153 SM calls per run on the
 * `topscorers` entity. ~3.6k/day at the hourly schedule. ~5% of cap.
 */
export async function syncTopScorersHandler(): Promise<void> {
  const leagues = getLeaguesWithSeason();
  logger.info(`🏅 syncTopScorers: processing ${leagues.length} leagues (3 categories each)`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < leagues.length; i++) {
    const league = leagues[i];
    const seasonId = league.currentSeasonId!;

    try {
      const [goals, assists, cards] = await Promise.all([
        fetchTopScorers(seasonId, 208).catch(() => []),
        fetchTopScorers(seasonId, 209).catch(() => []),
        fetchTopScorers(seasonId, 84).catch(() => []),
      ]);

      if (goals.length > 0 || assists.length > 0 || cards.length > 0) {
        const goalsDoc = mapTopScorersToDoc(seasonId, league.id, goals);
        const assistsList = assists.length > 0
          ? mapTopScorersToDoc(seasonId, league.id, assists).scorers
          : [];
        const cardsList = cards.length > 0
          ? mapTopScorersToDoc(seasonId, league.id, cards).scorers
          : [];
        await db.collection('topscorers').doc(String(seasonId)).set({
          ...goalsDoc,
          assists: assistsList,
          cards: cardsList,
        });
        successCount++;
      }
    } catch (err) {
      logger.error(`Failed top scorers for ${league.name} (season ${seasonId}):`, err);
      errorCount++;
    }

    // Rate limit: pause every 10 leagues
    if ((i + 1) % 10 === 0 && i < leagues.length - 1) {
      await sleep(2000);
    }
  }

  logger.info(`✅ syncTopScorers: ${successCount} ok, ${errorCount} errors`);
}
