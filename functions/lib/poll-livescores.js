"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.pollLivescoresHandler = pollLivescoresHandler;
const admin_init_1 = require("./admin-init");
const logger = __importStar(require("firebase-functions/logger"));
const crypto_1 = require("crypto");
const config_1 = require("./config");
const sportmonks_1 = require("./sportmonks");
const mappers_1 = require("./mappers");
const detect_changes_1 = require("./detect-changes");
const live_activities_1 = require("./live-activities");
/** Utility: sleep for N milliseconds */
function sleep(ms) {
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
function liveDocFingerprint(doc) {
    const clean = {};
    for (const [k, v] of Object.entries(doc)) {
        if (!FINGERPRINT_EXCLUDED_KEYS.has(k))
            clean[k] = v;
    }
    return (0, crypto_1.createHash)('sha256').update(JSON.stringify(clean)).digest('hex');
}
/**
 * Execute a single livescores poll cycle.
 * Returns the number of matches processed.
 */
async function executeSinglePoll(pollIndex) {
    const startMs = Date.now();
    // 1. Fetch live matches from SportMonks
    const smFixtures = await (0, sportmonks_1.fetchLivescores)();
    // 2. Transform live matches to MatchDoc format
    const matchDocs = [];
    for (const fixture of smFixtures) {
        const doc = (0, mappers_1.mapFixtureToMatchDoc)(fixture);
        if (doc)
            matchDocs.push(doc);
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
        const toSmUtc = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
        const nowIso = toSmUtc(startMs);
        const soonIso = toSmUtc(startMs + 20 * 60 * 1000);
        const liveIds = new Set(matchDocs.map(m => m.id));
        const upcomingSnap = await admin_init_1.db.collection('matches')
            .where('status', '==', 'scheduled')
            .where('startingAtUtc', '>=', nowIso)
            .where('startingAtUtc', '<=', soonIso)
            .get();
        for (const doc of upcomingSnap.docs) {
            if (!liveIds.has(doc.id)) {
                matchDocs.push(doc.data());
            }
        }
    }
    catch (err) {
        // Non-fatal — reminder may fire on the next poll if this query fails.
        logger.warn('pollLivescores: upcoming-matches query failed', { err });
    }
    if (!matchDocs.length) {
        // Sin partidos en el ciclo, el catch-up de Live Activities debe correr
        // igual (1×/min): si el ÚLTIMO partido de la noche terminó y SM lo sacó
        // de la lista antes de entregarse el FINAL, este es el único camino que
        // rescata la Activity huérfana (incidente España-Bélgica, 10 jul 2026).
        if (pollIndex === 1) {
            await (0, live_activities_1.sendLiveActivityUpdates)([], { deepPass: true });
        }
        logger.debug(`Poll ${pollIndex}: No live or upcoming matches`);
        return 0;
    }
    // 3. Load previous snapshot and detect changes. We pass the raw SMFixtures
    //    too so the detector can pull scorer names and red-card events from
    //    the events array on the same response.
    const prevSnapshot = await (0, detect_changes_1.loadSnapshot)();
    const changes = (0, detect_changes_1.detectChanges)(matchDocs, prevSnapshot, smFixtures);
    // 4. Batch write to Firestore (max 500 per batch) — SOLO los docs cuyo
    //    fingerprint cambió desde el poll anterior (ver liveDocFingerprint).
    const batches = [];
    let currentBatch = admin_init_1.db.batch();
    let opCount = 0;
    let written = 0;
    const docHashes = new Map();
    for (const matchDoc of matchDocs) {
        const fp = liveDocFingerprint(matchDoc);
        docHashes.set(matchDoc.id, fp);
        if (prevSnapshot?.[matchDoc.id]?.docHash === fp)
            continue; // sin cambios → sin escritura
        const ref = admin_init_1.db.collection('matches').doc(matchDoc.id);
        currentBatch.set(ref, matchDoc, { merge: true });
        opCount++;
        written++;
        if (opCount >= 499) {
            batches.push(currentBatch);
            currentBatch = admin_init_1.db.batch();
            opCount = 0;
        }
    }
    if (opCount > 0)
        batches.push(currentBatch);
    await Promise.all(batches.map(b => b.commit()));
    // 5. Save snapshot for next poll. The detector reads event counts off
    //    the fixtures' events array; we also pass the previous snapshot so
    //    one-time flags (reminderSent, lineupsSent) are preserved across polls,
    //    plus the doc fingerprints for the skip-unchanged write optimization.
    await (0, detect_changes_1.saveSnapshot)(matchDocs, smFixtures, prevSnapshot, docHashes);
    // 6. Dispatch notifications for detected changes
    if (changes.length > 0) {
        await (0, detect_changes_1.dispatchNotifications)(changes);
    }
    // 6b. Live Activities: empujar estado a lock screen / Dynamic Island de
    //     quien sigue estos partidos. Autoblindada (nunca lanza) y solo envía
    //     cuando el estado cambió — ver live-activities.ts. El paso profundo
    //     (huérfanos + sweep TTL) corre 1×/min en el primer poll del ciclo.
    await (0, live_activities_1.sendLiveActivityUpdates)(matchDocs, { deepPass: pollIndex === 1 });
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
async function pollLivescoresHandler() {
    logger.info(`🔄 pollLivescores: starting ${config_1.POLLS_PER_INVOCATION}-poll cycle (${config_1.LIVESCORE_POLL_INTERVAL_SEC}s apart)`);
    for (let i = 0; i < config_1.POLLS_PER_INVOCATION; i++) {
        try {
            await executeSinglePoll(i + 1);
        }
        catch (err) {
            logger.error(`Poll ${i + 1} failed:`, err);
        }
        // Wait 15 seconds before next poll (skip wait after last poll)
        if (i < config_1.POLLS_PER_INVOCATION - 1) {
            await sleep(config_1.LIVESCORE_POLL_INTERVAL_SEC * 1000);
        }
    }
    logger.info(`✅ pollLivescores: ${config_1.POLLS_PER_INVOCATION}-poll cycle complete`);
}
//# sourceMappingURL=poll-livescores.js.map