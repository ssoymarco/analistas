import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MATCH_STORAGE_KEY = 'analistas_match_favorites';
const TEAM_STORAGE_KEY  = 'analistas_team_favorites';

interface FavoritesContextType {
  // Match favorites
  favoriteIds: string[];
  isFavorite: (matchId: string) => boolean;
  toggleFavorite: (matchId: string) => void;
  // Team following
  followedTeamIds: string[];
  isFollowingTeam: (teamId: string) => boolean;
  toggleFollowTeam: (teamId: string) => void;
}

const FavoritesContext = createContext<FavoritesContextType>({
  favoriteIds: [],
  isFavorite: () => false,
  toggleFavorite: () => {},
  followedTeamIds: [],
  isFollowingTeam: () => false,
  toggleFollowTeam: () => {},
});

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [followedTeamIds, setFollowedTeamIds] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(MATCH_STORAGE_KEY),
      AsyncStorage.getItem(TEAM_STORAGE_KEY),
    ]).then(([matchRaw, teamRaw]) => {
      if (matchRaw) {
        try { const p = JSON.parse(matchRaw); if (Array.isArray(p)) setFavoriteIds(p); } catch {}
      }
      if (teamRaw) {
        try { const p = JSON.parse(teamRaw); if (Array.isArray(p)) setFollowedTeamIds(p); } catch {}
      }
    });
  }, []);

  // ── Match favorites ──
  const isFavorite = useCallback(
    (matchId: string) => favoriteIds.includes(matchId),
    [favoriteIds],
  );

  const toggleFavorite = useCallback((matchId: string) => {
    setFavoriteIds(prev => {
      const next = prev.includes(matchId) ? prev.filter(id => id !== matchId) : [...prev, matchId];
      AsyncStorage.setItem(MATCH_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // ── Team following ──
  const isFollowingTeam = useCallback(
    (teamId: string) => followedTeamIds.includes(teamId),
    [followedTeamIds],
  );

  const toggleFollowTeam = useCallback((teamId: string) => {
    setFollowedTeamIds(prev => {
      const next = prev.includes(teamId) ? prev.filter(id => id !== teamId) : [...prev, teamId];
      AsyncStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <FavoritesContext.Provider value={{
      favoriteIds, isFavorite, toggleFavorite,
      followedTeamIds, isFollowingTeam, toggleFollowTeam,
    }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  return useContext(FavoritesContext);
}
