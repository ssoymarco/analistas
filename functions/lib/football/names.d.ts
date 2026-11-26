/**
 * football/names.ts
 *
 * How the server writes team names in texts a person reads (push
 * notifications, the Live Activity line): Spanish for national teams, "Sub-17"
 * for their youth sides, and the app's own names for the big clubs.
 */
export declare const loc: (name: string) => string;
/** Display name of a team: the app's name for a curated club, Spanish for a national team. */
export declare function teamLabel(team: {
    id?: string | number | null;
    name: string;
}): string;
