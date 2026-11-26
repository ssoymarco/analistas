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

import * as logger from 'firebase-functions/logger';
import { db } from '../admin-init';
import type { FbMatchDetailDoc, FbMatchDoc, FbPressure } from '../shared/football/model';
import { afGet, quotaState } from './apisports';
import type { AfFixtureFull } from './apisports-types';
import {
  detectChanges, detectReminders, emptyEntry, type FbChange, type Snapshot, type UpcomingMatch,
} from './live-detect';
import { sendLiveActivityUpdates } from './live-activities';
import {
  isFinishedShort, isLiveShort, mapFixtureToDetail, mapFixtureToMatch,
} from './mapping';
import { dispatchFootballChanges, dispatchPlayerLineups } from './notify';
import {
  acquireLease, COL, commitSets, detailWrite, loadGateEntries, loadLiveSnapshot, loadQuota,
  markStandingsDirty, matchWrite, releaseLease, rowHash, saveLiveSnapshot, saveQuota,
  type StoredSnapshot,
} from './store';

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

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function isInPlayEntry(st: string): boolean {
  return isLiveShort(st) || HALTED.has(st);
}

function todayUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function settleDue(e: { ft?: number; se?: number; pp?: number }, nowSec: number): boolean {
  if (!e.ft || (e.pp ?? 0) < PRIORITY_POPULARITY) return false;
  const done = e.se ?? 0;
  return done < SETTLE_AFTER_SEC.length && nowSec - e.ft >= SETTLE_AFTER_SEC[done];
}

/** Polls to run this minute (0 = skip). Pure — exported for tests. */
export function decideCadence(opts: {
  nowSec: number;
  gate: Array<[number, number, number]>;
  snapshot: Snapshot;
  remainingDay: number;
  minuteOfDay: number;
}): { polls: number; maxPop: number; enrich: boolean } {
  const { nowSec, gate, snapshot, remainingDay, minuteOfDay } = opts;
  let maxPop = -1;
  for (const [ts, pop] of gate) {
    if (nowSec >= ts - 20 * 60 && nowSec <= ts + 150 * 60) maxPop = Math.max(maxPop, pop);
  }
  let pendingSettle = false;
  for (const e of Object.values(snapshot)) {
    // Matches that left the feed mid-game are re-checked on their own clock;
    // they don't keep the fast cadence alive.
    if (isInPlayEntry(e.st) && !e.g) maxPop = Math.max(maxPop, e.pp ?? 0);
    if (settleDue(e, nowSec) || (e.g && nowSec - (e.gc ?? 0) >= GONE_RECHECK_SEC)) pendingSettle = true;
  }
  if (maxPop < 0 && !pendingSettle) return { polls: 0, maxPop, enrich: false };

  let polls = maxPop >= TOP_POPULARITY ? 4 : maxPop >= PRIORITY_POPULARITY ? 2 : 1;
  let enrich = maxPop >= PRIORITY_POPULARITY || pendingSettle;
  // Quota guard — degrade instead of running dry mid-match.
  if (remainingDay < 20) return { polls: 0, maxPop, enrich: false };
  if (remainingDay < 100) { polls = minuteOfDay % 2 === 0 ? 1 : 0; enrich = false; }
  else if (remainingDay < 300) { polls = 1; enrich = false; }
  else if (remainingDay < 800) { polls = Math.min(polls, 2); }
  return { polls, maxPop, enrich };
}

async function fetchByIds(ids: string[]): Promise<AfFixtureFull[]> {
  const out: AfFixtureFull[] = [];
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    const res = await afGet<AfFixtureFull[]>('/fixtures', { ids: chunk.join('-') });
    out.push(...res);
  }
  return out;
}

/** Scheduled fb_matches rows kicking off within the window (no API call). */
async function loadUpcomingDocs(nowSec: number, windowSec: number): Promise<FbMatchDoc[]> {
  const snap = await db.collection(COL.matches)
    .where('timestamp', '>', nowSec)
    .where('timestamp', '<=', nowSec + windowSec)
    .get();
  return snap.docs
    .map(d => d.data() as FbMatchDoc)
    .filter(d => d.status === 'scheduled' && d.statusShort !== 'PST' && d.statusShort !== 'CANC');
}

