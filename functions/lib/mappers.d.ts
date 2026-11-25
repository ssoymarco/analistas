/**
 * mappers.ts
 *
 * Transform SportMonks API responses into Firestore document shapes.
 * Mirrors the client-side sportsApi.ts mapping logic for server-side use.
 */
import type { SMFixture, SMStandingGroup, SMTopScorer, MatchDoc, StandingsDoc, TopScorersDoc } from './types';
/** ¿SM marcó este fixture como sede neutral? (metadata type_id 35) */
export declare function isNeutralVenueFixture(fixture: SMFixture): boolean;
/** ¿Hay que DESCARTAR el venue que manda SM para este fixture? */
export declare function shouldDiscardFixtureVenue(fixture: SMFixture): boolean;
/**
 * Expulsados de un lado (roja directa + doble amarilla).
 *
 * ⚠️ Filtra `cancelled`. Cuando el VAR revoca una expulsión, SportMonks
 * normalmente BORRA el evento del arreglo (verificado en Atlante vs América,
 * 24 jul 2026, fixture 19715303: tras la revocación de la roja a Rodolfo Cota
 * no queda ningún evento tipo 20/21). Pero el payload define `cancelled` y
 * algunos feeds lo usan en vez de borrar — contar un evento cancelado dejaría
 * al jugador expulsado para siempre en la UI. Cubrimos ambas variantes.
 *
 * Fuente única: detect-changes.ts importa esta misma función para que el
 * conteo del doc y el de la detección de cambios no puedan divergir.
 */
export declare function countRedCardsForSide(fixture: Pick<SMFixture, 'events'>, participantId: number | undefined): number;
export declare function mapFixtureToMatchDoc(fixture: SMFixture): MatchDoc | null;
export declare function mapStandingsToDoc(seasonId: number, leagueId: number, groups: SMStandingGroup[]): StandingsDoc;
export declare function mapTopScorersToDoc(seasonId: number, leagueId: number, scorers: SMTopScorer[]): TopScorersDoc;
