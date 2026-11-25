"use strict";
/**
 * sync-league-seasons.ts
 *
 * Resolución DINÁMICA liga→temporada actual. Mata la clase de bug del
 * 11-jul-2026: los `currentSeasonId` hardcodeados (functions/src/config.ts y
 * src/config/leagues.ts) se quedaron apuntando a las temporadas 2025/26
 * terminadas, así que la app mostraba tablas viejas, "Sin partidos próximos"
 * y calendarios de la temporada pasada — cuando SM ya tenía 2026/27 completa.
 *
 * Qué hace (programada 2×/día + callable admin para correrla on-demand):
 *   1. Por cada liga de LEAGUES pregunta a SM su temporada vigente
 *      (`include=currentSeason`).
 *   2. Escribe el mapa en `_meta/leagueSeasons` — el cliente y las demás
 *      Cloud Functions lo leen vía getCurrentSeasonMap() con fallback al
 *      hardcode de config.ts.
 *   3. Si detecta CAMBIO de temporada (SM ≠ lo último registrado), crawlea el
 *      calendario completo de la temporada nueva → matches/{id} + reconstruye
 *      season_fixtures/{seasonId}. Así el calendario de liga y los próximos
 *      partidos por equipo existen en Firestore desde el día uno, sin esperar
 *      a que la ventana de 15 días de syncFixtures los alcance.
 *
 * El doc _meta/leagueSeasons es legible por el cliente (firestore.rules) —
 * regla de oro: doc nuevo que el cliente lee → rules en el MISMO cambio.
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
exports.syncLeagueSeasonsHandler = syncLeagueSeasonsHandler;
exports.getCurrentSeasonMap = getCurrentSeasonMap;
const admin_init_1 = require("./admin-init");
const logger = __importStar(require("firebase-functions/logger"));
const config_1 = require("./config");
const sportmonks_1 = require("./sportmonks");
const mappers_1 = require("./mappers");
const season_fixtures_index_1 = require("./season-fixtures-index");
/** Presupuesto de tiempo por corrida — bajo el timeout de 540s del runtime.
 *  Si una corrida no alcanza a cubrir todas las ligas (p.ej. la primera, con
 *  muchos cambios acumulados), el doc ya quedó parcialmente escrito y la
 *  siguiente corrida retoma donde quedó. */
const TIME_BUDGET_MS = 450_000;
/**
 * Reconstruye season_index/{leagueId} — la lista de temporadas del selector
 * "Elegir temporada" del cliente. Antes la escribía solo un script manual y
 * al estrenar temporada seguía marcando la anterior como "EN CURSO".
 * Mismo shape que scripts/rebuild-season-index.ts.
 */
