import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cancelAllNotificationsForMatch, PUSH_TOKEN_KEY } from '../services/notifications';

export interface NotificationPrefs {
  goals: boolean;
  matchStart: boolean;
  halftime: boolean;
  matchEnd: boolean;
  lineups: boolean;
  redCards: boolean;
  substitutions: boolean;
  var: boolean;
  /** 🏟️ Modo Estadio: retrasa notificaciones de eventos en vivo */
  estadioMode: boolean;
  /** Delay in minutes when Modo Estadio is active (1 | 2 | 5 | 10) */
  estadioDelay: number;
}

const DEFAULT_PREFS: NotificationPrefs = {
  goals: true, matchStart: true, halftime: false,
  matchEnd: true, lineups: true, redCards: true,
  substitutions: false, var: true,
  estadioMode: false,
  estadioDelay: 2,
};

interface NotificationPrefsContextType {
  prefs: NotificationPrefs;
  togglePref: (key: keyof Pick<NotificationPrefs, 'goals' | 'matchStart' | 'halftime' | 'matchEnd' | 'lineups' | 'redCards' | 'substitutions' | 'var' | 'estadioMode'>) => void;
  /** Set the Modo Estadio delay in minutes */
  setEstadioDelay: (minutes: number) => void;
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
  mutedMatchIds: new Set(),
  toggleMatchMute: () => {},
  isMatchMuted: () => false,
  estadioMatchIds: new Set(),
  toggleMatchEstadio: () => {},
  isMatchEstadio: () => false,
  estadioMatchDelays: {},
  setMatchEstadioDelay: () => {},
  getMatchEstadioDelay: () => 2,
  pushToken: null,
  setPushToken: () => {},
  permissionStatus: 'undetermined',
  setPermissionStatus: () => {},
});

const PREFS_KEY          = 'analistas_notif_prefs';
const MUTED_KEY          = 'analistas_muted_matches';
const ESTADIO_KEY        = 'analistas_estadio_matches';
const ESTADIO_DELAYS_KEY = 'analistas_estadio_delays';
const PERM_KEY           = 'analistas_notif_permission';

export function NotificationPrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [mutedMatchIds, setMutedMatchIds] = useState<Set<string>>(new Set());
  const [estadioMatchIds, setEstadioMatchIds] = useState<Set<string>>(new Set());
  const [estadioMatchDelays, setEstadioMatchDelays] = useState<Record<string, number>>({});
  const [pushToken, setPushTokenState] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatusState] = useState<'undetermined' | 'granted' | 'denied'>('undetermined');

  useEffect(() => {
    AsyncStorage.multiGet([PREFS_KEY, MUTED_KEY, ESTADIO_KEY, ESTADIO_DELAYS_KEY, PUSH_TOKEN_KEY, PERM_KEY]).then(
      ([[, rawPrefs], [, rawMuted], [, rawEstadio], [, rawDelays], [, savedToken], [, savedPerm]]) => {
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
        prefs, togglePref, setEstadioDelay,
        mutedMatchIds, toggleMatchMute, isMatchMuted,
        estadioMatchIds, toggleMatchEstadio, isMatchEstadio,
        estadioMatchDelays, setMatchEstadioDelay, getMatchEstadioDelay,
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
