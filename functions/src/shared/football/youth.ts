/**
 * shared/football/youth.ts
 *
 * Youth teams by name ("Mexico U17"): the provider has no field that links a
 * youth national team to its senior team, so the name is what both the server
 * (notifications, team families) and the app (display names) go by.
 */

const YOUTH_RE = /^(.+?)\s+U-?\s?(1[5-9]|2[0-3])$/i;

/** "Mexico U17" → { base: "Mexico", age: 17 }; null for anything else. */
export function youthOf(name: string | null | undefined): { base: string; age: number } | null {
  const m = YOUTH_RE.exec((name ?? '').trim());
  return m ? { base: m[1].trim(), age: Number(m[2]) } : null;
}

/**
 * Countries the provider names differently in its youth and senior teams
 * (youth base name, lowercased → senior team name). Checked against the
 * provider on 26-nov-2026.
 */
const SENIOR_NAME: Record<string, string> = {
  'korea republic': 'South Korea',
  'korea dpr': 'North Korea',
  'republic of ireland': 'Rep. Of Ireland',
  'china pr': 'China',
  "côte d'ivoire": 'Ivory Coast',
  'turkey': 'Türkiye',
  'ir iran': 'Iran',
  'bosnia-herzegovina': 'Bosnia & Herzegovina',
  'kyrgyz republic': 'Kyrgyzstan',
  'north macedonia': 'FYR Macedonia',
  'uae': 'United Arab Emirates',
};

/** The senior team's name for a youth team's base name ("Korea Republic" → "South Korea"). */
export function seniorNameOf(base: string): string {
  return SENIOR_NAME[base.trim().toLowerCase()] ?? base.trim();
}
