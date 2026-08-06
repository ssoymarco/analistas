/**
 * sync-teams.ts
 *
 * Cloud Function: syncs full team info for every team that plays in any of
 * the 51 configured leagues. Writes one `teams/{teamId}` doc per team with
 * enough detail to power TeamDetailScreen without any client-side
 * SportMonks calls.
 *
 * Architecture rationale: previously `useTeamDetail` hit the SportMonks
 * proxy three times per team-page open (fetchTeamById + fetchSquad +
 * fetchTeamRecentFixtures). With ~15k users that scales linearly into the
 * API quota. This function pulls the data once per day per league and
 * serves every user from Firestore.
 *
 * Schedule: every 24h. Team info (stadium, coach, founded year) changes on
 * a weekly-to-yearly timescale, so daily is generous.
 *
 * Cost: 51 leagues × 1 call/league (single page typically holds all teams
 * including pagination) ≈ 60-100 SM calls/day. ~0.1% of the Pro plan.
 */

import { admin, db } from './admin-init';
import * as logger from 'firebase-functions/logger';
import { LEAGUES } from './config';
import { getCurrentSeasonMap } from './sync-league-seasons';
import { fetchTeamsForSeason, fetchVenueById, type SMTeamFull } from './sportmonks';
import type { TeamFullDoc } from './types';

const SLEEP_BETWEEN_LEAGUES_MS = 500;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Pull the active coach (or fall back to the first listed) and derive their
 * display fields. Mirrors the client's existing useTeamDetail logic so a
 * page rendered from Firestore looks identical to one fetched from the
 * proxy.
 */
