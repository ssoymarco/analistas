// ── User Stats Context ───────────────────────────────────────────────────────
// Tracks user engagement metrics: matches viewed, news read, and daily streak.
// All data persists via AsyncStorage.

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  matchesViewed: 'analistas_matches_viewed',
  newsRead: 'analistas_news_read',
  streakDays: 'analistas_streak_days',
  lastActiveDate: 'analistas_last_active_date',
  viewedMatchIds: 'analistas_viewed_match_ids',
  readNewsIds: 'analistas_read_news_ids',
};

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface UserStatsContextType {
  matchesViewed: number;
  newsRead: number;
  streakDays: number;
  incrementMatchesViewed: (matchId: string) => void;
  incrementNewsRead: (articleId: string) => void;
  resetStats: () => Promise<void>;
}

const UserStatsContext = createContext<UserStatsContextType>({
  matchesViewed: 0,
  newsRead: 0,
  streakDays: 1,
  incrementMatchesViewed: () => {},
  incrementNewsRead: () => {},
  resetStats: async () => {},
});

export const useUserStats = () => useContext(UserStatsContext);

export const UserStatsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [matchesViewed, setMatchesViewed] = useState(0);
  const [newsRead, setNewsRead] = useState(0);
  const [streakDays, setStreakDays] = useState(1);
  const [viewedMatchIds, setViewedMatchIds] = useState<Set<string>>(new Set());
  const [readNewsIds, setReadNewsIds] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  // Load persisted stats on mount
  useEffect(() => {
    (async () => {
      try {
        const [mv, nr, sd, lad, vmIds, rnIds] = await AsyncStorage.multiGet([
          KEYS.matchesViewed,
          KEYS.newsRead,
          KEYS.streakDays,
          KEYS.lastActiveDate,
          KEYS.viewedMatchIds,
          KEYS.readNewsIds,
        ]);

        const savedMatches = parseInt(mv[1] ?? '0', 10) || 0;
        const savedNews = parseInt(nr[1] ?? '0', 10) || 0;
        let savedStreak = parseInt(sd[1] ?? '1', 10) || 1;
        const lastActive = lad[1] ?? '';
        const savedViewedIds: string[] = vmIds[1] ? JSON.parse(vmIds[1]) : [];
        const savedReadIds: string[] = rnIds[1] ? JSON.parse(rnIds[1]) : [];

        // ── Streak logic ──
        const today = todayISO();
        const yesterday = yesterdayISO();

        if (lastActive === today) {
          // Already active today — no change
        } else if (lastActive === yesterday) {
          // Active yesterday — streak continues
          savedStreak += 1;
          await AsyncStorage.setItem(KEYS.streakDays, String(savedStreak));
          await AsyncStorage.setItem(KEYS.lastActiveDate, today);
        } else {
          // Missed a day or first launch — reset streak
          savedStreak = 1;
          await AsyncStorage.setItem(KEYS.streakDays, '1');
          await AsyncStorage.setItem(KEYS.lastActiveDate, today);
        }

        setMatchesViewed(savedMatches);
        setNewsRead(savedNews);
        setStreakDays(savedStreak);
        setViewedMatchIds(new Set(savedViewedIds));
        setReadNewsIds(new Set(savedReadIds));
        setReady(true);
      } catch {
        setReady(true);
      }
    })();
  }, []);

  const incrementMatchesViewed = useCallback((matchId: string) => {
    setViewedMatchIds(prev => {
      if (prev.has(matchId)) return prev; // Already counted this match
      const next = new Set(prev);
      next.add(matchId);

      const newCount = next.size;
      setMatchesViewed(newCount);

      // Persist async
      AsyncStorage.setItem(KEYS.matchesViewed, String(newCount));
      AsyncStorage.setItem(KEYS.viewedMatchIds, JSON.stringify([...next]));

      return next;
    });
  }, []);

  const incrementNewsRead = useCallback((articleId: string) => {
    setReadNewsIds(prev => {
      if (prev.has(articleId)) return prev; // Already counted this article
      const next = new Set(prev);
      next.add(articleId);

      const newCount = next.size;
      setNewsRead(newCount);

      // Persist async
      AsyncStorage.setItem(KEYS.newsRead, String(newCount));
      AsyncStorage.setItem(KEYS.readNewsIds, JSON.stringify([...next]));

      return next;
    });
  }, []);

  const resetStats = useCallback(async () => {
    setMatchesViewed(0);
    setNewsRead(0);
    setStreakDays(1);
    setViewedMatchIds(new Set());
    setReadNewsIds(new Set());
    await AsyncStorage.multiRemove(Object.values(KEYS));
  }, []);

  return (
    <UserStatsContext.Provider value={{
      matchesViewed,
      newsRead,
      streakDays,
      incrementMatchesViewed,
      incrementNewsRead,
      resetStats,
    }}>
      {children}
    </UserStatsContext.Provider>
  );
};