function toUpcoming(d: FbMatchDoc): UpcomingMatch {
  return {
    id: String(d.id), timestamp: d.timestamp, homeTeam: d.homeTeam, awayTeam: d.awayTeam,
    league: d.league, leagueId: String(d.leagueId), leagueCountry: d.leagueCountry,
    popularity: d.popularity ?? 0,
  };
}

async function loadPrevPressure(ids: string[]): Promise<Map<string, FbPressure | null>> {
  const m = new Map<string, FbPressure | null>();
  if (!ids.length) return m;
  const snaps = await db.getAll(...ids.map(id => db.doc(`${COL.details}/${id}`)));
  snaps.forEach((s, i) => m.set(ids[i], (s.exists ? (s.data() as FbMatchDetailDoc).pressure : null) ?? null));
  return m;
}

/** Map rows (keeping the clock anchor stable); queue writes for changed ones. */
function mapRows(fixtures: AfFixtureFull[], store: StoredSnapshot, nowSec: number) {
  const writes: Array<{ path: string; data: Record<string, unknown> }> = [];
  const docs: FbMatchDoc[] = [];
  for (const f of fixtures) {
    const id = String(f.fixture.id);
    const entry = store.matches[id];
    const prevClock = entry?.lc ? { periodStartedAt: entry.lc[0], periodMinuteOffset: entry.lc[1] } : null;
    const doc = mapFixtureToMatch(f, { nowSec, prevClock });
    docs.push(doc);
    if (entry) {
      if (doc.liveClock) entry.lc = [doc.liveClock.periodStartedAt, doc.liveClock.periodMinuteOffset];
      else delete entry.lc;
    }
    const hash = rowHash(doc);
    if (store.fp[id] === hash) continue;
    store.fp[id] = hash;
    writes.push(matchWrite(doc));
  }
  return { writes, docs };
}

function prune(store: StoredSnapshot, nowSec: number): void {
  for (const [id, e] of Object.entries(store.matches)) {
    const age = nowSec - e.ts;
    const stale =
      (isFinishedShort(e.st) && age > 4 * 3600 && !settleDue(e, nowSec)) ||
      (e.g !== undefined && nowSec - e.g > GONE_MAX_SEC) ||
      (!isInPlayEntry(e.st) && !isFinishedShort(e.st) && age > 6 * 3600) ||
      age > 24 * 3600;
    if (stale) {
      delete store.matches[id];
      delete store.fp[id];
      delete store.enrichedAt[id];
    }
  }
  for (const id of Object.keys(store.fp)) if (!store.matches[id]) delete store.fp[id];
  for (const id of Object.keys(store.enrichedAt)) if (!store.matches[id]) delete store.enrichedAt[id];
}

