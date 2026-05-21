/**
 * sportmonks.ts
 *
 * Server-side SportMonks v3 API client for Cloud Functions.
 * No CORS proxy needed — server-to-server direct calls.
 */
import type { SMFixture, SMStandingGroup, SMTopScorer } from './types';
/**
 * GET /livescores — all currently live matches across all leagues.
 * Single API call returns everything.
 */
export declare function fetchLivescores(): Promise<SMFixture[]>;
/**
 * GET /fixtures/date/{date} — all matches for a specific date.
 * @param date - 'YYYY-MM-DD'
 * @param leagueIds - optional comma-separated league IDs to filter
 */
export declare function fetchFixturesByDate(date: string, leagueIds?: string): Promise<SMFixture[]>;
/**
 * GET /fixtures/{id} — single match with full detail.
 * Used for match detail enrichment.
 */
export declare function fetchFixtureById(id: number): Promise<SMFixture | null>;
/**
 * GET /standings/seasons/{seasonId} — full league standings, all pages.
 * Group-stage cups (WC, UCL) can have many entries — pagination is required.
 */
export declare function fetchStandings(seasonId: number): Promise<SMStandingGroup[]>;
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
export declare function fetchTopScorers(seasonId: number): Promise<SMTopScorer[]>;
/**
 * GET /teams/seasons/{seasonId} — every team in a season.
 *
 * Uses `include=venue;coaches` so the response carries enough info to fill
 * a team-detail page (stadium + coach). Returns ~20-50 teams per league
 * (or 48 for the World Cup) in a single paginated call.
 */
export interface SMTeamFull {
    id: number;
    name: string;
    short_code?: string;
    image_path: string;
    country_id?: number;
    founded?: number;
    venue?: {
        id?: number;
        name?: string;
        city_name?: string;
        capacity?: number;
        image_path?: string;
    };
    coaches?: Array<{
        id?: number;
        display_name?: string;
        common_name?: string;
        name?: string;
        image_path?: string;
        date_of_birth?: string;
        active?: boolean;
    }>;
}
export declare function fetchTeamsForSeason(seasonId: number): Promise<SMTeamFull[]>;
/**
 * GET /squads/seasons/{seasonId}/teams/{teamId} — full roster for a team in
 * a given season. Used by syncSquads. Includes player metadata + the
 * player's other team memberships (so we can show "current club" alongside
 * a national-team player).
 */
export interface SMSquadPlayerFull {
    id: number;
    player_id: number;
    jersey_number: number;
    position_id: number;
    captain: boolean;
    player?: {
        id?: number;
        name?: string;
        common_name?: string;
        display_name?: string;
        date_of_birth?: string;
        image_path?: string;
        teams?: Array<{
            end?: string;
            team?: {
                id?: number;
                name?: string;
                image_path?: string;
                type?: string;
            };
        }>;
    };
}
export declare function fetchSquadForSeasonAndTeam(seasonId: number, teamId: number): Promise<SMSquadPlayerFull[]>;
