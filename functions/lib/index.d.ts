/**
 * index.ts
 *
 * Cloud Functions entry point for Analistas.
 *
 * Data provider: API-Sports (since Nov 2026). The football pipeline lives in
 * ./football (see football/functions.ts for the schedule and API budget).
 *
 * The Sportmonks-era functions (pollLivescores, syncFixtures, syncStandings,
 * syncTeams, …) are no longer exported — Sportmonks was cancelled. Their code
 * is kept in sportmonks-index.legacy.ts and the old modules for reference
 * until the app migration ships; deploying this entry point removes them
 * from Firebase.
 */
import './admin-init';
export { fbPollLive, fbSyncFixtures, fbSyncStandings, fbDailyLeagues, fbAdmin, fbOnDemand, } from './football/functions';
export { onWallpaperEntryCreated } from './wallpaper-entries';
export { deliverDelayedPush } from './deliver-delayed-push';
export { reportFcmToken, sendTestPush } from './diagnostics';
