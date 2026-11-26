/**
 * shared/football/youth.ts
 *
 * Youth teams by name ("Mexico U17"): the provider has no field that links a
 * youth national team to its senior team, so the name is what both the server
 * (notifications, team families) and the app (display names) go by.
 */
/** "Mexico U17" → { base: "Mexico", age: 17 }; null for anything else. */
export declare function youthOf(name: string | null | undefined): {
    base: string;
    age: number;
} | null;
/** The senior team's name for a youth team's base name ("Korea Republic" → "South Korea"). */
export declare function seniorNameOf(base: string): string;
