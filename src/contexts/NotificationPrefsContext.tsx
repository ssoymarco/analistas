import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cancelAllNotificationsForMatch, PUSH_TOKEN_KEY } from '../services/notifications';

export interface NotificationPrefs {
  /** Master kill-switch. When `false`, no notification is dispatched
   *  regardless of the per-event toggles below. Phrased positively so the
   *  UI label reads naturally ("Recibir notificaciones" ON by default). */
  notificationsEnabled: boolean;
  /** ⏰ Pre-match reminder — fires `matchReminderMinutes` before kickoff
   *  for followed matches. */
  matchReminder: boolean;
  /** How many minutes before kickoff the reminder fires (5 | 15 | 30). */
  matchReminderMinutes: number;
  goals: boolean;
  matchStart: boolean;
  halftime: boolean;
  matchEnd: boolean;
  lineups: boolean;
  yellowCards: boolean;
  redCards: boolean;
  substitutions: boolean;
  var: boolean;
  /** 🏟️ Modo Estadio: retrasa notificaciones de eventos en vivo */
  estadioMode: boolean;
  /** Delay in minutes when Modo Estadio is active (1 | 2 | 5 | 10) */
  estadioDelay: number;
}

/** Subset of NotificationPrefs that the user can override on a per-match
 *  basis from the bell in MatchDetailScreen. Excludes things that don't
 *  make sense per-match (notificationsEnabled is global, estadioMode has
 *  its own per-match API, reminder/estadio delays are minute values). */
export type MatchEventPrefKey =
  | 'matchReminder' | 'goals' | 'matchStart' | 'halftime' | 'matchEnd'
  | 'lineups' | 'yellowCards' | 'redCards' | 'substitutions' | 'var';

export const MATCH_EVENT_KEYS: MatchEventPrefKey[] = [
  'matchReminder', 'goals', 'matchStart', 'halftime', 'matchEnd',
  'lineups', 'redCards', 'yellowCards', 'substitutions', 'var',
];

export type MatchEventOverrides = Record<string /* matchId */, Partial<Record<MatchEventPrefKey, boolean>>>;

// Defaults reflect the polite happy-path:
//   - Master switch ON (the user opened settings because they want alerts)
//   - Match reminder ON at 15 min (the universal sweet spot in competitor apps)
//   - Yellow cards OFF (4-5× noisier than reds; opt-in)
const DEFAULT_PREFS: NotificationPrefs = {
  notificationsEnabled: true,
  matchReminder: true,
  matchReminderMinutes: 15,
  goals: true, matchStart: true, halftime: false,
  matchEnd: true, lineups: true,
  yellowCards: false, redCards: true,
  substitutions: false, var: true,
  estadioMode: false,
  estadioDelay: 2,
};

interface NotificationPrefsContextType {
  prefs: NotificationPrefs;
  togglePref: (key: keyof Pick<NotificationPrefs, 'notificationsEnabled' | 'matchReminder' | 'goals' | 'matchStart' | 'halftime' | 'matchEnd' | 'lineups' | 'yellowCards' | 'redCards' | 'substitutions' | 'var' | 'estadioMode'>) => void;
  /** Set the Modo Estadio delay in minutes */
  setEstadioDelay: (minutes: number) => void;
  /** Set how many minutes before kickoff the match reminder fires */
  setMatchReminderMinutes: (minutes: number) => void;
  mutedMatchIds: Set<string>;
  toggleMatchMute: (matchId: string) => void;
  isMatchMuted: (matchId: string) => boolean;
  /** Per-match Modo Estadio — overrides global setting for a specific match */
  estadioMatchIds: Set<string>;
  toggleMatchEstadio: (matchId: string) => void;
  isMatchEstadio: (matchId: string) => boolean;
  /** Per-match delay in minutes. Falls back to prefs.estadioDelay if not set. */
  estadioMatchDelays: Record<string, number>;
  setMatchEstadioDelay: (matchId: string, minutes: number) => void;
  getMatchEstadioDelay: (matchId: string) => number;
  /** Per-match event overrides — let the user customize a single match
   *  without affecting their global preferences. Missing keys fall back to
   *  the global pref. */
  matchEventOverrides: MatchEventOverrides;
  setMatchEventOverride: (matchId: string, key: MatchEventPrefKey, value: boolean) => void;
  clearMatchEventOverride: (matchId: string, key: MatchEventPrefKey) => void;
  clearAllMatchEventOverrides: (matchId: string) => void;
  /** Returns the effective bool for an event on a given match — override if
   *  set, otherwise the global pref. */
  getEffectiveMatchEventPref: (matchId: string, key: MatchEventPrefKey) => boolean;
  /** Whether the user has set any per-event override OR muted this match. */
  hasMatchCustomization: (matchId: string) => boolean;
  /** Expo Push Token — null until permissions are granted */
  pushToken: string | null;
  setPushToken: (token: string | null) => void;
  /** Permission status — 'undetermined' until the OS dialog has been shown */
  permissionStatus: 'undetermined' | 'granted' | 'denied';
  setPermissionStatus: (status: 'undetermined' | 'granted' | 'denied') => void;
}

