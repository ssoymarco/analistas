"use strict";
/**
 * football/on-demand.ts
 *
 * Data fetched the first time somebody asks for it (the `fbOnDemand` callable)
 * instead of on a schedule: team pages, player pages, match previews, season
 * calendars, tables of leagues the scheduled sync doesn't cover, search.
 *
 * Contract with the app (shapes in shared/football/model.ts):
 *   1. the app reads the Firestore doc directly;
 *   2. only when it is missing or past `expiresAt` it calls the function;
 *   3. the function re-checks freshness itself (it is the authority), asks
 *      API-Sports, stores the doc with a TTL and returns it.
 *
 * So API-Sports is hit once per document per TTL no matter how many users
 * open the screen, and the provider key never leaves the server.
 *
 * QUOTA: on-demand work must never starve the live poller. Every fetch first
 * checks the day's remaining requests against a reserve sized for the rest of
 * the day's polling (see `onDemandReserve`). When the reserve is reached the
 * function serves the stale doc if there is one, or fails with
 * `resource-exhausted` — live scores and pushes keep working either way.
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onDemandReserve = onDemandReserve;
exports.budgetAllows = budgetAllows;
exports.normalizeSearch = normalizeSearch;
exports.ensureMatch = ensureMatch;
exports.ensureMatchPreview = ensureMatchPreview;
exports.ensureTeam = ensureTeam;
exports.ensureTeamFixtures = ensureTeamFixtures;
exports.ensureTeamStats = ensureTeamStats;
exports.ensurePlayer = ensurePlayer;
exports.ensureCoach = ensureCoach;
exports.ensureLeague = ensureLeague;
exports.ensureLeagueFixtures = ensureLeagueFixtures;
exports.ensureStandings = ensureStandings;
exports.ensureTopPlayers = ensureTopPlayers;
exports.ensureSearch = ensureSearch;
exports.mapLegacyPlayers = mapLegacyPlayers;
exports.handleOnDemand = handleOnDemand;
exports.toPlain = toPlain;
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const admin_init_1 = require("../admin-init");
const freshness_1 = require("../shared/football/freshness");
const leagues_1 = require("../shared/football/leagues");
const legacyPlayerMap_json_1 = __importDefault(require("../shared/football/legacyPlayerMap.json"));
const legacy_1 = require("../shared/football/legacy");
const apisports_1 = require("./apisports");
const mapping_1 = require("./mapping");
const on_demand_mapping_1 = require("./on-demand-mapping");
const store_1 = require("./store");
const DAY_MS = 86_400_000;
/** Firestore caps a document at 1 MB; ~450 B per slim fixture row. */
const MAX_SEASON_FIXTURES = 1_400;
const LEGACY_PLAYER_MAP = legacyPlayerMap_json_1.default;
// ── Quota guard ──────────────────────────────────────────────────────────────
/**
 * Requests to keep untouched for the scheduled pipeline for the rest of the
 * UTC day: ~3 calls per remaining minute (live polls + enrichment + fixture
 * sync at a busy-evening rate) plus a fixed cushion. Early in the day this
 * leaves ~3,000 of the Pro plan's 7,500 for on-demand work; the share grows as
 * the day goes by and the real polling stays under the worst case.
 */
function onDemandReserve(nowMs) {
    const minuteOfDay = Math.floor((nowMs % DAY_MS) / 60_000);
    return Math.round((1440 - minuteOfDay) * 3) + 200;
}
function sameUtcDay(a, b) {
    return Math.floor(a / DAY_MS) === Math.floor(b / DAY_MS);
}
/** Requests left today as far as we know (Infinity when never observed). */
async function remainingToday(nowMs) {
    // This instance's own reading, when recent, is the freshest.
    if (apisports_1.quotaState.observedAt > 0 && nowMs - apisports_1.quotaState.observedAt < 120_000 && Number.isFinite(apisports_1.quotaState.remainingDay)) {
        return apisports_1.quotaState.remainingDay;
    }
    const q = await (0, store_1.loadQuota)().catch(() => null);
    if (!q)
        return Number.POSITIVE_INFINITY;
    // A reading from yesterday means nothing was spent yet today.
    return sameUtcDay(q.at, nowMs) ? q.remainingDay : (q.limitDay || Number.POSITIVE_INFINITY);
}
async function budgetAllows(cost, nowMs) {
    const remaining = await remainingToday(nowMs);
    return remaining - cost >= onDemandReserve(nowMs);
}
async function persistQuota() {
    if (apisports_1.quotaState.observedAt > 0 && Number.isFinite(apisports_1.quotaState.remainingDay)) {
        await (0, store_1.saveQuota)({ limitDay: apisports_1.quotaState.limitDay, remainingDay: apisports_1.quotaState.remainingDay, at: apisports_1.quotaState.observedAt })
            .catch(() => { });
    }
}
/**
 * Read-through cache for one Firestore document.
 *  - fresh doc → returned as is (no provider call);
 *  - otherwise `build` runs (if the quota reserve allows `cost` calls) and the
 *    result is stored with its TTL;
 *  - on a provider failure or an exhausted budget the stale doc is returned
 *    when there is one.
 */
