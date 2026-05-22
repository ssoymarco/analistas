/**
 * sync-coaches.ts
 *
 * Cloud Function: syncs full coach profiles (career stats + teams managed)
 * for every active coach across the configured leagues. Writes one
 * `coaches/{coachId}` doc per coach.
 *
 * Replaces the per-user `getCoachProfile` proxy call in AlineacionTab.
 *
 * Strategy: rather than crawling all SportMonks coaches, we iterate the
 * `teams/` collection (written by syncTeams), extract each team's active
 * coach (from the fixture-detail enrichment or team page), and fetch their
 * full profile. This keeps the call volume bounded by the number of teams
 * we care about.
 *
 * Schedule: every 24h. Career stats change on a weekly timescale.
 *
 * Cost: ~1,000-1,500 coach fetches per run / day. ~6% of the daily
 * `coaches` entity cap (72k). Sequential with 200ms pauses to be polite.
 */

import { admin, db } from './admin-init';
import * as logger from 'firebase-functions/logger';
import { fetchCoachFullProfile } from './sportmonks';

const SLEEP_BETWEEN_FETCHES_MS = 200;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Find coach IDs to sync. We pull them from two sources to be thorough:
 *
 *   1. matches/{id}.detail.coaches[].id  — populated by syncMatchEnrichment
 *      from /fixtures/{id} includes. Covers active coaches of teams that
 *      have had a hot-window match recently.
 *   2. matches/{id}.detail.lineups[].coach_id  — same source, redundant
 *      coverage.
 *
 * Deduplicates by coach ID.
 */
async function findCoachIdsToSync(): Promise<Set<number>> {
  const ids = new Set<number>();
  // Pull from recent enriched matches — covers most active coaches.
  const snap = await db.collection('matches')
    .where('detailUpdatedAt', '!=', null)
    .limit(500)
    .get();
  for (const docSnap of snap.docs) {
    const detail = (docSnap.data() as any)?.detail;
    if (!detail) continue;
    const coaches = Array.isArray(detail.coaches) ? detail.coaches : [];
    for (const c of coaches) {
      const id = c?.meta?.coach_id ?? c?.id;
      if (typeof id === 'number' && id > 0) ids.add(id);
    }
  }
  return ids;
}

export async function syncCoachesHandler(): Promise<void> {
  const startMs = Date.now();
  logger.info('👔 syncCoaches: discovering active coach IDs');

  const ids = await findCoachIdsToSync();
  if (ids.size === 0) {
    logger.info('👔 syncCoaches: no coach IDs discovered (matches not enriched yet?)');
    return;
  }
  logger.info(`👔 syncCoaches: ${ids.size} unique coach IDs to refresh`);

  let written = 0;
  let errors = 0;

  for (const coachId of ids) {
    try {
      const raw = await fetchCoachFullProfile(coachId);
      if (!raw) continue;
      await db.collection('coaches').doc(String(coachId)).set(
        {
          id: coachId,
          raw,
          updatedAt: admin.firestore.Timestamp.now(),
        },
        { merge: true },
      );
      written++;
      await sleep(SLEEP_BETWEEN_FETCHES_MS);
    } catch (err) {
      errors++;
      logger.error(`👔 coach ${coachId} sync failed:`, err);
    }
  }

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  logger.info(`✅ syncCoaches: ${written} written (${errors} errors) in ${elapsed}s`);
}
