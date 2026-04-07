import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'analistas_match_favorites';

interface FavoritesContextType {
  favoriteIds: string[];
  isFavorite: (matchId: string) => boolean;
  toggleFavorite: (matchId: string) => void;
}

const FavoritesContext = createContext<FavoritesContextType>({
  favoriteIds: [],
  isFavorite: () => false,
  toggleFavorite: () => {},
});

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setFavoriteIds(parsed);
        } catch {}
      }
    });
  }, []);

  const isFavorite = useCallback(
    (matchId: string) => favoriteIds.includes(matchId),
    [favoriteIds],
  );

  const toggleFavorite = useCallback((matchId: string) => {
    setFavoriteIds(prev => {
      const next = prev.includes(matchId)
        ? prev.filter(id => id !== matchId)
        : [...prev, matchId];
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <FavoritesContext.Provider value={{ favoriteIds, isFavorite, toggleFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  return useContext(FavoritesContext);
}
