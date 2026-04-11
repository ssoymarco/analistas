import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MATCH_STORAGE_KEY  = 'analistas_match_favorites';
const TEAM_STORAGE_KEY   = 'analistas_team_favorites';
const PLAYER_STORAGE_KEY = 'analistas_player_favorites';
const LEAGUE_STORAGE_KEY = 'analistas_league_favorites';

interface FavoritesContextType {
  // Match favorites
  favoriteIds: string[];
  isFavorite: (matchId: string) => boolean;
  toggleFavorite: (matchId: string) => void;
  // Team following
  followedTeamIds: string[];
  isFollowingTeam: (teamId: string) => boolean;
  toggleFollowTeam: (teamId: string) => void;
  // Player following
  followedPlayerIds: string[];
  isFollowingPlayer: (playerId: string) => boolean;
  toggleFollowPlayer: (playerId: string) => void;
  // League following
  followedLeagueIds: string[];
  isFollowingLeague: (leagueId: string) => boolean;
  toggleFollowLeague: (leagueId: string) => void;
}

const FavoritesContext = createContext<FavoritesContextType>({
  favoriteIds: [],
  isFavorite: () => false,
  toggleFavorite: () => {},
  followedTeamIds: [],
  isFollowingTeam: () => false,
  toggleFollowTeam: () => {},
  followedPlayerIds: [],
  isFollowingPlayer: () => false,
  toggleFollowPlayer: () => {},
  followedLeagueIds: [],
  isFollowingLeague: () => false,
  toggleFollowLeague: () => {},
});

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [followedTeamIds, setFollowedTeamIds] = useState<string[]>([]);
  const [followedPlayerIds, setFollowedPlayerIds] = useState<string[]>([]);
  const [followedLeagueIds, setFollowedLeagueIds] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(MATCH_STORAGE_KEY),
      AsyncStorage.getItem(TEAM_STORAGE_KEY),
      AsyncStorage.getItem(PLAYER_STORAGE_KEY),
      AsyncStorage.getItem(LEAGUE_STORAGE_KEY),
    ]).then(([matchRaw, teamRaw, playerRaw, leagueRaw]) => {
      if (matchRaw) {
        try { const p = JSON.parse(matchRaw); if (Array.isArray(p)) setFavoriteIds(p); } catch {}
      }
      if (teamRaw) {
        try { const p = JSON.parse(teamRaw); if (Array.isArray(p)) setFollowedTeamIds(p); } catch {}
      }
      if (playerRaw) {
        try { const p = JSON.parse(playerRaw); if (Array.isArray(p)) setFollowedPlayerIds(p); } catch {}
      }
      if (leagueRaw) {
        try { const p = JSON.parse(leagueRaw); if (Array.isArray(p)) setFollowedLeagueIds(p); } catch {}
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

  // ── Player following ──
  const isFollowingPlayer = useCallback(
    (playerId: string) => followedPlayerIds.includes(playerId),
    [followedPlayerIds],
  );

  const toggleFollowPlayer = useCallback((playerId: string) => {
    setFollowedPlayerIds(prev => {
      const next = prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId];
      AsyncStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // ── League following ──
  const isFollowingLeague = useCallback(
    (leagueId: string) => followedLeagueIds.includes(leagueId),
    [followedLeagueIds],
  );

  const toggleFollowLeague = useCallback((leagueId: string) => {
    setFollowedLeagueIds(prev => {
      const next = prev.includes(leagueId) ? prev.filter(id => id !== leagueId) : [...prev, leagueId];
      AsyncStorage.setItem(LEAGUE_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <FavoritesContext.Provider value={{
      favoriteIds, isFavorite, toggleFavorite,
      followedTeamIds, isFollowingTeam, toggleFollowTeam,
      followedPlayerIds, isFollowingPlayer, toggleFollowPlayer,
      followedLeagueIds, isFollowingLeague, toggleFollowLeague,
    }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  return useContext(FavoritesContext);
}
