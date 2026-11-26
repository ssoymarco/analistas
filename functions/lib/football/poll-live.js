"use strict";
/**
 * football/poll-live.ts
 *
 * The live engine. Scheduled every minute; inside one invocation it polls
 * `/fixtures?live=all` 1-4 times depending on what's being played:
 *
 *   top league live (popularity ≥ 75: Liga MX, Premier, LaLiga, MLS, UCL…) → every 15 s
 *   priority league live (≥ 20)                                         → every 30 s
 *   only minor leagues live                                             → every 60 s
 *   nothing live or about to start                                      → no API call
 *
 * API-Sports refreshes live data every ~15 s, so polling faster buys nothing.
 * At peak (busy Saturday) this costs ~4 calls/min; with enrichment and the
 * fixtures sync the daily total stays well inside the Pro plan's 7,500.
 *
 * Per poll:
 *   1. live feed (1 call) + re-fetch of matches that just left the feed
 *      (finished/abandoned — 1 call per 20). A match that left the feed while
 *      still "in play" (storm suspension) is re-checked every 5 min for up to
 *      3 h so its final whistle still gets a push.
 *   2. diff vs snapshot → changes → push notifications
 *   3. write changed rows to fb_matches; Live Activities updates
 * Once per invocation (first poll):
 *   4. pre-match reminders (Firestore query, no API call)
 *   5. detail enrichment (events/lineups/stats/ratings) for priority matches
 *      via /fixtures?ids= (≤20 per call), "lineups confirmed" pushes (team +
 *      followed players), and post-final settle passes (+2/5/10/20 min) that
 *      pick up late events (stoppage-time scorer, post-whistle red card).
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
exports.decideCadence = decideCadence;
exports.pollFootballLive = pollFootballLive;
const logger = __importStar(require("firebase-functions/logger"));
const admin_init_1 = require("../admin-init");
const apisports_1 = require("./apisports");
const live_detect_1 = require("./live-detect");
const live_activities_1 = require("./live-activities");
const mapping_1 = require("./mapping");
const notify_1 = require("./notify");
const store_1 = require("./store");
const TOP_POPULARITY = 75;
const PRIORITY_POPULARITY = 20;
const DETAIL_EVERY_SEC_TOP = 120;
const DETAIL_EVERY_SEC_PRIORITY = 240;
const LINEUP_CHECK_EVERY_SEC = 300;
const LINEUP_WINDOW_SEC = 75 * 60;
const MAX_DETAIL_BATCHES = 3;
/** Post-final settle passes, seconds after the final whistle. */
const SETTLE_AFTER_SEC = [120, 300, 600, 1200];
/** Matches that left the feed mid-game: re-check cadence and give-up horizon. */
const GONE_RECHECK_SEC = 300;
const GONE_MAX_SEC = 3 * 3600;
const HALTED = new Set(['SUSP', 'INT']);
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
function isInPlayEntry(st) {
    return (0, mapping_1.isLiveShort)(st) || HALTED.has(st);
}
function todayUtc(ms) {
    return new Date(ms).toISOString().slice(0, 10);
}
function settleDue(e, nowSec) {
    if (!e.ft || (e.pp ?? 0) < PRIORITY_POPULARITY)
        return false;
    const done = e.se ?? 0;
    return done < SETTLE_AFTER_SEC.length && nowSec - e.ft >= SETTLE_AFTER_SEC[done];
}
/** Polls to run this minute (0 = skip). Pure — exported for tests. */
function decideCadence(opts) {
    const { nowSec, gate, snapshot, remainingDay, minuteOfDay } = opts;
    let maxPop = -1;
    for (const [ts, pop] of gate) {
        if (nowSec >= ts - 20 * 60 && nowSec <= ts + 150 * 60)
            maxPop = Math.max(maxPop, pop);
    }
    let pendingSettle = false;
    for (const e of Object.values(snapshot)) {
        // Matches that left the feed mid-game are re-checked on their own clock;
        // they don't keep the fast cadence alive.
        if (isInPlayEntry(e.st) && !e.g)
            maxPop = Math.max(maxPop, e.pp ?? 0);
        if (settleDue(e, nowSec) || (e.g && nowSec - (e.gc ?? 0) >= GONE_RECHECK_SEC))
            pendingSettle = true;
    }
    if (maxPop < 0 && !pendingSettle)
        return { polls: 0, maxPop, enrich: false };
    let polls = maxPop >= TOP_POPULARITY ? 4 : maxPop >= PRIORITY_POPULARITY ? 2 : 1;
    let enrich = maxPop >= PRIORITY_POPULARITY || pendingSettle;
    // Quota guard — degrade instead of running dry mid-match.
    if (remainingDay < 20)
        return { polls: 0, maxPop, enrich: false };
    if (remainingDay < 100) {
        polls = minuteOfDay % 2 === 0 ? 1 : 0;
        enrich = false;
    }
    else if (remainingDay < 300) {
        polls = 1;
        enrich = false;
    }
    else if (remainingDay < 800) {
        polls = Math.min(polls, 2);
    }
    return { polls, maxPop, enrich };
}
async function fetchByIds(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += 20) {
        const chunk = ids.slice(i, i + 20);
        const res = await (0, apisports_1.afGet)('/fixtures', { ids: chunk.join('-') });
        out.push(...res);
    }
    return out;
}
/** Scheduled fb_matches rows kicking off within the window (no API call). */
async function loadUpcomingDocs(nowSec, windowSec) {
    const snap = await admin_init_1.db.collection(store_1.COL.matches)
        .where('timestamp', '>', nowSec)
        .where('timestamp', '<=', nowSec + windowSec)
        .get();
    return snap.docs
        .map(d => d.data())
        .filter(d => d.status === 'scheduled' && d.statusShort !== 'PST' && d.statusShort !== 'CANC');
}
function toUpcoming(d) {
    return {
        id: String(d.id), timestamp: d.timestamp, homeTeam: d.homeTeam, awayTeam: d.awayTeam,
        league: d.league, leagueId: String(d.leagueId), leagueCountry: d.leagueCountry,
        popularity: d.popularity ?? 0,
    };
}
async function loadPrevPressure(ids) {
    const m = new Map();
    if (!ids.length)
        return m;
    const snaps = await admin_init_1.db.getAll(...ids.map(id => admin_init_1.db.doc(`${store_1.COL.details}/${id}`)));
    snaps.forEach((s, i) => m.set(ids[i], (s.exists ? s.data().pressure : null) ?? null));
    return m;
}
/** Map rows (keeping the clock anchor stable); queue writes for changed ones. */
function mapRows(fixtures, store, nowSec) {
    const writes = [];
    const docs = [];
    for (const f of fixtures) {
        const id = String(f.fixture.id);
        const entry = store.matches[id];
        const prevClock = entry?.lc ? { periodStartedAt: entry.lc[0], periodMinuteOffset: entry.lc[1] } : null;
        const doc = (0, mapping_1.mapFixtureToMatch)(f, { nowSec, prevClock });
        docs.push(doc);
        if (entry) {
            if (doc.liveClock)
                entry.lc = [doc.liveClock.periodStartedAt, doc.liveClock.periodMinuteOffset];
            else
                delete entry.lc;
        }
        const hash = (0, store_1.rowHash)(doc);
        if (store.fp[id] === hash)
            continue;
        store.fp[id] = hash;
        writes.push((0, store_1.matchWrite)(doc));
    }
    return { writes, docs };
}
function prune(store, nowSec) {
    for (const [id, e] of Object.entries(store.matches)) {
        const age = nowSec - e.ts;
        const stale = ((0, mapping_1.isFinishedShort)(e.st) && age > 4 * 3600 && !settleDue(e, nowSec)) ||
            (e.g !== undefined && nowSec - e.g > GONE_MAX_SEC) ||
            (!isInPlayEntry(e.st) && !(0, mapping_1.isFinishedShort)(e.st) && age > 6 * 3600) ||
            age > 24 * 3600;
        if (stale) {
            delete store.matches[id];
            delete store.fp[id];
            delete store.enrichedAt[id];
        }
    }
    for (const id of Object.keys(store.fp))
        if (!store.matches[id])
            delete store.fp[id];
    for (const id of Object.keys(store.enrichedAt))
        if (!store.matches[id])
            delete store.enrichedAt[id];
}
async function pollFootballLive() {
    if (!(await (0, store_1.acquireLease)('poll', 75_000))) {
        logger.warn('fbPollLive: previous invocation still running — skipping');
        return;
    }
    const startedMs = Date.now();
    const callsBefore = apisports_1.quotaState.callsThisInstance;
    try {
        const [gate, quota, store] = await Promise.all([(0, store_1.loadGateEntries)(), (0, store_1.loadQuota)(), (0, store_1.loadLiveSnapshot)()]);
        const nowSec0 = Math.floor(startedMs / 1000);
        const sameDay = quota && todayUtc(quota.at) === todayUtc(startedMs);
        const remaining = sameDay ? quota.remainingDay : Number.POSITIVE_INFINITY;
        const minuteOfDay = Math.floor((startedMs % 86_400_000) / 60_000);
        const cadence = decideCadence({ nowSec: nowSec0, gate, snapshot: store.matches, remainingDay: remaining, minuteOfDay });
        if (cadence.polls === 0) {
            logger.debug('fbPollLive: idle', { maxPop: cadence.maxPop, remaining });
            // Live Activities still need their orphan catch-up + TTL sweep.
            await (0, live_activities_1.sendLiveActivityUpdates)([], { deepPass: true });
            return;
        }
        const intervalMs = Math.floor(60_000 / cadence.polls);
        let totalChanges = 0;
        for (let i = 0; i < cadence.polls; i++) {
            const pollStart = Date.now();
            const nowSec = Math.floor(pollStart / 1000);
            try {
                totalChanges += await runPoll(store, nowSec, { enrich: i === 0 && cadence.enrich, firstOfMinute: i === 0 });
            }
            catch (err) {
                logger.error(`fbPollLive: poll ${i + 1}/${cadence.polls} failed`, { err: String(err) });
            }
            if (i < cadence.polls - 1) {
                const wait = intervalMs - (Date.now() - pollStart);
                if (wait > 0)
                    await sleep(wait);
            }
        }
        logger.info('fbPollLive: done', {
            polls: cadence.polls, maxPop: cadence.maxPop, changes: totalChanges,
            apiCalls: apisports_1.quotaState.callsThisInstance - callsBefore,
            remainingDay: apisports_1.quotaState.remainingDay, ms: Date.now() - startedMs,
        });
    }
    finally {
        if (apisports_1.quotaState.observedAt > 0 && Number.isFinite(apisports_1.quotaState.remainingDay)) {
            await (0, store_1.saveQuota)({ limitDay: apisports_1.quotaState.limitDay, remainingDay: apisports_1.quotaState.remainingDay, at: apisports_1.quotaState.observedAt })
                .catch(() => { });
        }
        await (0, store_1.releaseLease)('poll').catch(() => { });
    }
}
/** One poll. Returns the number of changes dispatched. */
async function runPoll(store, nowSec, opts) {
    // 1. Live feed + matches missing from it.
    const feed = await (0, apisports_1.afGet)('/fixtures', { live: 'all' });
    const inFeed = new Set(feed.map(f => String(f.fixture.id)));
    const missing = Object.entries(store.matches).filter(([id, e]) => !inFeed.has(id) && isInPlayEntry(e.st));
    // Just left the feed → re-fetch now. Already known to be gone (suspension) →
    // only on the first poll of the minute, every GONE_RECHECK_SEC.
    const refetchIds = missing
        .filter(([, e]) => !e.g || (opts.firstOfMinute && nowSec - (e.gc ?? 0) >= GONE_RECHECK_SEC))
        .map(([id]) => id);
    const refetched = refetchIds.length ? await fetchByIds(refetchIds) : [];
    const fixtures = [...feed, ...refetched];
    // 2. Diff. Keep entries not in this batch (upcoming, gone, recently finished).
    const { changes, next } = (0, live_detect_1.detectChanges)(fixtures, store.matches, nowSec);
    for (const f of refetched) {
        const e = next[String(f.fixture.id)];
        if (e && isInPlayEntry(e.st)) {
            // Still "in play" but not in the live feed — remember since when.
            const prevE = store.matches[String(f.fixture.id)];
            e.g = prevE?.g ?? nowSec;
            e.gc = nowSec;
        }
    }
    store.matches = { ...store.matches, ...next };
    // 4. Reminders + upcoming docs for Live Activities (once per minute).
    let upcomingDocs = [];
    if (opts.firstOfMinute) {
        try {
            upcomingDocs = await loadUpcomingDocs(nowSec, 16 * 60);
            changes.push(...(0, live_detect_1.detectReminders)(upcomingDocs.map(toUpcoming), store.matches, nowSec));
        }
        catch (err) {
            logger.warn('fbPollLive: upcoming query failed', { err: String(err) });
        }
    }
    // 3. Rows.
    const { writes, docs } = mapRows(fixtures, store, nowSec);
    // Final details for priority matches that just finished come for free in the
    // re-fetch (/fixtures?ids= includes events, lineups, stats, players).
    const detailSources = refetched.filter(f => (0, mapping_1.isFinishedShort)(f.fixture.status.short) && (store.matches[String(f.fixture.id)]?.pp ?? 0) >= PRIORITY_POPULARITY);
    // 5. Enrichment (first poll of the minute only).
    const lineupPushes = [];
    if (opts.enrich) {
        const extra = await enrichment(store, nowSec, changes, lineupPushes);
        detailSources.push(...extra.details);
        const settled = mapRows(extra.settled, store, nowSec);
        writes.push(...settled.writes);
    }
    if (detailSources.length) {
        const unique = new Map(detailSources.map(f => [String(f.fixture.id), f]));
        const prevPressure = await loadPrevPressure([...unique.keys()]);
        for (const [id, f] of unique) {
            writes.push((0, store_1.detailWrite)((0, mapping_1.mapFixtureToDetail)(f, prevPressure.get(id) ?? null)));
            store.enrichedAt[id] = nowSec;
        }
    }
    if (writes.length)
        await (0, store_1.commitSets)(writes);
    prune(store, nowSec);
    // Persist latches BEFORE sending so a crash mid-dispatch can't re-send.
    await (0, store_1.saveLiveSnapshot)(store);
    await (0, notify_1.dispatchFootballChanges)(changes);
    for (const { f, row } of lineupPushes) {
        const starters = (f.lineups ?? []).flatMap(l => (l.startXI ?? []).map(s => ({
            playerId: s.player.id, name: s.player.name, teamId: String(l.team.id),
        })));
        await (0, notify_1.dispatchPlayerLineups)({ matchId: row.id, homeTeam: row.homeTeam, awayTeam: row.awayTeam, league: row.league }, starters);
    }
    // Live Activities: every poll for the matches of this cycle; the deep pass
    // (orphan catch-up + TTL sweep) once per minute.
    await (0, live_activities_1.sendLiveActivityUpdates)([...docs, ...upcomingDocs], { deepPass: opts.firstOfMinute });
    const endedLeagues = [...new Set(changes
            .filter(c => c.type === 'matchEnd' && c.popularity >= PRIORITY_POPULARITY)
            .map(c => c.leagueId))];
    await (0, store_1.markStandingsDirty)(endedLeagues).catch(err => logger.warn('markStandingsDirty failed', { err: String(err) }));
    return changes.length;
}
/**
 * Detail refresh for priority live matches, lineup checks for upcoming ones
 * and post-final settle passes. Returns fixtures whose detail doc should be
 * written, and the settled fixtures whose rows may have changed.
 */