async function cached(path, nowMs, cost, build) {
    const ref = admin_init_1.db.doc(path);
    const snap = await ref.get();
    const prev = (snap.exists ? snap.data() : null);
    if (prev && !(0, freshness_1.isExpired)(prev, nowMs))
        return prev;
    if (!(await budgetAllows(cost, nowMs))) {
        if (prev)
            return prev;
        logger.warn('fbOnDemand: quota reserve reached', { path, cost, reserve: onDemandReserve(nowMs) });
        throw new https_1.HttpsError('resource-exhausted', 'Daily data budget reached — try again later.');
    }
    let built;
    try {
        built = await build(prev);
    }
    catch (err) {
        await persistQuota();
        if (err instanceof https_1.HttpsError) {
            if (prev && err.code !== 'not-found' && err.code !== 'invalid-argument')
                return prev;
            throw err;
        }
        if (prev) {
            logger.warn('fbOnDemand: provider failed, serving stale', { path, err: String(err) });
            return prev;
        }
        logger.error('fbOnDemand: provider failed', { path, err: String(err) });
        throw new https_1.HttpsError('unavailable', 'Could not load this right now.');
    }
    const doc = { ...built.doc, fetchedAt: nowMs, expiresAt: nowMs + built.ttlMs };
    await ref.set({ ...doc, updatedAt: admin_init_1.admin.firestore.Timestamp.now() });
    await persistQuota();
    return doc;
}
// ── Input validation ─────────────────────────────────────────────────────────
function idParam(v, name) {
    const n = typeof v === 'string' && /^\d{1,9}$/.test(v) ? Number(v) : v;
    if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0 || n > 999_999_999) {
        throw new https_1.HttpsError('invalid-argument', `${name} must be a positive integer`);
    }
    return n;
}
function seasonParam(v, nowMs) {
    const n = idParam(v, 'season');
    const maxYear = new Date(nowMs).getUTCFullYear() + 1;
    if (n < 2008 || n > maxYear)
        throw new https_1.HttpsError('invalid-argument', 'season out of range');
    return n;
}
/** Lowercase ASCII letters/digits/spaces — the only characters API-Sports' search accepts. */
function normalizeSearch(raw) {
    if (typeof raw !== 'string')
        return '';
    return raw
        .normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ').trim().slice(0, 40);
}
// ── League catalog (current season per league) ───────────────────────────────
let catalogCache = null;
async function loadCatalog(nowMs) {
    if (catalogCache && nowMs - catalogCache.at < 30 * 60_000)
        return catalogCache.leagues;
    const s = await admin_init_1.db.doc(`${store_1.COL.meta}/leagueCatalog`).get();
    const leagues = (s.exists ? s.data()?.leagues : undefined) ?? {};
    catalogCache = { at: nowMs, leagues };
    return leagues;
}
/** A season other than the league's current one is over: cache it for long. */
async function isPastSeason(leagueId, season, nowMs) {
    const cur = (await loadCatalog(nowMs))[String(leagueId)]?.s;
    return typeof cur === 'number' && season < cur;
}
async function readMatch(id) {
    const [m, d] = await admin_init_1.db.getAll(admin_init_1.db.doc(`${store_1.COL.matches}/${id}`), admin_init_1.db.doc(`${store_1.COL.details}/${id}`));
    return {
        match: (m.exists ? m.data() : null),
        detail: (d.exists ? d.data() : null),
    };
}
/**
 * Make sure `fb_matches/{id}` and `fb_match_details/{id}` exist and are as
 * fresh as the shared rules ask. Matches of priority leagues are enriched by
 * the live poller; this covers everything else (minor leagues, fixtures older
 * than the sync window, lineups before kickoff).
 */
