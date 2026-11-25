/**
 * football/store.ts
 *
 * Firestore persistence for the football backend: match rows, detail docs,
 * the live-diff snapshot, per-date write fingerprints, the live gate (when the
 * poller should run) and the shared quota reading.
 *
 * Write economy: rows are only written when their visible fingerprint
 * changed — Firestore writes are the main recurring cost of this pipeline.
 */

import { createHash } from 'node:crypto';
import { admin, db } from '../admin-init';
import type { FbMatchDetailDoc, FbMatchDoc } from '../shared/football/model';
import type { Snapshot } from './live-detect';
import { matchFingerprint } from './mapping';

export const COL = {
  matches: 'fb_matches',
  details: 'fb_match_details',
  standings: 'fb_standings',
  topscorers: 'fb_topscorers',
  meta: 'fb_meta',
  // On-demand caches (see on-demand.ts)
  previews: 'fb_match_previews',
  teams: 'fb_teams',
  teamFixtures: 'fb_team_fixtures',
  teamStats: 'fb_team_stats',
  players: 'fb_players',
  coaches: 'fb_coaches',
  venues: 'fb_venues',
  leagues: 'fb_leagues',
  leagueFixtures: 'fb_league_fixtures',
  search: 'fb_search',
  legacyPlayers: 'fb_legacy_players',
} as const;

const now = () => admin.firestore.Timestamp.now();

export function shortHash(s: string): string {
  return createHash('md5').update(s).digest('base64url').slice(0, 10);
}

export function rowHash(doc: Partial<FbMatchDoc>): string {
  return shortHash(matchFingerprint(doc));
}

// ── Batched writes ───────────────────────────────────────────────────────────

/** Commit set(merge) writes in batches of ≤450 ops. */
export async function commitSets(writes: Array<{ path: string; data: Record<string, unknown> }>): Promise<void> {
  for (let i = 0; i < writes.length; i += 450) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + 450)) batch.set(db.doc(w.path), w.data, { merge: true });
    await batch.commit();
  }
}

export function matchWrite(doc: Partial<FbMatchDoc> & { id: string }) {
  return { path: `${COL.matches}/${doc.id}`, data: { ...doc, updatedAt: now() } as Record<string, unknown> };
}

export function detailWrite(doc: FbMatchDetailDoc) {
  // set() without merge semantics per field would be ideal for arrays; merge
  // replaces arrays wholesale anyway, which is what we want here.
  return {
    path: `${COL.details}/${doc.matchId}`,
    data: { ...doc, fetchedAt: Date.now(), updatedAt: now() } as unknown as Record<string, unknown>,
  };
}

// ── Live snapshot ────────────────────────────────────────────────────────────

export interface StoredSnapshot {
  matches: Snapshot;
  /** Row fingerprints written by the poller (id → hash) to skip no-op writes. */
  fp: Record<string, string>;
  /** Last detail enrichment per match (id → unix seconds). */
  enrichedAt: Record<string, number>;
}

export async function loadLiveSnapshot(): Promise<StoredSnapshot> {
  const s = await db.doc(`${COL.meta}/liveSnapshot`).get();
  const d = (s.exists ? s.data() : undefined) as Partial<StoredSnapshot> | undefined;
  return { matches: d?.matches ?? {}, fp: d?.fp ?? {}, enrichedAt: d?.enrichedAt ?? {} };
}

export async function saveLiveSnapshot(s: StoredSnapshot): Promise<void> {
  await db.doc(`${COL.meta}/liveSnapshot`).set({ ...s, updatedAt: now() });
}

// ── Fixture fingerprints per date (sync-fixtures) ────────────────────────────

export async function loadDateFingerprints(date: string): Promise<Record<string, string>> {
  const s = await db.doc(`${COL.meta}/fp_${date}`).get();
  return ((s.exists ? s.data()?.fp : undefined) as Record<string, string> | undefined) ?? {};
}

export async function saveDateFingerprints(date: string, fp: Record<string, string>): Promise<void> {
  await db.doc(`${COL.meta}/fp_${date}`).set({ fp, updatedAt: now() });
}

// ── Live gate ────────────────────────────────────────────────────────────────