async function enrichment(store, nowSec, changes, lineupPushes) {
    const due = [];
    const settling = new Set();
    for (const [id, e] of Object.entries(store.matches)) {
        const pop = e.pp ?? 0;
        if (pop < PRIORITY_POPULARITY)
            continue;
        const last = store.enrichedAt[id] ?? 0;
        if ((0, mapping_1.isLiveShort)(e.st) && !e.g) {
            const every = pop >= 50 ? DETAIL_EVERY_SEC_TOP : DETAIL_EVERY_SEC_PRIORITY;
            if (nowSec - last >= every)
                due.push({ id, pop });
        }
        else if (settleDue(e, nowSec)) {
            due.push({ id, pop });
            settling.add(id);
        }
    }
    // Upcoming priority matches → lineups (needs snapshot entries: create them).
    try {
        const upcoming = await loadUpcomingDocs(nowSec, LINEUP_WINDOW_SEC);
        for (const m of upcoming) {
            const pop = m.popularity ?? 0;
            if (pop < PRIORITY_POPULARITY)
                continue;
            const e = store.matches[m.id] ?? (store.matches[m.id] = (0, live_detect_1.emptyEntry)(m.timestamp, pop));
            if (e.f.lin)
                continue;
            if (nowSec - (store.enrichedAt[m.id] ?? 0) >= LINEUP_CHECK_EVERY_SEC)
                due.push({ id: m.id, pop });
        }
    }
    catch (err) {
        logger.warn('fbPollLive: lineup window query failed', { err: String(err) });
    }
    if (!due.length)
        return { details: [], settled: [] };
    due.sort((a, b) => b.pop - a.pop);
    const ids = [...new Set(due.map(d => d.id))].slice(0, MAX_DETAIL_BATCHES * 20);
    const full = await fetchByIds(ids);
    for (const f of full) {
        const id = String(f.fixture.id);
        const e = store.matches[id];
        if (!e)
            continue;
        if (settling.has(id))
            e.se = (e.se ?? 0) + 1;
        if (e.f.lin)
            continue;
        const lineupsReady = (f.lineups?.length ?? 0) >= 2 && f.lineups.every(l => (l.startXI?.length ?? 0) >= 11);
        if (lineupsReady) {
            e.f.lin = true;
            // Only announce lineups BEFORE kickoff. A match we first see already in
            // play (deploy, poller restart) just gets the latch silently.
            const short = f.fixture.status.short;
            if (short === 'NS' || short === 'TBD') {
                const row = (0, mapping_1.mapFixtureToMatch)(f, { nowSec });
                changes.push({
                    type: 'lineups', matchId: id, homeTeam: row.homeTeam, awayTeam: row.awayTeam,
                    homeScore: row.homeScore, awayScore: row.awayScore, league: row.league,
                    leagueId: row.leagueId, leagueCountry: row.leagueCountry, popularity: row.popularity,
                });
                lineupPushes.push({ f, row });
            }
        }
        if (!(0, mapping_1.isLiveShort)(f.fixture.status.short) && !lineupsReady && !settling.has(id)) {
            // Nothing worth storing yet for an upcoming match without lineups.
            store.enrichedAt[id] = nowSec;
        }
    }
    return {
        // Persist detail docs that carry something: live, settling, or lineups out.
        details: full.filter(f => (0, mapping_1.isLiveShort)(f.fixture.status.short) || settling.has(String(f.fixture.id)) ||
            (f.lineups?.length ?? 0) > 0),
        settled: full.filter(f => settling.has(String(f.fixture.id))),
    };
}
//# sourceMappingURL=poll-live.js.map