export async function pollFootballLive(): Promise<void> {
  if (!(await acquireLease('poll', 75_000))) {
    logger.warn('fbPollLive: previous invocation still running — skipping');
    return;
  }
  const startedMs = Date.now();
  const callsBefore = quotaState.callsThisInstance;
  try {
    const [gate, quota, store] = await Promise.all([loadGateEntries(), loadQuota(), loadLiveSnapshot()]);
    const nowSec0 = Math.floor(startedMs / 1000);
    const sameDay = quota && todayUtc(quota.at) === todayUtc(startedMs);
    const remaining = sameDay ? quota!.remainingDay : Number.POSITIVE_INFINITY;
    const minuteOfDay = Math.floor((startedMs % 86_400_000) / 60_000);
    const cadence = decideCadence({ nowSec: nowSec0, gate, snapshot: store.matches, remainingDay: remaining, minuteOfDay });
    if (cadence.polls === 0) {
      logger.debug('fbPollLive: idle', { maxPop: cadence.maxPop, remaining });
      // Live Activities still need their orphan catch-up + TTL sweep.
      await sendLiveActivityUpdates([], { deepPass: true });
      return;
    }

    const intervalMs = Math.floor(60_000 / cadence.polls);
    let totalChanges = 0;
    for (let i = 0; i < cadence.polls; i++) {
      const pollStart = Date.now();
      const nowSec = Math.floor(pollStart / 1000);
      try {
        totalChanges += await runPoll(store, nowSec, { enrich: i === 0 && cadence.enrich, firstOfMinute: i === 0 });
      } catch (err) {
        logger.error(`fbPollLive: poll ${i + 1}/${cadence.polls} failed`, { err: String(err) });
      }
      if (i < cadence.polls - 1) {
        const wait = intervalMs - (Date.now() - pollStart);
        if (wait > 0) await sleep(wait);
      }
    }
    logger.info('fbPollLive: done', {
      polls: cadence.polls, maxPop: cadence.maxPop, changes: totalChanges,
      apiCalls: quotaState.callsThisInstance - callsBefore,
      remainingDay: quotaState.remainingDay, ms: Date.now() - startedMs,
    });
  } finally {
    if (quotaState.observedAt > 0 && Number.isFinite(quotaState.remainingDay)) {
      await saveQuota({ limitDay: quotaState.limitDay, remainingDay: quotaState.remainingDay, at: quotaState.observedAt })
        .catch(() => {});
    }
    await releaseLease('poll').catch(() => {});
  }
}

/** One poll. Returns the number of changes dispatched. */
async function runPoll(
  store: StoredSnapshot,
  nowSec: number,
  opts: { enrich: boolean; firstOfMinute: boolean },
): Promise<number> {
  // 1. Live feed + matches missing from it.
  const feed = await afGet<AfFixtureFull[]>('/fixtures', { live: 'all' });
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
  const { changes, next } = detectChanges(fixtures, store.matches, nowSec);
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
  let upcomingDocs: FbMatchDoc[] = [];
  if (opts.firstOfMinute) {
    try {
      upcomingDocs = await loadUpcomingDocs(nowSec, 16 * 60);
      changes.push(...detectReminders(upcomingDocs.map(toUpcoming), store.matches, nowSec));
    } catch (err) {
      logger.warn('fbPollLive: upcoming query failed', { err: String(err) });
    }
  }

  // 3. Rows.
  const { writes, docs } = mapRows(fixtures, store, nowSec);

  // Final details for priority matches that just finished come for free in the
  // re-fetch (/fixtures?ids= includes events, lineups, stats, players).
  const detailSources: AfFixtureFull[] = refetched.filter(f =>
    isFinishedShort(f.fixture.status.short) && (store.matches[String(f.fixture.id)]?.pp ?? 0) >= PRIORITY_POPULARITY);

  // 5. Enrichment (first poll of the minute only).
  const lineupPushes: Array<{ f: AfFixtureFull; row: FbMatchDoc }> = [];
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
      writes.push(detailWrite(mapFixtureToDetail(f, prevPressure.get(id) ?? null)));
      store.enrichedAt[id] = nowSec;
    }
  }

  if (writes.length) await commitSets(writes);

  prune(store, nowSec);
  // Persist latches BEFORE sending so a crash mid-dispatch can't re-send.
  await saveLiveSnapshot(store);
  await dispatchFootballChanges(changes);
  for (const { f, row } of lineupPushes) {
    const starters = (f.lineups ?? []).flatMap(l => (l.startXI ?? []).map(s => ({
      playerId: s.player.id, name: s.player.name, teamId: String(l.team.id),
    })));
    await dispatchPlayerLineups(
      { matchId: row.id, homeTeam: row.homeTeam, awayTeam: row.awayTeam, league: row.league },
      starters,
    );
  }

  // Live Activities: every poll for the matches of this cycle; the deep pass
  // (orphan catch-up + TTL sweep) once per minute.
  await sendLiveActivityUpdates([...docs, ...upcomingDocs], { deepPass: opts.firstOfMinute });

  const endedLeagues = [...new Set(changes
    .filter(c => c.type === 'matchEnd' && c.popularity >= PRIORITY_POPULARITY)
    .map(c => c.leagueId))];
  await markStandingsDirty(endedLeagues).catch(err => logger.warn('markStandingsDirty failed', { err: String(err) }));

  return changes.length;
}

