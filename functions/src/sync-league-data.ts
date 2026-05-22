/**
 * sync-league-data.ts
 *
 * Event-driven sync: when pollLivescores detects a goal or match end,
 * immediately refresh standings + topscorers for the affected league
 * instead of waiting for the next hourly cron.
 *
 * Why two separate functions:
 *   • Goals change topscorers but NOT standings (match isn't over yet).
 *   • Match endings change both — points awarded + final goals tallied.
 *
 * Concurrency: callers should dedupe by leagueId and run the syncs in
 * parallel via Promise.allSettled. We don't enforce a global lock — the
 * worst case is two syncs racing on the same Firestore doc, where the
 * later write wins (and both contain the same fresh SportMonks data
 * anyway, so the outcome is identical).
 */

import * as logger from 'firebase-functions/logger';
import { db } from './admin-init';
import { fetchStandings, fetchTopScorers } from './sportmonks';
import { mapStandingsToDoc, mapTopScorersToDoc } from './mappers';
import { getLeagueConfig } from './config';
import type { DetectedChange } from './types';

/**
 * Refresh standings for a single league. Silent no-op if the league has
 * no configured seasonId (e.g. friendlies). Errors are caught + logged —
 * we never throw, so a failed sync of one league cannot block others.
 */
export async function syncLeagueStandings(leagueId: number): Promise<void> {
  const cfg = getLeagueConfig(leagueId);
  if (!cfg?.currentSeasonId) {
    logger.debug(`[event-sync] no seasonId for league ${leagueId} — skipping standings`);
    return;
  }
  try {
    const groups = await fetchStandings(cfg.currentSeasonId);
    if (groups.length === 0) return;
    const doc = mapStandingsToDoc(cfg.currentSeasonId, cfg.id, groups);
    await db.collection('standings').doc(String(cfg.currentSeasonId)).set(doc);
    logger.info(`📊 event-driven standings refreshed for ${cfg.name}`);
  } catch (err) {
    logger.error(`[event-sync] standings failed for league ${leagueId} (${cfg.name}):`, err);
  }
}

/**
 * Refresh top scorers for a single league. Same error/skip semantics as
 * syncLeagueStandings.
 */
export async function syncLeagueTopScorers(leagueId: number): Promise<void> {
  const cfg = getLeagueConfig(leagueId);
  if (!cfg?.currentSeasonId) {
    logger.debug(`[event-sync] no seasonId for league ${leagueId} — skipping topscorers`);
    return;
  }
  try {
    const scorers = await fetchTopScorers(cfg.currentSeasonId);
    if (scorers.length === 0) return;
    const doc = mapTopScorersToDoc(cfg.currentSeasonId, cfg.id, scorers);
    await db.collection('topscorers').doc(String(cfg.currentSeasonId)).set(doc);
    logger.info(`🏅 event-driven topscorers refreshed for ${cfg.name}`);
  } catch (err) {
    logger.error(`[event-sync] topscorers failed for league ${leagueId} (${cfg.name}):`, err);
  }
}

/**
 * Inspect a batch of detected changes and fire the appropriate syncs.
 *
 *   matchEnd → refresh standings AND topscorers for that league
 *   goal     → refresh topscorers for that league (standings unchanged)
 *
 * Multiple events for the same league collapse to a single sync per
 * type, even within the same invocation (Set dedup). All syncs run in
 * parallel via Promise.allSettled — one league's failure can't block the
 * rest, and a slow league can't delay the next poll cycle by more than
 * the duration of the slowest sync.
 */
export async function triggerLeagueSyncForChanges(
  changes: DetectedChange[],
): Promise<void> {
  const standingsLeagues = new Set<number>();
  const topscorersLeagues = new Set<number>();

  for (const c of changes) {
    const lid = parseInt(c.leagueId, 10);
    if (!Number.isFinite(lid)) continue;

    switch (c.type) {
      case 'matchEnd':
        standingsLeagues.add(lid);
        topscorersLeagues.add(lid);
        break;
      case 'goal':
        topscorersLeagues.add(lid);
        break;
      // matchStart and statusChange don't affect standings or topscorers
    }
  }

  if (standingsLeagues.size === 0 && topscorersLeagues.size === 0) return;

  const tasks: Promise<void>[] = [];
  for (const lid of standingsLeagues)  tasks.push(syncLeagueStandings(lid));
  for (const lid of topscorersLeagues) tasks.push(syncLeagueTopScorers(lid));

  await Promise.allSettled(tasks);

  logger.info(
    `⚡ event-driven sync: ${standingsLeagues.size} standings + ${topscorersLeagues.size} topscorers`,
    {
      standingsLeagueIds:  Array.from(standingsLeagues),
      topscorersLeagueIds: Array.from(topscorersLeagues),
    },
  );
}
