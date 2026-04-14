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
}

const DEFAULT_PREFS: NotificationPrefs = {
  goals: true, matchStart: true, halftime: false,
  matchEnd: true, lineups: true, redCards: true,
  substitutions: false, var: true,
};

interface NotificationPrefsContextType {
  prefs: NotificationPrefs;
  togglePref: (key: keyof NotificationPrefs) => void;
  mutedMatchIds: Set<string>;
  toggleMatchMute: (matchId: string) => void;
  isMatchMuted: (matchId: string) => boolean;
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
  mutedMatchIds: new Set(),
  toggleMatchMute: () => {},
  isMatchMuted: () => false,
  pushToken: null,
  setPushToken: () => {},
  permissionStatus: 'undetermined',
  setPermissionStatus: () => {},
});

const PREFS_KEY = 'analistas_notif_prefs';
const MUTED_KEY = 'analistas_muted_matches';
const PERM_KEY  = 'analistas_notif_permission';

export function NotificationPrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [mutedMatchIds, setMutedMatchIds] = useState<Set<string>>(new Set());
  const [pushToken, setPushTokenState] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatusState] = useState<'undetermined' | 'granted' | 'denied'>('undetermined');

  useEffect(() => {
    AsyncStorage.multiGet([PREFS_KEY, MUTED_KEY, PUSH_TOKEN_KEY, PERM_KEY]).then(
      ([[, rawPrefs], [, rawMuted], [, savedToken], [, savedPerm]]) => {
        if (rawPrefs) {
          try { setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(rawPrefs) }); } catch {}
        }
        if (rawMuted) {
          try { setMutedMatchIds(new Set(JSON.parse(rawMuted))); } catch {}
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
        prefs, togglePref,
        mutedMatchIds, toggleMatchMute, isMatchMuted,
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
