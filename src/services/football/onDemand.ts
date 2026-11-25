/**
 * football/onDemand.ts
 *
 * Client side of the `fbOnDemand` Cloud Function (functions/src/football/
 * on-demand.ts). Data that isn't synced on a schedule — team and player
 * pages, match previews, season calendars, tables of minor leagues, search —
 * lives in Firestore docs with an `expiresAt`. The pattern is always:
 *
 *   1. read the Firestore doc (one cheap read, no provider call);
 *   2. if it is fresh, done;
 *   3. otherwise show the stale copy (if any) and ask the function to refresh.
 *
 * The app never talks to the data provider and never holds its key.
 */

import { doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import app, { db } from '../firebase';
import { isExpired } from '../../../functions/src/shared/football/freshness';
import type { FbCached, FbOnDemandKind } from '../../../functions/src/shared/football/model';

export interface OnDemandRequest {
  kind: FbOnDemandKind;
  id?: string | number;
  leagueId?: string | number;
  season?: number;
  q?: string;
  ids?: string[];
}

type Transport = (req: OnDemandRequest) => Promise<{ kind: string; data: unknown }>;

const REGION = 'us-central1';
const CALL_TIMEOUT_MS = 25_000;

let transport: Transport = async req => {
  const fn = httpsCallable<OnDemandRequest, { kind: string; data: unknown }>(
    getFunctions(app, REGION), 'fbOnDemand', { timeout: CALL_TIMEOUT_MS },
  );
  return (await fn(req)).data;
};

/** Tests swap the network call for a local implementation. */
export function setOnDemandTransport(t: Transport): void {
  transport = t;
}

// Identical requests issued while one is in flight share its promise (two
// hooks on the same screen asking for the same team make one call).
const inflight = new Map<string, Promise<unknown>>();

export async function callOnDemand<T>(req: OnDemandRequest): Promise<T> {
  const key = JSON.stringify(req);
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const p = transport(req)
    .then(res => res.data as T)
    .finally(() => { inflight.delete(key); });
  inflight.set(key, p);
  return p;
}

/** One-shot read of a Firestore doc as plain data (null when it doesn't exist). */
export async function readDoc<T>(path: string): Promise<T | null> {
  const snap = await getDoc(doc(db, path));
  return snap.exists() ? (snap.data() as T) : null;
}

interface LoadOptions<T> {
  /** Called with the expired copy while the refresh is in flight (stale-while-revalidate). */
  onStale?: (doc: T) => void;
}

/**
 * Read-through for an on-demand document. Resolves to the freshest doc
 * available: the Firestore copy when it hasn't expired, else the function's
 * answer; if the refresh fails the stale copy is returned rather than nothing.
 * Rejects only when there is no data at all.
 */
export async function loadCached<T extends FbCached>(
  path: string,
  req: OnDemandRequest,
  opts: LoadOptions<T> = {},
): Promise<T> {
  let cached: T | null = null;
  try {
    cached = await readDoc<T>(path);
  } catch {
    // Firestore unreachable — the function may still answer.
  }
  if (cached && !isExpired(cached, Date.now())) return cached;
  if (cached) opts.onStale?.(cached);
  try {
    return await callOnDemand<T>(req);
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}
