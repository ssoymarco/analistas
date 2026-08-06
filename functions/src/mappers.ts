/**
 * mappers.ts
 *
 * Transform SportMonks API responses into Firestore document shapes.
 * Mirrors the client-side sportsApi.ts mapping logic for server-side use.
 */

import { Timestamp } from 'firebase-admin/firestore';
import { getLeagueConfig } from './config';
import {
  LIVE_STATE_IDS, FINISHED_STATE_IDS, DEAD_STATE_IDS, SM_STATE_IDS, SM_EVENT_TYPES,
  STANDING_DETAIL_TYPES,
} from './types';
import type {
  SMFixture, SMStandingGroup, SMTopScorer,
  MatchDoc, TeamDoc, StandingRowDoc, StandingsDoc, TopScorerDoc, TopScorersDoc,
} from './types';

// ── State Label Mapping ─────────────────────────────────────────────────────

function getStateLabel(stateId: number): string | null {
  switch (stateId) {
    case SM_STATE_IDS.FIRST_HALF: return '1T';
    case SM_STATE_IDS.HALF_TIME:  return 'HT';
    case SM_STATE_IDS.SECOND_HALF: return '2T';
    case SM_STATE_IDS.EXTRA_TIME: return 'ET';
    case SM_STATE_IDS.PENALTIES:  return 'PEN';
    // BREAK (4) = terminaron los 90', viene PRÓRROGA — NO es medio tiempo.
    // Mapearlo a 'HT' hacía que app y Live Activity dijeran "MT/DESCANSO"
    // al final del tiempo regular (ARG-SUI 11 jul 2026, reporte del dueño).
    case SM_STATE_IDS.BREAK:              return 'ETB';
    case SM_STATE_IDS.EXTRA_TIME_BREAK:   return 'ETB'; // entre tiempos extra
    case SM_STATE_IDS.PEN_BREAK:          return 'PEN'; // dentro de la tanda
    case SM_STATE_IDS.SUSPENDED:   return 'SUSP';
    case SM_STATE_IDS.INTERRUPTED: return 'INT';
    default: return null;
  }
}

// States where the match is in progress but temporarily halted (weather,
// floodlight failure, crowd incident, etc.). SportMonks keeps these distinct
// from both "live" and "dead/postponed/cancelled". We map them to 'live' so the
// deployed client — which only understands live/finished/scheduled — renders
// the in-progress view with the current score instead of reverting to the
// pre-match "Previa" screen. The distinct stateLabel ('SUSP'/'INT') lets newer
// clients surface the interrupted treatment by reading stateId.
const PAUSED_LIVE_STATE_IDS = new Set<number>([
  SM_STATE_IDS.SUSPENDED,    // 11
  SM_STATE_IDS.INTERRUPTED,  // 18
]);

/**
 * Map a SportMonks state_id to our internal MatchStatus.
 *
 * Why the time-based fallback exists:
 *   1. SportMonks occasionally adds new state IDs (or our constants drift out
 *      of date — see the historical note in types.ts). Without a fallback,
 *      any unknown ID silently becomes 'scheduled' and the client renders
 *      the pre-match view for an active live match.
 *   2. Some lower-tier or regional feeds lag — they keep `state_id: 1`
 *      (NOT_STARTED) for several minutes after actual kickoff.
 *
 * The fallback is intentionally conservative:
 *   - Only triggers for state IDs we don't recognize (or NOT_STARTED).
 *   - Never overrides a DEAD state (postponed/cancelled/abandoned/etc.).
 *   - 2-min minimum elapsed avoids prematurely marking a fixture live just
 *     because clocks are slightly off.
 *   - 135-min maximum elapsed covers 90' regulation + ~15' HT + 30' ET +
 *     ~5' penalty shootout + buffer, while still rejecting matches that
 *     started hours ago and clearly should have ended.
 *
 * Mirror of `mapStateToStatus` in src/services/sportsApi.ts — keep both
 * in sync so server-side writes match client-side reads.
 */
