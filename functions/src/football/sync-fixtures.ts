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

import * as logger from 'firebase-functions/logger';
import { afGet, quotaState } from './apisports';
import type { AfFixtureCore } from './apisports-types';
import type { FbChange } from './live-detect';
import { isFinishedShort, isLiveShort, mapFixtureToMatch, omitRedCardsWhenUnknown } from './mapping';
import { dispatchFootballChanges } from './notify';
import { MAX_LOOKUPS_PER_SYNC, NATIONAL_TEAMS_COUNTRY, seniorTeamIds, youthOf } from './team-family';
import {
  commitSets, loadDateFingerprints, matchWrite, rowHash, saveDateFingerprints,
  saveLiveGateDates, saveQuota, type GateEntry,
} from './store';

function dateUtc(offsetDays: number, nowMs: number): string {
  const d = new Date(nowMs);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** Which day offsets to refresh on this run. Pure — exported for tests. */
export function datesForRun(nowMs: number): number[] {
  const minuteOfDay = Math.floor((nowMs % 86_400_000) / 60_000);
  const out = [0];
  if (minuteOfDay % 30 < 5) out.push(-1, 1);
  if (minuteOfDay % 360 < 5) out.push(2, 3, 4, 5, 6, 7);
  if (minuteOfDay < 5 || (minuteOfDay >= 720 && minuteOfDay < 725)) out.push(8, 9, 10, 11, 12, 13, 14);
  return out;
}

export interface SyncResult {
  dates: string[]; fixtures: number; written: number; delays: number;
  /** Dates the provider call failed for (nothing was stored for them). */
  failed: string[];
}

const MIN_DELAY_SEC = 5 * 60;
const MAX_DELAY_SEC = 8 * 3600;
const IMMINENT_SEC = 8 * 3600;

/** "1 h", "1 h 30 min", "45 min" — timezone-free delay text. */
export function formatDelay(sec: number): string {
  const total = Math.round(sec / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h} h ${m} min`;
  if (h > 0) return `${h} h`;
  return `${m} min`;
}

/** Fingerprint record stored per fixture: "hash:kickoffUnix:statusShort". */
function fpRecord(hash: string, ts: number, short: string): string {
  return `${hash}:${ts}:${short}`;
}

function parseFp(rec: string | undefined): { hash: string; ts: number; short: string } | null {
  if (!rec) return null;
  const [hash, ts, short] = rec.split(':');
  return { hash, ts: Number(ts) || 0, short: short ?? '' };
}

/** Delay / postponement of an imminent match vs the previous run. Pure — exported for tests. */
export function kickoffDelayFor(
  old: { ts: number; short: string } | null,
  cur: { ts: number; short: string },
  nowSec: number,
): string | null {
  if (!old || !old.ts) return null;
  const wasPending = old.short === 'NS' || old.short === 'TBD';
  if (!wasPending) return null;
  const imminent = old.ts - nowSec < IMMINENT_SEC && old.ts - nowSec > -3 * 3600;
  if (!imminent) return null;
  if (cur.short === 'PST') return 'postponed';
  if (cur.short !== 'NS' && cur.short !== 'TBD') return null;
  const delta = cur.ts - old.ts;
  if (delta < MIN_DELAY_SEC || delta > MAX_DELAY_SEC) return null;
  return formatDelay(delta);
}

export async function syncFootballFixtures(explicitDates?: string[], nowMs = Date.now()): Promise<SyncResult> {
  const nowSec = Math.floor(nowMs / 1000);
  const dates = explicitDates?.length ? explicitDates : datesForRun(nowMs).map(o => dateUtc(o, nowMs));
  const gate: Record<string, GateEntry[]> = {};
  let fixturesSeen = 0;
  let written = 0;
  const delayChanges: FbChange[] = [];
  const failed: string[] = [];
  /** Youth national teams with fixtures in the window (to link to their senior team). */
  const youthTeams = new Map<string, { id: string; name: string }>();

  for (const date of dates) {
    let list: AfFixtureCore[];
    try {
      list = await afGet<AfFixtureCore[]>('/fixtures', { date, timezone: 'UTC' });
    } catch (err) {
      logger.error(`fbSyncFixtures: ${date} failed`, { err: String(err) });
      failed.push(date);
      continue;
    }
    fixturesSeen += list.length;
    const fp = await loadDateFingerprints(date);
    const nextFp: Record<string, string> = {};
    const writes: Array<{ path: string; data: Record<string, unknown> }> = [];
    const gateEntries: GateEntry[] = [];

    for (const f of list) {
      const id = String(f.fixture.id);
      const short = f.fixture.status.short;
      const doc = mapFixtureToMatch(f, { nowSec });
      if (f.league.country === NATIONAL_TEAMS_COUNTRY) {
        for (const t of [doc.homeTeam, doc.awayTeam]) if (t.id && youthOf(t.name)) youthTeams.set(t.id, t);
      }
      if (!isFinishedShort(short) && short !== 'CANC' && short !== 'PST') {
        gateEntries.push([f.fixture.timestamp, doc.popularity, f.fixture.id]);
      }
      if (isLiveShort(short)) { if (fp[id]) nextFp[id] = fp[id]; continue; }
      const row = omitRedCardsWhenUnknown(doc, false);
      const hash = rowHash(row);
      const prev = parseFp(fp[id]);
      nextFp[id] = fpRecord(hash, f.fixture.timestamp, short);

      const delay = kickoffDelayFor(prev, { ts: f.fixture.timestamp, short }, nowSec);
      if (delay) {
        delayChanges.push({
          type: 'kickoffDelayed', matchId: id, homeTeam: doc.homeTeam, awayTeam: doc.awayTeam,
          homeScore: 0, awayScore: 0, league: doc.league, leagueId: doc.leagueId,
          leagueCountry: doc.leagueCountry, popularity: doc.popularity, delay,
        });
      }

      if (prev?.hash === hash) continue;
      writes.push(matchWrite({ ...row, id }));
    }

    if (writes.length) await commitSets(writes);
    written += writes.length;
    await saveDateFingerprints(date, nextFp);
    gate[date] = gateEntries;
  }

  // Gate keeps yesterday … tomorrow (matches past midnight UTC still count).
  const keep = [-1, 0, 1].map(o => dateUtc(o, nowMs));
  const gateUpdate = Object.fromEntries(Object.entries(gate).filter(([d]) => keep.includes(d)));
  if (Object.keys(gateUpdate).length) await saveLiveGateDates(gateUpdate, keep);

  // Youth national teams → their senior team, for the app ("Mis equipos") and
  // the notifications. Remembered: once a team is linked it costs no more calls.
  if (youthTeams.size) {
    await seniorTeamIds([...youthTeams.values()], nowMs, MAX_LOOKUPS_PER_SYNC).catch(() => {});
  }

  if (quotaState.observedAt > 0 && Number.isFinite(quotaState.remainingDay)) {
    await saveQuota({ limitDay: quotaState.limitDay, remainingDay: quotaState.remainingDay, at: quotaState.observedAt })
      .catch(() => {});
  }
  if (delayChanges.length) {
    await dispatchFootballChanges(delayChanges).catch(err =>
      logger.warn('fbSyncFixtures: delay pushes failed', { err: String(err) }));
  }

  logger.info('fbSyncFixtures: done', {
    dates, fixtures: fixturesSeen, written, delays: delayChanges.length, remainingDay: quotaState.remainingDay,
  });
  return { dates, fixtures: fixturesSeen, written, delays: delayChanges.length, failed };
}
