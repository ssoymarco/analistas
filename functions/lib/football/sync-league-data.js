"use strict";
/**
 * football/sync-league-data.ts
 *
 * League-level data: the league catalog (current season per league), standings
 * and top players.
 *
 * Budget:
 *   catalog                     1 call/day
 *   standings, event-driven     1 call per priority league that finished a match
 *                               (debounced through fb_meta/standingsDirty)
 *   standings, daily sweep      ~85 calls (every priority league in season)
 *   top scorers/assists/yellows 3 calls × ~45 leagues (popularity ≥ 50), daily
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncFootballCatalog = syncFootballCatalog;
exports.buildTeamIndex = buildTeamIndex;
exports.syncDirtyStandings = syncDirtyStandings;
exports.syncAllLeagueTables = syncAllLeagueTables;
const logger = __importStar(require("firebase-functions/logger"));
const admin_init_1 = require("../admin-init");
const leagues_1 = require("../shared/football/leagues");
const apisports_1 = require("./apisports");
const mapping_1 = require("./mapping");
const store_1 = require("./store");
const now = () => admin_init_1.admin.firestore.Timestamp.now();
async function syncFootballCatalog() {
    const list = await (0, apisports_1.afGet)('/leagues', { current: 'true' });
    const leagues = {};
    for (const x of list) {
        const cur = x.seasons?.find(s => s.current) ?? x.seasons?.[x.seasons.length - 1];
        const cov = (cur?.coverage ?? {});
        leagues[String(x.league.id)] = {
            n: x.league.name, c: x.country.name, t: x.league.type, logo: x.league.logo,
            flag: x.country.flag ?? null, s: cur?.year ?? null, st: !!cov.standings,
        };
    }
    await admin_init_1.db.doc(`${store_1.COL.meta}/leagueCatalog`).set({ leagues, count: list.length, updatedAt: now() });
    logger.info('fbSyncCatalog: done', { leagues: list.length });
    return list.length;
}
async function loadCatalog() {
    const s = await admin_init_1.db.doc(`${store_1.COL.meta}/leagueCatalog`).get();
    return (s.exists ? s.data()?.leagues : undefined) ?? {};
}
async function refreshStandings(leagueId, cat) {
    if (!cat?.s || !cat.st)
        return null;
    const res = await (0, apisports_1.afGet)('/standings', { league: leagueId, season: cat.s });
    if (!res.length)
        return null;
    const doc = (0, mapping_1.mapStandings)(res[0]);
    await admin_init_1.db.doc(`${store_1.COL.standings}/${leagueId}_${cat.s}`).set({ ...doc, updatedAt: now() });
    return doc;
}
/**
 * `fb_meta/teamIndex`: every team that appears in a curated league's table,
 * most popular league first. One small doc the app reads once so team search
 * is instant and offline-friendly (no provider call per keystroke).
 */
function buildTeamIndex(tables) {
    const sorted = [...tables].sort((a, b) => (leagues_1.LEAGUE_POPULARITY[Number(b.leagueId)] ?? 0) - (leagues_1.LEAGUE_POPULARITY[Number(a.leagueId)] ?? 0));
    const seen = new Set();
    const teams = [];
    for (const table of sorted) {
        for (const group of table.groups) {
            for (const row of group.rows) {
                if (!row.team.id || seen.has(row.team.id))
                    continue;
                seen.add(row.team.id);
                teams.push({ i: row.team.id, n: row.team.name, l: table.leagueId });
            }
        }
    }
    return teams;
}
async function refreshTopPlayers(leagueId, cat) {
    if (!cat?.s)
        return false;
    const [scorers, assists, yellows] = await Promise.all([
        (0, apisports_1.afGet)('/players/topscorers', { league: leagueId, season: cat.s }),
        (0, apisports_1.afGet)('/players/topassists', { league: leagueId, season: cat.s }),
        (0, apisports_1.afGet)('/players/topyellowcards', { league: leagueId, season: cat.s }),
    ]);
    await admin_init_1.db.doc(`${store_1.COL.topscorers}/${leagueId}_${cat.s}`).set({
        leagueId, season: cat.s,
        scorers: (0, mapping_1.mapTopPlayers)(scorers, 'goals'),
        assists: (0, mapping_1.mapTopPlayers)(assists, 'assists'),
        yellowCards: (0, mapping_1.mapTopPlayers)(yellows, 'yellow'),
        updatedAt: now(),
    });
    return true;
}
/** Event-driven refresh of leagues marked dirty by the live poller. */
async function syncDirtyStandings(maxLeagues = 15) {
    const ref = admin_init_1.db.doc(`${store_1.COL.meta}/standingsDirty`);
    const snap = await ref.get();
    const dirty = (snap.exists ? snap.data()?.leagues : undefined) ?? [];
    if (!dirty.length)
        return 0;
    const cat = await loadCatalog();
    const batch = dirty.slice(0, maxLeagues);
    let done = 0;
    for (const id of batch) {
        try {
            if (await refreshStandings(id, cat[id]))
                done++;
        }
        catch (err) {
            logger.warn(`fbStandings: league ${id} failed`, { err: String(err) });
        }
    }
    await ref.set({ leagues: admin_init_1.admin.firestore.FieldValue.arrayRemove(...batch), updatedAt: now() }, { merge: true });
    logger.info('fbStandings (dirty): done', { refreshed: done, pending: dirty.length - batch.length });
    return done;
}
/** Daily sweep: standings for every priority league, top players for the big ones. */
async function syncAllLeagueTables() {
    const cat = await loadCatalog();
    let standings = 0;
    let topPlayers = 0;
    const tables = [];
    const ids = Object.entries(leagues_1.LEAGUE_POPULARITY).filter(([, p]) => p >= 20).map(([id]) => id);
    for (const id of ids) {
        try {
            const table = await refreshStandings(id, cat[id]);
            if (table) {
                standings++;
                tables.push(table);
            }
        }
        catch (err) {
            logger.warn(`fbTables: standings ${id} failed`, { err: String(err) });
        }
        if ((leagues_1.LEAGUE_POPULARITY[Number(id)] ?? 0) >= 50) {
            try {
                if (await refreshTopPlayers(id, cat[id]))
                    topPlayers++;
            }
            catch (err) {
                logger.warn(`fbTables: top players ${id} failed`, { err: String(err) });
            }
        }
    }
    // Only replace the index after a healthy sweep — a provider outage must not
    // leave the app with an empty search index.
    if (tables.length >= 20) {
        const teams = buildTeamIndex(tables);
        await admin_init_1.db.doc(`${store_1.COL.meta}/teamIndex`).set({ teams, updatedAt: now() })
            .catch(err => logger.warn('fbTables: team index write failed', { err: String(err) }));
    }
    logger.info('fbTables: done', { standings, topPlayers });
    return { standings, topPlayers };
}
//# sourceMappingURL=sync-league-data.js.map