function getMatchStatus(
  stateId: number,
  startingAt?: string,
): 'live' | 'finished' | 'scheduled' {
  if ((LIVE_STATE_IDS as Set<number>).has(stateId)) return 'live';
  if ((FINISHED_STATE_IDS as Set<number>).has(stateId)) return 'finished';
  // Suspended/interrupted matches are in progress — surface them as 'live'
  // (checked BEFORE the dead set, which also lists these IDs to suppress the
  // time-based "won't happen" inference). Keeps a live-but-paused match out of
  // the scheduled bucket so the client never reverts to the pre-match view.
  if (PAUSED_LIVE_STATE_IDS.has(stateId)) return 'live';
  // Estados MUERTOS (cancelado/pospuesto/abandonado/eliminado) → 'finished',
  // que es TERMINAL. Antes se mapeaban a 'scheduled' con la idea de "nunca
  // inferir en vivo", PERO la heurística del cliente (reapplyLiveStatus en
  // firestoreApi.ts) revive cualquier 'scheduled' con kickoff pasado como
  // 'live' por 135 min → reloj desbocado (incidente Chivas vs U. de G.,
  // 11 jul 2026: SM canceló un amistoso que sí se jugaba y la app mostró
  // "EN VIVO · 119:08'"). 'finished' corta la cadena: el cliente jamás
  // revive un partido terminado, y si SM lo resucita, el sync lo re-mapea.
  if ((DEAD_STATE_IDS as Set<number>).has(stateId)) return 'finished';

  // Time-based inference for NOT_STARTED, unknown IDs, or lagging feeds.
  if (startingAt) {
    const kickoffMs = new Date(startingAt.replace(' ', 'T') + 'Z').getTime();
    if (!Number.isNaN(kickoffMs)) {
      const elapsedMin = (Date.now() - kickoffMs) / 60000;
      if (elapsedMin > 2 && elapsedMin < 135) return 'live';
    }
  }
  return 'scheduled';
}

// ── Red cards ───────────────────────────────────────────────────────────────

/**
 * Expulsados de un lado (roja directa + doble amarilla).
 *
 * ⚠️ Filtra `cancelled`. Cuando el VAR revoca una expulsión, SportMonks
 * normalmente BORRA el evento del arreglo (verificado en Atlante vs América,
 * 24 jul 2026, fixture 19715303: tras la revocación de la roja a Rodolfo Cota
 * no queda ningún evento tipo 20/21). Pero el payload define `cancelled` y
 * algunos feeds lo usan en vez de borrar — contar un evento cancelado dejaría
 * al jugador expulsado para siempre en la UI. Cubrimos ambas variantes.
 *
 * Fuente única: detect-changes.ts importa esta misma función para que el
 * conteo del doc y el de la detección de cambios no puedan divergir.
 */
export function countRedCardsForSide(
  fixture: Pick<SMFixture, 'events'>,
  participantId: number | undefined,
): number {
  if (!fixture.events || !participantId) return 0;
  let count = 0;
  for (const ev of fixture.events) {
    if (ev.participant_id !== participantId) continue;
    if (ev.cancelled === true) continue;
    if (ev.type_id === SM_EVENT_TYPES.RED_CARD ||
        ev.type_id === SM_EVENT_TYPES.SECOND_YELLOW) {
      count++;
    }
  }
  return count;
}

// ── Live Minute Calculation ─────────────────────────────────────────────────

