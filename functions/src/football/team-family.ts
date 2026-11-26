/**
 * football/team-family.ts
 *
 * A senior national team and its youth sides (U17, U20, U23…) are one thing
 * for a fan: whoever follows Mexico wants to hear about Mexico U17 at its
 * World Cup (owner's rule, 25-nov-2026). The data provider treats them as
 * unrelated teams, so the link is derived from the name ("Mexico U17" →
 * "Mexico") and confirmed against the provider's national teams — one call per
 * country, remembered in `fb_meta/nationalIds`.
 */

import * as logger from 'firebase-functions/logger';
import { db } from '../admin-init';
import { afGet } from './apisports';
import type { AfTeamEntry } from './apisports-types';
import { COL } from './store';

/** The provider's "country" for national-team and international competitions. */
export const NATIONAL_TEAMS_COUNTRY = 'World';

const YOUTH_RE = /^(.+?)\s+U-?\s?(1[5-9]|2[0-3])$/i;

/** "Mexico U17" → { base: "Mexico", age: 17 }; null for anything else. */
export function youthOf(name: string | null | undefined): { base: string; age: number } | null {
  const m = YOUTH_RE.exec((name ?? '').trim());
  return m ? { base: m[1].trim(), age: Number(m[2]) } : null;
}

const DOC = `${COL.meta}/nationalIds`;
/** A name with no senior national team (a club in a youth cup) is asked again after this long. */
const RETRY_MISSING_MS = 30 * 24 * 3600_000;
/** New names looked up per batch of changes; the rest wait for the next one. */
const MAX_LOOKUPS_PER_RUN = 6;

interface NationalIdsDoc {
  /** Lowercased team name → provider id ('' = looked up, not found). */
  byName?: Record<string, string>;
  /** When each name was looked up (ms). */
  at?: Record<string, number>;
}

let memo: NationalIdsDoc | null = null;
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
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  let lookups = 0;
  for (const t of teams) {
    const y = youthOf(t.name);
    if (!y || out[t.id]) continue;
    try {
      let senior = await knownNationalId(y.base, nowMs);
      if (senior === undefined) {
        if (lookups >= MAX_LOOKUPS_PER_RUN) continue;
        lookups++;
        senior = await lookupNationalId(y.base, nowMs);
      }
      if (senior && senior !== t.id) out[t.id] = senior;
    } catch (err) {
      logger.warn('team family: could not resolve', { team: t.name, err: String(err) });
    }
  }
  return out;
}

/** Test hook: forget what this instance has loaded. */
export function resetTeamFamilyForTests(): void { memo = null; }
