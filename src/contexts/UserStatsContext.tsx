// ── User Stats Context ───────────────────────────────────────────────────────
// Tracks user engagement metrics: matches viewed, news read, daily streak,
// streak recoveries (3/month like TikTok), and streak notification preference.
// Also tracks time-windowed stats (last 7 / 30 days) and a yearly Wrapped
// aggregate. All data persists via AsyncStorage.

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── AsyncStorage keys ────────────────────────────────────────────────────────

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
  // New keys
  longestStreak: '@analistas_longest_streak',
  goalsFromFavorites: '@analistas_goals_from_favorites',
  liveMatchesViewed: '@analistas_live_matches_viewed',
  matchEvents: '@analistas_match_events',
  newsEvents: '@analistas_news_events',
};

function wrappedKey(year: number): string {
  return `@analistas_wrapped_${year}`;
}

// ── Event types ──────────────────────────────────────────────────────────────

type MatchEvent = {
  ts: number;
  teamIds: string[];
  isLive: boolean;
  leagueId: string;
};

type NewsEvent = {
  ts: number;
  tags: string[];
};

// ── Wrapped yearly stats ─────────────────────────────────────────────────────

type WrappedYearStats = {
  year: number;
  matchesViewed: number;
  matchesFromFavorites: number;
  liveMatchesViewed: number;
  goalsFromFavorites: number;
  newsRead: number;
  longestStreak: number;
  worldCupMatches: number;
  firstOpenDate: string; // ISO date
};

const WORLD_CUP_LEAGUE_IDS = new Set(['copa_del_mundo', 'world_cup', 'fifa_world_cup']);

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_RECOVERIES_PER_MONTH = 3;
const MAX_EVENTS = 500;
const PURGE_DAYS = 90;

// ── Date helpers ─────────────────────────────────────────────────────────────

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

function currentYear(): number {
  return new Date().getFullYear();
}

/** Count whole days between two ISO dates (exclusive of start, inclusive of end). */
function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T12:00:00');
  const db = new Date(b + 'T12:00:00');
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

function isWithinDays(ts: number, days: number): boolean {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return ts >= cutoff;
}

function purgeOldEvents<T extends { ts: number }>(events: T[]): T[] {
  const cutoff = Date.now() - PURGE_DAYS * 24 * 60 * 60 * 1000;
  return events.filter(e => e.ts >= cutoff);
}

function appendEvent<T extends { ts: number }>(events: T[], event: T): T[] {
  const next = [...events, event];
  // Purge old entries first, then cap at MAX_EVENTS (drop oldest)
  const purged = purgeOldEvents(next);
  if (purged.length > MAX_EVENTS) {
    return purged.slice(purged.length - MAX_EVENTS);
  }
  return purged;
}

function computeWindowedCounts(
  matchEvents: MatchEvent[],
  newsEvents: NewsEvent[],
) {
  const matchesThisWeek = matchEvents.filter(e => isWithinDays(e.ts, 7)).length;
  const matchesThisMonth = matchEvents.filter(e => isWithinDays(e.ts, 30)).length;
  const newsThisWeek = newsEvents.filter(e => isWithinDays(e.ts, 7)).length;
  const newsThisMonth = newsEvents.filter(e => isWithinDays(e.ts, 30)).length;
  return { matchesThisWeek, matchesThisMonth, newsThisWeek, newsThisMonth };
}

// ── Default empty Wrapped stats ──────────────────────────────────────────────

function emptyWrapped(year: number): WrappedYearStats {
  return {
    year,
    matchesViewed: 0,
    matchesFromFavorites: 0,
    liveMatchesViewed: 0,
    goalsFromFavorites: 0,
    newsRead: 0,
    longestStreak: 0,
    worldCupMatches: 0,
    firstOpenDate: todayISO(),
  };
}

// ── Context type ─────────────────────────────────────────────────────────────

