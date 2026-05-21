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
exports.fetchFixtureById = fetchFixtureById;
exports.fetchStandings = fetchStandings;
exports.fetchTopScorers = fetchTopScorers;
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
    const res = await fetchApi('/livescores/inplay', {
        include: 'participants;scores;league;state',
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
        include: 'participants;scores;league;state',
    };
    if (leagueIds) {
        params.filters = `fixtureLeagues:${leagueIds}`;
    }
    return fetchAllPages(`/fixtures/date/${date}`, params);
}
/**
 * GET /fixtures/{id} — single match with full detail.
 * Used for match detail enrichment.
 */
async function fetchFixtureById(id) {
    try {
        const res = await fetchApi(`/fixtures/${id}`, {
            include: 'participants;scores;events;statistics;lineups.player;venue;league;referees.referee;tvstations.tvstation;weatherreport',
        });
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
 * GET /topscorers/seasons/{seasonId} — full top scorers list, all pages.
 * SM returns one row per stat type per player; many leagues exceed 50 rows.
 */
async function fetchTopScorers(seasonId) {
    return fetchAllPages(`/topscorers/seasons/${seasonId}`, {
        include: 'player',
    });
}
//# sourceMappingURL=sportmonks.js.map