const NotificationPrefsContext = createContext<NotificationPrefsContextType>({
  prefs: DEFAULT_PREFS,
  togglePref: () => {},
  setEstadioDelay: () => {},
  setMatchReminderMinutes: () => {},
  mutedMatchIds: new Set(),
  toggleMatchMute: () => {},
  isMatchMuted: () => false,
  estadioMatchIds: new Set(),
  toggleMatchEstadio: () => {},
  isMatchEstadio: () => false,
  estadioMatchDelays: {},
  setMatchEstadioDelay: () => {},
  getMatchEstadioDelay: () => 2,
  matchEventOverrides: {},
  setMatchEventOverride: () => {},
  clearMatchEventOverride: () => {},
  clearAllMatchEventOverrides: () => {},
  getEffectiveMatchEventPref: () => true,
  hasMatchCustomization: () => false,
  pushToken: null,
  setPushToken: () => {},
  permissionStatus: 'undetermined',
  setPermissionStatus: () => {},
});

const PREFS_KEY          = 'analistas_notif_prefs';
const MUTED_KEY          = 'analistas_muted_matches';
const ESTADIO_KEY        = 'analistas_estadio_matches';
const ESTADIO_DELAYS_KEY = 'analistas_estadio_delays';
const OVERRIDES_KEY      = 'analistas_match_event_overrides';
const PERM_KEY           = 'analistas_notif_permission';

