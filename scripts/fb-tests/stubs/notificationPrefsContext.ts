// The storage keys and defaults of src/contexts/NotificationPrefsContext.tsx
// (the real module is a React provider). Keep in step with it.
export const PREFS_KEY = 'analistas_notif_prefs';
export const MUTED_KEY = 'analistas_muted_matches';
export const OVERRIDES_KEY = 'analistas_match_event_overrides';
export const DEFAULT_NOTIFICATION_PREFS = {
  notificationsEnabled: true,
  matchReminder: false, matchReminderMinutes: 15,
  goals: true, matchStart: true, halftime: true, matchEnd: true, lineups: false,
  yellowCards: false, redCards: true, substitutions: false, var: true,
  estadioMode: false, estadioDelay: 2,
  rivalResult: true, rivalRedCard: true, rivalPenMiss: true,
};
