// ── Design tokens ──────────────────────────────────────────────────────────
// Numeric primitives reused across components so spacing, radii and shared
// element sizes (search bar, header height) stay in sync.
//
// Keep this file LEAN — it's the place you go to change a value once and
// have it propagate everywhere.
// ────────────────────────────────────────────────────────────────────────────

/** Corner radii. Use these instead of magic numbers in card/pill/sheet UIs. */
export const radius = {
  sm: 8,    // pills, small chips
  md: 12,   // tab pills, search bar, small cards
  lg: 14,   // standard list cards (notification rows, intro cards)
  xl: 16,   // article rows, story cards, achievement tiles
  xxl: 20,  // hero cards, premium feature cards
  hero: 22, // streak hero / wrapped style
  round: 999,
} as const;

/** Standard heights for inline UI elements. */
export const ui = {
  searchBarHeight: 44,
  tabBarPaddingBottom: 12,
} as const;

/** Section header default spacing — keep section headers reading as one
 *  family regardless of which screen renders them. */
export const sectionHeaderSpacing = {
  paddingHorizontal: 20,
  marginTop: 16,
  marginBottom: 10,
} as const;
