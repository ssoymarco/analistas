import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  onboarding:    'analistas_onboarding_done',
  teams:         'analistas_fav_teams',
  leagues:       'analistas_fav_leagues',
  players:       'analistas_fav_players',
  notifications: 'analistas_onboarding_notif_prefs',
} as const;

const DEFAULT_NOTIFS: Record<string, boolean> = {
  goals: true, matchStart: true, results: true,
  lineups: false, transfers: false, news: false,
};

interface OnboardingContextType {
  hasCompletedOnboarding: boolean;
  ready: boolean;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  selectedTeams: string[];
  toggleTeam: (teamId: string) => void;
  selectedLeagues: string[];
  toggleLeague: (leagueId: string) => void;
  selectedPlayers: string[];
  togglePlayer: (playerId: string) => void;
  notifications: Record<string, boolean>;
  toggleNotification: (key: string) => void;
}

const OnboardingContext = createContext<OnboardingContextType>({
  hasCompletedOnboarding: false,
  ready: false,
  completeOnboarding: () => {}, resetOnboarding: () => {},
  selectedTeams: [], toggleTeam: () => {},
  selectedLeagues: [], toggleLeague: () => {},
  selectedPlayers: [], togglePlayer: () => {},
  notifications: {}, toggleNotification: () => {},
});

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [hasCompletedOnboarding, setHasCompleted] = useState(false);
  const [ready, setReady] = useState(false);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<Record<string, boolean>>(DEFAULT_NOTIFS);

  useEffect(() => {
    AsyncStorage.multiGet(Object.values(KEYS)).then(results => {
      const map = Object.fromEntries(results.map(([k, v]) => [k, v]));
      if (map[KEYS.onboarding]) setHasCompleted(map[KEYS.onboarding] === 'true');
      if (map[KEYS.teams]) {
        try { setSelectedTeams(JSON.parse(map[KEYS.teams]!)); } catch {}
      }
      if (map[KEYS.leagues]) {
        try { setSelectedLeagues(JSON.parse(map[KEYS.leagues]!)); } catch {}
      }
      if (map[KEYS.players]) {
        try { setSelectedPlayers(JSON.parse(map[KEYS.players]!)); } catch {}
      }
      if (map[KEYS.notifications]) {
        try { setNotifications({ ...DEFAULT_NOTIFS, ...JSON.parse(map[KEYS.notifications]!) }); } catch {}
      }
      setReady(true);
    });
  }, []);

  const completeOnboarding = useCallback(() => {
    setHasCompleted(true);
    AsyncStorage.setItem(KEYS.onboarding, 'true');
  }, []);

  const resetOnboarding = useCallback(() => {
    setHasCompleted(false);
    AsyncStorage.setItem(KEYS.onboarding, 'false');
  }, []);

  const toggleTeam = useCallback((teamId: string) => {
    setSelectedTeams(prev => {
      const next = prev.includes(teamId) ? prev.filter(id => id !== teamId) : [...prev, teamId];
      AsyncStorage.setItem(KEYS.teams, JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleLeague = useCallback((leagueId: string) => {
    setSelectedLeagues(prev => {
      const next = prev.includes(leagueId) ? prev.filter(id => id !== leagueId) : [...prev, leagueId];
      AsyncStorage.setItem(KEYS.leagues, JSON.stringify(next));
      return next;
    });
  }, []);

  const togglePlayer = useCallback((playerId: string) => {
    setSelectedPlayers(prev => {
      const next = prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId];
      AsyncStorage.setItem(KEYS.players, JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleNotification = useCallback((key: string) => {
    setNotifications(prev => {
      const next = { ...prev, [key]: !prev[key] };
      AsyncStorage.setItem(KEYS.notifications, JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <OnboardingContext.Provider value={{
      hasCompletedOnboarding, ready, completeOnboarding, resetOnboarding,
      selectedTeams, toggleTeam,
      selectedLeagues, toggleLeague,
      selectedPlayers, togglePlayer,
      notifications, toggleNotification,
    }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  return useContext(OnboardingContext);
}
