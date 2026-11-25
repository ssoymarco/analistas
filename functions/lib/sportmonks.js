"use strict";
/**
 * sportmonks.ts
 *
 * Server-side SportMonks v3 API client for Cloud Functions.
 * No CORS proxy needed — server-to-server direct calls.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchLivescores = fetchLivescores;
exports.fetchFixturesByDate = fetchFixturesByDate;
exports.fetchLeagueCurrentSeason = fetchLeagueCurrentSeason;
exports.fetchSeasonsListForLeague = fetchSeasonsListForLeague;
exports.fetchFixturesBySeason = fetchFixturesBySeason;
exports.fetchFixtureById = fetchFixtureById;
exports.fetchVenueById = fetchVenueById;
exports.fetchStandings = fetchStandings;
exports.fetchTopScorers = fetchTopScorers;
exports.fetchFixtureFullDetail = fetchFixtureFullDetail;
exports.fetchH2H = fetchH2H;
exports.fetchPlayerFullProfile = fetchPlayerFullProfile;
exports.fetchCoachFullProfile = fetchCoachFullProfile;
exports.fetchSidelined = fetchSidelined;
exports.fetchTeamsForSeason = fetchTeamsForSeason;
exports.fetchSquadForSeasonAndTeam = fetchSquadForSeasonAndTeam;
const config_1 = require("./config");
// ── Internal Helpers ────────────────────────────────────────────────────────
/**
 * Build a query string preserving SM's special characters (semicolons, commas).
 * Node's URLSearchParams would encode semicolons, which SM needs as literal chars.
 */
function buildQueryString(params) {
    return Object.entries(params)
        .map(([k, v]) => `${k}=${v}`)
        .join('&');
}
/**
 * Single authenticated API request with timeout.
 * Token is read at runtime from the SPORTMONKS_TOKEN secret — every function
 * that calls this must declare the secret in its `secrets: [SPORTMONKS_TOKEN]` option.
 */