/**
 * Detail refresh for priority live matches, lineup checks for upcoming ones
 * and post-final settle passes. Returns fixtures whose detail doc should be
 * written, and the settled fixtures whose rows may have changed.
 */
async function enrichment(
  store: StoredSnapshot,
  nowSec: number,
  changes: FbChange[],
  lineupPushes: Array<{ f: AfFixtureFull; row: FbMatchDoc }>,
): Promise<{ details: AfFixtureFull[]; settled: AfFixtureFull[] }> {
  const due: Array<{ id: string; pop: number }> = [];
  const settling = new Set<string>();
  for (const [id, e] of Object.entries(store.matches)) {
    const pop = e.pp ?? 0;
    if (pop < PRIORITY_POPULARITY) continue;
    const last = store.enrichedAt[id] ?? 0;
    if (isLiveShort(e.st) && !e.g) {
      const every = pop >= 50 ? DETAIL_EVERY_SEC_TOP : DETAIL_EVERY_SEC_PRIORITY;
      if (nowSec - last >= every) due.push({ id, pop });
    } else if (settleDue(e, nowSec)) {
      due.push({ id, pop });
      settling.add(id);
    }
  }
  // Upcoming priority matches → lineups (needs snapshot entries: create them).
  try {
    const upcoming = await loadUpcomingDocs(nowSec, LINEUP_WINDOW_SEC);
    for (const m of upcoming) {
      const pop = m.popularity ?? 0;
      if (pop < PRIORITY_POPULARITY) continue;
      const e = store.matches[m.id] ?? (store.matches[m.id] = emptyEntry(m.timestamp, pop));
      if (e.f.lin) continue;
      if (nowSec - (store.enrichedAt[m.id] ?? 0) >= LINEUP_CHECK_EVERY_SEC) due.push({ id: m.id, pop });
    }
  } catch (err) {
    logger.warn('fbPollLive: lineup window query failed', { err: String(err) });
  }
  if (!due.length) return { details: [], settled: [] };

  due.sort((a, b) => b.pop - a.pop);
  const ids = [...new Set(due.map(d => d.id))].slice(0, MAX_DETAIL_BATCHES * 20);
  const full = await fetchByIds(ids);

  for (const f of full) {
    const id = String(f.fixture.id);
    const e = store.matches[id];
    if (!e) continue;
    if (settling.has(id)) e.se = (e.se ?? 0) + 1;
    if (e.f.lin) continue;
    const lineupsReady = (f.lineups?.length ?? 0) >= 2 && f.lineups!.every(l => (l.startXI?.length ?? 0) >= 11);
    if (lineupsReady) {
      e.f.lin = true;
      // Only announce lineups BEFORE kickoff. A match we first see already in
      // play (deploy, poller restart) just gets the latch silently.
      const short = f.fixture.status.short;
      if (short === 'NS' || short === 'TBD') {
        const row = mapFixtureToMatch(f, { nowSec });
        changes.push({
          type: 'lineups', matchId: id, homeTeam: row.homeTeam, awayTeam: row.awayTeam,
          homeScore: row.homeScore, awayScore: row.awayScore, league: row.league,
          leagueId: row.leagueId, leagueCountry: row.leagueCountry, popularity: row.popularity,
        });
        lineupPushes.push({ f, row });
      }
    }
    if (!isLiveShort(f.fixture.status.short) && !lineupsReady && !settling.has(id)) {
      // Nothing worth storing yet for an upcoming match without lineups.
      store.enrichedAt[id] = nowSec;
    }
  }
  return {
    // Persist detail docs that carry something: live, settling, or lineups out.
    details: full.filter(f => isLiveShort(f.fixture.status.short) || settling.has(String(f.fixture.id)) ||
      (f.lineups?.length ?? 0) > 0),
    settled: full.filter(f => settling.has(String(f.fixture.id))),
  };
}