function calculateLiveMinute(fixture: SMFixture): number | null {
  const status = getMatchStatus(fixture.state_id, fixture.starting_at);
  if (status !== 'live') return null;
  // Suspended/interrupted: in progress but the clock isn't ticking. Return null
  // so the UI shows the 'SUSP'/'INT' label instead of a bogus elapsed minute.
  if (PAUSED_LIVE_STATE_IDS.has(fixture.state_id)) return null;
  // Penalty shootout: the game clock is NOT running — no minute (UI shows "PEN").
  if (fixture.state_id === SM_STATE_IDS.PENALTIES) return null;
  if (fixture.state_id === SM_STATE_IDS.HALF_TIME) return 45;

  // Prefer the ticking-period anchor (started + counts_from). SportMonks resets
  // `started` when a period (re)begins, so this tracks the REAL played minute
  // across stoppages. A wall-clock-from-kickoff estimate counts a long
  // suspension (e.g. weather) as match time and inflates the minute — e.g.
  // reporting 177' for a match that resumed and is actually at 54', which then
  // pushes the pressure-chart playhead to the far right of the axis.
  const anchor = getLiveClockAnchor(fixture);
  if (anchor) {
    const nowSec = Math.floor(Date.now() / 1000);
    const elapsedMin = Math.floor((nowSec - anchor.periodStartedAt) / 60);
    return Math.max(1, anchor.periodMinuteOffset + elapsedMin);
  }

  // SM SÍ mandó periodos pero ninguno da ancla usable (ninguno ticking, o el
  // ticking es basura — guard de plausibilidad). Eso significa reloj parado o
  // datos rotos: CONGELAR (null → el merge conserva el último minuto bueno).
  // Caer al estimador de pared aquí es lo que infló el minuto contando la
  // suspensión por tormenta como juego (Inter Miami 5 ago 2026, "174'"). El
  // estimador queda SOLO para feeds que no traen periodos en absoluto.
  if (fixture.periods && fixture.periods.length > 0) return null;

  // Fallback: wall-clock from kickoff when the feed has no period data at all.
  const kickoffTs = fixture.starting_at_timestamp;
  if (!kickoffTs) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const elapsedMin = Math.floor((nowSec - kickoffTs) / 60);

  // If second half (or beyond), subtract 15 min half-time break.
  // Tope 105 (90' + descuento récord ~14'): sin él, cualquier retraso del
  // kickoff o pausa larga se cuenta como juego y el minuto se desboca.
  if (fixture.state_id === SM_STATE_IDS.SECOND_HALF) {
    return Math.max(46, Math.min(elapsedMin - 15, 105));
  }
  // Prórroga sin datos de periodos: el estimador de pared no sabe descontar
  // los DOS descansos — el clamp de abajo inventaba "45'" (Isla Dinámica,
  // ARG-SUI 11 jul 2026). Mejor null: el merge conserva el minuto bueno.
  if (fixture.state_id === SM_STATE_IDS.EXTRA_TIME) return null;

  return Math.max(1, Math.min(elapsedMin, 45));
}

// ── Time Display ────────────────────────────────────────────────────────────

function formatTimeDisplay(fixture: SMFixture, status: 'live' | 'finished' | 'scheduled', minute: number | null): string {
  if (status === 'finished') return 'FT';
  if (status === 'live' && fixture.state_id === SM_STATE_IDS.HALF_TIME) return 'HT';
  if (status === 'live' && fixture.state_id === SM_STATE_IDS.PENALTIES) return 'PEN';
  // Suspended/interrupted: legacy clients (≤ v1.1.x) render this `time` string
  // verbatim and have no i18n key for the state, so we write the full word here.
  // Newer clients derive 'interrupted' from stateId and localise via i18n,
  // ignoring this field. Audience is es-MX, so Spanish is the safe default.
  if (status === 'live' && PAUSED_LIVE_STATE_IDS.has(fixture.state_id)) {
    return fixture.state_id === SM_STATE_IDS.SUSPENDED ? 'Suspendido' : 'Interrumpido';
  }
  if (status === 'live' && minute) return `${minute}'`;

  // Scheduled: store the raw UTC HH:MM. We can't compute the user's local time
  // server-side (GCP runs in UTC, the client knows its own timezone). The app
  // uses `startingAtUtc` to render the final local time per-user; this `time`
  // string is a UTC fallback for any read path that doesn't do that conversion.
  return fixture.starting_at?.slice(11, 16) ?? '--:--';
}