async function fetchApi(endpoint, params = {}) {
    const qs = buildQueryString({ api_token: (0, config_1.getSportmonksToken)(), ...params });
    const url = `${config_1.SM_BASE_URL}${endpoint}?${qs}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config_1.SM_TIMEOUT);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`SportMonks ${res.status}: ${text.slice(0, 200)}`);
        }
        return (await res.json());
    }
    finally {
        clearTimeout(timer);
    }
}
/**
 * Fetch ALL pages of a paginated SM endpoint, following `pagination.has_more`.
 * Uses `per_page=50` (SM max) to minimise request count.
 *
 * @param maxPages  Generous safety cap (default 200 = 10,000 records). Hitting
 *                  it logs a warning so we notice if a real dataset is bigger.
 */
async function fetchAllPages(endpoint, params = {}, maxPages = 200) {
    const allData = [];
    let page = 1;
    while (page <= maxPages) {
        const res = await fetchApi(endpoint, {
            per_page: '50',
            ...params,
            page: String(page),
        });
        if (Array.isArray(res.data)) {
            allData.push(...res.data);
        }
        if (!res.pagination?.has_more)
            break;
        page++;
    }
    if (page > maxPages) {
        // eslint-disable-next-line no-console
        console.warn(`fetchAllPages: hit maxPages=${maxPages} on ${endpoint} — data may be truncated`);
    }
    return allData;
}
// ── Public API Functions ────────────────────────────────────────────────────
/**
 * GET /livescores — all currently live matches across all leagues.
 * Single API call returns everything.
 */
async function fetchLivescores() {
    // `events;statistics` are included so the per-user MatchDetail polling
    // (every 10s) can be replaced by Firestore onSnapshot reads. Payload is
    // bigger (~300KB on busy match days) but it's still ONE API call.
    const res = await fetchApi('/livescores/inplay', {
        include: 'participants;scores;league;state;events;statistics;periods',
    });
    return Array.isArray(res.data) ? res.data : [];
}
/**
 * GET /fixtures/date/{date} — all matches for a specific date.
 * @param date - 'YYYY-MM-DD'
 * @param leagueIds - optional comma-separated league IDs to filter
 */
async function fetchFixturesByDate(date, leagueIds) {
    const params = {
        // `periods` incluido (11 jul 2026): sin él, syncFixtures no podía calcular
        // reloj/minuto de partidos en vivo y contaminaba los docs del poll.
        // `metadata` (6 ago 2026): trae la bandera neutral (type 35) — en Leagues
        // Cup, SM rellena el venue con el estadio del "local" aunque el partido
        // sea en sede neutral, y la bandera es la única señal para descartarlo.
        include: 'participants;scores;league;state;stage;round;venue;periods;metadata',
    };
    if (leagueIds) {
        params.filters = `fixtureLeagues:${leagueIds}`;
    }
    return fetchAllPages(`/fixtures/date/${date}`, params);
}
/**
 * GET /leagues/{id}?include=currentSeason — la temporada VIGENTE según SM.
 * Fuente de verdad para syncLeagueSeasons: SM voltea `is_current` a la nueva
 * temporada en cuanto la publica (2026/27 apareció semanas antes del arranque),
 * mientras nuestros currentSeasonId hardcodeados se quedan en la anterior.
 */
async function fetchLeagueCurrentSeason(leagueId) {
    try {
        const res = await fetchApi(`/leagues/${leagueId}`, {
            include: 'currentSeason',
        });
        const data = res.data;
        const cs = data?.currentseason;
        if (!cs || typeof cs.id !== 'number')
            return null;
        // image_path lleva la URL REAL del logo (con subcarpeta, p.ej.
        // leagues/7/743.png). La convención sin subcarpeta (leagues/743.png)
        // sirve un asset viejo — es el "logo desactualizado" de Liga MX/La Liga.
        return { id: cs.id, name: cs.name ?? null, leagueLogo: data.image_path ?? null };
    }
    catch {
        return null;
    }
}
/**
 * GET /seasons?filters=seasonLeagues:{id} — TODAS las temporadas de una liga.
 * Alimenta season_index/{leagueId} (selector "Elegir temporada" del cliente),
 * que antes solo se poblaba con un script manual y se quedaba stale (mostraba
 * "2025/2026 EN CURSO" tras el arranque de 2026/27).
 */
async function fetchSeasonsListForLeague(leagueId) {
    return fetchAllPages('/seasons', {
        filters: `seasonLeagues:${leagueId}`,
    }, 5);
}
/**
 * GET /fixtures?filters=fixtureSeasons:{id} — TODOS los fixtures de una
 * temporada, paginado. Mismos includes que fetchFixturesByDate para que
 * mapFixtureToMatchDoc produzca docs idénticos a los del sync normal.
 * Una liga grande son ~380 fixtures = 8 páginas.
 */
async function fetchFixturesBySeason(seasonId) {
    return fetchAllPages('/fixtures', {
        filters: `fixtureSeasons:${seasonId}`,
        include: 'participants;scores;league;state;stage;round;venue;periods;metadata',
    });
}
/**
 * GET /fixtures/{id} — single match with full detail.
 * Used for match detail enrichment.
 */
async function fetchFixtureById(id) {
    try {
        const res = await fetchApi(`/fixtures/${id}`, {
            include: 'participants;scores;events;statistics;lineups.player;venue;league;referees.referee;tvstations.tvstation;weatherreport;metadata;periods',
        });
        return res.data ?? null;
    }
    catch {
        return null;
    }
}
/**
 * GET /venues/{id} — ficha completa de un estadio.
 *
 * Se usa cuando detectamos que el `venue` a nivel EQUIPO que publica SM está
 * viejo (ver deriveHomeVenue en sync-teams.ts): de los fixtures sacamos el
 * venue_id correcto, y de aquí el nombre/capacidad/imagen que lo acompañan.
 */
async function fetchVenueById(id) {
    try {
        const res = await fetchApi(`/venues/${id}`, {});
        return res.data ?? null;
    }
    catch {
        return null;
    }
}
/**
 * GET /standings/seasons/{seasonId} — full league standings, all pages.
 * Group-stage cups (WC, UCL) can have many entries — pagination is required.
 */
async function fetchStandings(seasonId) {
    return fetchAllPages(`/standings/seasons/${seasonId}`, {
        include: 'participant;details',
    });
}
/**
 * GET /topscorers/seasons/{seasonId} — Goal Topscorer ranking, all pages.
 *
 * SportMonks returns rankings across MULTIPLE types per season (goals, assists,
 * cards, etc.). We filter to type_id 208 (Goal Topscorer) at the API level
 * with the `seasontopscorerTypes` filter — NOT `topScorerTypes` (camelCase),
 * which SportMonks silently ignores and falls back to whatever default ranking
 * it has on hand (usually cards). See sibling note in src/services/sportmonks.ts.
 *
 * Includes `participant` so we get the team name/logo alongside the player.
 */
async function fetchTopScorers(seasonId, typeId = 208) {
    return fetchAllPages(`/topscorers/seasons/${seasonId}`, {
        include: 'player;participant',
        filters: `seasontopscorerTypes:${typeId}`,
    });
}
/**
 * GET /fixtures/{id} with full enrichment includes — fetches everything the
 * MatchDetailScreen needs in a single call. Used by syncMatchEnrichment
 * to populate matches/{id}.detail so the client never has to hit SportMonks
 * for match detail.
 *
 * Note: `odds` is omitted — 403 on Pro plan. Fetch separately if needed.
 */
async function fetchFixtureFullDetail(id) {
    try {
        const res = await fetchApi(`/fixtures/${id}`, {
            include: [
                'participants',
                'scores',
                'events',
                'statistics',
                'lineups.player',
                'expectedLineups.player',
                'coaches.nationality',
                'venue',
                'league',
                'referees.referee',
                'tvstations.tvstation',
                'weatherreport',
                'predictions',
                'periods',
                'aggregate.fixtures.scores',
                'aggregate.fixtures.participants',
                'metadata', // bandera neutral (type 35) — descarta venues mentirosos de Leagues Cup
            ].join(';'),
        });
        return res.data ?? null;
    }
    catch {
        return null;
    }
}
/**
 * GET /fixtures/head-to-head/{id1}/{id2} — direct historical meetings.
 * Used by syncMatchEnrichment to populate the H2H section.
 */
async function fetchH2H(teamId1, teamId2) {
    return fetchAllPages(`/fixtures/head-to-head/${teamId1}/${teamId2}`, { include: 'participants;scores' });
}
/**
 * GET /players/{id} — full player profile with season-by-season stats and
 * team history. Used by syncPlayers to populate players/{id} docs.
 */
async function fetchPlayerFullProfile(playerId) {
    try {
        const res = await fetchApi(`/players/${playerId}`, {
            include: 'statistics.details;statistics.season;statistics.team;nationality;teams.team',
        });
        return res.data ?? null;
    }
    catch {
        return null;
    }
}
/**
 * GET /coaches/{id} — full coach profile with career history.
 * Used by syncCoaches to populate coaches/{id} docs.
 */
async function fetchCoachFullProfile(coachId) {
    try {
        const res = await fetchApi(`/coaches/${coachId}`, {
            include: 'teams.team;statistics.team;statistics.details;nationality',
        });
        return res.data ?? null;
    }
    catch {
        return null;
    }
}
/**
 * GET /sidelined/seasons/{seasonId}/teams/{teamId} — injuries / suspensions
 * for a team in a given season. Used by syncMatchEnrichment.
 */
async function fetchSidelined(seasonId, teamId) {
    try {
        const res = await fetchApi(`/sidelined/seasons/${seasonId}/teams/${teamId}`, { include: 'player' });
        return Array.isArray(res.data) ? res.data : [];
    }
    catch {
        return [];
    }
}
async function fetchTeamsForSeason(seasonId) {
    return fetchAllPages(`/teams/seasons/${seasonId}`, {
        include: 'venue;coaches;country',
    });
}
async function fetchSquadForSeasonAndTeam(seasonId, teamId) {
    return fetchAllPages(`/squads/seasons/${seasonId}/teams/${teamId}`, { include: 'player;player.teams.team' });
}
//# sourceMappingURL=sportmonks.js.map