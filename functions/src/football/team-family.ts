/**
 * football/team-family.ts
 *
 * A senior national team and its youth sides (U17, U20, U23…) are one thing
 * for a fan: whoever follows Mexico wants to hear about Mexico U17 at its
 * World Cup (owner's rule, 25-nov-2026). The data provider treats them as
 * unrelated teams, so the link is derived from the name ("Mexico U17" →
 * "Mexico") and confirmed against the provider's national teams — one call per
 * country, remembered in `fb_meta/nationalIds` (server-only).
 *
 * Every link found is also published in `fb_meta/teamFamilies` (youth team id →
 * senior team id), which the app reads to show Mexico U17's matches among the
 * matches of whoever follows Mexico. The fixture sync fills it days ahead; the
 * notifications resolve whatever is still missing at send time.
 */

import * as logger from 'firebase-functions/logger';
import { db } from '../admin-init';
import { afGet } from './apisports';
import type { AfTeamEntry } from './apisports-types';
import type { FbTeamFamiliesDoc } from '../shared/football/model';
import { seniorNameOf, youthOf } from '../shared/football/youth';
import { COL } from './store';

export { seniorNameOf, youthOf };

/** The provider's "country" for national-team and international competitions. */
export const NATIONAL_TEAMS_COUNTRY = 'World';

const DOC = `${COL.meta}/nationalIds`;
/** Public: youth team id → senior team id (the app reads it). */
const FAMILIES_DOC = `${COL.meta}/teamFamilies`;
/** A name with no senior national team (a club in a youth cup) is asked again after this long. */
const RETRY_MISSING_MS = 30 * 24 * 3600_000;
/** New names looked up per batch of notifications; the rest wait for the next one. */
const MAX_LOOKUPS_PER_RUN = 6;
/** New names looked up per fixture sync (every 5 min): a 48-team cup is linked in under half an hour. */
export const MAX_LOOKUPS_PER_SYNC = 10;

interface NationalIdsDoc {
  /** Lowercased team name → provider id ('' = looked up, not found). */
  byName?: Record<string, string>;
  /** When each name was looked up (ms). */
  at?: Record<string, number>;
}

let memo: NationalIdsDoc | null = null;
let published: Record<string, string> | null = null;
const key = (name: string) => name.trim().toLowerCase();

async function load(): Promise<NationalIdsDoc> {
  if (!memo) {
    const snap = await db.doc(DOC).get();
    memo = (snap.exists ? snap.data() : {}) as NationalIdsDoc;
    memo.byName ??= {};
    memo.at ??= {};
  }
  return memo;
}

/** Adds the links the public doc doesn't have yet (one small merge write, or none). */
async function publish(links: Record<string, string>, nowMs: number): Promise<void> {
  if (!published) {
    const snap = await db.doc(FAMILIES_DOC).get();
    published = { ...((snap.data() as FbTeamFamiliesDoc | undefined)?.seniorOf ?? {}) };
  }
  const fresh: Record<string, string> = {};
  for (const [youth, senior] of Object.entries(links)) {
    if (published[youth] !== senior) fresh[youth] = senior;
  }
  if (!Object.keys(fresh).length) return;
  const doc: FbTeamFamiliesDoc = { seniorOf: fresh, updatedAt: nowMs };
  await db.doc(FAMILIES_DOC).set(doc, { merge: true });
  Object.assign(published, fresh);
}

/** What is already known about `name`: its id, null (no such national team) or undefined (never asked). */
async function knownNationalId(name: string, nowMs: number): Promise<string | null | undefined> {
  const doc = await load();
  const k = key(name);
  const known = doc.byName![k];
  if (known) return known;
  if (known === '' && nowMs - (doc.at![k] ?? 0) < RETRY_MISSING_MS) return null;
  return undefined;
}

/** Asks the provider for the senior national team called `name` and remembers the answer. */
async function lookupNationalId(name: string, nowMs: number): Promise<string | null> {
  const doc = await load();
  const k = key(name);
  let id = '';
  try {
    const list = await afGet<AfTeamEntry[]>('/teams', { name });
    const hit = list.find(e => e.team.national && key(e.team.name) === k);
    if (hit) id = String(hit.team.id);
  } catch (err) {
    logger.warn('team family: lookup failed', { name, err: String(err) });
    return null;                       // not remembered: asked again next time
  }
  doc.byName![k] = id;
  doc.at![k] = nowMs;
  await db.doc(DOC).set({ byName: { [k]: id }, at: { [k]: nowMs } }, { merge: true }).catch(() => {});
  return id || null;
}

/**
 * For the youth national teams among `teams`: youth team id → senior team id.
 * A club's youth side ("Real Madrid U19") resolves to nothing, because its
 * base name is not a national team. Never throws.
 */
export async function seniorTeamIds(
  teams: Array<{ id: string; name: string }>,
  nowMs = Date.now(),
  maxLookups = MAX_LOOKUPS_PER_RUN,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  let lookups = 0;
  for (const t of teams) {
    const y = youthOf(t.name);
    if (!y || out[t.id]) continue;
    try {
      const name = seniorNameOf(y.base);
      let senior = await knownNationalId(name, nowMs);
      if (senior === undefined) {
        if (lookups >= maxLookups) continue;
        lookups++;
        senior = await lookupNationalId(name, nowMs);
      }
      if (senior && senior !== t.id) out[t.id] = senior;
    } catch (err) {
      logger.warn('team family: could not resolve', { team: t.name, err: String(err) });
    }
  }
  await publish(out, nowMs).catch(err => logger.warn('team family: publish failed', { err: String(err) }));
  return out;
}

/** Test hook: forget what this instance has loaded. */
export function resetTeamFamilyForTests(): void { memo = null; published = null; }