// ── Score Extraction ────────────────────────────────────────────────────────

function extractScores(fixture: SMFixture): {
  homeScore: number; awayScore: number;
  homeScoreHT: number | null; awayScoreHT: number | null;
  homePenScore: number | null; awayPenScore: number | null;
} {
  let homeScore = 0, awayScore = 0;
  let homeScoreHT: number | null = null, awayScoreHT: number | null = null;
  // Penalty shootout final score — kept as `null` rather than 0 so the
  // client can distinguish "no shootout took place" from "shootout ended 0-0"
  // (which is impossible in practice but useful semantically).
  let homePenScore: number | null = null, awayPenScore: number | null = null;

  if (fixture.scores && Array.isArray(fixture.scores)) {
    for (const s of fixture.scores) {
      // CURRENT = the regulation/ET score (i.e. the in-play total). For a
      // fixture that ends in penalties this stays at the ET tied value
      // (e.g. 3-3 for the 2022 final) — the shootout result lives in a
      // separate row described as 'PENALTIES' (see below).
      if (s.description === 'CURRENT') {
        if (s.score.participant === 'home') homeScore = s.score.goals;
        else awayScore = s.score.goals;
      } else if (s.description === '1ST_HALF') {
        if (s.score.participant === 'home') homeScoreHT = s.score.goals;
        else awayScoreHT = s.score.goals;
      } else if (s.description === 'PENALTIES' || s.description === 'PENALTY_SHOOTOUT') {
        // SportMonks v3 docs spell it 'PENALTIES'; some legacy/third-party
        // feeds use the more literal 'PENALTY_SHOOTOUT'. Accept both — the
        // semantic is identical (final shootout tally).
        if (s.score.participant === 'home') homePenScore = s.score.goals;
        else awayPenScore = s.score.goals;
      }
    }
  }

  return { homeScore, awayScore, homeScoreHT, awayScoreHT, homePenScore, awayPenScore };
}

// ── Live clock anchor ───────────────────────────────────────────────────────
// Extract the timestamp + minute offset of the currently-ticking period so the
// client can smoothly advance the displayed minute between server polls.
// Mirrors `getLiveClockAnchor` in src/services/sportsApi.ts so both ends of the
// pipeline use the same logic. Returns undefined for HT (no period ticking),
// scheduled, and finished matches — the client falls back to `minute` then.
function getLiveClockAnchor(fixture: SMFixture):
  | { periodStartedAt: number; periodMinuteOffset: number }
  | undefined
{
  // Penalty shootout: don't advance any clock — the UI shows "PEN".
  if (fixture.state_id === SM_STATE_IDS.PENALTIES) return undefined;
  const periods = fixture.periods;
  if (!periods || periods.length === 0) return undefined;
  const ticking = periods.find(p => p.ticking);
  if (!ticking) return undefined;
  const offset = Math.max(0, typeof ticking.counts_from === 'number' ? ticking.counts_from : 0);

  // ANCLA SINTÉTICA desde el minuto OFICIAL de SM (minutes/seconds) — es el
  // mismo reloj de la TV. Anclar a `started` sobrecontaba: la prórroga es UN
  // periodo (counts_from 90, ambos tiempos) cuyo `started` no descuenta el
  // descanso entre TE1 y TE2 → la app iba ~5 min adelante de la transmisión
  // (116' vs 111:39, ARG-SUI 11 jul 2026). Cuantizada a 30s para no churnear
  // el fingerprint del doc (jitter de polling ±s no cambia el ancla).
  if (typeof ticking.minutes === 'number' && ticking.minutes >= offset) {
    const playedSec = (ticking.minutes - offset) * 60 +
      (typeof ticking.seconds === 'number' ? ticking.seconds : 0);
    const synthetic = Math.floor(Date.now() / 1000) - playedSec;
    return {
      periodStartedAt: Math.round(synthetic / 30) * 30,
      periodMinuteOffset: offset,
    };
  }

  // Fallback legado: timestamp real de inicio del periodo.
  if (typeof ticking.started !== 'number' || ticking.started <= 0) return undefined;

  // ── Guard de plausibilidad ──
  // Un partido REANUDADO tras suspensión por tormenta llega con counts_from =
  // minuto real de la pausa (p. ej. 96) pero `started` = inicio ORIGINAL del
  // periodo — el ancla doble-cuenta: offset + (now − started) = 96 + 78 = 174
  // (Inter Miami vs San Luis, 5 ago 2026: la app dijo "174:00'" con el
  // partido en ~96'; ver también el comentario del incidente "177'" arriba).
  // Si el minuto derivado rebasa el tope del periodo + descuento récord, el
  // ancla es basura → undefined. El caller congela el minuto (mejor el último
  // bueno que uno inventado).
  const derivedMin = offset + Math.floor((Date.now() / 1000 - ticking.started) / 60);
  const periodCap = offset >= 90 ? 120 : offset >= 45 ? 90 : 45;
  if (derivedMin > periodCap + 20) return undefined;

  return {
    periodStartedAt: ticking.started,
    periodMinuteOffset: offset,
  };
}

