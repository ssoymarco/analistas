// ── seasonResolver — temporada ACTUAL por liga, dinámica ─────────────────────
//
// Bug del 11-jul-2026: los `currentSeasonId` de src/config/leagues.ts están
// hardcodeados y quedaron apuntando a temporadas 2025/26 TERMINADAS, así que
// la app mostraba la tabla vieja, "Sin partidos próximos" y el calendario de
// la temporada pasada — cuando SM ya tenía 2026/27 completa.
//
// La Cloud Function syncLeagueSeasons (2×/día) escribe el mapa real en
// `_meta/leagueSeasons`. Este módulo lo lee UNA vez por sesión (con espejo en
// AsyncStorage para arranques offline) y expone:
//   • getCurrentSeasonId(leagueId)  — async, garantiza el mapa cargado
//   • peekCurrentSeasonId(leagueId) — sync, para render (mapa ya precargado)
// Ambos caen al hardcode de config/leagues.ts si el doc no está disponible —
// el hardcode pasa de "fuente de verdad" a "fallback".

import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { getLeagueConfig } from '../config/leagues';

const STORAGE_KEY = 'league_seasons_map_v2';
/** Refrescar desde Firestore si el espejo local tiene más de 6 h. */
const REFRESH_MS = 6 * 60 * 60 * 1000;

let seasonMap: Record<string, number> = {};
let logoMap: Record<string, string> = {};
let loadedAt = 0;
let inflight: Promise<void> | null = null;

async function loadFromStorage(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        map?: Record<string, number>;
        logos?: Record<string, string>;
        at?: number;
      };
      if (parsed.map && typeof parsed.map === 'object') {
        seasonMap = parsed.map;
        logoMap = parsed.logos ?? {};
        loadedAt = parsed.at ?? 0;
      }
    }
  } catch { /* espejo local corrupto — se repuebla desde Firestore */ }
}

async function refreshFromFirestore(): Promise<void> {
  try {
    const snap = await getDoc(doc(db, '_meta', 'leagueSeasons'));
    const seasons = (snap.data()?.seasons ?? {}) as Record<
      string,
      { seasonId?: number; leagueLogo?: string | null }
    >;
    const map: Record<string, number> = {};
    const logos: Record<string, string> = {};
    for (const [leagueId, entry] of Object.entries(seasons)) {
      if (typeof entry?.seasonId === 'number' && entry.seasonId > 0) {
        map[leagueId] = entry.seasonId;
      }
      if (typeof entry?.leagueLogo === 'string' && entry.leagueLogo) {
        logos[leagueId] = entry.leagueLogo;
      }
    }
    if (Object.keys(map).length > 0) {
      seasonMap = map;
      logoMap = logos;
      loadedAt = Date.now();
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ map, logos, at: loadedAt })).catch(() => {});
    }
  } catch {
    // Sin red / doc aún no escrito — se queda el espejo local o el hardcode.
  }
}

/** Garantiza el mapa en memoria (espejo local primero, Firestore si caducó). */
export async function ensureSeasonMap(): Promise<void> {
  if (inflight) return inflight;
  if (Date.now() - loadedAt < REFRESH_MS && Object.keys(seasonMap).length > 0) return;
  inflight = (async () => {
    if (Object.keys(seasonMap).length === 0) await loadFromStorage();
    if (Date.now() - loadedAt >= REFRESH_MS || Object.keys(seasonMap).length === 0) {
      await refreshFromFirestore();
    }
  })().finally(() => { inflight = null; });
  return inflight;
}

/** Temporada actual de la liga (async — usar en hooks/loaders). */
export async function getCurrentSeasonId(leagueId: number): Promise<number | null> {
  await ensureSeasonMap();
  return peekCurrentSeasonId(leagueId);
}

/** Versión sync para render: mapa en memoria → hardcode → null.
 *  Precisa que ensureSeasonMap() haya corrido antes (se dispara al importar). */
export function peekCurrentSeasonId(leagueId: number): number | null {
  return seasonMap[String(leagueId)]
    ?? getLeagueConfig(leagueId)?.currentSeasonId
    ?? null;
}

/** Logo REAL de la liga (image_path de SM, vía _meta/leagueSeasons).
 *  La convención `leagues/{id}.png` sin subcarpeta sirve el asset VIEJO
 *  (Liga MX/La Liga desactualizados, 11-jul-2026) — usar esta primero. */
export function peekLeagueLogo(leagueId: number): string | null {
  return logoMap[String(leagueId)] ?? null;
}

// Precarga fire-and-forget al importar el módulo: para cuando el usuario
// llega a una pantalla de liga/equipo, el mapa ya está en memoria.
ensureSeasonMap().catch(() => {});
