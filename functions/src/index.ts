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

// IMPORTANT: admin-init must be imported first — it calls admin.initializeApp()
// before any other module touches admin.firestore().
import './admin-init';

// ── Football (API-Sports) ───────────────────────────────────────────────────
export {
  fbPollLive, fbSyncFixtures, fbSyncStandings, fbDailyLeagues, fbAdmin, fbOnDemand,
} from './football/functions';

// ── Wallpapers contest (Firestore trigger, provider-agnostic) ────────────────
export { onWallpaperEntryCreated } from './wallpaper-entries';

// ── Modo Estadio — delayed push via Cloud Tasks (provider-agnostic) ──────────
export { deliverDelayedPush } from './deliver-delayed-push';

// ── Push diagnostics ────────────────────────────────────────────────────────
export { reportFcmToken, sendTestPush } from './diagnostics';