export function NotificationPrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [mutedMatchIds, setMutedMatchIds] = useState<Set<string>>(new Set());
  const [estadioMatchIds, setEstadioMatchIds] = useState<Set<string>>(new Set());
  const [estadioMatchDelays, setEstadioMatchDelays] = useState<Record<string, number>>({});
  const [matchEventOverrides, setMatchEventOverrides] = useState<MatchEventOverrides>({});
  const [pushToken, setPushTokenState] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatusState] = useState<'undetermined' | 'granted' | 'denied'>('undetermined');

  useEffect(() => {
    AsyncStorage.multiGet([PREFS_KEY, MUTED_KEY, ESTADIO_KEY, ESTADIO_DELAYS_KEY, OVERRIDES_KEY, PUSH_TOKEN_KEY, PERM_KEY]).then(
      ([[, rawPrefs], [, rawMuted], [, rawEstadio], [, rawDelays], [, rawOverrides], [, savedToken], [, savedPerm]]) => {
        if (rawPrefs) {
          try { setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(rawPrefs) }); } catch {}
        }
        if (rawMuted) {
          try { setMutedMatchIds(new Set(JSON.parse(rawMuted))); } catch {}
        }
        if (rawEstadio) {
          try { setEstadioMatchIds(new Set(JSON.parse(rawEstadio))); } catch {}
        }
        if (rawDelays) {
          try { setEstadioMatchDelays(JSON.parse(rawDelays)); } catch {}
        }
        if (rawOverrides) {
          try { setMatchEventOverrides(JSON.parse(rawOverrides)); } catch {}
        }
        if (savedToken) setPushTokenState(savedToken);
        if (savedPerm === 'granted' || savedPerm === 'denied') {
          setPermissionStatusState(savedPerm);
        }
      },
    );
  }, []);

  const togglePref = useCallback((key: keyof NotificationPrefs) => {
    setPrefs(p => {
      const next = { ...p, [key]: !p[key] };
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setEstadioDelay = useCallback((minutes: number) => {
    setPrefs(p => {
      const next = { ...p, estadioDelay: minutes };
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setMatchReminderMinutes = useCallback((minutes: number) => {
    setPrefs(p => {
      const next = { ...p, matchReminderMinutes: minutes };
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleMatchMute = useCallback((matchId: string) => {
    setMutedMatchIds(prev => {
      const next = new Set(prev);
      if (next.has(matchId)) {
        next.delete(matchId);
      } else {
        next.add(matchId);
        // Cancel any scheduled local notifications for this match
        cancelAllNotificationsForMatch(matchId).catch(() => {});
      }
      AsyncStorage.setItem(MUTED_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const isMatchMuted = useCallback(
    (matchId: string) => mutedMatchIds.has(matchId),
    [mutedMatchIds],
  );

  const toggleMatchEstadio = useCallback((matchId: string) => {
    setEstadioMatchIds(prev => {
      const next = new Set(prev);
      if (next.has(matchId)) {
        next.delete(matchId);
      } else {
        next.add(matchId);
      }
      AsyncStorage.setItem(ESTADIO_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const isMatchEstadio = useCallback(
    (matchId: string) => estadioMatchIds.has(matchId),
    [estadioMatchIds],
  );

  const setMatchEstadioDelay = useCallback((matchId: string, minutes: number) => {
    setEstadioMatchDelays(prev => {
      const next = { ...prev, [matchId]: minutes };
      AsyncStorage.setItem(ESTADIO_DELAYS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const getMatchEstadioDelay = useCallback(
    (matchId: string) => estadioMatchDelays[matchId] ?? prefs.estadioDelay,
    [estadioMatchDelays, prefs.estadioDelay],
  );

  // ── Per-match event overrides ───────────────────────────────────────────
  const persistOverrides = useCallback((next: MatchEventOverrides) => {
    AsyncStorage.setItem(OVERRIDES_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const setMatchEventOverride = useCallback(
    (matchId: string, key: MatchEventPrefKey, value: boolean) => {
      setMatchEventOverrides(prev => {
        const matchPrev = prev[matchId] ?? {};
        const next: MatchEventOverrides = {
          ...prev,
          [matchId]: { ...matchPrev, [key]: value },
        };
        persistOverrides(next);
        return next;
      });
    },
    [persistOverrides],
  );

  const clearMatchEventOverride = useCallback(
    (matchId: string, key: MatchEventPrefKey) => {
      setMatchEventOverrides(prev => {
        const matchPrev = prev[matchId];
        if (!matchPrev || !(key in matchPrev)) return prev;
        const { [key]: _drop, ...rest } = matchPrev;
        const next: MatchEventOverrides = { ...prev };
        if (Object.keys(rest).length === 0) {
          delete next[matchId];
        } else {
          next[matchId] = rest;
        }
        persistOverrides(next);
        return next;
      });
    },
    [persistOverrides],
  );

  const clearAllMatchEventOverrides = useCallback(
    (matchId: string) => {
      setMatchEventOverrides(prev => {
        if (!prev[matchId]) return prev;
        const next: MatchEventOverrides = { ...prev };
        delete next[matchId];
        persistOverrides(next);
        return next;
      });
    },
    [persistOverrides],
  );

  const getEffectiveMatchEventPref = useCallback(
    (matchId: string, key: MatchEventPrefKey): boolean => {
      const override = matchEventOverrides[matchId]?.[key];
      if (override !== undefined) return override;
      return prefs[key];
    },
    [matchEventOverrides, prefs],
  );

  const hasMatchCustomization = useCallback(
    (matchId: string) => {
      if (mutedMatchIds.has(matchId)) return true;
      const overrides = matchEventOverrides[matchId];
      return !!overrides && Object.keys(overrides).length > 0;
    },
    [mutedMatchIds, matchEventOverrides],
  );

  const setPushToken = useCallback((token: string | null) => {
    setPushTokenState(token);
    // AsyncStorage persistence is handled by requestPermissionsAndGetToken in the service.
    // This setter just syncs reactive state so components can read the token.
    if (token) AsyncStorage.setItem(PUSH_TOKEN_KEY, token).catch(() => {});
  }, []);

  const setPermissionStatus = useCallback((status: 'undetermined' | 'granted' | 'denied') => {
    setPermissionStatusState(status);
    AsyncStorage.setItem(PERM_KEY, status).catch(() => {});
  }, []);

  return (
    <NotificationPrefsContext.Provider
      value={{
        prefs, togglePref, setEstadioDelay, setMatchReminderMinutes,
        mutedMatchIds, toggleMatchMute, isMatchMuted,
        estadioMatchIds, toggleMatchEstadio, isMatchEstadio,
        estadioMatchDelays, setMatchEstadioDelay, getMatchEstadioDelay,
        matchEventOverrides,
        setMatchEventOverride, clearMatchEventOverride, clearAllMatchEventOverrides,
        getEffectiveMatchEventPref, hasMatchCustomization,
        pushToken, setPushToken,
        permissionStatus, setPermissionStatus,
      }}
    >
      {children}
    </NotificationPrefsContext.Provider>
  );
}

export function useNotificationPrefs() {
  return useContext(NotificationPrefsContext);
}