function pickCoach(team: SMTeamFull): { name: string; image: string; age: number } {
  const coaches = team.coaches ?? [];
  const active = coaches.find(c => c.active !== false) ?? coaches[0] ?? null;
  if (!active) return { name: '', image: '', age: 0 };
  const name = active.display_name || active.common_name || active.name || '';
  const image = active.image_path ?? '';
  let age = 0;
  if (active.date_of_birth) {
    const birth = new Date(active.date_of_birth);
    if (!isNaN(birth.getTime())) {
      const now = new Date();
      age = now.getFullYear() - birth.getFullYear();
      if (now.getMonth() < birth.getMonth() ||
          (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) {
        age--;
      }
    }
  }
  return { name, image, age };
}

function mapTeamToDoc(
  team: SMTeamFull,
  leagueId: number,
  leagueName: string,
  seasonId: number,
): TeamFullDoc {
  const coach = pickCoach(team);
  // For World Cup national teams SM often returns a club venue (e.g. the
  // Mexico fed page shows Soldier Field Chicago). Clear venue for league 732
  // so the client doesn't need its existing isWCNationalTeam hack later.
  const isWcNational = leagueId === 732;
  return {
    id:             String(team.id),
    name:           team.name,
    shortName:      team.short_code || team.name.slice(0, 3).toUpperCase(),
    logo:           team.image_path ?? '',
    country:        team.country?.name ?? team.country?.official_name ?? '',
    founded:        team.founded ?? 0,
    venueName:      isWcNational ? '' : (team.venue?.name ?? ''),
    venueCity:      isWcNational ? '' : (team.venue?.city_name ?? ''),
    venueCapacity:  isWcNational ? 0  : (team.venue?.capacity ?? 0),
    venueImage:     isWcNational ? '' : (team.venue?.image_path ?? ''),
    coachName:      coach.name,
    coachImage:     coach.image,
    coachAge:       coach.age,
    leagueId,
    leagueName,
    currentSeasonId: seasonId,
    updatedAt:      admin.firestore.Timestamp.now(),
  };
}

// ── Estadio real, derivado de los partidos de local ─────────────────────────
//
// SportMonks mantiene un `venue` a nivel EQUIPO que se queda viejo cuando un
// club se muda: el Atlante seguía publicado en el Estadio Olímpico Andrés
// Quintana Roo (Cancún, cap. 17,289) mucho después de mudarse a Ciudad de
// México, y la ficha del equipo mostraba eso — reporte del dueño, 5 ago 2026.
//
// El dato bueno YA lo tenemos: el `venue` a nivel FIXTURE sí está al día (el
// partido del 25 jul dice "Mexico City Stadium / Mexico City"). Así que en vez
// de hardcodear excepciones — la lección de los season IDs — derivamos la sede
// de los últimos partidos de local y dejamos que se auto-corrija para
// cualquier equipo que se mude en el futuro.
//
// Se toma la MODA, no el último partido: un club puede jugar un partido suelto
// en sede neutral (una final, una gira) sin haberse mudado. Se exige mayoría
// real para no reescribir la sede por un solo dato raro.

/** Cuántos partidos de local recientes se miran. */
const HOME_VENUE_LOOKBACK = 7;
/** Apariciones mínimas de la sede ganadora para aceptar la corrección. */
const HOME_VENUE_MIN_HITS = 3;

interface DerivedVenue { venueId: number; name: string; city: string }

/**
 * Sede más frecuente entre los últimos partidos de local YA JUGADOS del equipo.
 * `null` si no hay datos suficientes (equipos de ligas que crawleamos parcial,
 * o recién ascendidos) — el caller conserva entonces el valor de SM.
 *
 * ⚠️ Usa `.select()`: los docs de `matches` pesan ~260 KB por el blob `detail`,
 * y leerlos completos para ~1,500 equipos al día repetiría el incidente de
 * egress de julio. La proyección server-side trae solo 3 campos. (El cliente
 * NO puede proyectar; el Admin SDK sí.)
 */
async function deriveHomeVenue(teamId: string): Promise<DerivedVenue | null> {
  const nowSm = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const snap = await db.collection('matches')
    .where('homeTeam.id', '==', teamId)
    .where('startingAtUtc', '<=', nowSm)
    .orderBy('startingAtUtc', 'desc')
    .limit(HOME_VENUE_LOOKBACK)
    .select('venueId', 'venueName', 'venueCity')
    .get();

  const tally = new Map<number, { hits: number; v: DerivedVenue }>();
  for (const doc of snap.docs) {
    const d = doc.data() as { venueId?: number; venueName?: string; venueCity?: string };
    if (!d.venueId || !d.venueName) continue;
    const entry = tally.get(d.venueId);
    if (entry) entry.hits++;
    else tally.set(d.venueId, {
      hits: 1,
      v: { venueId: d.venueId, name: d.venueName, city: d.venueCity ?? '' },
    });
  }

  let best: { hits: number; v: DerivedVenue } | null = null;
  for (const entry of tally.values()) {
    if (!best || entry.hits > best.hits) best = entry;
  }
  return best && best.hits >= HOME_VENUE_MIN_HITS ? best.v : null;
}

/**
 * Corrige la sede del doc cuando los partidos contradicen a SM. Capacidad e
 * imagen no vienen en el fixture, así que se piden a /venues/{id} — una sola
 * llamada por equipo REALMENTE mudado (un puñado al año), no por equipo.
 *
 * No-fatal: si algo falla se conserva lo que dijo SM.
 */
async function applyDerivedVenue(doc: TeamFullDoc): Promise<boolean> {
  try {
    const derived = await deriveHomeVenue(doc.id);
    if (!derived) return false;
    // SM ya coincide con la realidad → nada que hacer (el caso normal).
    if (derived.name === doc.venueName) return false;

    doc.venueName = derived.name;
    doc.venueCity = derived.city;
    // Capacidad/imagen del estadio VIEJO serían peor que nada junto al nombre
    // nuevo: se limpian y solo se repuebla si SM nos da la ficha del correcto.
    doc.venueCapacity = 0;
    doc.venueImage = '';
    const full = await fetchVenueById(derived.venueId);
    if (full) {
      if (full.capacity) doc.venueCapacity = full.capacity;
      if (full.image_path) doc.venueImage = full.image_path;
      if (full.city_name) doc.venueCity = full.city_name;
    }
    logger.info(`  🏟️ ${doc.name}: sede corregida → ${doc.venueName} (SM decía otra)`);
    return true;
  } catch (err) {
    logger.warn(`  🏟️ ${doc.name}: derivación de sede falló`, { err: String(err) });
    return false;
  }
}

export async function syncTeamsHandler(): Promise<void> {
  logger.info(`👥 syncTeams: starting for ${LEAGUES.length} leagues`);
  // Temporada actual dinámica (_meta/leagueSeasons); hardcode = fallback.
  const seasonMap = await getCurrentSeasonMap();

  let totalTeams = 0;
  let leagueErrors = 0;

  for (const league of LEAGUES) {
    const seasonId = seasonMap.get(league.id) ?? league.currentSeasonId;
    if (seasonId == null) {
      logger.debug(`👥 syncTeams: skipping ${league.name} — no currentSeasonId`);
      continue;
    }
    try {
      const teams = await fetchTeamsForSeason(seasonId);
      if (teams.length === 0) {
        logger.warn(`👥 syncTeams: 0 teams for ${league.name} (season ${seasonId})`);
        continue;
      }

      // Batch write. Firestore caps at 500 ops per batch — most leagues
      // (~20-50 teams) fit in one, but the safety check is here anyway.
      const batches: admin.firestore.WriteBatch[] = [];
      let current = db.batch();
      let opCount = 0;

      // Selecciones nacionales quedan fuera: mapTeamToDoc ya les vacía la sede
      // a propósito, y no tienen "partidos de local" en el sentido de un club.
      const isWcNational = league.id === 732;
      let venuesFixed = 0;

      for (const team of teams) {
        const doc = mapTeamToDoc(team, league.id, league.name, seasonId);
        if (!isWcNational && await applyDerivedVenue(doc)) venuesFixed++;
        const ref = db.collection('teams').doc(doc.id);
        // `merge: true` is intentional — preserves overrides from other
        // sync paths (e.g. a future syncTeamSocial function adding twitter/
        // instagram handles without us re-fetching from SM).
        current.set(ref, doc, { merge: true });
        opCount++;
        if (opCount >= 499) {
          batches.push(current);
          current = db.batch();
          opCount = 0;
        }
      }
      if (opCount > 0) batches.push(current);

      await Promise.all(batches.map(b => b.commit()));

      totalTeams += teams.length;
      logger.info(`  ✓ ${league.name}: ${teams.length} teams` +
        (venuesFixed ? ` (${venuesFixed} sede(s) corregida(s))` : ''));

      await sleep(SLEEP_BETWEEN_LEAGUES_MS); // rate-limit courtesy
    } catch (err) {
      leagueErrors++;
      logger.error(`  ✗ ${league.name} (season ${league.currentSeasonId}):`, err);
    }
  }

  logger.info(`✅ syncTeams: wrote ${totalTeams} teams across ${LEAGUES.length - leagueErrors} leagues (${leagueErrors} errors)`);
}
