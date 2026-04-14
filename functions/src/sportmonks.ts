/**
 * sportmonks.ts
 *
 * Server-side SportMonks v3 API client for Cloud Functions.
 * No CORS proxy needed — server-to-server direct calls.
 */

import { SM_API_TOKEN, SM_BASE_URL, SM_TIMEOUT } from './config';
import type {
  SMResponse, SMFixture, SMStandingGroup, SMTopScorer, SMPagination,
} from './types';

// ── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Build a query string preserving SM's special characters (semicolons, commas).
 * Node's URLSearchParams would encode semicolons, which SM needs as literal chars.
 */
function buildQueryString(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

/**
 * Single authenticated API request with timeout.
 */
async function fetchApi<T>(
  endpoint: string,
  params: Record<string, string> = {},
): Promise<SMResponse<T>> {
  const qs = buildQueryString({ api_token: SM_API_TOKEN, ...params });
  const url = `${SM_BASE_URL}${endpoint}?${qs}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SM_TIMEOUT);

  try {
    const res = await fetch(url, { signal: controller.signal });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`SportMonks ${res.status}: ${text.slice(0, 200)}`);
    }

    return (await res.json()) as SMResponse<T>;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch all pages of a paginated SM endpoint. Safety cap at 10 pages.
 */
async function fetchAllPages<T>(
  endpoint: string,
  params: Record<string, string> = {},
): Promise<T[]> {
  const allData: T[] = [];
  let page = 1;

  while (page <= 10) {
    const res = await fetchApi<T[]>(endpoint, { ...params, page: String(page) });
    if (Array.isArray(res.data)) {
      allData.push(...res.data);
    }
    if (!res.pagination?.has_more) break;
    page++;
  }

  return allData;
}

// ── Public API Functions ────────────────────────────────────────────────────

/**
 * GET /livescores — all currently live matches across all leagues.
 * Single API call returns everything.
 */
export async function fetchLivescores(): Promise<SMFixture[]> {
  const res = await fetchApi<SMFixture[]>('/livescores/inplay', {
    include: 'participants;scores;league;state',
  });
  return Array.isArray(res.data) ? res.data : [];
}

/**
 * GET /fixtures/date/{date} — all matches for a specific date.
 * @param date - 'YYYY-MM-DD'
 * @param leagueIds - optional comma-separated league IDs to filter
 */
export async function fetchFixturesByDate(
  date: string,
  leagueIds?: string,
): Promise<SMFixture[]> {
  const params: Record<string, string> = {
    include: 'participants;scores;league;state',
  };
  if (leagueIds) {
    params.filters = `fixtureLeagues:${leagueIds}`;
  }
  return fetchAllPages<SMFixture>(`/fixtures/date/${date}`, params);
}

/**
 * GET /fixtures/{id} — single match with full detail.
 * Used for match detail enrichment.
 */
export async function fetchFixtureById(id: number): Promise<SMFixture | null> {
  try {
    const res = await fetchApi<SMFixture>(`/fixtures/${id}`, {
      include: 'participants;scores;events;statistics;lineups.player;venue;league;referees.referee;tvstations.tvstation;weatherreport',
    });
    return res.data ?? null;
  } catch {
    return null;
  }
}

/**
 * GET /standings/seasons/{seasonId} — league standings.
 */
export async function fetchStandings(seasonId: number): Promise<SMStandingGroup[]> {
  const res = await fetchApi<SMStandingGroup[]>(`/standings/seasons/${seasonId}`, {
    include: 'participant;details',
  });
  return Array.isArray(res.data) ? res.data : [];
}

/**
 * GET /topscorers/seasons/{seasonId} — top goal scorers.
 */
export async function fetchTopScorers(seasonId: number): Promise<SMTopScorer[]> {
  const res = await fetchApi<SMTopScorer[]>(`/topscorers/seasons/${seasonId}`, {
    include: 'player',
  });
  return Array.isArray(res.data) ? res.data : [];
}