// ── Live enrichment extractor ───────────────────────────────────────────────
// Pulls the subset of SMFixture fields that change during a live match —
// events, statistics, periods. Returned as a plain object suitable for
// nesting under MatchDoc.detail. Skips undefined values to keep Firestore
// happy.
function extractLiveEnrichment(fixture: SMFixture): Record<string, unknown> | null {
  const f = fixture as any;
  const out: Record<string, unknown> = {};
  let any = false;
  if (Array.isArray(f.events))     { out.events     = f.events;     any = true; }
  if (Array.isArray(f.statistics)) { out.statistics = f.statistics; any = true; }
  if (Array.isArray(f.periods))    { out.periods    = f.periods;    any = true; }
  return any ? out : null;
}

// ── Fixture → MatchDoc ──────────────────────────────────────────────────────

export function mapFixtureToMatchDoc(fixture: SMFixture): MatchDoc | null {
  const participants = fixture.participants ?? [];
  const home = participants.find(p => p.meta?.location === 'home');
  const away = participants.find(p => p.meta?.location === 'away');

  if (!home || !away) return null;

  const status = getMatchStatus(fixture.state_id, fixture.starting_at);
  const minute = calculateLiveMinute(fixture);
  const {
    homeScore, awayScore, homeScoreHT, awayScoreHT, homePenScore, awayPenScore,
  } = extractScores(fixture);
  const time = formatTimeDisplay(fixture, status, minute);

  // League info from config or SM response
  const leagueCfg = getLeagueConfig(fixture.league_id);
  const league = fixture.league;

  const homeTeam: TeamDoc = {
    id: String(home.id),
    name: home.name,
    shortName: home.short_code || home.name.slice(0, 3).toUpperCase(),
    logo: home.image_path,
  };

  const awayTeam: TeamDoc = {
    id: String(away.id),
    name: away.name,
    shortName: away.short_code || away.name.slice(0, 3).toUpperCase(),
    logo: away.image_path,
  };

  const doc: MatchDoc = {
    id: String(fixture.id),
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    homeScoreHT,
    awayScoreHT,
    homePenScore,
    awayPenScore,
    status,
    stateId: fixture.state_id,
    // For finished fixtures we suppress the in-game stateLabel ("HT", "2T",
    // "ET" …) so the UI doesn't keep rendering "DESCANSO" or "EN VIVO" on a
    // match that ended hours/years ago. The UI uses status='finished' alone
    // to drive the "FT" / final-score presentation.
    stateLabel: status === 'finished' ? null : getStateLabel(fixture.state_id),
    minute,
    time,
    // ⚠️ Si el reloj está CONGELADO (minute null en vivo, sin etiqueta propia
    // tipo HT/PEN/Suspendido), estos dos campos se ELIMINAN del doc más abajo
    // — escribir null con merge:true no conserva nada: pisa el último minuto
    // bueno y `time` cae al string de kickoff ("23:30") en pleno partido.
    league: leagueCfg?.name ?? league?.name ?? 'Unknown',
    leagueId: String(fixture.league_id),
    leagueLogo: league?.image_path ?? '',
    date: fixture.starting_at?.slice(0, 10) ?? '',
    startingAtUtc: fixture.starting_at ?? '',
    seasonId: fixture.season_id ?? null,
    updatedAt: Timestamp.now(),
  };

  const smDetails = (fixture as { details?: string }).details;
  if (typeof smDetails === 'string' && smDetails.length > 0) {
    doc.details = smDetails;
  }
  if (home.placeholder === true) doc.homePlaceholder = true;
  if (away.placeholder === true) doc.awayPlaceholder = true;

  if (fixture.stage_id) doc.stageId = fixture.stage_id;
  if (fixture.round_id) doc.roundId = fixture.round_id;
  const groupId = (fixture as { group_id?: number | null }).group_id;
  if (groupId != null) doc.groupId = groupId;
  const stage = (fixture as { stage?: unknown }).stage;
  if (stage) doc.stage = stage;
  const round = (fixture as { round?: unknown }).round;
  if (round) doc.round = round;
  const group = (fixture as { group?: unknown }).group;
  if (group) doc.group = group;
  // Expulsados por lado. El cliente ya los pintaba (`<RedCards>` en
  // MatchCard.tsx) pero el servidor NUNCA escribió estos campos desde la
  // migración a Firestore-first: el indicador de roja llevaba meses muerto en
  // el feed. Además le da al guard de VAR (deliver-delayed-push.ts) una fuente
  // barata para saber si una roja sigue vigente al momento de entregar un push
  // retrasado de Modo Estadio.
  doc.homeRedCards = countRedCardsForSide(fixture, home.id);
  doc.awayRedCards = countRedCardsForSide(fixture, away.id);

  if (fixture.venue_id) doc.venueId = fixture.venue_id;
  const venue = (fixture as { venue?: { name?: string; city_name?: string } }).venue;
  if (venue?.name) doc.venueName = venue.name;
  if (venue?.city_name) doc.venueCity = venue.city_name;

  // Live clock anchor — populated only when a period is actively ticking.
  // Without this the client UI freezes the minute between server polls (15s
  // intervals); with it the displayed minute advances smoothly every second.
  //
  // ⚠️ SIEMPRE escribir el campo (null cuando no corre): el doc se escribe
  // con merge:true, así que OMITIRLO dejaba el ancla VIEJA viva en Firestore
  // durante descansos/breaks — la Live Activity seguía contando (109:01 en
  // el descanso de la prórroga, ARG-SUI 11 jul 2026, reporte del dueño).
  // Solo cuando el feed TRAE periodos podemos afirmar algo del reloj:
  // syncFixtures/crawls (sin include=periods... hasta hoy) NO deben pisar el
  // ancla buena del poll ni con null ni con basura.
  if (Array.isArray(fixture.periods)) {
    const liveClock = getLiveClockAnchor(fixture);
    doc.liveClock = liveClock ?? null;
  }

  // Optional live enrichment — only present when called from pollLivescores
  // (which pulls events/statistics/periods on /livescores/inplay).
  const liveEnrich = extractLiveEnrichment(fixture);
  if (liveEnrich) {
    doc.detail = liveEnrich;
    doc.detailUpdatedAt = Timestamp.now();
  }

  // ── Reloj congelado: OMITIR minute/time, no escribir null ──────────────────
  // calculateLiveMinute devuelve null cuando el reloj no debe avanzar (pausa
  // por tormenta, ancla implausible de un partido reanudado, prórroga sin
  // periodos). Con merge:true, escribir null PISA el último minuto bueno y
  // `time` cae al HH:MM de kickoff en pleno partido. Al eliminar los campos,
  // Firestore conserva el último valor bueno — congelado de verdad (Inter
  // Miami vs San Luis, 5 ago 2026). Estados con etiqueta propia (HT/PEN/
  // Suspendido/Interrumpido) NO se tocan: su `time` es la etiqueta, no un
  // minuto, y debe escribirse.
  const FROZEN_LABEL_STATES: number[] = [
    SM_STATE_IDS.HALF_TIME, SM_STATE_IDS.PENALTIES,
    SM_STATE_IDS.SUSPENDED, SM_STATE_IDS.INTERRUPTED,
  ];
  if (status === 'live' && minute === null && !FROZEN_LABEL_STATES.includes(fixture.state_id)) {
    delete (doc as { minute?: number | null }).minute;
    delete (doc as { time?: string }).time;
  }

  return doc;
}

