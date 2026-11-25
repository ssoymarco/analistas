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
 */

import * as logger from 'firebase-functions/logger';
import { afGet, quotaState } from './apisports';
import type { AfFixtureCore } from './apisports-types';
import { isFinishedShort, isLiveShort, mapFixtureToMatch, omitRedCardsWhenUnknown } from './mapping';
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

export interface SyncResult { dates: string[]; fixtures: number; written: number }

export async function syncFootballFixtures(explicitDates?: string[], nowMs = Date.now()): Promise<SyncResult> {
  const nowSec = Math.floor(nowMs / 1000);
  const dates = explicitDates?.length ? explicitDates : datesForRun(nowMs).map(o => dateUtc(o, nowMs));
  const gate: Record<string, GateEntry[]> = {};
  let fixturesSeen = 0;
  let written = 0;

  for (const date of dates) {
    let list: AfFixtureCore[];
    try {
      list = await afGet<AfFixtureCore[]>('/fixtures', { date, timezone: 'UTC' });
    } catch (err) {
      logger.error(`fbSyncFixtures: ${date} failed`, { err: String(err) });
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
      if (!isFinishedShort(short) && short !== 'CANC' && short !== 'PST') {
        gateEntries.push([f.fixture.timestamp, doc.popularity, f.fixture.id]);
      }
      if (isLiveShort(short)) { if (fp[id]) nextFp[id] = fp[id]; continue; }
      const row = omitRedCardsWhenUnknown(doc, false);
      const hash = rowHash(row);
      nextFp[id] = hash;
      if (fp[id] === hash) continue;
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

  if (quotaState.observedAt > 0 && Number.isFinite(quotaState.remainingDay)) {
    await saveQuota({ limitDay: quotaState.limitDay, remainingDay: quotaState.remainingDay, at: quotaState.observedAt })
      .catch(() => {});
  }
  logger.info('fbSyncFixtures: done', { dates, fixtures: fixturesSeen, written, remainingDay: quotaState.remainingDay });
  return { dates, fixtures: fixturesSeen, written };
}
