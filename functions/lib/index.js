"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTestPush = exports.reportFcmToken = exports.deliverDelayedPush = exports.onWallpaperEntryCreated = exports.fbOnDemand = exports.fbAdmin = exports.fbDailyLeagues = exports.fbSyncStandings = exports.fbSyncFixtures = exports.fbPollLive = void 0;
// IMPORTANT: admin-init must be imported first — it calls admin.initializeApp()
// before any other module touches admin.firestore().
require("./admin-init");
// ── Football (API-Sports) ───────────────────────────────────────────────────
var functions_1 = require("./football/functions");
Object.defineProperty(exports, "fbPollLive", { enumerable: true, get: function () { return functions_1.fbPollLive; } });
Object.defineProperty(exports, "fbSyncFixtures", { enumerable: true, get: function () { return functions_1.fbSyncFixtures; } });
Object.defineProperty(exports, "fbSyncStandings", { enumerable: true, get: function () { return functions_1.fbSyncStandings; } });
Object.defineProperty(exports, "fbDailyLeagues", { enumerable: true, get: function () { return functions_1.fbDailyLeagues; } });
Object.defineProperty(exports, "fbAdmin", { enumerable: true, get: function () { return functions_1.fbAdmin; } });
Object.defineProperty(exports, "fbOnDemand", { enumerable: true, get: function () { return functions_1.fbOnDemand; } });
// ── Wallpapers contest (Firestore trigger, provider-agnostic) ────────────────
var wallpaper_entries_1 = require("./wallpaper-entries");
Object.defineProperty(exports, "onWallpaperEntryCreated", { enumerable: true, get: function () { return wallpaper_entries_1.onWallpaperEntryCreated; } });
// ── Modo Estadio — delayed push via Cloud Tasks (provider-agnostic) ──────────
var deliver_delayed_push_1 = require("./deliver-delayed-push");
Object.defineProperty(exports, "deliverDelayedPush", { enumerable: true, get: function () { return deliver_delayed_push_1.deliverDelayedPush; } });
// ── Push diagnostics ────────────────────────────────────────────────────────
var diagnostics_1 = require("./diagnostics");
Object.defineProperty(exports, "reportFcmToken", { enumerable: true, get: function () { return diagnostics_1.reportFcmToken; } });
Object.defineProperty(exports, "sendTestPush", { enumerable: true, get: function () { return diagnostics_1.sendTestPush; } });
//# sourceMappingURL=index.js.map