// ── Standings → StandingsDoc ────────────────────────────────────────────────

function getDetailValue(details: Array<{ type_id: number; value: number }> | undefined, typeId: number): number {
  return details?.find(d => d.type_id === typeId)?.value ?? 0;
}

export function mapStandingsToDoc(
  seasonId: number,
  leagueId: number,
  groups: SMStandingGroup[],
): StandingsDoc {
  const rows: StandingRowDoc[] = [];

  for (const group of groups) {
    const entries = group.standings?.data ?? [];
    for (const entry of entries) {
      if (!entry.participant) continue;

      rows.push({
        position: entry.position,
        team: {
          id: String(entry.participant.id),
          name: entry.participant.name,
          shortName: entry.participant.short_code || entry.participant.name.slice(0, 3).toUpperCase(),
          logo: entry.participant.image_path,
        },
        played:         getDetailValue(entry.details, STANDING_DETAIL_TYPES.GP),
        won:            getDetailValue(entry.details, STANDING_DETAIL_TYPES.W),
        drawn:          getDetailValue(entry.details, STANDING_DETAIL_TYPES.D),
        lost:           getDetailValue(entry.details, STANDING_DETAIL_TYPES.L),
        goalsFor:       getDetailValue(entry.details, STANDING_DETAIL_TYPES.GF),
        goalsAgainst:   getDetailValue(entry.details, STANDING_DETAIL_TYPES.GA),
        goalDifference: getDetailValue(entry.details, STANDING_DETAIL_TYPES.GD),
        points: entry.points,
        groupId: entry.group_id ?? null,
      });
    }
  }

  // Sort by position
  rows.sort((a, b) => a.position - b.position);

  return {
    seasonId,
    leagueId,
    rows,
    updatedAt: Timestamp.now(),
  };
}

