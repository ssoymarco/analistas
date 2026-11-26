/**
 * football/standings-repair.ts
 *
 * API-Sports sometimes returns a standings row without the team's id and crest
 * (seen for Club León in Liga MX 2026: `{ id: null, name: "Club Leon", logo:
 * null }`). Such a row can't be opened, highlighted or matched to a followed
 * team, so the missing team is identified before the table is stored:
 *
 *   1. from the previously stored table (no provider call), else
 *   2. from the league's team list (`/teams?league=&season=`, one call).
 *
 * A team is matched by name — the significant words of one name contained in
 * the other ("Club Leon" ↔ "Leon") — among the teams the table doesn't already
 * list; when a single row and a single team are left over they are paired.
 */
import type { FbStandingsDoc, FbTeamRef } from '../shared/football/model';
export declare const hasTeamId: (id: unknown) => boolean;
/** Names of the rows that came without a team id. */
export declare function rowsWithoutTeam(doc: FbStandingsDoc): string[];
/**
 * Give the id-less rows the team they belong to, choosing among `candidates`
 * (teams of the league that the table doesn't list). Pure — exported for tests.
 * Returns the names that could not be resolved.
 */
export declare function fillMissingTeams(doc: FbStandingsDoc, candidates: FbTeamRef[]): string[];
/**
 * Identify the teams of id-less rows (mutates and returns `doc`). `prev` is the
 * table stored before this refresh, when there is one.
 */
export declare function repairStandings(doc: FbStandingsDoc, prev?: FbStandingsDoc | null): Promise<FbStandingsDoc>;
