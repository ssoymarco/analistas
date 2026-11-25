/**
 * football/on-demand-mapping.ts
 *
 * API-Sports → on-demand Firestore document mappers (shapes in
 * shared/football/model.ts). Pure functions — no I/O — so they can be tested
 * against recorded API responses.
 */
import type { FbAbsence, FbAbsenceType, FbCoachDoc, FbCoachRef, FbFixtureLite, FbFormRow, FbH2HRow, FbLeagueDoc, FbPlayerDoc, FbPlayerSeasonStat, FbPrediction, FbSearchPlayer, FbSearchTeam, FbSquadPlayer, FbTeamDoc, FbTeamLeagueRef, FbTeamStatsDoc, FbVenue } from '../shared/football/model';
import type { AfCoachEntry, AfFixtureCore, AfInjuryEntry, AfLeagueEntry, AfLeagueFull, AfPlayerProfile, AfPlayerProfileEntry, AfPlayerSeasonBlock, AfPlayerSeasonEntry, AfPlayerTeamsEntry, AfPredictionEntry, AfSquadEntry, AfTeamEntry, AfTeamSeasonStats, AfVenue } from './apisports-types';
type Cacheless<T> = Omit<T, 'fetchedAt' | 'expiresAt'>;
export declare function mapVenue(v: AfVenue | null | undefined): FbVenue | null;
export declare function toFixtureLite(f: AfFixtureCore, withLeague: boolean): FbFixtureLite;
/**
 * Sort chronologically and, when a season is too large for one document
 * (catch-all friendlies competitions), keep the `max` fixtures nearest to now.
 */
export declare function capFixtures(rows: FbFixtureLite[], max: number, nowSec: number): {
    rows: FbFixtureLite[];
    truncated: boolean;
};
export declare function mapH2H(list: AfFixtureCore[] | undefined, excludeFixtureId: number): FbH2HRow[];
export declare function absenceType(type: string | null, reason: string | null): FbAbsenceType;
export declare function mapAbsences(list: AfInjuryEntry[], homeId: number): {
    home: FbAbsence[];
    away: FbAbsence[];
};
export declare function mapPrediction(p: AfPredictionEntry | undefined): FbPrediction | null;
/** Last finished matches of `teamId`, newest first. */
export declare function mapForm(list: AfFixtureCore[], teamId: number, max?: number): FbFormRow[];
export declare function mapSquad(entry: AfSquadEntry | undefined): FbSquadPlayer[];
/**
 * The coach currently in charge of `teamId`. `/coachs?team=` returns everyone
 * who ever had a stint there; old stints sometimes keep `end: null`, so the
 * open stint with the latest start wins.
 */
export declare function pickCurrentCoach(list: AfCoachEntry[], teamId: number): FbCoachRef | null;
/** Competitions whose current season is still running (or ended < 60 days ago). */
export declare function mapTeamLeagues(list: AfLeagueEntry[] | AfLeagueFull[], nowMs: number): FbTeamLeagueRef[];
/** The competition that defines a team's table and calendar. */
export declare function pickPrimaryLeague(leagues: FbTeamLeagueRef[], teamCountry: string | null, national: boolean): FbTeamLeagueRef | null;
export declare function mapTeam(entry: AfTeamEntry, squad: AfSquadEntry | undefined, coaches: AfCoachEntry[], leagues: AfLeagueEntry[] | AfLeagueFull[], nowMs: number): Cacheless<FbTeamDoc>;
export declare function mapTeamStats(s: AfTeamSeasonStats): Cacheless<FbTeamStatsDoc>;
export declare function mapPlayerStat(b: AfPlayerSeasonBlock): FbPlayerSeasonStat | null;
/** A team that represents a country (senior or youth side). */
export declare function looksNationalTeam(teamName: string, nationality: string | null): boolean;
export declare function mapPlayer(seasons: AfPlayerSeasonEntry[], profile: AfPlayerProfile | undefined, teams: AfPlayerTeamsEntry[], seasonsLoaded: number[]): Cacheless<FbPlayerDoc> | null;
export declare function mapCoach(c: AfCoachEntry): Cacheless<FbCoachDoc>;
export declare function mapLeague(x: AfLeagueFull): Cacheless<FbLeagueDoc>;
export declare function mapSearchTeams(list: AfTeamEntry[], max?: number): FbSearchTeam[];
export declare function mapSearchPlayers(list: AfPlayerProfileEntry[], max?: number): FbSearchPlayer[];
/** "Luis Malagón" from firstname "Luis Ángel" + lastname "Malagón Velázquez" (API `name` is "L. Malagón"). */
export declare function fullPlayerName(p: AfPlayerProfile): string;
export {};
