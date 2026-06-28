// ── season_fixtures/{seasonId} — lightweight per-season fixtures index ────────
//
// WHY: matches/{id} docs carry a heavy `detail` blob (events, lineups,
// statistics, h2h, …) written by syncMatchEnrichment / pollLivescores. The
// league-detail screen reads every fixture of a season
// (getFixturesBySeasonFromFirestore: ~104 docs for the World Cup) and the
// CLIENT Firebase SDK cannot project fields — it downloads the FULL docs,
// detail blobs included (several MB), and JSON-parses them on the main thread.
// That was the 3-4s "App Hanging" on the Mundial 2026 landing.
//
// FIX: precompute a single compact doc per season holding only the fields the
// fixtures list + bracket need (NO detail / h2h / sidelined). Built server-side
// with the Admin SDK `.select(...)` so we never load the heavy blobs into the
// function either. The client then reads ONE ~26 KB doc instead of 104 heavy
// ones. Same denormalized-read-model pattern as standings/{seasonId}.
//
// Live scores: this index intentionally goes a little stale for in-play
// matches. The client overlays live scores from the small `status == 'live'`
// query on top of the index — see getFixturesBySeasonFromFirestore.
import { admin, db } from './admin-init';
import * as logger from 'firebase-functions/logger';

/**
 * Fields the client's matchFromDoc() reads. MUST be a superset of everything
 * matchFromDoc touches — omitting a present field would silently break the
 * fixtures list or the cup bracket. Selecting a field that doesn't exist on a
 * given doc is harmless (Firestore just omits it). Deliberately EXCLUDES the
 * heavy fields: detail, detailUpdatedAt, h2h, h2hUpdatedAt, sidelinedHome,
 * sidelinedAway, lineupsSent, updatedAt.
 */
export const SEASON_FIXTURE_LIGHT_FIELDS = [
  'id',
  'homeTeam', 'awayTeam',
  'homeScore', 'awayScore',
  'homeScoreHT', 'awayScoreHT',
  'homePenScore', 'awayPenScore',
  'status', 'stateId', 'stateLabel', 'minute', 'time',
  'league', 'leagueId', 'leagueLogo',
  'date', 'startingAtUtc', 'seasonId',
  'liveClock',
  'stageId', 'roundId', 'groupId',
  'stage', 'round', 'group',
  'venueId', 'venueName', 'venueCity',
] as const;

export interface SeasonFixturesDoc {
  seasonId: number;
  count: number;
  fixtures: Record<string, unknown>[];
  updatedAt: admin.firestore.Timestamp;
}

/**
 * Rebuild season_fixtures/{seasonId} from the matches collection using a
 * light-field projection. Returns the number of fixtures written.
 */
export async function rebuildSeasonFixturesIndex(seasonId: number): Promise<number> {
  const snap = await db
    .collection('matches')
    .where('seasonId', '==', seasonId)
    .orderBy('startingAtUtc', 'asc')
    .select(...SEASON_FIXTURE_LIGHT_FIELDS)
    .limit(2000)
    .get();

  // Spread data first, then force `id` from the doc id so it always wins.
  const fixtures = snap.docs.map(d => ({ ...d.data(), id: d.id }));

  const payload: SeasonFixturesDoc = {
    seasonId,
    count: fixtures.length,
    fixtures,
    updatedAt: admin.firestore.Timestamp.now(),
  };

  await db.collection('season_fixtures').doc(String(seasonId)).set(payload);
  logger.info(`season_fixtures/${seasonId}: rebuilt (${fixtures.length} fixtures)`);
  return fixtures.length;
}

/**
 * Rebuild the index for a set of seasons (deduped). Called after syncFixtures /
 * backfill batch writes. Failures are isolated per season so one bad season
 * doesn't abort the rest.
 */
export async function rebuildSeasonFixturesForSeasons(seasonIds: Iterable<number>): Promise<void> {
  const unique = [...new Set(seasonIds)].filter(n => Number.isFinite(n) && n > 0);
  await Promise.all(
    unique.map(sid =>
      rebuildSeasonFixturesIndex(sid).catch(err =>
        logger.error(`season_fixtures/${sid} rebuild failed:`, err),
      ),
    ),
  );
}
