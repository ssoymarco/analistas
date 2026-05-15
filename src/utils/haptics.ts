// ── Haptic Feedback Utility ──────────────────────────────────────────────────
// Centralized haptic feedback for premium tactile responses throughout the app.
// Falls back silently on platforms/devices without haptic support.

import * as Haptics from 'expo-haptics';

/**
 * Fire-and-forget haptic helpers.
 *
 * Usage: `haptics.light()` — no await needed.
 *
 * | Method      | Use case                                    |
 * |-------------|---------------------------------------------|
 * | selection   | Tab switch, filter change, date navigation  |
 * | light       | Toggle, minor action, card press            |
 * | medium      | Follow/unfollow, reaction, important action |
 * | heavy       | Destructive action, major state change      |
 * | success     | Completed action, purchase, code redeemed   |
 * | warning     | Premium gate, attention needed               |
 * | error       | Failed action, invalid input                 |
 */
export const haptics = {
  /** Ultra-subtle — selection changes, scrolls snapping */
  selection: () => {
    try { Haptics.selectionAsync(); } catch {}
  },

  /** Subtle — toggles, small actions, card presses */
  light: () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
  },

  /** Moderate — follow/unfollow, reactions, meaningful actions */
  medium: () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
  },

  /** Strong — destructive actions, major state changes */
  heavy: () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
  },

  /** Positive feedback — completed action, success */
  success: () => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
  },

  /** Attention — premium gate, warning */
  warning: () => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
  },

  /** Negative feedback — error, invalid */
  error: () => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
  },
};