/** [kickoff unix seconds, league popularity, fixture id] for unfinished fixtures. */
export type GateEntry = [number, number, number];

/**
 * Replace the gate entries of the given dates and drop dates not in
 * `keepDates`. Stored as "ts:pop:id" strings because Firestore arrays can't
 * contain arrays.
 */
export async function saveLiveGateDates(entries: Record<string, GateEntry[]>, keepDates: string[]): Promise<void> {
  const ref = db.doc(`${COL.meta}/liveGate`);
  await db.runTransaction(async tx => {
    const cur = await tx.get(ref);
    const byDate: Record<string, string[]> = { ...((cur.data()?.byDate as Record<string, string[]> | undefined) ?? {}) };
    for (const [d, list] of Object.entries(entries)) byDate[d] = list.map(e => `${e[0]}:${e[1]}:${e[2]}`);
    for (const d of Object.keys(byDate)) if (!keepDates.includes(d)) delete byDate[d];
    tx.set(ref, { byDate, updatedAt: now() });
  });
}

export function decodeGate(raw: Record<string, unknown> | undefined): GateEntry[] {
  const out: GateEntry[] = [];
  for (const list of Object.values(raw ?? {})) {
    if (!Array.isArray(list)) continue;
    for (const s of list) {
      if (typeof s !== 'string') continue;
      const [ts, pop, id] = s.split(':').map(Number);
      if (Number.isFinite(ts)) out.push([ts, pop || 0, id || 0]);
    }
  }
  return out;
}

export async function loadGateEntries(): Promise<GateEntry[]> {
  const s = await db.doc(`${COL.meta}/liveGate`).get();
  return decodeGate((s.exists ? s.data()?.byDate : undefined) as Record<string, unknown> | undefined);
}

// ── Quota (shared across instances) ──────────────────────────────────────────

export interface QuotaDoc {
  limitDay: number;
  remainingDay: number;
  /** Unix ms of the reading. */
  at: number;
}

export async function loadQuota(): Promise<QuotaDoc | null> {
  const s = await db.doc(`${COL.meta}/quota`).get();
  return s.exists ? (s.data() as QuotaDoc) : null;
}

export async function saveQuota(q: QuotaDoc): Promise<void> {
  await db.doc(`${COL.meta}/quota`).set(q);
}

// ── Poll lease (prevents overlapping poller invocations) ────────────────────

export async function acquireLease(name: string, ttlMs: number): Promise<boolean> {
  const ref = db.doc(`${COL.meta}/lease_${name}`);
  const nowMs = Date.now();
  return db.runTransaction(async tx => {
    const cur = await tx.get(ref);
    const until = (cur.data()?.until as number | undefined) ?? 0;
    if (until > nowMs) return false;
    tx.set(ref, { until: nowMs + ttlMs, at: nowMs });
    return true;
  });
}

export async function releaseLease(name: string): Promise<void> {
  await db.doc(`${COL.meta}/lease_${name}`).set({ until: 0, at: Date.now() });
}

// ── Standings dirty set (league ids whose table must be refreshed) ───────────

export async function markStandingsDirty(leagueIds: string[]): Promise<void> {
  if (!leagueIds.length) return;
  await db.doc(`${COL.meta}/standingsDirty`).set(
    { leagues: admin.firestore.FieldValue.arrayUnion(...leagueIds), updatedAt: now() },
    { merge: true },
  );
}

// ── Housekeeping ─────────────────────────────────────────────────────────────

/** Delete per-date fingerprint docs older than `keepDays` (they only matter for the sync window). */
export async function deleteOldFingerprints(keepDays = 3, nowMs = Date.now()): Promise<number> {
  const cutoff = new Date(nowMs - keepDays * 86_400_000).toISOString().slice(0, 10);
  const refs = await db.collection(COL.meta).listDocuments();
  const old = refs.filter(r => r.id.startsWith('fp_') && r.id.slice(3) < cutoff);
  for (let i = 0; i < old.length; i += 400) {
    const batch = db.batch();
    old.slice(i, i + 400).forEach(r => batch.delete(r));
    await batch.commit();
  }
  return old.length;
}
