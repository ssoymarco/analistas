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
export function normalize(str: string | null | undefined): string {
  // Guard against null/undefined \u2014 some SportMonks teams (e.g. lower-division
  // cup sides like Copa Argentina entries) come back with a missing name or
  // subtitle. Calling .toLowerCase() on undefined threw and crashed the whole
  // app during live search (typing "chiv" walked the full team index and hit
  // an item with no subtitle). Returning '' makes every call site null-safe.
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
