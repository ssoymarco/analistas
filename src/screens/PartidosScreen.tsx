import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Animated, Platform } from 'react-native';
import { PlaceholderBannerAd } from '../components/PlaceholderBannerAd';
import { useUserStats } from '../contexts/UserStatsContext';
import { SkeletonPartidos } from '../components/Skeleton';
import { ScreenHeader } from '../components/ScreenHeader';
import { BellIcon, SearchIcon } from '../components/NavIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useThemeColors } from '../theme/useTheme';
import { useDarkMode } from '../contexts/DarkModeContext';
import type { Match, MatchStatus } from '../data/types';
import { DateNavigator, formatFullDate, isToday } from '../components/DateNavigator';
import { CategoryTabs, type CategoryTab as PillTab } from '../components/CategoryTabs';

/** Filter keys for Partidos. Kept exported for callers that still type the
 *  active tab (e.g. analytics, persisted state). */
export type FilterTab = 'todos' | 'vivo' | 'finalizados' | 'proximos';
import { LeagueSection } from '../components/LeagueSection';
import { CalendarPicker } from '../components/CalendarPicker';
import { useFixtures } from '../hooks/useFixtures';
import type { LeagueWithMatches } from '../services/sportsApi';
import type { PartidosStackParamList } from '../navigation/AppNavigator';
import { useFavorites } from '../contexts/FavoritesContext';
import { getLeaguePopularity } from '../config/leagues';
import { useUserCountry } from '../hooks/useUserCountry';
import ATTModal from '../components/ATTModal';
import { WorldCupBanner } from '../components/WorldCupBanner';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as TrackingTransparency from 'expo-tracking-transparency';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Screen ────────────────────────────────────────────────────────────────────
export const PartidosScreen: React.FC = () => {
  const { t } = useTranslation();
  const c = useThemeColors();
  const { isDark } = useDarkMode();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();
  const { streakDays } = useUserStats();
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [activeTab, setActiveTab] = useState<FilterTab>('todos');
  const [showCalendar, setShowCalendar] = useState(false);
  const [showATT, setShowATT] = useState(false);

  // Show ATT modal 7s after first mount — only once ever
  useEffect(() => {
    const ATT_KEY = 'analistas_att_shown';
    let timer: ReturnType<typeof setTimeout>;
    AsyncStorage.getItem(ATT_KEY).then(shown => {
      if (!shown) {
        timer = setTimeout(() => setShowATT(true), 7000);
      }
    });
    return () => clearTimeout(timer);
  }, []);

  const handleATTContinue = async () => {
    setShowATT(false);
    await AsyncStorage.setItem('analistas_att_shown', '1');
    if (Platform.OS === 'ios') {
      await TrackingTransparency.requestTrackingPermissionsAsync().catch(() => {});
    }
  };

  const handleATTSkip = async () => {
    setShowATT(false);
    await AsyncStorage.setItem('analistas_att_shown', '1');
  };

  // ── Real data via hook ──────────────────────────────────────────────────────
  const { matches: allMatches, leagues: allLeagues, loading, refreshing, refresh, isPolling } = useFixtures(selectedDate);
  const { followedTeamIds, followedLeagueIds } = useFavorites();
  const { country } = useUserCountry();

  // ── Live polling dot animation ─────────────────────────────────────────────
  const liveDotOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isPolling) {
      liveDotOpacity.setValue(1);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(liveDotOpacity, { toValue: 0.2, duration: 700, useNativeDriver: true }),
        Animated.timing(liveDotOpacity, { toValue: 1,   duration: 700, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [isPolling, liveDotOpacity]);

  const totalCount    = allMatches.length;
  const liveCount     = useMemo(() => allMatches.filter(m => m.status === 'live').length, [allMatches]);
  const finishedCount = useMemo(() => allMatches.filter(m => m.status === 'finished').length, [allMatches]);

  // Build match counts for the selected date (DateNavigator shows it)
  const matchCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    counts[selectedDate] = totalCount;
    return counts;
  }, [selectedDate, totalCount]);

  // ── Filter pills — unified CategoryTabs ────────────────────────────────────
  const filterTabs = useMemo<PillTab<FilterTab>[]>(() => [
    { key: 'todos',       label: t('filters.all'),      emoji: '⚽', badge: totalCount > 0 ? totalCount : null },
    { key: 'vivo',        label: t('filters.live'),     emoji: '🔴', badge: liveCount > 0 ? liveCount : null, liveBadge: liveCount > 0 },
    { key: 'finalizados', label: t('filters.finished'), emoji: '🏁', badge: finishedCount > 0 ? finishedCount : null },
    { key: 'proximos',    label: t('filters.upcoming'), emoji: '🕐' },
  ], [t, totalCount, liveCount, finishedCount]);

  const filterStatus = useMemo<MatchStatus | null>(() => {
    if (activeTab === 'todos') return null;
    if (activeTab === 'vivo') return 'live';
    if (activeTab === 'finalizados') return 'finished';
    if (activeTab === 'proximos') return 'scheduled';
    return null;
  }, [activeTab]);

  const filteredLeagues = useMemo(() => {
    if (!filterStatus) return allLeagues;
    return allLeagues
      .map(league => ({ ...league, matches: league.matches.filter(m => m.status === filterStatus) }))
      .filter(league => league.matches.length > 0);
  }, [filterStatus, allLeagues]);

  // ── Personalization: partition leagues into tiers ──────────────────────────
  //
  // Strategy:
  //   1. "Mis equipos"  — matches where the user follows homeTeam or awayTeam (cross-league)
  //   2. "Mis ligas"    — full league sections for leagues the user follows (or are
  //                       inferred because the user follows a team in them)
  //   3. Tier 1         — popularity ≥ 75 (top global + country-boosted)
  //   4. Tier 2         — popularity 50-74 (important regional + national cups)
  //   5. Tier 3         — popularity < 50 (niche/women's/lower divisions)
  //
  // Tier definition uses LEAGUE_POPULARITY + LEAGUE_POPULARITY_BY_COUNTRY from
  // config/leagues.ts. The user's country (from expo-localization + Cloudflare
  // /geo) biases the ranking so a Mexican sees Liga MX above Bundesliga, an
  // Argentine sees Liga Profesional above Brasileirão, etc.
  //
  // Within each tier, leagues are sorted by:
  //   1. Live matches first (always — competitive UX)
  //   2. Popularity DESC (country-aware) when no live matches differentiate them

  const {
    myTeamMatches,
    priorityLeagueGroups,
    tier1Groups,
    tier2Groups,
    tier3Groups,
  } = useMemo(() => {
    const teamSet   = new Set(followedTeamIds);
    const leagueSet = new Set(followedLeagueIds);

    // ── My team matches + infer their leagues ─────────────────────────────────
    // For each league: if any match involves a followed team, (a) collect that
    // match in myTeamMatches, and (b) mark that league as "inferred" so we show
    // the full league section as context (Chivas vs Cruz Azul still shows under
    // Liga MX if the user follows América, because they clearly like Liga MX).
    const myTeamMatches: Match[] = [];
    const inferredLeagueIds = new Set<string>();

    filteredLeagues.forEach(lg => {
      lg.matches.forEach(m => {
        if (teamSet.has(m.homeTeam.id) || teamSet.has(m.awayTeam.id)) {
          myTeamMatches.push(m);
          inferredLeagueIds.add(lg.id); // mark whole league as relevant
        }
      });
    });

    // Sort my team matches: live → scheduled → finished
    const statusOrder: Record<string, number> = { live: 0, scheduled: 1, finished: 2 };
    myTeamMatches.sort((a, b) => (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1));

    // ── Priority leagues = inferred (from teams) ∪ explicitly followed ────────
    const priorityIds = new Set([...inferredLeagueIds, ...leagueSet]);
    const myTeamMatchIds = new Set(myTeamMatches.map(m => m.id));
    const priorityLeagueGroups = filteredLeagues
      .filter(lg => priorityIds.has(lg.id))
      .map(lg => ({
        ...lg,
        matches: lg.matches.filter(m => !myTeamMatchIds.has(m.id)),
      }))
      .filter(lg => lg.matches.length > 0);

    // ── Remaining leagues — partition by popularity (country-aware) ──────────
    const remaining = filteredLeagues.filter(lg => !priorityIds.has(lg.id));
    const tier1Groups: LeagueWithMatches[] = [];
    const tier2Groups: LeagueWithMatches[] = [];
    const tier3Groups: LeagueWithMatches[] = [];
    for (const lg of remaining) {
      const pop = getLeaguePopularity(Number(lg.id), country);
      if (pop >= 75)      tier1Groups.push(lg);
      else if (pop >= 50) tier2Groups.push(lg);
      else                tier3Groups.push(lg);
    }

    // ── Sort each tier: leagues with live matches first, then by popularity ──
    // DESC. Within same live-status they're ordered by the user-biased ranking
    // so Champions League appears above Bundesliga, Liga MX above Brasileirão
    // for a Mexican, etc.
    const compareLeagues = (a: LeagueWithMatches, b: LeagueWithMatches) => {
      const livePriority = (lg: LeagueWithMatches) => {
        if (lg.matches.some(m => m.status === 'live'))     return 0;
        if (lg.matches.some(m => m.status === 'finished')) return 1;
        return 2;
      };
      const pa = livePriority(a);
      const pb = livePriority(b);
      if (pa !== pb) return pa - pb;
      // Tiebreaker: popularity DESC (country-biased)
      return getLeaguePopularity(Number(b.id), country) - getLeaguePopularity(Number(a.id), country);
    };

    return {
      myTeamMatches,
      priorityLeagueGroups: [...priorityLeagueGroups].sort(compareLeagues),
      tier1Groups:          tier1Groups.sort(compareLeagues),
      tier2Groups:          tier2Groups.sort(compareLeagues),
      tier3Groups:          tier3Groups.sort(compareLeagues),
    };
  }, [filteredLeagues, followedTeamIds, followedLeagueIds, country]);

  // Does the user have at least some personalization set up?
  const hasPersonalization = followedTeamIds.length > 0 || followedLeagueIds.length > 0;

  // True when the user has favorites configured but none of their teams/leagues
  // play on the selected date → we still show the global queue below, but with
  // a "Tus favoritos no juegan hoy, pero tenemos:" notice that frames it.
  const nothingPersonalToday =
    hasPersonalization &&
    myTeamMatches.length === 0 &&
    priorityLeagueGroups.length === 0;

  // ── Global league queue + progressive reveal ─────────────────────────────
  //
  // We flatten all non-priority leagues (tier1 → tier2 → tier3, already
  // sorted by country-weighted popularity inside each tier) into ONE ordered
  // queue and reveal them in chunks of `LEAGUES_PER_BLOCK` per tap on
  // "Cargar más partidos".
  //
  // The data is already in memory (fetched by `subscribeFixturesByDate`),
  // so revealing more leagues is a pure UI operation — no extra Firestore
  // reads. We chunk to keep the rendered list manageable and to let the
  // user stop scrolling when leagues stop being interesting (popularity
  // decreases as we go down the queue).
  const LEAGUES_PER_BLOCK = 4;

  const globalQueue = useMemo<LeagueWithMatches[]>(
    () => [...tier1Groups, ...tier2Groups, ...tier3Groups],
    [tier1Groups, tier2Groups, tier3Groups]
  );

  // Number of times the user has tapped "Cargar más partidos" (0 = only the
  // first block of LEAGUES_PER_BLOCK is visible).
  const [loadMoreClicks, setLoadMoreClicks] = useState(0);

  // Reset reveal when the date or active filter tab changes.
  // Also reset the active tab to 'todos' when navigating away from today —
  // filters like "En vivo" or "Finalizados" make no sense for other days.
  useEffect(() => {
    setLoadMoreClicks(0);
    if (!isToday(selectedDate)) setActiveTab('todos');
  }, [selectedDate, activeTab]);

  const visibleGlobalCount  = LEAGUES_PER_BLOCK * (loadMoreClicks + 1);
  const visibleGlobalLeagues = globalQueue.slice(0, visibleGlobalCount);
  const hiddenGlobalCount    = Math.max(0, globalQueue.length - visibleGlobalCount);

  // Has the user got personal content (followed teams or leagues playing today)?
  // When true, the Caliente banner sits between the personal block and the
  // global block. When false, the banner sits AFTER the first
  // `LEAGUES_PER_BLOCK` global leagues so it's never the first element shown.
  const hasPersonalContent = myTeamMatches.length > 0 || priorityLeagueGroups.length > 0;

  const showDateLabel = !isToday(selectedDate);

  const handleGoToday = useCallback(() => {
    setSelectedDate(todayISO());
    setActiveTab('todos');
  }, []);

  const handleCalendarSelect = useCallback((dateStr: string) => {
    setSelectedDate(dateStr);
    setShowCalendar(false);
    setActiveTab('todos');
  }, []);

  // ── Tab press → jump to today ──────────────────────────────────────────────
  // When the user taps the "Partidos" tab while already on it (from any date),
  // snap back to today. Uses the parent tab navigator's tabPress event.
  useEffect(() => {
    const parent = navigation.getParent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unsubscribe = parent?.addListener('tabPress' as any, () => {
      setSelectedDate(todayISO());
      setActiveTab('todos');
    });
    return unsubscribe ?? undefined;
  }, []); // navigation ref is stable for the lifetime of this screen

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── Top Bar ── unified header (see ScreenHeader) */}
      <ScreenHeader
        icon="⚽"
        iconBg="rgba(16,185,129,0.15)"
        title={t('matches.title')}
        right={
          <>
            {/* Order: Streak · Bell · Search.
                Search lives rightmost because it's the most-tapped action
                in this header (multiple times per session vs. once-a-week
                for the bell). The streak pill is a status indicator, not
                an action, so it sits on the leftmost edge of the cluster
                where it stays visible without being the strongest visual
                anchor. */}
            <TouchableOpacity
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 2,
                backgroundColor: 'rgba(255,122,0,0.12)',
                paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12,
              }}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('Streak')}
            >
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#ff7a00' }}>{streakDays}</Text>
              <Text style={{ fontSize: 14 }}>🔥</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                width: 38, height: 38, borderRadius: 19,
                backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center',
              }}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('NotificationSettings')}
              accessibilityRole="button"
              accessibilityLabel={t('notifications.title')}
            >
              <BellIcon color={c.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={{
              width: 38, height: 38, borderRadius: 19,
              backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center',
            }} activeOpacity={0.7} onPress={() => navigation.navigate('GlobalSearch')}>
              <SearchIcon color={c.textSecondary} />
            </TouchableOpacity>
          </>
        }
      />

      <DateNavigator
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        onCalendarPress={() => setShowCalendar(true)}
        matchCounts={matchCounts}
      />

      {/* Full date label when not today */}
      {showDateLabel && (
        <View style={{
          alignItems: 'center', paddingVertical: 8,
          borderBottomWidth: 1, borderBottomColor: c.border,
          backgroundColor: c.bg,
        }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: c.textTertiary }}>
            {formatFullDate(selectedDate)}
          </Text>
        </View>
      )}

      {isToday(selectedDate) && (
        <CategoryTabs<FilterTab>
          tabs={filterTabs}
          activeKey={activeTab}
          onChange={setActiveTab}
          layout="scroll"
        />
      )}

      {/* Live auto-refresh indicator removed */}

      <ScrollView
        style={{ flex: 1, backgroundColor: c.bg }}
        contentContainerStyle={{ paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.emerald} />
        }
      >
        {loading ? (
          <View style={{ paddingTop: 8 }}>
            <SkeletonPartidos />
          </View>
        ) : filteredLeagues.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 80, gap: 10 }}>
            <Text style={{ fontSize: 48 }}>⚽</Text>
            <Text style={{ fontSize: 18, fontWeight: '700', color: c.textPrimary }}>{t('matches.noMatches')}</Text>
            <Text style={{ fontSize: 14, color: c.textSecondary, textAlign: 'center' }}>
              {filterStatus && allLeagues.length > 0 ? t('matches.noMatchesFilter') : t('matches.noMatchesDay')}
            </Text>
          </View>
        ) : (
          (() => {
            // ── Helper: render one global league section. Inlined to capture
            //   `navigation` cleanly without prop drilling. Previously this
            //   helper also intercalated rotating secondary banner ads
            //   (amazon/corona) every 2nd league, but those mock ads were
            //   removed in the v1.0 ad-cleanup — Caliente is the only paid
            //   sponsor for v1.0 and it has its own fixed slot (see below).
            const renderGlobalLeague = (league: LeagueWithMatches, idx: number) => (
              <LeagueSection
                key={league.id}
                league={league}
                index={idx}
                onMatchPress={m => navigation.navigate('MatchDetail', { match: m })}
                onLeaguePress={lg => {
                  const seasonId = lg.matches[0]?.seasonId;
                  navigation.navigate('LeagueDetail', {
                    leagueId: Number(lg.id),
                    leagueName: lg.name,
                    leagueLogo: lg.logo,
                    ...(seasonId ? { seasonId } : {}),
                  });
                }}
              />
            );

            return (
              <>
                {/* ── A. Mis equipos (cross-league highlight) ─────────────── */}
                {hasPersonalization && myTeamMatches.length > 0 && (
                  <LeagueSection
                    league={{
                      id: '__my_teams__',
                      name: t('matches.myTeams'),
                      logo: '⭐',
                      country: '',
                      matches: myTeamMatches,
                    }}
                    index={0}
                    onMatchPress={m => navigation.navigate('MatchDetail', { match: m })}
                    onLeaguePress={() => {/* synthetic — no league detail */ }}
                  />
                )}

                {/* ── B. Ligas prioritarias (seguidas + inferidas) ────────── */}
                {priorityLeagueGroups.map((league, idx) => (
                  <LeagueSection
                    key={league.id}
                    league={league}
                    index={(myTeamMatches.length > 0 ? 1 : 0) + idx}
                    onMatchPress={m => navigation.navigate('MatchDetail', { match: m })}
                    onLeaguePress={lg => {
                      const seasonId = lg.matches[0]?.seasonId;
                      navigation.navigate('LeagueDetail', {
                        leagueId: Number(lg.id),
                        leagueName: lg.name,
                        leagueLogo: lg.logo,
                        ...(seasonId ? { seasonId } : {}),
                      });
                    }}
                  />
                ))}

                {/* ── C. Aviso "favoritos no juegan hoy" → introduce lista global ─ */}
                {nothingPersonalToday && (
                  <View style={{
                    marginHorizontal: 16, marginTop: 4, marginBottom: 2,
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                  }}>
                    <Text style={{ fontSize: 11 }}>⭐</Text>
                    <Text style={{ fontSize: 13, color: c.textSecondary, flexShrink: 1 }}>
                      {t('matches.noPersonalizedToday')}
                    </Text>
                  </View>
                )}

                {/* ── D. Global leagues + Caliente banner ──────────────────────
                   Banner placement depends on whether there's personal content
                   above. The rule is: the Caliente banner is NEVER the first
                   element on screen — it always sits below at least one block
                   of league sections.

                     • hasPersonalContent → banner anchors between the personal
                       section (mis equipos + ligas prioritarias) and the
                       global queue. All visible globals follow below.

                     • !hasPersonalContent → banner anchors after the first
                       `LEAGUES_PER_BLOCK` global leagues. Each tap on
                       "Cargar más partidos" reveals 4 more leagues BELOW the
                       banner. The banner stays put as a fixed visual divider.
                   ───────────────────────────────────────────────────────── */}
                {hasPersonalContent ? (
                  <>
                    <PlaceholderBannerAd variant="caliente-banner" />
                    {visibleGlobalLeagues.map((lg, idx) => renderGlobalLeague(lg, idx))}
                  </>
                ) : (
                  <>
                    {/* First chunk: up to LEAGUES_PER_BLOCK leagues above the banner. */}
                    {visibleGlobalLeagues.slice(0, LEAGUES_PER_BLOCK).map((lg, idx) =>
                      renderGlobalLeague(lg, idx)
                    )}

                    {/* Banner only when there's at least one league above — keeps
                       the rule "banner never alone, never first". */}
                    {visibleGlobalLeagues.length > 0 && (
                      <PlaceholderBannerAd variant="caliente-banner" />
                    )}

                    {/* Remaining visible leagues (revealed by "Cargar más"). */}
                    {visibleGlobalLeagues.slice(LEAGUES_PER_BLOCK).map((lg, relIdx) =>
                      renderGlobalLeague(lg, relIdx + LEAGUES_PER_BLOCK)
                    )}
                  </>
                )}

                {/* ── E. "Cargar más partidos" — reveals next 4 leagues ───── */}
                {hiddenGlobalCount > 0 && (
                  <View style={{ marginHorizontal: 16, marginBottom: 8, marginTop: 4 }}>
                    <Text style={{
                      fontSize: 12, color: c.textTertiary, textAlign: 'center',
                      marginBottom: 10, lineHeight: 18,
                    }}>
                      {t(isToday(selectedDate) ? 'matches.moreToday' : 'matches.moreOnDay')}
                    </Text>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setLoadMoreClicks(n => n + 1)}
                      accessibilityRole="button"
                      accessibilityLabel={t('matches.loadMore')}
                      style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                        backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
                        borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, gap: 10,
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary }}>
                        {t('matches.loadMore')}
                      </Text>
                      {/* Chevron › */}
                      <View>
                        <View style={{ width: 6, height: 1.5, backgroundColor: c.textTertiary, borderRadius: 1,
                          transform: [{ rotate: '45deg' }, { translateY: -2 }] }} />
                        <View style={{ width: 6, height: 1.5, backgroundColor: c.textTertiary, borderRadius: 1,
                          transform: [{ rotate: '-45deg' }, { translateY: 2 }] }} />
                      </View>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            );
          })()
        )}
        <View style={{ height: 80 }} />
      </ScrollView>

      {!isToday(selectedDate) && (
        <TouchableOpacity style={{
          position: 'absolute', bottom: 24, alignSelf: 'center',
          backgroundColor: c.emerald, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24,
          shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
        }} activeOpacity={0.85} onPress={handleGoToday}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#ffffff', letterSpacing: -0.2 }}>{t('dates.goToToday')}</Text>
        </TouchableOpacity>
      )}

      <CalendarPicker visible={showCalendar} selectedDate={selectedDate} onSelectDate={handleCalendarSelect} onClose={() => setShowCalendar(false)} onGoToday={() => { handleGoToday(); setShowCalendar(false); }} />

      <ATTModal visible={showATT} onContinue={handleATTContinue} onSkip={handleATTSkip} />

      {/* World Cup 2026 floating countdown — auto-hides after July 19, 2026 */}
      <WorldCupBanner />

    </SafeAreaView>
  );
};
