"use strict";
/**
 * football/sync-fixtures.ts
 *
 * Keeps `fb_matches` filled with every fixture API-Sports has for a rolling
 * window (yesterday … +14 days), all leagues. One `/fixtures?date=` call per
 * date returns every league at once (no pagination), so cost depends only on
 * how often each date is refreshed:
 *
 *   today              every run (5 min)   → 288 calls/day
 *   yesterday/tomorrow every 30 min        →  96
 *   +2 … +7            every 6 h           →  24
 *   +8 … +14           once a day          →   7
 *                                            ≈ 415 calls/day
 *
 * Live fixtures are skipped here — the live poller owns them (fresher data and
 * a stable clock anchor). Rows are only written when their fingerprint changed.
 * The run also rebuilds the "live gate" the poller reads to know when to wake.
 *
 * Kickoff delays: API-Sports has no "delayed" status — a delay shows up as a
 * NEW kickoff time (status still NS), a postponement as NS → PST. Both are
 * detected here by comparing with the previous run (the per-date fingerprint
 * stores "hash:kickoff:status") and pushed as `kickoffDelayed` to the
 * followers of both teams when the original kickoff was within 8 h.
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
exports.datesForRun = datesForRun;
exports.formatDelay = formatDelay;
exports.kickoffDelayFor = kickoffDelayFor;
exports.syncFootballFixtures = syncFootballFixtures;
const logger = __importStar(require("firebase-functions/logger"));
const apisports_1 = require("./apisports");
const mapping_1 = require("./mapping");
const notify_1 = require("./notify");
const store_1 = require("./store");
function dateUtc(offsetDays, nowMs) {
    const d = new Date(nowMs);
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d.toISOString().slice(0, 10);
}
/** Which day offsets to refresh on this run. Pure — exported for tests. */
function datesForRun(nowMs) {
    const minuteOfDay = Math.floor((nowMs % 86_400_000) / 60_000);
    const out = [0];
    if (minuteOfDay % 30 < 5)
        out.push(-1, 1);
    if (minuteOfDay % 360 < 5)
        out.push(2, 3, 4, 5, 6, 7);
    if (minuteOfDay < 5 || (minuteOfDay >= 720 && minuteOfDay < 725))
        out.push(8, 9, 10, 11, 12, 13, 14);
    return out;
}
const MIN_DELAY_SEC = 5 * 60;
const MAX_DELAY_SEC = 8 * 3600;
const IMMINENT_SEC = 8 * 3600;
/** "1 h", "1 h 30 min", "45 min" — timezone-free delay text. */
function formatDelay(sec) {
    const total = Math.round(sec / 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h > 0 && m > 0)
        return `${h} h ${m} min`;
    if (h > 0)
        return `${h} h`;
    return `${m} min`;
}
/** Fingerprint record stored per fixture: "hash:kickoffUnix:statusShort". */
function fpRecord(hash, ts, short) {
    return `${hash}:${ts}:${short}`;
}
function parseFp(rec) {
    if (!rec)
        return null;
    const [hash, ts, short] = rec.split(':');
    return { hash, ts: Number(ts) || 0, short: short ?? '' };
}
/** Delay / postponement of an imminent match vs the previous run. Pure — exported for tests. */
function kickoffDelayFor(old, cur, nowSec) {
    if (!old || !old.ts)
        return null;
    const wasPending = old.short === 'NS' || old.short === 'TBD';
    if (!wasPending)
        return null;
    const imminent = old.ts - nowSec < IMMINENT_SEC && old.ts - nowSec > -3 * 3600;
    if (!imminent)
        return null;
    if (cur.short === 'PST')
        return 'postponed';
    if (cur.short !== 'NS' && cur.short !== 'TBD')
        return null;
    const delta = cur.ts - old.ts;
    if (delta < MIN_DELAY_SEC || delta > MAX_DELAY_SEC)
        return null;
    return formatDelay(delta);
}
async function syncFootballFixtures(explicitDates, nowMs = Date.now()) {
    const nowSec = Math.floor(nowMs / 1000);
    const dates = explicitDates?.length ? explicitDates : datesForRun(nowMs).map(o => dateUtc(o, nowMs));
    const gate = {};
    let fixturesSeen = 0;
    let written = 0;
    const delayChanges = [];
    const failed = [];
    for (const date of dates) {
        let list;
        try {
            list = await (0, apisports_1.afGet)('/fixtures', { date, timezone: 'UTC' });
        }
        catch (err) {
            logger.error(`fbSyncFixtures: ${date} failed`, { err: String(err) });
            failed.push(date);
            continue;
        }
        fixturesSeen += list.length;
        const fp = await (0, store_1.loadDateFingerprints)(date);
        const nextFp = {};
        const writes = [];
        const gateEntries = [];
        for (const f of list) {
            const id = String(f.fixture.id);
            const short = f.fixture.status.short;
            const doc = (0, mapping_1.mapFixtureToMatch)(f, { nowSec });
            if (!(0, mapping_1.isFinishedShort)(short) && short !== 'CANC' && short !== 'PST') {
                gateEntries.push([f.fixture.timestamp, doc.popularity, f.fixture.id]);
            }
            if ((0, mapping_1.isLiveShort)(short)) {
                if (fp[id])
                    nextFp[id] = fp[id];
                continue;
            }
            const row = (0, mapping_1.omitRedCardsWhenUnknown)(doc, false);
            const hash = (0, store_1.rowHash)(row);
            const prev = parseFp(fp[id]);
            nextFp[id] = fpRecord(hash, f.fixture.timestamp, short);
            const delay = kickoffDelayFor(prev, { ts: f.fixture.timestamp, short }, nowSec);
            if (delay) {
                delayChanges.push({
                    type: 'kickoffDelayed', matchId: id, homeTeam: doc.homeTeam, awayTeam: doc.awayTeam,
                    homeScore: 0, awayScore: 0, league: doc.league, leagueId: doc.leagueId,
                    popularity: doc.popularity, delay,
                });
            }
            if (prev?.hash === hash)
                continue;
            writes.push((0, store_1.matchWrite)({ ...row, id }));
        }
        if (writes.length)
            await (0, store_1.commitSets)(writes);
        written += writes.length;
        await (0, store_1.saveDateFingerprints)(date, nextFp);
        gate[date] = gateEntries;
    }
    // Gate keeps yesterday … tomorrow (matches past midnight UTC still count).
    const keep = [-1, 0, 1].map(o => dateUtc(o, nowMs));
    const gateUpdate = Object.fromEntries(Object.entries(gate).filter(([d]) => keep.includes(d)));
    if (Object.keys(gateUpdate).length)
        await (0, store_1.saveLiveGateDates)(gateUpdate, keep);
    if (apisports_1.quotaState.observedAt > 0 && Number.isFinite(apisports_1.quotaState.remainingDay)) {
        await (0, store_1.saveQuota)({ limitDay: apisports_1.quotaState.limitDay, remainingDay: apisports_1.quotaState.remainingDay, at: apisports_1.quotaState.observedAt })
            .catch(() => { });
    }
    if (delayChanges.length) {
        await (0, notify_1.dispatchFootballChanges)(delayChanges).catch(err => logger.warn('fbSyncFixtures: delay pushes failed', { err: String(err) }));
    }
    logger.info('fbSyncFixtures: done', {
        dates, fixtures: fixturesSeen, written, delays: delayChanges.length, remainingDay: apisports_1.quotaState.remainingDay,
    });
    return { dates, fixtures: fixturesSeen, written, delays: delayChanges.length, failed };
}
//# sourceMappingURL=sync-fixtures.js.map