async function ensureMatch(id, nowMs) {
    const cur = await readMatch(id);
    if (!(0, freshness_1.matchDetailNeedsFetch)(cur.match, cur.detail, nowMs))
        return cur;
    if (!(await budgetAllows(1, nowMs)))
        return cur;
    let list;
    try {
        list = await (0, apisports_1.afGet)('/fixtures', { id });
    }
    catch (err) {
        logger.warn('fbOnDemand match: provider failed', { id, err: String(err) });
        await persistQuota();
        return cur;
    }
    const f = list[0];
    if (!f) {
        await persistQuota();
        if (!cur.match)
            throw new https_1.HttpsError('not-found', 'Unknown fixture');
        return cur;
    }
    const nowSec = Math.floor(nowMs / 1000);
    const short = f.fixture.status.short;
    const row = (0, mapping_1.mapFixtureToMatch)(f, { nowSec, prevClock: cur.match?.liveClock ?? null });
    const detail = {
        ...(0, mapping_1.mapFixtureToDetail)(f, cur.detail?.pressure ?? null),
        fetchedAt: nowMs,
    };
    const batch = admin_init_1.db.batch();
    const stamp = admin_init_1.admin.firestore.Timestamp.now();
    batch.set(admin_init_1.db.doc(`${store_1.COL.details}/${id}`), { ...detail, updatedAt: stamp }, { merge: true });
    // The live poller owns the rows of matches in play (score, minute, clock
    // anchor); only write the row when it isn't live or doesn't exist yet.
    const writeRow = !cur.match || !(0, mapping_1.isLiveShort)(short);
    if (writeRow)
        batch.set(admin_init_1.db.doc(`${store_1.COL.matches}/${id}`), { ...row, updatedAt: stamp }, { merge: true });
    await batch.commit();
    await persistQuota();
    return { match: writeRow ? row : cur.match, detail };
}
// ── matchPreview ─────────────────────────────────────────────────────────────
async function ensureVenue(venueId, nowMs) {
    if (!venueId)
        return null;
    try {
        const doc = await cached(`${store_1.COL.venues}/${venueId}`, nowMs, 1, async () => {
            const list = await (0, apisports_1.afGet)('/venues', { id: venueId });
            const v = (0, on_demand_mapping_1.mapVenue)(list[0]);
            if (!v)
                throw new https_1.HttpsError('not-found', 'Unknown venue');
            return { doc: v, ttlMs: freshness_1.FbTtl.venue };
        });
        const { fetchedAt: _f, expiresAt: _e, ...venue } = doc;
        return venue;
    }
    catch {
        return null; // a missing stadium card must not break the preview
    }
}
async function ensureMatchPreview(id, nowMs) {
    const path = `${store_1.COL.previews}/${id}`;
    // Cheap freshness check first — most calls end here without touching the match row.
    const existing = (await admin_init_1.db.doc(path).get()).data();
    if (existing && !(0, freshness_1.isExpired)(existing, nowMs))
        return existing;
    let { match } = await readMatch(id);
    if (!match)
        match = (await ensureMatch(id, nowMs)).match;
    if (!match)
        throw new https_1.HttpsError('not-found', 'Unknown fixture');
    const row = match;
    const homeId = Number(row.homeTeam.id);
    const awayId = Number(row.awayTeam.id);
    const started = (0, mapping_1.isLiveShort)(row.statusShort) || (0, mapping_1.isFinishedShort)(row.statusShort);
    // A preview that already exists is frozen once the ball rolls: no provider call.
    if (existing && started) {
        const frozen = { ...existing, expiresAt: nowMs + (0, freshness_1.matchPreviewTtlMs)(row, nowMs) };
        await admin_init_1.db.doc(path).set({ expiresAt: frozen.expiresAt }, { merge: true });
        return frozen;
    }
    // Form "as of now" is only meaningful around the match itself.
    const formRelevant = row.timestamp * 1000 > nowMs - 2 * DAY_MS;
    return cached(path, nowMs, 4, async (prev) => {
        const formFresh = !!prev && nowMs - (prev.formFetchedAt ?? 0) < 12 * 3_600_000;
        const wantForm = formRelevant && !formFresh;
        const [pred, injuries, homeLast, awayLast, venue] = await Promise.all([
            (0, apisports_1.afGet)('/predictions', { fixture: id }).catch(() => []),
            (0, apisports_1.afGet)('/injuries', { fixture: id }).catch(() => []),
            wantForm ? (0, apisports_1.afGet)('/fixtures', { team: homeId, last: 6 }).catch(() => null) : Promise.resolve(null),
            wantForm ? (0, apisports_1.afGet)('/fixtures', { team: awayId, last: 6 }).catch(() => null) : Promise.resolve(null),
            ensureVenue(row.venueId, nowMs),
        ]);
        const beforeThis = (list) => (list ?? []).filter(f => f.fixture.id !== id && f.fixture.timestamp < row.timestamp);
        const form = {
            home: homeLast ? (0, on_demand_mapping_1.mapForm)(beforeThis(homeLast), homeId) : (prev?.form.home ?? []),
            away: awayLast ? (0, on_demand_mapping_1.mapForm)(beforeThis(awayLast), awayId) : (prev?.form.away ?? []),
        };
        return {
            doc: {
                matchId: String(id),
                homeTeamId: row.homeTeam.id,
                awayTeamId: row.awayTeam.id,
                h2h: (0, on_demand_mapping_1.mapH2H)(beforeThis(pred[0]?.h2h), id),
                absences: (0, on_demand_mapping_1.mapAbsences)(injuries, homeId),
                prediction: (0, on_demand_mapping_1.mapPrediction)(pred[0]),
                form,
                formFetchedAt: homeLast || awayLast ? nowMs : (prev?.formFetchedAt ?? 0),
                venue,
            },
            ttlMs: (0, freshness_1.matchPreviewTtlMs)(row, nowMs),
        };
    });
}
// ── team ─────────────────────────────────────────────────────────────────────
async function ensureTeam(id, nowMs) {
    return cached(`${store_1.COL.teams}/${id}`, nowMs, 4, async () => {
        const [teams, squads, coaches, leagues] = await Promise.all([
            (0, apisports_1.afGet)('/teams', { id }),
            (0, apisports_1.afGet)('/players/squads', { team: id }).catch(() => []),
            (0, apisports_1.afGet)('/coachs', { team: id }).catch(() => []),
            (0, apisports_1.afGet)('/leagues', { team: id, current: 'true' }).catch(() => []),
        ]);
        if (!teams[0])
            throw new https_1.HttpsError('not-found', 'Unknown team');
        return { doc: (0, on_demand_mapping_1.mapTeam)(teams[0], squads[0], coaches, leagues, nowMs), ttlMs: freshness_1.FbTtl.team };
    });
}
async function ensureTeamFixtures(id, seasonArg, nowMs) {
    // The season that matters depends on the team's league (calendar-year vs
    // split-year), so it comes from the team doc unless the caller names one.
    const season = seasonArg ?? (await ensureTeam(id, nowMs)).season ?? new Date(nowMs).getUTCFullYear();
    return cached(`${store_1.COL.teamFixtures}/${id}_${season}`, nowMs, 1, async () => {
        const list = await (0, apisports_1.afGet)('/fixtures', { team: id, season });
        const nowSec = Math.floor(nowMs / 1000);
        const { rows } = (0, on_demand_mapping_1.capFixtures)(list.map(f => (0, on_demand_mapping_1.toFixtureLite)(f, true)), MAX_SEASON_FIXTURES, nowSec);
        const last = rows[rows.length - 1]?.timestamp ?? 0;
        const over = rows.length > 0 && rows.every(r => (0, mapping_1.isFinishedShort)(r.statusShort)) && nowSec - last > 45 * 86_400;
        return {
            doc: { teamId: String(id), season, fixtures: rows },
            ttlMs: over ? freshness_1.FbTtl.finishedSeason : rows.length ? freshness_1.FbTtl.teamFixtures : freshness_1.FbTtl.empty,
        };
    });
}
async function ensureTeamStats(id, leagueId, season, nowMs) {
    return cached(`${store_1.COL.teamStats}/${id}_${leagueId}_${season}`, nowMs, 1, async () => {
        // This endpoint answers with an object (or an empty array when it has nothing).
        const res = await (0, apisports_1.afGet)('/teams/statistics', { team: id, league: leagueId, season });
        if (Array.isArray(res) || !res?.team?.id)
            throw new https_1.HttpsError('not-found', 'No statistics for this team/league/season');
        const past = await isPastSeason(leagueId, season, nowMs);
        return { doc: (0, on_demand_mapping_1.mapTeamStats)(res), ttlMs: past ? freshness_1.FbTtl.finishedSeason : freshness_1.FbTtl.teamStats };
    });
}
// ── player / coach / venue ───────────────────────────────────────────────────
async function ensurePlayer(id, nowMs) {
    return cached(`${store_1.COL.players}/${id}`, nowMs, 3, async () => {
        // API-Sports labels a season by its starting year, so "this year and the
        // one before" always covers the running season of every league.
        const y = new Date(nowMs).getUTCFullYear();
        const seasons = [y, y - 1];
        const [cur, prevSeason, teams] = await Promise.all([
            (0, apisports_1.afGet)('/players', { id, season: seasons[0] }).catch(() => []),
            (0, apisports_1.afGet)('/players', { id, season: seasons[1] }).catch(() => []),
            (0, apisports_1.afGet)('/players/teams', { player: id }).catch(() => []),
        ]);
        const entries = [...cur, ...prevSeason];
        let profile = entries[0]?.player;
        if (!profile) {
            // No statistics in the last two seasons (retired, or a league without
            // player coverage) — the profile endpoint still knows who this is.
            const list = await (0, apisports_1.afGet)('/players/profiles', { player: id });
            profile = list[0]?.player;
        }
        const doc = (0, on_demand_mapping_1.mapPlayer)(entries, profile, teams, seasons);
        if (!doc)
            throw new https_1.HttpsError('not-found', 'Unknown player');
        return { doc, ttlMs: freshness_1.FbTtl.player };
    });
}
async function ensureCoach(id, nowMs) {
    return cached(`${store_1.COL.coaches}/${id}`, nowMs, 1, async () => {
        const list = await (0, apisports_1.afGet)('/coachs', { id });
        if (!list[0])
            throw new https_1.HttpsError('not-found', 'Unknown coach');
        return { doc: (0, on_demand_mapping_1.mapCoach)(list[0]), ttlMs: freshness_1.FbTtl.coach };
    });
}
// ── league ───────────────────────────────────────────────────────────────────
async function ensureLeague(id, nowMs) {
    return cached(`${store_1.COL.leagues}/${id}`, nowMs, 1, async () => {
        const list = await (0, apisports_1.afGet)('/leagues', { id });
        if (!list[0])
            throw new https_1.HttpsError('not-found', 'Unknown league');
        return { doc: (0, on_demand_mapping_1.mapLeague)(list[0]), ttlMs: freshness_1.FbTtl.league };
    });
}
async function ensureLeagueFixtures(id, season, nowMs) {
    return cached(`${store_1.COL.leagueFixtures}/${id}_${season}`, nowMs, 1, async () => {
        const list = await (0, apisports_1.afGet)('/fixtures', { league: id, season });
        const nowSec = Math.floor(nowMs / 1000);
        const { rows, truncated } = (0, on_demand_mapping_1.capFixtures)(list.map(f => (0, on_demand_mapping_1.toFixtureLite)(f, false)), MAX_SEASON_FIXTURES, nowSec);
        const past = await isPastSeason(id, season, nowMs);
        return {
            doc: { leagueId: String(id), season, fixtures: rows, truncated },
            ttlMs: past ? freshness_1.FbTtl.finishedSeason : rows.length ? freshness_1.FbTtl.leagueFixtures : freshness_1.FbTtl.empty,
        };
    });
}
/** Docs kept fresh by a schedule carry no `expiresAt`; trust them for a day. */
function scheduledDocFresh(doc, nowMs) {
    const ts = doc?.updatedAt;
    const at = typeof ts?.toMillis === 'function' ? ts.toMillis() : 0;
    return at > 0 && nowMs - at < 36 * 3_600_000;
}
async function ensureStandings(id, season, nowMs) {
    const path = `${store_1.COL.standings}/${id}_${season}`;
    const snap = await admin_init_1.db.doc(path).get();
    const prev = (snap.exists ? snap.data() : null);
    const cat = (await loadCatalog(nowMs))[String(id)];
    const scheduled = (leagues_1.LEAGUE_POPULARITY[id] ?? 0) >= 20 && cat?.s === season;
    if (prev && typeof prev.expiresAt === 'number' && prev.expiresAt > nowMs)
        return prev;
    // Tables of priority leagues are refreshed by fbSyncStandings / fbDailyLeagues.
    if (prev && scheduled && scheduledDocFresh(prev, nowMs))
        return prev;
    if (!(await budgetAllows(1, nowMs))) {
        if (prev)
            return prev;
        throw new https_1.HttpsError('resource-exhausted', 'Daily data budget reached — try again later.');
    }
    let doc;
    try {
        const res = await (0, apisports_1.afGet)('/standings', { league: id, season });
        doc = res[0] ? (0, mapping_1.mapStandings)(res[0]) : { leagueId: String(id), season, groups: [] };
    }
    catch (err) {
        await persistQuota();
        if (prev)
            return prev;
        logger.warn('fbOnDemand standings: provider failed', { id, season, err: String(err) });
        throw new https_1.HttpsError('unavailable', 'Could not load this right now.');
    }
    const past = typeof cat?.s === 'number' && season < cat.s;
    const ttl = past ? freshness_1.FbTtl.finishedSeason : doc.groups.length ? freshness_1.FbTtl.standings : freshness_1.FbTtl.empty;
    const out = { ...doc, fetchedAt: nowMs, expiresAt: nowMs + ttl };
    await admin_init_1.db.doc(path).set({ ...out, updatedAt: admin_init_1.admin.firestore.Timestamp.now() });
    await persistQuota();
    return out;
}
async function ensureTopPlayers(id, season, nowMs) {
    const path = `${store_1.COL.topscorers}/${id}_${season}`;
    const snap = await admin_init_1.db.doc(path).get();
    const prev = (snap.exists ? snap.data() : null);
    const cat = (await loadCatalog(nowMs))[String(id)];
    const scheduled = (leagues_1.LEAGUE_POPULARITY[id] ?? 0) >= 50 && cat?.s === season;
    if (prev && typeof prev.expiresAt === 'number' && prev.expiresAt > nowMs)
        return prev;
    if (prev && scheduled && scheduledDocFresh(prev, nowMs))
        return prev;
    if (!(await budgetAllows(3, nowMs))) {
        if (prev)
            return prev;
        throw new https_1.HttpsError('resource-exhausted', 'Daily data budget reached — try again later.');
    }
    let body;
    try {
        const [scorers, assists, yellows] = await Promise.all([
            (0, apisports_1.afGet)('/players/topscorers', { league: id, season }),
            (0, apisports_1.afGet)('/players/topassists', { league: id, season }).catch(() => []),
            (0, apisports_1.afGet)('/players/topyellowcards', { league: id, season }).catch(() => []),
        ]);
        body = {
            leagueId: String(id), season,
            scorers: (0, mapping_1.mapTopPlayers)(scorers, 'goals'),
            assists: (0, mapping_1.mapTopPlayers)(assists, 'assists'),
            yellowCards: (0, mapping_1.mapTopPlayers)(yellows, 'yellow'),
        };
    }
    catch (err) {
        await persistQuota();
        if (prev)
            return prev;
        logger.warn('fbOnDemand topPlayers: provider failed', { id, season, err: String(err) });
        throw new https_1.HttpsError('unavailable', 'Could not load this right now.');
    }
    const past = typeof cat?.s === 'number' && season < cat.s;
    const empty = !body.scorers.length && !body.assists.length && !body.yellowCards.length;
    const ttl = past ? freshness_1.FbTtl.finishedSeason : empty ? freshness_1.FbTtl.empty : freshness_1.FbTtl.topPlayers;
    const out = { ...body, fetchedAt: nowMs, expiresAt: nowMs + ttl };
    await admin_init_1.db.doc(path).set({ ...out, updatedAt: admin_init_1.admin.firestore.Timestamp.now() });
    await persistQuota();
    return out;
}
// ── search ───────────────────────────────────────────────────────────────────
async function ensureSearch(rawQuery, nowMs) {
    const q = normalizeSearch(rawQuery);
    if (q.length < 3)
        throw new https_1.HttpsError('invalid-argument', 'search needs at least 3 letters');
    const key = q.replace(/ /g, '_');
    return cached(`${store_1.COL.search}/${key}`, nowMs, 2, async () => {
        const tokens = q.split(' ').filter(t => t.length >= 3);
        // API-Sports matches players by surname: search the last usable word and
        // rank by how many of the other words also appear in the full name.
        const playerTerm = tokens[tokens.length - 1] ?? q;
        const [teams, players] = await Promise.all([
            (0, apisports_1.afGet)('/teams', { search: q }).catch(() => []),
            (0, apisports_1.afGet)('/players/profiles', { search: playerTerm }).catch(() => []),
        ]);
        const words = q.split(' ');
        const score = (e) => {
            const full = normalizeSearch(`${e.player.firstname ?? ''} ${e.player.lastname ?? ''} ${e.player.name ?? ''}`);
            return words.filter(w => full.includes(w)).length;
        };
        const ranked = players
            .map((e, i) => ({ e, i, s: score(e) }))
            .filter(x => x.s > 0)
            .sort((a, b) => b.s - a.s || a.i - b.i)
            .map(x => x.e);
        // Team search also matches the country ("mexico" → every Mexican club):
        // name matches first, the rest in API order.
        const byName = (e) => (normalizeSearch(e.team.name).includes(q) ? 0 : 1);
        const teamRows = [...teams].sort((a, b) => byName(a) - byName(b));
        const doc = { q, teams: (0, on_demand_mapping_1.mapSearchTeams)(teamRows), players: (0, on_demand_mapping_1.mapSearchPlayers)(ranked) };
        const empty = !doc.teams.length && !doc.players.length;
        return { doc, ttlMs: empty ? freshness_1.FbTtl.empty : freshness_1.FbTtl.search };
    });
}
function asciiWords(s) {
    return normalizeSearch(s ?? '').split(' ').filter(w => w.length >= 3);
}
/**
 * Find the API-Sports player for a Sportmonks player id, using the Sportmonks
 * profile archived in Firestore `players/{id}` (surname + date of birth; the
 * current club's squad as a tie-breaker). Returns null when there is no
 * confident match — a wrong player would be worse than none.
 */
