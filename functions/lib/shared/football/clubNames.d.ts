/**
 * shared/football/clubNames.ts
 *
 * The data provider writes the big clubs its own way ("Club America",
 * "Guadalajara Chivas", "U.N.A.M. - Pumas"). These are the names and codes the
 * app has always shown for the clubs of its curated list and for Liga MX, by
 * API-Sports team id — shared so push notifications and Live Activities say
 * "América" too. The app's own table (services/football/popular.ts + base.ts)
 * must agree with this one; scripts/fb-tests/logic.test.ts checks it.
 */
/** Team id → [display name, short code]. */
export declare const CLUB_NAMES: Readonly<Record<string, readonly [string, string]>>;
/** Display name for a club (curated when known, else the provider's). */
export declare function clubName(id: string | number | null | undefined, name: string): string;
