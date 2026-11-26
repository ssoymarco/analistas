/**
 * football/team-family.ts
 *
 * A senior national team and its youth sides (U17, U20, U23…) are one thing
 * for a fan: whoever follows Mexico wants to hear about Mexico U17 at its
 * World Cup (owner's rule, 25-nov-2026). The data provider treats them as
 * unrelated teams, so the link is derived from the name ("Mexico U17" →
 * "Mexico") and confirmed against the provider's national teams — one call per
 * country, remembered in `fb_meta/nationalIds`.
 */
/** The provider's "country" for national-team and international competitions. */
export declare const NATIONAL_TEAMS_COUNTRY = "World";
/** "Mexico U17" → { base: "Mexico", age: 17 }; null for anything else. */
export declare function youthOf(name: string | null | undefined): {
    base: string;
    age: number;
} | null;
/**
 * For the youth national teams among `teams`: youth team id → senior team id.
 * A club's youth side ("Real Madrid U19") resolves to nothing, because its
 * base name is not a national team. Never throws.
 */
export declare function seniorTeamIds(teams: Array<{
    id: string;
    name: string;
}>, nowMs?: number): Promise<Record<string, string>>;
/** Test hook: forget what this instance has loaded. */
export declare function resetTeamFamilyForTests(): void;
