/**
 * football/catalog.ts
 *
 * The league catalog: every competition API-Sports covers, with its CURRENT
 * season, written nightly by the backend to `fb_meta/leagueCatalog`. It
 * answers "which season is this league in?" without hard-coding anything —
 * the season rolls over on the server and every device follows.
 *
 * Season keys: screens and navigation params carry a single number per season
 * (`seasonId`). It is `leagueId × 10000 + season year` (see fbSeasonKey), which
 * identifies both the league and the season.
 *
 * Memory-first with an AsyncStorage mirror, so `peek*` helpers answer
 * synchronously after the first load and cold starts don't wait for the
 * network.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  fbSeasonKey, parseFbSeasonKey, type FbCatalogEntry,
} from '../../../functions/src/shared/football/model';
import { COPYRIGHT_SENSITIVE_LEAGUE_IDS, getFootballLeague } from '../../../functions/src/shared/football/leagues';

const STORAGE_KEY = 'fb_league_catalog_v1';
const REFRESH_MS = 12 * 60 * 60 * 1000;

let leagues: Record<string, FbCatalogEntry> = {};
let loadedAt = 0;
let inflight: Promise<void> | null = null;

const hasData = () => Object.keys(leagues).length > 0;

async function loadFromStorage(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { leagues?: Record<string, FbCatalogEntry>; at?: number };
    if (parsed.leagues && typeof parsed.leagues === 'object') {
      leagues = parsed.leagues;
      loadedAt = parsed.at ?? 0;
    }
  } catch { /* corrupt mirror — refilled from Firestore */ }
}

async function refreshFromFirestore(): Promise<void> {
  try {
    const snap = await getDoc(doc(db, 'fb_meta', 'leagueCatalog'));
    const fresh = (snap.data()?.leagues ?? {}) as Record<string, FbCatalogEntry>;
    if (Object.keys(fresh).length > 0) {
      leagues = fresh;
      loadedAt = Date.now();
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ leagues, at: loadedAt })).catch(() => {});
    }
  } catch {
    // Offline: keep whatever we have (memory or mirror).
  }
}

/** Make sure the catalog is in memory (and refresh it when older than 12 h). */
export async function ensureCatalog(): Promise<void> {
  if (inflight) return inflight;
  if (hasData() && Date.now() - loadedAt < REFRESH_MS) return;
  inflight = (async () => {
    if (!hasData()) await loadFromStorage();
    if (!hasData()) {
      await refreshFromFirestore(); // nothing to show yet — wait for the network
    } else if (Date.now() - loadedAt >= REFRESH_MS) {
      refreshFromFirestore().catch(() => {}); // stale mirror is fine meanwhile
    }
  })().finally(() => { inflight = null; });
  return inflight;
}

export function peekCatalogEntry(leagueId: number | string): FbCatalogEntry | undefined {
  return leagues[String(leagueId)];
}

/** Current season YEAR of a league (2026 for 2026 or 2026/27), or null when unknown. */
export function peekCurrentSeason(leagueId: number | string): number | null {
  return leagues[String(leagueId)]?.s ?? null;
}

/** Season key (`seasonId`) of a league's current season. */
export function peekCurrentSeasonId(leagueId: number | string): number | null {
  const year = peekCurrentSeason(leagueId);
  return year ? fbSeasonKey(leagueId, year) : null;
}

export async function getCurrentSeasonId(leagueId: number | string): Promise<number | null> {
  await ensureCatalog();
  return peekCurrentSeasonId(leagueId);
}

/** League logo from the catalog (null for competitions whose crest we don't show). */
export function peekLeagueLogo(leagueId: number | string): string | null {
  if (COPYRIGHT_SENSITIVE_LEAGUE_IDS.has(Number(leagueId))) return null;
  return leagues[String(leagueId)]?.logo ?? null;
}

/**
 * Knockout competition (shows a bracket instead of a league table)? Curated
 * leagues say so in their config; for the rest the catalog's type decides.
 */
export function isCupLeague(leagueId: number | string): boolean {
  const curated = getFootballLeague(leagueId);
  if (curated) return !!curated.isCup;
  return leagues[String(leagueId)]?.t === 'Cup';
}

/** Split a season key back into league and year. */
export function parseSeasonId(seasonId: number | null | undefined): { leagueId: number; season: number } | null {
  return seasonId ? parseFbSeasonKey(seasonId) : null;
}

/**
 * Display name of a season: "2026/27" for competitions that span two calendar
 * years, "2026" for calendar-year ones. `range` (the season's own dates) wins;
 * otherwise the shape of the league's current season decides.
 */
export function seasonLabel(leagueId: number | string, season: number, range?: { start?: string | null; end?: string | null }): string {
  const entry = leagues[String(leagueId)];
  const start = range?.start ?? (entry?.s === season ? entry?.b : null);
  const end = range?.end ?? (entry?.s === season ? entry?.e : null);
  let spansTwoYears: boolean;
  if (start && end) spansTwoYears = Number(end.slice(0, 4)) > Number(start.slice(0, 4));
  else spansTwoYears = !!(entry?.b && entry?.e && Number(entry.e.slice(0, 4)) > Number(entry.b.slice(0, 4)));
  return spansTwoYears ? `${season}/${String(season + 1).slice(2)}` : String(season);
}

export interface CatalogLeague {
  id: number;
  name: string;
  country: string;
  /** 'League' | 'Cup' */
  type: string;
  logo: string;
  flag: string | null;
  season: number | null;
}

/** Every league in the catalog (empty until `ensureCatalog` resolves). */
export function getCatalogLeagues(): CatalogLeague[] {
  return Object.entries(leagues).map(([id, e]) => ({
    id: Number(id), name: e.n, country: e.c, type: e.t, logo: e.logo, flag: e.flag, season: e.s,
  }));
}

// Warm up on module load so the first league/standings screen doesn't wait.
ensureCatalog().catch(() => {});
