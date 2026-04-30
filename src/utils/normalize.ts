/**
 * Normalize a string for accent-insensitive, case-insensitive comparison.
 *
 * "América" → "america"
 * "Müller"  → "muller"
 * "São Paulo" → "sao paulo"
 *
 * Uses Unicode NFD decomposition to strip all combining diacritical marks,
 * so users can search with or without accents and still find results.
 */
export function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
