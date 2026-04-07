import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
}

const NotificationPrefsContext = createContext<NotificationPrefsContextType>({
  prefs: DEFAULT_PREFS,
  togglePref: () => {},
  mutedMatchIds: new Set(),
  toggleMatchMute: () => {},
  isMatchMuted: () => false,
});

const PREFS_KEY = 'analistas_notif_prefs';
const MUTED_KEY = 'analistas_muted_matches';

export function NotificationPrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [mutedMatchIds, setMutedMatchIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.multiGet([PREFS_KEY, MUTED_KEY]).then(([[, rawPrefs], [, rawMuted]]) => {
      if (rawPrefs) {
        try { setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(rawPrefs) }); } catch {}
      }
      if (rawMuted) {
        try { setMutedMatchIds(new Set(JSON.parse(rawMuted))); } catch {}
      }
    });
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
      if (next.has(matchId)) next.delete(matchId);
      else next.add(matchId);
      AsyncStorage.setItem(MUTED_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const isMatchMuted = useCallback(
    (matchId: string) => mutedMatchIds.has(matchId),
    [mutedMatchIds],
  );

  return (
    <NotificationPrefsContext.Provider value={{ prefs, togglePref, mutedMatchIds, toggleMatchMute, isMatchMuted }}>
      {children}
    </NotificationPrefsContext.Provider>
  );
}

export function useNotificationPrefs() {
  return useContext(NotificationPrefsContext);
}