// ── Top Scorers → TopScorersDoc ─────────────────────────────────────────────

export function mapTopScorersToDoc(
  seasonId: number,
  leagueId: number,
  scorers: SMTopScorer[],
): TopScorersDoc {
  // SM returns one entry per stat type. type_id 208 = goals (most common).
  // Group by player, take the highest total as goals.
  const playerMap = new Map<number, TopScorerDoc>();

  for (const s of scorers) {
    const pid = s.player_id;
    const existing = playerMap.get(pid);
    if (!existing || s.total > existing.goals) {
      playerMap.set(pid, {
        playerId: String(pid),
        playerName: s.player?.display_name ?? s.player?.common_name ?? `Player ${pid}`,
        playerImage: s.player?.image_path ?? '',
        // Team info now arrives via the `participant` include on the topscorers
        // query — see fetchTopScorers in sportmonks.ts.
        teamName: s.participant?.name ?? '',
        teamLogo: s.participant?.image_path ?? '',
        goals: s.total,
        assists: 0,
        position: s.position,
      });
    }
  }

  const result = Array.from(playerMap.values());
  result.sort((a, b) => a.position - b.position);

  return {
    seasonId,
    leagueId,
    scorers: result.slice(0, 30), // Top 30
    updatedAt: Timestamp.now(),
  };
}
