/**
 * poll-livescores.ts
 *
 * Cloud Function: polls SportMonks livescores every 15 seconds.
 * Scheduled to run every 1 minute, executes 4 internal polls with 15s delays.
 *
 * Flow per poll:
 * 1. Fetch all live matches from SportMonks (1 API call)
 * 2. Transform to MatchDoc format
 * 3. Compare against previous snapshot for change detection (goals, starts, ends)
 * 4. Batch write changed matches to Firestore
 * 5. Save new snapshot for next comparison
 * 6. Dispatch notifications for detected changes
 */

import { admin, db } from './admin-init';
import * as logger from 'firebase-functions/logger';
import { createHash } from 'crypto';
import { LIVESCORE_POLL_INTERVAL_SEC, POLLS_PER_INVOCATION } from './config';
import { fetchLivescores, fetchFixtureById } from './sportmonks';
import { mapFixtureToMatchDoc } from './mappers';
import { loadSnapshot, saveSnapshot, detectChanges, dispatchNotifications } from './detect-changes';
import { enrichMatchesByIds } from './sync-match-enrichment';
import { sendLiveActivityUpdates } from './live-activities';
import type { MatchDoc } from './types';

/** Utility: sleep for N milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Skip-unchanged writes (auditoría de costos, 8 jul 2026) ──────────────────
// Antes: CADA poll (cada ~4s) escribía TODOS los partidos vivos a Firestore,
// hubiera cambiado algo o no — y `updatedAt`/`detailUpdatedAt` se re-generaban
// en cada mapeo, así que el doc "siempre cambiaba". Cada escritura abanica el
// documento COMPLETO (~260 KB con el blob `detail`) a cada listener del feed y
// de la pantalla de detalle → 708 GiB de egress + 50M lecturas en 8 días.
//
// Ahora: se calcula un fingerprint del doc EXCLUYENDO los campos volátiles
// (updatedAt, detailUpdatedAt) Y el blob `detail` (las estadísticas en vivo
// micro-cambian casi cada poll y anularían el ahorro). Solo se escribe cuando
// el fingerprint cambia. Consecuencias deliberadas:
//   · Goles, tarjetas-por-marcador, cambios de estado/periodo → escritura
//     INMEDIATA (cambian el core).
//   · `minute` cambia cada ~60s → cada escritura por minuto lleva de paso el
//     `detail` fresco (stats/eventos ≤60s de rezago; las notificaciones NO
//     dependen de esto — salen de detectChanges, que es pre-escritura).
//   · Medio tiempo / pausas: minuto congelado → CERO escrituras (antes: 15/min
//     × N partidos abanicando 260 KB a todos, con el partido detenido).
const FINGERPRINT_EXCLUDED_KEYS = new Set(['updatedAt', 'detailUpdatedAt', 'detail']);

function liveDocFingerprint(doc: MatchDoc): string {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc)) {
    if (!FINGERPRINT_EXCLUDED_KEYS.has(k)) clean[k] = v;
  }
  return createHash('sha256').update(JSON.stringify(clean)).digest('hex');
}

/**
 * Execute a single livescores poll cycle.
 * Returns the number of matches processed.
 */
