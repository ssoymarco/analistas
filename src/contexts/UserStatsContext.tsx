// ── User Stats Context ───────────────────────────────────────────────────────
// Tracks user engagement metrics: matches viewed, news read, daily streak,
// streak recoveries (3/month like TikTok), and streak notification preference.
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
  activeDates: 'analistas_active_dates',
  recoveriesUsed: 'analistas_streak_recoveries_used',
  recoveryMonth: 'analistas_streak_recovery_month',
  streakNotify: 'analistas_streak_notify',
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

function currentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Count whole days between two ISO dates (exclusive of start, inclusive of end). */
function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T12:00:00');
  const db = new Date(b + 'T12:00:00');
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

const MAX_RECOVERIES_PER_MONTH = 3;

interface UserStatsContextType {
  matchesViewed: number;
  newsRead: number;
  streakDays: number;
  activeDates: string[];
  recoveriesRemaining: number;
  streakNotifyEnabled: boolean;
  incrementMatchesViewed: (matchId: string) => void;
  incrementNewsRead: (articleId: string) => void;
  setStreakNotify: (enabled: boolean) => void;
  resetStats: () => Promise<void>;
}

const UserStatsContext = createContext<UserStatsContextType>({
  matchesViewed: 0,
  newsRead: 0,
  streakDays: 1,
  activeDates: [],
  recoveriesRemaining: MAX_RECOVERIES_PER_MONTH,
  streakNotifyEnabled: false,
  incrementMatchesViewed: () => {},
  incrementNewsRead: () => {},
  setStreakNotify: () => {},
  resetStats: async () => {},
});

export const useUserStats = () => useContext(UserStatsContext);