async function refreshSeasonIndex(leagueId, leagueName) {
    const raw = await (0, sportmonks_1.fetchSeasonsListForLeague)(leagueId);
    if (raw.length === 0)
        return;
    const seasons = raw
        .map(s => {
        const yearFromStart = (s.starting_at ?? '').slice(0, 4);
        const yearFromName = (s.name ?? '').match(/(\d{4})/)?.[1] ?? '';
        return {
            id: s.id,
            name: s.name || String(s.id),
            year: parseInt(yearFromStart || yearFromName, 10) || 0,
            current: Boolean(s.is_current),
            finished: Boolean(s.finished),
            pending: Boolean(s.pending),
        };
    })
        .sort((a, b) => b.year - a.year || b.id - a.id);
    await admin_init_1.db.collection('season_index').doc(String(leagueId)).set({
        leagueId,
        leagueName,
        seasons,
        updatedAt: admin_init_1.admin.firestore.Timestamp.now(),
    });
}
/** Escribe los MatchDocs de una temporada completa en matches/{id} (merge). */
async function crawlSeasonFixtures(seasonId) {
    const fixtures = await (0, sportmonks_1.fetchFixturesBySeason)(seasonId);
    const docs = [];
    for (const fixture of fixtures) {
        const doc = (0, mappers_1.mapFixtureToMatchDoc)(fixture);
        if (doc)
            docs.push(doc);
    }
    if (docs.length === 0)
        return 0;
    const batches = [];
    let batch = admin_init_1.db.batch();
    let ops = 0;
    for (const matchDoc of docs) {
        batch.set(admin_init_1.db.collection('matches').doc(matchDoc.id), matchDoc, { merge: true });
        if (++ops >= 499) {
            batches.push(batch);
            batch = admin_init_1.db.batch();
            ops = 0;
        }
    }
    if (ops > 0)
        batches.push(batch);
    await Promise.all(batches.map(b => b.commit()));
    await (0, season_fixtures_index_1.rebuildSeasonFixturesForSeasons)([seasonId]);
    return docs.length;
}
async function syncLeagueSeasonsHandler() {
    const started = Date.now();
    const ref = admin_init_1.db.doc('_meta/leagueSeasons');
    const snap = await ref.get();
    const stored = (snap.exists ? snap.data().seasons : undefined) ?? {};
    let checked = 0;
    let changed = 0;
    let crawledFixtures = 0;
    for (const league of config_1.LEAGUES) {
        if (Date.now() - started > TIME_BUDGET_MS) {
            logger.warn(`⏱️ syncLeagueSeasons: presupuesto agotado tras ${checked} ligas — la siguiente corrida retoma`);
            break;
        }
        const current = await (0, sportmonks_1.fetchLeagueCurrentSeason)(league.id);
        checked++;
        if (!current)
            continue; // liga sin temporada vigente (torneo terminado) — conservar la última conocida
        // "Lo último registrado": el doc si existe; si no, el hardcode de config —
        // así la PRIMERA corrida solo crawlea las ligas genuinamente desfasadas.
        const prevSeasonId = stored[String(league.id)]?.seasonId ?? league.currentSeasonId;
        if (prevSeasonId !== current.id) {
            logger.info(`🔄 ${league.name}: temporada ${prevSeasonId} → ${current.id} (${current.name})`);
            try {
                const wrote = await crawlSeasonFixtures(current.id);
                crawledFixtures += wrote;
                changed++;
                logger.info(`  📅 ${wrote} fixtures de la temporada nueva escritos + índice reconstruido`);
            }
            catch (err) {
                // NO registrar la temporada nueva si el crawl falló — la siguiente
                // corrida vuelve a detectar el cambio y reintenta.
                logger.error(`  ❌ crawl falló para season ${current.id} — se reintenta en la próxima corrida:`, err);
                continue;
            }
        }
        stored[String(league.id)] = {
            seasonId: current.id,
            seasonName: current.name,
            leagueName: league.name,
            leagueLogo: current.leagueLogo,
        };
        // Mantener fresco el dropdown de temporadas del cliente (una llamada SM
        // extra por liga por corrida — 58×2/día, trivial). No-fatal.
        await refreshSeasonIndex(league.id, league.name).catch(err => logger.warn(`season_index refresh falló para ${league.name}:`, err));
        // Persistir tras cada cambio (resumable); las entradas sin cambio se
        // persisten en el write final.
        if (prevSeasonId !== current.id) {
            await ref.set({ seasons: stored, updatedAt: admin_init_1.admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }
    }
    await ref.set({ seasons: stored, updatedAt: admin_init_1.admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    logger.info(`✅ syncLeagueSeasons: ${checked} ligas revisadas, ${changed} cambios de temporada, ${crawledFixtures} fixtures crawleados`);
    return { checked, changed, crawledFixtures };
}
// ── Resolver para las demás Cloud Functions ─────────────────────────────────
let seasonMapCache = null;
const SEASON_MAP_TTL_MS = 10 * 60 * 1000;
/**
 * Mapa liga→temporada actual: `_meta/leagueSeasons` con fallback al hardcode
 * de config.ts. Cachea 10 min por instancia — syncStandings/syncTeams/etc.
 * lo consultan una vez por corrida.
 */
async function getCurrentSeasonMap() {
    if (seasonMapCache && Date.now() - seasonMapCache.at < SEASON_MAP_TTL_MS) {
        return seasonMapCache.map;
    }
    const map = new Map();
    for (const l of config_1.LEAGUES) {
        if (l.currentSeasonId != null)
            map.set(l.id, l.currentSeasonId);
    }
    try {
        const snap = await admin_init_1.db.doc('_meta/leagueSeasons').get();
        const seasons = (snap.exists ? snap.data().seasons : undefined) ?? {};
        for (const [leagueId, entry] of Object.entries(seasons)) {
            if (typeof entry?.seasonId === 'number' && entry.seasonId > 0) {
                map.set(Number(leagueId), entry.seasonId);
            }
        }
    }
    catch (err) {
        logger.warn('getCurrentSeasonMap: lectura de _meta/leagueSeasons falló — usando hardcodes:', err);
    }
    seasonMapCache = { map, at: Date.now() };
    return map;
}
//# sourceMappingURL=sync-league-seasons.js.map