interface UserStatsContextType {
  // ── Existing (backward-compatible) ──────────────────────────────────────
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
  // ── New computed values ──────────────────────────────────────────────────
  matchesThisWeek: number;
  matchesThisMonth: number;
  newsThisWeek: number;
  newsThisMonth: number;
  longestStreak: number;
  goalsFromFavorites: number;
  liveMatchesViewed: number;
  // ── New tracking functions ───────────────────────────────────────────────
  trackMatchOpened: (params: { teamIds: string[]; isLive: boolean; leagueId: string }) => Promise<void>;
  trackNewsOpened: (params: { tags?: string[] }) => Promise<void>;
  trackGoalFromFavorite: (teamId: string) => Promise<void>;
}

// ── Default context value ────────────────────────────────────────────────────

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
  matchesThisWeek: 0,
  matchesThisMonth: 0,
  newsThisWeek: 0,
  newsThisMonth: 0,
  longestStreak: 0,
  goalsFromFavorites: 0,
  liveMatchesViewed: 0,
  trackMatchOpened: async () => {},
  trackNewsOpened: async () => {},
  trackGoalFromFavorite: async () => {},
});

export const useUserStats = () => useContext(UserStatsContext);

// ── Provider ─────────────────────────────────────────────────────────────────

export const UserStatsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Existing state
  const [matchesViewed, setMatchesViewed] = useState(0);
  const [newsRead, setNewsRead] = useState(0);
  const [streakDays, setStreakDays] = useState(1);
  const [activeDates, setActiveDates] = useState<string[]>([]);
  const [recoveriesRemaining, setRecoveriesRemaining] = useState(MAX_RECOVERIES_PER_MONTH);
  const [streakNotifyEnabled, setStreakNotifyEnabled] = useState(false);
  const [viewedMatchIds, setViewedMatchIds] = useState<Set<string>>(new Set());
  const [readNewsIds, setReadNewsIds] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  // New state
  const [matchesThisWeek, setMatchesThisWeek] = useState(0);
  const [matchesThisMonth, setMatchesThisMonth] = useState(0);
  const [newsThisWeek, setNewsThisWeek] = useState(0);
  const [newsThisMonth, setNewsThisMonth] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [goalsFromFavorites, setGoalsFromFavorites] = useState(0);
  const [liveMatchesViewed, setLiveMatchesViewed] = useState(0);

  // Internal refs to keep latest event arrays without triggering re-renders
  // during rapid sequential tracking calls
  const matchEventsRef = useRef<MatchEvent[]>([]);
  const newsEventsRef = useRef<NewsEvent[]>([]);
  const wrappedRef = useRef<WrappedYearStats>(emptyWrapped(currentYear()));
  const streakDaysRef = useRef(1);
  const longestStreakRef = useRef(0);

  // Keep refs in sync with state
  useEffect(() => { streakDaysRef.current = streakDays; }, [streakDays]);
  useEffect(() => { longestStreakRef.current = longestStreak; }, [longestStreak]);

  // ── Load persisted stats on mount ────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const year = currentYear();
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
          // New keys
          KEYS.longestStreak,
          KEYS.goalsFromFavorites,
          KEYS.liveMatchesViewed,
          KEYS.matchEvents,
          KEYS.newsEvents,
          wrappedKey(year),
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
        // New fields
        const savedLongestStreak = parseInt(results[10][1] ?? '0', 10) || 0;
        const savedGoalsFromFavorites = parseInt(results[11][1] ?? '0', 10) || 0;
        const savedLiveMatchesViewed = parseInt(results[12][1] ?? '0', 10) || 0;
        let savedMatchEvents: MatchEvent[] = results[13][1] ? JSON.parse(results[13][1]) : [];
        let savedNewsEvents: NewsEvent[] = results[14][1] ? JSON.parse(results[14][1]) : [];
        const savedWrapped: WrappedYearStats = results[15][1]
          ? JSON.parse(results[15][1])
          : emptyWrapped(year);

        // ── Purge old events (90-day rolling window) ──
        savedMatchEvents = purgeOldEvents(savedMatchEvents);
        savedNewsEvents = purgeOldEvents(savedNewsEvents);
        // Persist pruned arrays back if anything was removed
        await AsyncStorage.multiSet([
          [KEYS.matchEvents, JSON.stringify(savedMatchEvents)],
          [KEYS.newsEvents, JSON.stringify(savedNewsEvents)],
        ]);

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

        // ── Update longestStreak if current streak is bigger ──
        let effectiveLongest = savedLongestStreak;
        if (savedStreak > effectiveLongest) {
          effectiveLongest = savedStreak;
          await AsyncStorage.setItem(KEYS.longestStreak, String(effectiveLongest));
        }

        // ── Compute windowed counts ──
        const windowed = computeWindowedCounts(savedMatchEvents, savedNewsEvents);

        // ── Sync refs ──
        matchEventsRef.current = savedMatchEvents;
        newsEventsRef.current = savedNewsEvents;
        wrappedRef.current = savedWrapped;
        streakDaysRef.current = savedStreak;
        longestStreakRef.current = effectiveLongest;

        // ── Set state ──
        setMatchesViewed(savedMatches);
        setNewsRead(savedNews);
        setStreakDays(savedStreak);
        setActiveDates(savedActiveDates);
        setRecoveriesRemaining(MAX_RECOVERIES_PER_MONTH - recUsed);
        setStreakNotifyEnabled(notify);
        setViewedMatchIds(new Set(savedViewedIds));
        setReadNewsIds(new Set(savedReadIds));
        setLongestStreak(effectiveLongest);
        setGoalsFromFavorites(savedGoalsFromFavorites);
        setLiveMatchesViewed(savedLiveMatchesViewed);
        setMatchesThisWeek(windowed.matchesThisWeek);
        setMatchesThisMonth(windowed.matchesThisMonth);
        setNewsThisWeek(windowed.newsThisWeek);
        setNewsThisMonth(windowed.newsThisMonth);

        setReady(true);
      } catch {
        setReady(true);
      }
    })();
  }, []);

  // ── Existing tracking functions (backward compatible) ────────────────────

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

  // ── New tracking: match opened ───────────────────────────────────────────

  const trackMatchOpened = useCallback(async (params: {
    teamIds: string[];
    isLive: boolean;
    leagueId: string;
  }) => {
    const event: MatchEvent = {
      ts: Date.now(),
      teamIds: params.teamIds,
      isLive: params.isLive,
      leagueId: params.leagueId,
    };

    const updatedEvents = appendEvent(matchEventsRef.current, event);
    matchEventsRef.current = updatedEvents;

    // Update windowed state
    const windowed = computeWindowedCounts(updatedEvents, newsEventsRef.current);
    setMatchesThisWeek(windowed.matchesThisWeek);
    setMatchesThisMonth(windowed.matchesThisMonth);

    // Update live matches count
    if (params.isLive) {
      setLiveMatchesViewed(prev => {
        const next = prev + 1;
        AsyncStorage.setItem(KEYS.liveMatchesViewed, String(next));
        return next;
      });
    }

    // Update longestStreak if current streak is bigger
    const curStreak = streakDaysRef.current;
    const curLongest = longestStreakRef.current;
    if (curStreak > curLongest) {
      longestStreakRef.current = curStreak;
      setLongestStreak(curStreak);
      AsyncStorage.setItem(KEYS.longestStreak, String(curStreak));
    }

    // Update Wrapped yearly stats
    const year = currentYear();
    const wrapped = { ...wrappedRef.current };
    if (wrapped.year !== year) {
      // New year — reset wrapped
      wrappedRef.current = emptyWrapped(year);
      Object.assign(wrapped, wrappedRef.current);
    }
    wrapped.matchesViewed += 1;
    if (params.isLive) wrapped.liveMatchesViewed += 1;
    if (WORLD_CUP_LEAGUE_IDS.has(params.leagueId)) wrapped.worldCupMatches += 1;
    if (longestStreakRef.current > wrapped.longestStreak) {
      wrapped.longestStreak = longestStreakRef.current;
    }
    wrappedRef.current = wrapped;

    // Persist
    await AsyncStorage.multiSet([
      [KEYS.matchEvents, JSON.stringify(updatedEvents)],
      [wrappedKey(year), JSON.stringify(wrapped)],
    ]);
  }, []);

  // ── New tracking: news opened ────────────────────────────────────────────

  const trackNewsOpened = useCallback(async (params: { tags?: string[] }) => {
    const event: NewsEvent = {
      ts: Date.now(),
      tags: params.tags ?? [],
    };

    const updatedEvents = appendEvent(newsEventsRef.current, event);
    newsEventsRef.current = updatedEvents;

    // Update windowed state
    const windowed = computeWindowedCounts(matchEventsRef.current, updatedEvents);
    setNewsThisWeek(windowed.newsThisWeek);
    setNewsThisMonth(windowed.newsThisMonth);

    // Update Wrapped yearly stats
    const year = currentYear();
    const wrapped = { ...wrappedRef.current };
    if (wrapped.year !== year) {
      wrappedRef.current = emptyWrapped(year);
      Object.assign(wrapped, wrappedRef.current);
    }
    wrapped.newsRead += 1;
    wrappedRef.current = wrapped;

    // Persist
    await AsyncStorage.multiSet([
      [KEYS.newsEvents, JSON.stringify(updatedEvents)],
      [wrappedKey(year), JSON.stringify(wrapped)],
    ]);
  }, []);

  // ── New tracking: goal from favorite team ────────────────────────────────

  const trackGoalFromFavorite = useCallback(async (_teamId: string) => {
    setGoalsFromFavorites(prev => {
      const next = prev + 1;
      AsyncStorage.setItem(KEYS.goalsFromFavorites, String(next));

      // Update Wrapped yearly stats
      const year = currentYear();
      const wrapped = { ...wrappedRef.current };
      if (wrapped.year !== year) {
        wrappedRef.current = emptyWrapped(year);
        Object.assign(wrapped, wrappedRef.current);
      }
      wrapped.goalsFromFavorites += 1;
      wrappedRef.current = wrapped;
      AsyncStorage.setItem(wrappedKey(year), JSON.stringify(wrapped));

      return next;
    });
  }, []);

  // ── Reset all stats ──────────────────────────────────────────────────────

  const resetStats = useCallback(async () => {
    setMatchesViewed(0);
    setNewsRead(0);
    setStreakDays(1);
    setActiveDates([]);
    setRecoveriesRemaining(MAX_RECOVERIES_PER_MONTH);
    setStreakNotifyEnabled(false);
    setViewedMatchIds(new Set());
    setReadNewsIds(new Set());
    setMatchesThisWeek(0);
    setMatchesThisMonth(0);
    setNewsThisWeek(0);
    setNewsThisMonth(0);
    setLongestStreak(0);
    setGoalsFromFavorites(0);
    setLiveMatchesViewed(0);

    matchEventsRef.current = [];
    newsEventsRef.current = [];
    streakDaysRef.current = 1;
    longestStreakRef.current = 0;
    wrappedRef.current = emptyWrapped(currentYear());

    const year = currentYear();
    await AsyncStorage.multiRemove([
      ...Object.values(KEYS),
      wrappedKey(year),
    ]);
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────

  // Suppress unused variable warning — `ready` is used to gate renders in
  // future UI work but the provider always renders children immediately.
  void ready;

  return (
    <UserStatsContext.Provider value={{
      // Existing
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
      // New
      matchesThisWeek,
      matchesThisMonth,
      newsThisWeek,
      newsThisMonth,
      longestStreak,
      goalsFromFavorites,
      liveMatchesViewed,
      trackMatchOpened,
      trackNewsOpened,
      trackGoalFromFavorite,
    }}>
      {children}
    </UserStatsContext.Provider>
  );
};
