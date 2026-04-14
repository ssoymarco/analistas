/**
 * mappers.ts
 *
 * Transform SportMonks API responses into Firestore document shapes.
 * Mirrors the client-side sportsApi.ts mapping logic for server-side use.
 */
import type { SMFixture, SMStandingGroup, SMTopScorer, MatchDoc, StandingsDoc, TopScorersDoc } from './types';
export declare function mapFixtureToMatchDoc(fixture: SMFixture): MatchDoc | null;
export declare function mapStandingsToDoc(seasonId: number, leagueId: number, groups: SMStandingGroup[]): StandingsDoc;
export declare function mapTopScorersToDoc(seasonId: number, leagueId: number, scorers: SMTopScorer[]): TopScorersDoc;
