/**
 * football/functions.ts
 *
 * Cloud Functions for the API-Sports football backend.
 *
 *   fbPollLive        every 1 min   live scores + push notifications (1-4 polls/min, adaptive)
 *   fbSyncFixtures    every 5 min   fixtures for yesterday … +14 days, all leagues
 *   fbSyncStandings   every 10 min  standings of leagues that just finished a match
 *   fbDailyLeagues    daily 04:17   league catalog + standings/top players sweep
 *   fbAdmin           callable      operator actions (gated by BACKFILL_TOKEN)
 *   fbOnDemand        callable      team / player / preview / calendars / search, cached in Firestore
 *
 * Every function that talks to API-Sports binds the APISPORTS_KEY secret.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { BACKFILL_TOKEN } from '../diagnostics';
import { APISPORTS_KEY } from './apisports';
import { handleOnDemand, toPlain, type OnDemandRequest } from './on-demand';
import { pollFootballLive } from './poll-live';
import { syncFootballFixtures } from './sync-fixtures';
import { syncAllLeagueTables, syncDirtyStandings, syncFootballCatalog } from './sync-league-data';
import { deleteOldFingerprints } from './store';

const REGION = 'us-central1';

export const fbPollLive = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeoutSeconds: 120,
    memory: '512MiB',
    region: REGION,
    retryCount: 0, // the next minute's run supersedes a failed one
    secrets: [APISPORTS_KEY],
  },
  async () => { await pollFootballLive(); },
);

export const fbSyncFixtures = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeoutSeconds: 300,
    memory: '512MiB',
    region: REGION,
    retryCount: 0,
    secrets: [APISPORTS_KEY],
  },
  async () => { await syncFootballFixtures(); },
);

export const fbSyncStandings = onSchedule(
  {
    schedule: 'every 10 minutes',
    timeoutSeconds: 300,
    memory: '256MiB',
    region: REGION,
    retryCount: 0,
    secrets: [APISPORTS_KEY],
  },
  async () => { await syncDirtyStandings(); },
);

export const fbDailyLeagues = onSchedule(
  {
    schedule: '17 4 * * *',
    timeZone: 'Etc/UTC',
    timeoutSeconds: 540,
    memory: '512MiB',
    region: REGION,
    retryCount: 1,
    secrets: [APISPORTS_KEY],
  },
  async () => {
    await syncFootballCatalog();
    await syncAllLeagueTables();
    await deleteOldFingerprints();
  },
);

/**
 * Operator actions. `{ adminToken, action, dates? }`:
 *   action 'fixtures' — sync the given dates (YYYY-MM-DD, max 15) or the default window
 *   action 'catalog'  — refresh the league catalog
 *   action 'tables'   — standings + top players sweep
 * Used right after the first deploy to populate Firestore without waiting
 * for the schedules.
 */
export const fbAdmin = onCall(
  {
    timeoutSeconds: 540,
    memory: '512MiB',
    region: REGION,
    secrets: [APISPORTS_KEY, BACKFILL_TOKEN],
    invoker: 'public',
  },
  async (req) => {
    const token = String(req.data?.adminToken ?? '');
    const expected = BACKFILL_TOKEN.value();
    if (!expected || token !== expected) throw new HttpsError('permission-denied', 'Requires matching adminToken.');
    const action = String(req.data?.action ?? '');
    switch (action) {
      case 'fixtures': {
        const dates: unknown = req.data?.dates;
        if (dates !== undefined && (!Array.isArray(dates) || dates.length > 15 ||
            !dates.every(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)))) {
          throw new HttpsError('invalid-argument', 'dates must be ≤15 YYYY-MM-DD strings');
        }
        return { ok: true, ...(await syncFootballFixtures(dates as string[] | undefined)) };
      }
      case 'catalog':
        return { ok: true, leagues: await syncFootballCatalog() };
      case 'tables':
        return { ok: true, ...(await syncAllLeagueTables()) };
      default:
        throw new HttpsError('invalid-argument', "action must be 'fixtures' | 'catalog' | 'tables'");
    }
  },
);

/**
 * Data the app asks for the first time a screen needs it (team, squad,
 * player, match preview, season calendars, minor-league tables, search). Every
 * answer is cached in Firestore with a TTL, so API-Sports is called once per
 * document no matter how many users open it. See on-demand.ts.
 *
 * Public on purpose: onboarding searches teams before the user has a session.
 * Inputs are validated, and a daily quota reserve keeps on-demand work from
 * ever starving the live poller.
 */
export const fbOnDemand = onCall(
  {
    timeoutSeconds: 60,
    memory: '256MiB',
    region: REGION,
    secrets: [APISPORTS_KEY],
    invoker: 'public',
    concurrency: 40,
    maxInstances: 10,
  },
  async (req) => toPlain(await handleOnDemand(req.data as OnDemandRequest)),
);
