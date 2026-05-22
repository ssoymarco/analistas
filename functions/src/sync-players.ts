/**
 * sync-players.ts
 *
 * Cloud Function: syncs full player profiles (season stats + team history)
 * for every player we know about. Writes one `players/{playerId}` doc.
 *
 * Replaces the per-user usePlayerDetail proxy call.
 *
 * Player discovery sources:
 *   1. squads/{seasonId_teamId}.players[]  — every squad we've synced
 *   2. topscorers/{seasonId}.scorers/assists/cards[]  — top performers
 *
 * Schedule: every 24h.
 *
 * Cost: ~3-5k unique players × 1 SM call = ~3-5k calls/day on `players`
 * entity. ~5-7% of the 72k/day cap.
 */

import { admin, db } from './admin-init';
import * as logger from 'firebase-functions/logger';
import { fetchPlayerFullProfile } from './sportmonks';

const SLEEP_BETWEEN_FETCHES_MS = 150;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function findPlayerIdsToSync(): Promise<Set<number>> {
  const ids = new Set<number>();

  // From squads
  const squadsSnap = await db.collection('squads').limit(2000).get();
  for (const docSnap of squadsSnap.docs) {
    const players = (docSnap.data() as any)?.players;
    if (!Array.isArray(players)) continue;
    for (const p of players) {
      if (typeof p?.playerId === 'number' && p.playerId > 0) ids.add(p.playerId);
    }
  }

  // From topscorers (covers anyone in goleadores tab who isn't on a synced squad)
  const topSnap = await db.collection('topscorers').limit(200).get();
  for (const docSnap of topSnap.docs) {
    const data = docSnap.data() as any;
    for (const list of [data?.scorers, data?.assists, data?.cards]) {
      if (!Array.isArray(list)) continue;
      for (const p of list) {
        const id = Number(p?.playerId);
        if (id > 0) ids.add(id);
      }
    }
  }

  return ids;
}

export async function syncPlayersHandler(): Promise<void> {
  const startMs = Date.now();
  logger.info('🧍 syncPlayers: discovering player IDs');

  const ids = await findPlayerIdsToSync();
  if (ids.size === 0) {
    logger.info('🧍 syncPlayers: nothing to discover (squads not synced yet?)');
    return;
  }
  logger.info(`🧍 syncPlayers: ${ids.size} unique players to refresh`);

  let written = 0;
  let errors = 0;

  for (const playerId of ids) {
    try {
      const raw = await fetchPlayerFullProfile(playerId);
      if (!raw) continue;
      await db.collection('players').doc(String(playerId)).set(
        {
          id: playerId,
          raw,
          updatedAt: admin.firestore.Timestamp.now(),
        },
        { merge: true },
      );
      written++;
      await sleep(SLEEP_BETWEEN_FETCHES_MS);
    } catch (err) {
      errors++;
      logger.error(`🧍 player ${playerId} sync failed:`, err);
    }
  }

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  logger.info(`✅ syncPlayers: ${written} written (${errors} errors) in ${elapsed}s`);
}
