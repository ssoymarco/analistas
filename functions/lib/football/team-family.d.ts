/**
 * football/team-family.ts
 *
 * A senior national team and its youth sides (U17, U20, U23…) are one thing
 * for a fan: whoever follows Mexico wants to hear about Mexico U17 at its
 * World Cup (owner's rule, 25-nov-2026). The data provider treats them as
 * unrelated teams, so the link is derived from the name ("Mexico U17" →
 * "Mexico") and confirmed against the provider's national teams — one call per
 * country, remembered in `fb_meta/nationalIds` (server-only).
 *
 * Every link found is also published in `fb_meta/teamFamilies` (youth team id →
 * senior team id), which the app reads to show Mexico U17's matches among the
 * matches of whoever follows Mexico. The fixture sync fills it days ahead; the
 * notifications resolve whatever is still missing at send time.
 */
import { seniorNameOf, youthOf } from '../shared/football/youth';
export { seniorNameOf, youthOf };
/** The provider's "country" for national-team and international competitions. */
export declare const NATIONAL_TEAMS_COUNTRY = "World";
/** New names looked up per fixture sync (every 5 min): a 48-team cup is linked in under half an hour. */
export declare const MAX_LOOKUPS_PER_SYNC = 10;
/**
 * For the youth national teams among `teams`: youth team id → senior team id.
 * A club's youth side ("Real Madrid U19") resolves to nothing, because its
 * base name is not a national team. Never throws.
 */
export declare function seniorTeamIds(teams: Array<{
    id: string;
    name: string;
}>, nowMs?: number, maxLookups?: number): Promise<Record<string, string>>;
/** Test hook: forget what this instance has loaded. */
export declare function resetTeamFamilyForTests(): void;