async function resolveLegacyPlayer(smId) {
    const snap = await admin_init_1.db.doc(`players/${smId}`).get();
    const raw = (snap.exists ? snap.data()?.raw : null);
    if (!raw)
        return { afId: null, name: null };
    const name = raw.display_name || raw.common_name || raw.name || null;
    const dob = (raw.date_of_birth ?? '').slice(0, 10);
    const surnameWords = asciiWords(raw.lastname).length ? asciiWords(raw.lastname) : asciiWords(raw.name).slice(-1);
    const firstWords = asciiWords(raw.firstname);
    if (!surnameWords.length)
        return { afId: null, name };
    const matches = (p) => {
        if (dob && p.birth?.date)
            return p.birth.date === dob;
        return false;
    };
    if (dob) {
        for (const term of [...new Set([surnameWords[0], surnameWords[surnameWords.length - 1]])]) {
            for (let page = 1; page <= 3; page++) {
                const list = await (0, apisports_1.afGet)('/players/profiles', { search: term, page })
                    .catch(() => []);
                const hits = list.filter(e => matches(e.player));
                if (hits.length === 1)
                    return { afId: String(hits[0].player.id), name };
                if (hits.length > 1) {
                    // Same surname and birthday (twins, namesakes): the first name decides.
                    const byFirst = hits.filter(e => asciiWords(e.player.firstname ?? '').some(w => firstWords.includes(w)));
                    if (byFirst.length === 1)
                        return { afId: String(byFirst[0].player.id), name };
                    return { afId: null, name };
                }
                if (list.length < 250)
                    break;
            }
        }
    }
    // No birthday match: look for the surname in his current club's squad.
    const today = new Date().toISOString().slice(0, 10);
    const club = (raw.teams ?? []).find(t => t.team?.type !== 'national' && (t.active === true || !t.end || t.end > today));
    const afTeam = club?.team_id ? (0, legacy_1.mapLegacyTeamId)(club.team_id) : undefined;
    if (afTeam) {
        const squads = await (0, apisports_1.afGet)('/players/squads', { team: afTeam }).catch(() => []);
        const hits = (squads[0]?.players ?? []).filter(p => {
            const words = asciiWords(p.name);
            return surnameWords.some(w => words.includes(w));
        });
        if (hits.length === 1)
            return { afId: String(hits[0].id), name };
    }
    return { afId: null, name };
}
async function mapLegacyPlayers(idsArg, nowMs) {
    if (!Array.isArray(idsArg) || idsArg.length === 0 || idsArg.length > 40) {
        throw new https_1.HttpsError('invalid-argument', 'ids must be 1-40 player ids');
    }
    const ids = [...new Set(idsArg.map(v => String(idParam(v, 'id'))))];
    const out = {};
    const pending = [];
    for (const id of ids) {
        const fixed = LEGACY_PLAYER_MAP[id];
        if (fixed)
            out[id] = String(fixed);
        else
            pending.push(id);
    }
    if (pending.length) {
        const snaps = await admin_init_1.db.getAll(...pending.map(id => admin_init_1.db.doc(`${store_1.COL.legacyPlayers}/${id}`)));
        const todo = [];
        snaps.forEach((s, i) => {
            const d = (s.exists ? s.data() : null);
            // Failed lookups are retried after a week (the provider adds players over time).
            if (d && (d.afId || nowMs - d.resolvedAt < 7 * DAY_MS))
                out[pending[i]] = d.afId;
            else
                todo.push(pending[i]);
        });
        for (const id of todo) {
            if (!(await budgetAllows(3, nowMs)))
                break; // leave the rest for a later launch
            let res;
            try {
                res = await resolveLegacyPlayer(id);
            }
            catch (err) {
                logger.warn('fbOnDemand legacyPlayers: lookup failed', { id, err: String(err) });
                continue;
            }
            const doc = { smId: id, afId: res.afId, name: res.name, resolvedAt: nowMs };
            await admin_init_1.db.doc(`${store_1.COL.legacyPlayers}/${id}`).set(doc);
            out[id] = res.afId;
        }
        await persistQuota();
    }
    return out;
}
// ── Dispatcher ───────────────────────────────────────────────────────────────
const KINDS = new Set([
    'match', 'matchPreview', 'team', 'teamFixtures', 'teamStats', 'player', 'coach', 'venue',
    'league', 'leagueFixtures', 'standings', 'topPlayers', 'search', 'legacyPlayers',
]);
/** Route one request. Always resolves to `{ kind, data }` or throws an HttpsError. */
async function handleOnDemand(req, nowMs = Date.now()) {
    const kind = req?.kind;
    if (typeof kind !== 'string' || !KINDS.has(kind))
        throw new https_1.HttpsError('invalid-argument', 'unknown kind');
    const r = req;
    const season = () => seasonParam(r.season, nowMs);
    switch (kind) {
        case 'match':
            return { kind, data: await ensureMatch(idParam(r.id, 'id'), nowMs) };
        case 'matchPreview':
            return { kind, data: await ensureMatchPreview(idParam(r.id, 'id'), nowMs) };
        case 'team':
            return { kind, data: await ensureTeam(idParam(r.id, 'id'), nowMs) };
        case 'teamFixtures':
            return { kind, data: await ensureTeamFixtures(idParam(r.id, 'id'), r.season === undefined || r.season === null ? undefined : season(), nowMs) };
        case 'teamStats':
            return { kind, data: await ensureTeamStats(idParam(r.id, 'id'), idParam(r.leagueId, 'leagueId'), season(), nowMs) };
        case 'player':
            return { kind, data: await ensurePlayer(idParam(r.id, 'id'), nowMs) };
        case 'coach':
            return { kind, data: await ensureCoach(idParam(r.id, 'id'), nowMs) };
        case 'venue': {
            const v = await ensureVenue(idParam(r.id, 'id'), nowMs);
            if (!v)
                throw new https_1.HttpsError('not-found', 'Unknown venue');
            return { kind, data: v };
        }
        case 'league':
            return { kind, data: await ensureLeague(idParam(r.id, 'id'), nowMs) };
        case 'leagueFixtures':
            return { kind, data: await ensureLeagueFixtures(idParam(r.id, 'id'), season(), nowMs) };
        case 'standings':
            return { kind, data: await ensureStandings(idParam(r.id, 'id'), season(), nowMs) };
        case 'topPlayers':
            return { kind, data: await ensureTopPlayers(idParam(r.id, 'id'), season(), nowMs) };
        case 'search':
            return { kind, data: await ensureSearch(r.q, nowMs) };
        case 'legacyPlayers':
            return { kind, data: await mapLegacyPlayers(r.ids, nowMs) };
    }
}
/** Callable results must be plain JSON: drop Firestore Timestamps (`updatedAt`). */
function toPlain(value) {
    return JSON.parse(JSON.stringify(value, (k, v) => (k === 'updatedAt' ? undefined : v)));
}
//# sourceMappingURL=on-demand.js.map