async function executeSinglePoll(pollIndex: number): Promise<number> {
  const startMs = Date.now();

  // 1. Fetch live matches from SportMonks
  const smFixtures = await fetchLivescores();

  // 2. Transform live matches to MatchDoc format
  const matchDocs: MatchDoc[] = [];
  for (const fixture of smFixtures) {
    const doc = mapFixtureToMatchDoc(fixture);
    if (doc) matchDocs.push(doc);
  }

  // 2b. Also include scheduled matches starting within the next 20 minutes so
  //     the reminder detection in detectChanges (match.status === 'scheduled')
  //     can fire. pollLivescores only fetches live fixtures from SportMonks, so
  //     pre-match reminders would never trigger without this Firestore query.
  //     We only add each match once (live matches take precedence if somehow
  //     both appear).
  try {
    // ⚠️ startingAtUtc se guarda en formato SM "YYYY-MM-DD HH:MM:SS" (espacio,
    // sin sufijo). Los bounds DEBEN usar el mismo formato: un ISO con 'T'
    // ordena lexicográficamente DESPUÉS del espacio (0x20 < 0x54), así que
    // `startingAtUtc >= nowISO` jamás matcheaba partidos del mismo día — los
    // recordatorios pre-partido y la fase 'pre' de Live Activities nunca
    // recibían candidatos. (Hallazgo de la revisión adversarial, 3 jul 2026.)
    const toSmUtc = (ms: number) =>
      new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
    const nowIso  = toSmUtc(startMs);
    const soonIso = toSmUtc(startMs + 20 * 60 * 1000);
    const liveIds = new Set(matchDocs.map(m => m.id));
    const upcomingSnap = await db.collection('matches')
      .where('status', '==', 'scheduled')
      .where('startingAtUtc', '>=', nowIso)
      .where('startingAtUtc', '<=', soonIso)
      .get();
    for (const doc of upcomingSnap.docs) {
      if (!liveIds.has(doc.id)) {
        matchDocs.push(doc.data() as MatchDoc);
      }
    }
  } catch (err) {
    // Non-fatal — reminder may fire on the next poll if this query fails.
    logger.warn('pollLivescores: upcoming-matches query failed', { err });
  }

  if (!matchDocs.length) {
    // Sin partidos en el ciclo, el catch-up de Live Activities debe correr
    // igual (1×/min): si el ÚLTIMO partido de la noche terminó y SM lo sacó
    // de la lista antes de entregarse el FINAL, este es el único camino que
    // rescata la Activity huérfana (incidente España-Bélgica, 10 jul 2026).
    if (pollIndex === 1) {
      await sendLiveActivityUpdates([], { deepPass: true });
    }
    logger.debug(`Poll ${pollIndex}: No live or upcoming matches`);
    return 0;
  }

  // 3. Load previous snapshot and detect changes. We pass the raw SMFixtures
  //    too so the detector can pull scorer names and red-card events from
  //    the events array on the same response.
  const prevSnapshot = await loadSnapshot();

  // 3b. Rescate de partidos que DESAPARECEN del feed inplay.
  //     Un partido suspendido por tormenta sale del feed de livescores de SM
  //     mientras dura la pausa — y si termina fuera del feed, nunca vemos la
  //     transición live→FT: sin push de final, doc congelado en vivo hasta que
  //     syncFixtures lo flipea en silencio (Inter Miami vs San Luis, 5 ago
  //     2026: FT real ~02:45, doc en vivo "174'" hasta las 02:49, CERO
  //     MATCHEND). Mismo patrón que España-Bélgica pero para pushes.
  //
  //     1×/min (poll 1), máx 3 por ciclo: cada partido del snapshot que estaba
  //     'live' y ya no viene en el feed se re-consulta por id y se INYECTA al
  //     flujo normal — si volvió FT dispara matchEnd por el camino de siempre
  //     (con el gate de FINISHED_STATE_IDS); si está suspendido, el doc se
  //     actualiza a Interrumpido (la app deja de tickear); si SM lo borró, el
  //     fetch da null y la entrada expira del snapshot vía goneChecks.
  if (pollIndex === 1 && prevSnapshot) {
    const feedIds = new Set(matchDocs.map(m => m.id));

    // Asentamiento post-final: re-enriquecer partidos recién terminados que ya
    // salieron del feed, a ~1, 2, 5, 10 y 20 min del final. SM publica datos
    // DESPUÉS del pitido — la atribución del anotador de un gol al 90+ y las
    // rojas post-partido (bronca con el árbitro) — y para entonces ni el poll
    // escribe (fuera del feed) ni la ventana hot del enrichment aplica si el
    // kickoff se retrasó (por kickoff nominal expira ANTES del final: Hugo
    // Cuypers 90+9' invisible en la app, Monterrey vs Orlando, 5 ago 2026).
    // settleChecks avanza 1 por poll (~15/min) vía el carryover del snapshot.
    const SETTLE_MARKS = new Set([1, 2, 5, 10, 20]); // minutos post-final
    const settleIds = Object.entries(prevSnapshot)
      .filter(([id, m]) =>
        m.status === 'finished' && !feedIds.has(id) &&
        SETTLE_MARKS.has(Math.round((m.settleChecks ?? 0) / 15)))
      .map(([id]) => id)
      .slice(0, 5);
    if (settleIds.length > 0) {
      try {
        const r = await enrichMatchesByIds(settleIds);
        logger.info(`🧾 settle post-final: ${settleIds.join(',')} → ${r.enriched} enriquecidos`);
      } catch (err) {
        logger.warn('settle post-final falló', { err: String(err) });
      }
    }

    const gone = Object.entries(prevSnapshot)
      .filter(([id, m]) => m.status === 'live' && !feedIds.has(id))
      .slice(0, 3);
    for (const [id] of gone) {
      try {
        const fx = await fetchFixtureById(Number(id));
        if (!fx) continue;
        const doc = mapFixtureToMatchDoc(fx);
        if (doc) {
          matchDocs.push(doc);
          smFixtures.push(fx);
          logger.info(`🔎 rescate: fixture ${id} fuera del feed → state ${fx.state_id}`);
        }
      } catch (err) {
        logger.warn(`rescate: fetch de fixture ${id} falló`, { err: String(err) });
      }
    }
  }

  const changes = detectChanges(matchDocs, prevSnapshot, smFixtures);

  // 4. Batch write to Firestore (max 500 per batch) — SOLO los docs cuyo
  //    fingerprint cambió desde el poll anterior (ver liveDocFingerprint).
  const batches: admin.firestore.WriteBatch[] = [];
  let currentBatch = db.batch();
  let opCount = 0;
  let written = 0;
  const docHashes = new Map<string, string>();

  for (const matchDoc of matchDocs) {
    const fp = liveDocFingerprint(matchDoc);
    docHashes.set(matchDoc.id, fp);
    if (prevSnapshot?.[matchDoc.id]?.docHash === fp) continue; // sin cambios → sin escritura

    const ref = db.collection('matches').doc(matchDoc.id);
    currentBatch.set(ref, matchDoc, { merge: true });
    opCount++;
    written++;

    if (opCount >= 499) {
      batches.push(currentBatch);
      currentBatch = db.batch();
      opCount = 0;
    }
  }
  if (opCount > 0) batches.push(currentBatch);

  await Promise.all(batches.map(b => b.commit()));

  // 5. Save snapshot for next poll. The detector reads event counts off
  //    the fixtures' events array; we also pass the previous snapshot so
  //    one-time flags (reminderSent, lineupsSent) are preserved across polls,
  //    plus the doc fingerprints for the skip-unchanged write optimization.
  await saveSnapshot(matchDocs, smFixtures, prevSnapshot, docHashes);

  // 6. Dispatch notifications for detected changes
  if (changes.length > 0) {
    await dispatchNotifications(changes);
  }

  // 6b. Live Activities: empujar estado a lock screen / Dynamic Island de
  //     quien sigue estos partidos. Autoblindada (nunca lanza) y solo envía
  //     cuando el estado cambió — ver live-activities.ts. El paso profundo
  //     (huérfanos + sweep TTL) corre 1×/min en el primer poll del ciclo.
  await sendLiveActivityUpdates(matchDocs, { deepPass: pollIndex === 1 });

  const elapsed = Date.now() - startMs;
  logger.debug(`Poll ${pollIndex}: ${matchDocs.length} matches, ${changes.length} changes, ${written} written (${matchDocs.length - written} skipped), ${elapsed}ms`);

  return matchDocs.length;
}

/**
 * Main polling function — runs POLLS_PER_INVOCATION (15) polls spaced
 * LIVESCORE_POLL_INTERVAL_SEC (4s) apart, so one invocation continuously
 * covers the full ~60s until the next scheduled trigger. Net effect: an
 * effective ~4-second livescore poll cadence (goal → push in seconds), not
 * the 1-minute scheduler heartbeat.
 */
export async function pollLivescoresHandler(): Promise<void> {
  logger.info(`🔄 pollLivescores: starting ${POLLS_PER_INVOCATION}-poll cycle (${LIVESCORE_POLL_INTERVAL_SEC}s apart)`);

  for (let i = 0; i < POLLS_PER_INVOCATION; i++) {
    try {
      await executeSinglePoll(i + 1);
    } catch (err) {
      logger.error(`Poll ${i + 1} failed:`, err);
    }

    // Wait 15 seconds before next poll (skip wait after last poll)
    if (i < POLLS_PER_INVOCATION - 1) {
      await sleep(LIVESCORE_POLL_INTERVAL_SEC * 1000);
    }
  }

  logger.info(`✅ pollLivescores: ${POLLS_PER_INVOCATION}-poll cycle complete`);
}