export const UserStatsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [matchesViewed, setMatchesViewed] = useState(0);
  const [newsRead, setNewsRead] = useState(0);
  const [streakDays, setStreakDays] = useState(1);
  const [activeDates, setActiveDates] = useState<string[]>([]);
  const [recoveriesRemaining, setRecoveriesRemaining] = useState(MAX_RECOVERIES_PER_MONTH);
  const [streakNotifyEnabled, setStreakNotifyEnabled] = useState(false);
  const [viewedMatchIds, setViewedMatchIds] = useState<Set<string>>(new Set());
  const [readNewsIds, setReadNewsIds] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  // Load persisted stats on mount
  useEffect(() => {
    (async () => {
      try {
        const results = await AsyncStorage.multiGet([
          KEYS.matchesViewed,
          KEYS.newsRead,
          KEYS.streakDays,
          KEYS.lastActiveDate,
          KEYS.viewedMatchIds,
          KEYS.readNewsIds,
          KEYS.activeDates,
          KEYS.recoveriesUsed,
          KEYS.recoveryMonth,
          KEYS.streakNotify,
        ]);

        const savedMatches = parseInt(results[0][1] ?? '0', 10) || 0;
        const savedNews = parseInt(results[1][1] ?? '0', 10) || 0;
        let savedStreak = parseInt(results[2][1] ?? '1', 10) || 1;
        const lastActive = results[3][1] ?? '';
        const savedViewedIds: string[] = results[4][1] ? JSON.parse(results[4][1]) : [];
        const savedReadIds: string[] = results[5][1] ? JSON.parse(results[5][1]) : [];
        let savedActiveDates: string[] = results[6][1] ? JSON.parse(results[6][1]) : [];
        let recUsed = parseInt(results[7][1] ?? '0', 10) || 0;
        let recMonth = results[8][1] ?? '';
        const notify = results[9][1] === 'true';

        // ── Reset recoveries if new month ──
        const curMonth = currentMonthStr();
        if (recMonth !== curMonth) {
          recUsed = 0;
          recMonth = curMonth;
          await AsyncStorage.setItem(KEYS.recoveriesUsed, '0');
          await AsyncStorage.setItem(KEYS.recoveryMonth, curMonth);
        }

        // ── Streak logic with recoveries ──
        const today = todayISO();
        const yesterday = yesterdayISO();

        if (lastActive === today) {
          // Already active today — no change
        } else if (lastActive === yesterday) {
          // Active yesterday — streak continues
          savedStreak += 1;
          if (!savedActiveDates.includes(today)) {
            savedActiveDates = [...savedActiveDates, today].slice(-60);
          }
          await AsyncStorage.setItem(KEYS.streakDays, String(savedStreak));
          await AsyncStorage.setItem(KEYS.lastActiveDate, today);
          await AsyncStorage.setItem(KEYS.activeDates, JSON.stringify(savedActiveDates));
        } else if (lastActive) {
          // Missed one or more days — try auto-recovery
          const missed = daysBetween(lastActive, today) - 1;
          const recsAvailable = MAX_RECOVERIES_PER_MONTH - recUsed;

          if (missed > 0 && missed <= recsAvailable) {
            // Auto-recover: use recoveries to keep streak alive
            recUsed += missed;
            savedStreak += 1;
            if (!savedActiveDates.includes(today)) {
              savedActiveDates = [...savedActiveDates, today].slice(-60);
            }
            await AsyncStorage.multiSet([
              [KEYS.streakDays, String(savedStreak)],
              [KEYS.lastActiveDate, today],
              [KEYS.activeDates, JSON.stringify(savedActiveDates)],
              [KEYS.recoveriesUsed, String(recUsed)],
            ]);
          } else {
            // Too many missed days or no recoveries — streak breaks
            savedStreak = 1;
            if (!savedActiveDates.includes(today)) {
              savedActiveDates = [...savedActiveDates, today].slice(-60);
            }
            await AsyncStorage.multiSet([
              [KEYS.streakDays, '1'],
              [KEYS.lastActiveDate, today],
              [KEYS.activeDates, JSON.stringify(savedActiveDates)],
            ]);
          }
        } else {
          // Very first launch ever
          savedStreak = 1;
          savedActiveDates = [today];
          await AsyncStorage.multiSet([
            [KEYS.streakDays, '1'],
            [KEYS.lastActiveDate, today],
            [KEYS.activeDates, JSON.stringify(savedActiveDates)],
          ]);
        }

        setMatchesViewed(savedMatches);
        setNewsRead(savedNews);
        setStreakDays(savedStreak);
        setActiveDates(savedActiveDates);
        setRecoveriesRemaining(MAX_RECOVERIES_PER_MONTH - recUsed);
        setStreakNotifyEnabled(notify);
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
      if (prev.has(matchId)) return prev;
      const next = new Set(prev);
      next.add(matchId);

      const newCount = next.size;
      setMatchesViewed(newCount);

      AsyncStorage.setItem(KEYS.matchesViewed, String(newCount));
      AsyncStorage.setItem(KEYS.viewedMatchIds, JSON.stringify([...next]));

      return next;
    });
  }, []);

  const incrementNewsRead = useCallback((articleId: string) => {
    setReadNewsIds(prev => {
      if (prev.has(articleId)) return prev;
      const next = new Set(prev);
      next.add(articleId);

      const newCount = next.size;
      setNewsRead(newCount);

      AsyncStorage.setItem(KEYS.newsRead, String(newCount));
      AsyncStorage.setItem(KEYS.readNewsIds, JSON.stringify([...next]));

      return next;
    });
  }, []);

  const setStreakNotify = useCallback((enabled: boolean) => {
    setStreakNotifyEnabled(enabled);
    AsyncStorage.setItem(KEYS.streakNotify, String(enabled));
  }, []);

  const resetStats = useCallback(async () => {
    setMatchesViewed(0);
    setNewsRead(0);
    setStreakDays(1);
    setActiveDates([]);
    setRecoveriesRemaining(MAX_RECOVERIES_PER_MONTH);
    setStreakNotifyEnabled(false);
    setViewedMatchIds(new Set());
    setReadNewsIds(new Set());
    await AsyncStorage.multiRemove(Object.values(KEYS));
  }, []);

  return (
    <UserStatsContext.Provider value={{
      matchesViewed,
      newsRead,
      streakDays,
      activeDates,
      recoveriesRemaining,
      streakNotifyEnabled,
      incrementMatchesViewed,
      incrementNewsRead,
      setStreakNotify,
      resetStats,
    }}>
      {children}
    </UserStatsContext.Provider>
  );
};
