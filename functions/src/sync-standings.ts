/**
 * sync-standings.ts
 *
 * Cloud Function: syncs league standings and top scorers.
 * Scheduled every 6 hours for standings, every 12 hours for top scorers.
 *
 * Iterates through all configured leagues with valid seasonIds,
 * fetches standings/scorers from SportMonks, and writes to Firestore.
 */

import { db } from './admin-init';
import * as logger from 'firebase-functions/logger';
import { getLeaguesWithSeason } from './config';
import { getCurrentSeasonMap } from './sync-league-seasons';
import { fetchStandings, fetchTopScorers, fetchTeamsForSeason } from './sportmonks';
import { mapStandingsToDoc, mapTopScorersToDoc } from './mappers';
import { Timestamp } from 'firebase-admin/firestore';
import type { StandingsDoc } from './types';

/**
 * Tabla SINTETIZADA en ceros para temporadas que aún no arrancan.
 *
 * SM siembra las standings de cada temporada nueva en momentos distintos
 * (Liga MX y Premier ya; La Liga todavía no al 11-jul-2026). Mientras tanto
 * la pestaña Clasificación decía "no disponible" — feo para el usuario y
 * distinto entre ligas. Si SM devuelve 0 filas, construimos la tabla con los
 * equipos de la temporada, todos en cero, orden alfabético. La corrida
 * horaria la reemplaza con la real en cuanto SM la publique.
 *
 * Solo para formatos de LIGA (8–30 equipos): una "tabla" de la Copa del Rey
 * (~100 equipos) o un mundialito no tiene sentido — esas siguen mostrando
 * su empty state hasta tener grupos reales.
 */
async function synthesizeZeroTable(seasonId: number, leagueId: number): Promise<StandingsDoc | null> {
  const teams = await fetchTeamsForSeason(seasonId);
  if (teams.length < 8 || teams.length > 30) return null;
  const rows = teams
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map((t, i) => ({
      position: i + 1,
      team: {
        id: String(t.id),
        name: t.name,
        shortName: t.short_code || t.name.slice(0, 3).toUpperCase(),
        logo: t.image_path ?? '',
      },
      played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, goalDifference: 0,
      points: 0,
      groupId: null,
    }));
  return { seasonId, leagueId, rows, updatedAt: Timestamp.now() };
}

/** Utility: sleep for N milliseconds (rate limit courtesy) */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Sync standings for all configured leagues.
 * Processes 10 leagues at a time with 2-second pauses for rate limiting.
 */
export async function syncStandingsHandler(): Promise<void> {
  const leagues = getLeaguesWithSeason();
  // Temporada ACTUAL desde _meta/leagueSeasons (dinámico), no el hardcode —
  // el hardcode es solo el fallback dentro de getCurrentSeasonMap().
  const seasonMap = await getCurrentSeasonMap();
  logger.info(`📊 syncStandings: processing ${leagues.length} leagues`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < leagues.length; i++) {
    const league = leagues[i];
    const seasonId = seasonMap.get(league.id) ?? league.currentSeasonId!;

    try {
      const groups = await fetchStandings(seasonId);

      if (groups.length > 0) {
        const doc = mapStandingsToDoc(seasonId, league.id, groups);
        await db.collection('standings').doc(String(seasonId)).set(doc);
        successCount++;
      } else {
        // Temporada sin standings en SM (aún no arranca / no sembrada):
        // sintetizar tabla en ceros — pero NUNCA pisar una real ya escrita.
        const existing = await db.collection('standings').doc(String(seasonId)).get();
        const hasRealRows = existing.exists
          && Array.isArray(existing.data()?.rows)
          && (existing.data()!.rows as unknown[]).length > 0;
        if (!hasRealRows) {
          const zeroDoc = await synthesizeZeroTable(seasonId, league.id);
          if (zeroDoc) {
            await db.collection('standings').doc(String(seasonId)).set(zeroDoc);
            logger.info(`  🅾️ tabla en ceros sintetizada para ${league.name} (season ${seasonId}, ${zeroDoc.rows.length} equipos)`);
            successCount++;
          }
        }
      }
    } catch (err) {
      logger.error(`Failed standings for ${league.name} (season ${seasonId}):`, err);
      errorCount++;
    }

    // Rate limit: pause every 10 leagues
    if ((i + 1) % 10 === 0 && i < leagues.length - 1) {
      await sleep(2000);
    }
  }

  logger.info(`✅ syncStandings: ${successCount} ok, ${errorCount} errors`);
}

/**
 * Sync top scorers for all configured leagues. Fetches THREE separate stat
 * categories per league — goals (208), assists (209), yellow cards (84) —
 * and writes them all to the same topscorers/{seasonId} document so
 * useLeagueDetail can render all three tabs from Firestore in one read.
 *
 * Cost: 51 leagues × 3 categories = 153 SM calls per run on the
 * `topscorers` entity. At the every-15-min schedule that's ~14.7k/day
 * (~20% of the ~73k/day cap; 612 calls/hour, well under SM's 3k/hour/entity
 * limit). Bumped from hourly during the 2026 World Cup so the goleadores
 * table tracks live goals within 15 min instead of up to an hour.
 */
export async function syncTopScorersHandler(): Promise<void> {
  const leagues = getLeaguesWithSeason();
  const seasonMap = await getCurrentSeasonMap();
  logger.info(`🏅 syncTopScorers: processing ${leagues.length} leagues (3 categories each)`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < leagues.length; i++) {
    const league = leagues[i];
    const seasonId = seasonMap.get(league.id) ?? league.currentSeasonId!;

    try {
      const [goals, assists, cards] = await Promise.all([
        fetchTopScorers(seasonId, 208).catch(() => []),
        fetchTopScorers(seasonId, 209).catch(() => []),
        fetchTopScorers(seasonId, 84).catch(() => []),
      ]);

      if (goals.length > 0 || assists.length > 0 || cards.length > 0) {
        const goalsDoc = mapTopScorersToDoc(seasonId, league.id, goals);
        const assistsList = assists.length > 0
          ? mapTopScorersToDoc(seasonId, league.id, assists).scorers
          : [];
        const cardsList = cards.length > 0
          ? mapTopScorersToDoc(seasonId, league.id, cards).scorers
          : [];
        await db.collection('topscorers').doc(String(seasonId)).set({
          ...goalsDoc,
          assists: assistsList,
          cards: cardsList,
        });
        successCount++;
      }
    } catch (err) {
      logger.error(`Failed top scorers for ${league.name} (season ${seasonId}):`, err);
      errorCount++;
    }

    // Rate limit: pause every 10 leagues
    if ((i + 1) % 10 === 0 && i < leagues.length - 1) {
      await sleep(2000);
    }
  }

  logger.info(`✅ syncTopScorers: ${successCount} ok, ${errorCount} errors`);
}
