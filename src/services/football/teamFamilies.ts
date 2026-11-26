// ── Youth national teams count as their senior team ──────────────────────────
//
// Following Mexico includes Mexico U17, U20…: the server links each youth
// national team to its senior team and publishes the links in
// `fb_meta/teamFamilies` (see functions/src/football/team-family.ts). The app
// reads that small document a couple of times a day and widens the list of
// followed teams with it — the notifications are widened on the server.

import type { FbTeamFamiliesDoc } from '../../../functions/src/shared/football/model';
import { AppCache } from '../cache';
import { readDoc } from './onDemand';

const CACHE_KEY = 'fb_team_families_v1';
const TTL_MS = 12 * 3600_000;

type Links = Record<string, string>;
let inFlight: Promise<Links> | null = null;

/** Youth team id → senior team id. Empty when it can't be read (offline, first run). */
export function getTeamFamilies(): Promise<Links> {
  inFlight ??= (async () => {
    const cached = await AppCache.get<Links>(CACHE_KEY).catch(() => null);
    if (cached) return cached;
    const doc = await readDoc<FbTeamFamiliesDoc>('fb_meta/teamFamilies').catch(() => null);
    const links = doc?.seniorOf ?? null;
    if (links) AppCache.set(CACHE_KEY, links, TTL_MS).catch(() => {});
    return links ?? {};
  })().finally(() => { inFlight = null; });
  return inFlight;
}

/** `followed` plus the youth teams of the national teams in it (no duplicates, same order first). */
export function withYouthTeams(followed: string[], links: Links): string[] {
  if (!followed.length) return followed;
  const mine = new Set(followed.map(String));
  const youth = Object.keys(links).filter(id => mine.has(String(links[id])) && !mine.has(id));
  return youth.length ? [...followed, ...youth.sort()] : followed;
}
