import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, PanResponder, Animated } from 'react-native';
import { useUserStats } from '../contexts/UserStatsContext';
import { StreakModal } from '../components/StreakModal';
import { SkeletonPartidos } from '../components/Skeleton';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useThemeColors } from '../theme/useTheme';
import { useDarkMode } from '../contexts/DarkModeContext';
import type { Match, MatchStatus } from '../data/types';
import { DateNavigator, formatFullDate, isToday } from '../components/DateNavigator';
import { FilterTabs, FilterTab } from '../components/FilterTabs';
import { LeagueSection } from '../components/LeagueSection';
import { CalendarPicker } from '../components/CalendarPicker';
import { useFixtures } from '../hooks/useFixtures';
import type { LeagueWithMatches } from '../services/sportsApi';
import type { PartidosStackParamList } from '../navigation/AppNavigator';
import { useFavorites } from '../contexts/FavoritesContext';
import { LEAGUE_TIER_1, LEAGUE_TIER_2 } from '../config/leagueTiers';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Header icons ──────────────────────────────────────────────────────────────
const BellIcon = ({ color }: { color: string }) => (
  <View style={{ width: 16, height: 18, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ position: 'absolute', top: 3, width: 12, height: 10, borderRadius: 6, borderWidth: 1.5, borderColor: color, borderBottomWidth: 0 }} />
    <View style={{ position: 'absolute', top: 0, width: 3, height: 3, borderRadius: 2, backgroundColor: color }} />
    <View style={{ position: 'absolute', bottom: 2, width: 14, height: 1.5, borderRadius: 1, backgroundColor: color }} />
  </View>
);
const SearchIcon = ({ color }: { color: string }) => (
  <View style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ position: 'absolute', top: 0, left: 0, width: 11, height: 11, borderRadius: 6, borderWidth: 1.5, borderColor: color }} />
    <View style={{ position: 'absolute', bottom: 0, right: 0, width: 5, height: 1.5, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '45deg' }, { translateX: 1 }, { translateY: -2 }] }} />
  </View>
);

// ── Screen ────────────────────────────────────────────────────────────────────
export const PartidosScreen: React.FC = () => {
  const { t } = useTranslation();
  const c = useThemeColors();
  const { isDark } = useDarkMode();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();
  const { streakDays, streakNotifyEnabled, setStreakNotify } = useUserStats();
  const [streakModalVisible, setStreakModalVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [activeTab, setActiveTab] = useState<FilterTab>('todos');
  const [showCalendar, setShowCalendar] = useState(false);

  // ── Real data via hook ──────────────────────────────────────────────────────
  const { matches: allMatches, leagues: allLeagues, loading, refreshing, refresh, isPolling } = useFixtures(selectedDate);
  const { followedTeamIds, followedLeagueIds } = useFavorites();

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
  //   2. "Mis ligas"    — full league sections for leagues the user follows
  //   3. Tier 1         — top global leagues (Premier, Champions, La Liga, etc.)
  //   4. Tier 2         — important regional leagues (Championship, Bundesliga 2, etc.)
  //   5. Tier 3         — niche/women's/lower divisions (K-League, Liga Honduras, etc.)
  //
  // If the user has personalization (follows ≥1 team or league), only groups 1-2 are
  // shown immediately; tiers 1-3 appear behind progressive "Ver más" buttons.
  // If the user has NO personalization, tier 1 shows immediately; tiers 2-3 are behind
  // "Ver más" buttons. This avoids loading obscure leagues on the first paint.

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
    // This gives full league context without duplicates.
    // Example: follows América → Liga MX inferred → all Liga MX matches shown
    // even if the user never explicitly followed the league.
    const priorityIds = new Set([...inferredLeagueIds, ...leagueSet]);
    const priorityLeagueGroups = filteredLeagues.filter(lg => priorityIds.has(lg.id));

    // ── Remaining leagues — not in priority — split by tier ───────────────────
    const remaining = filteredLeagues.filter(lg => !priorityIds.has(lg.id));
    const tier1Groups = remaining.filter(lg => LEAGUE_TIER_1.has(Number(lg.id)));
    const tier2Groups = remaining.filter(lg => LEAGUE_TIER_2.has(Number(lg.id)));
    const tier3Groups = remaining.filter(
      lg => !LEAGUE_TIER_1.has(Number(lg.id)) && !LEAGUE_TIER_2.has(Number(lg.id))
    );

    return { myTeamMatches, priorityLeagueGroups, tier1Groups, tier2Groups, tier3Groups };
  }, [filteredLeagues, followedTeamIds, followedLeagueIds]);

  // Does the user have at least some personalization set up?
  const hasPersonalization = followedTeamIds.length > 0 || followedLeagueIds.length > 0;

  // True when the user has favorites configured but none of their teams/leagues
  // play on the selected date → fall back to showing global top leagues automatically.
  const nothingPersonalToday =
    hasPersonalization &&
    myTeamMatches.length === 0 &&
    priorityLeagueGroups.length === 0;

  // When no personal content is available, show tier 1 immediately (same as
  // no-personalization), so the screen never looks empty.
  const showTier1Immediately = !hasPersonalization || nothingPersonalToday;

  // Progressive reveal queue:
  //   showTier1Immediately → tier1 visible right away; queue = [tier2, tier3]
  //   personalised + has content → queue = [tier1, tier2, tier3]
  const revealQueue = useMemo<LeagueWithMatches[][]>(
    () => showTier1Immediately
      ? [tier2Groups, tier3Groups].filter(g => g.length > 0)
      : [tier1Groups, tier2Groups, tier3Groups].filter(g => g.length > 0),
    [showTier1Immediately, tier1Groups, tier2Groups, tier3Groups]
  );

  // How many tiers of `revealQueue` are currently expanded
  const [revealed, setRevealed] = useState(0);

  // Reset reveal when the date or active filter tab changes.
  // Also reset the active tab to 'todos' when navigating away from today —
  // filters like "En vivo" or "Finalizados" make no sense for other days.
  useEffect(() => {
    setRevealed(0);
    if (!isToday(selectedDate)) setActiveTab('todos');
  }, [selectedDate, activeTab]);

  // Groups currently visible from the queue
  const revealedGroups  = revealQueue.slice(0, revealed);
  const nextGroup       = revealQueue[revealed];         // next tier to show (undefined = all shown)
  const hiddenAfterNext = revealQueue.slice(revealed + 1);

  const nextMatchCount   = nextGroup?.reduce((s, lg) => s + lg.matches.length, 0) ?? 0;
  const hiddenMatchCount = hiddenAfterNext.reduce((s, g) => s + g.reduce((ss, lg) => ss + lg.matches.length, 0), 0);

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

  // ── Swipe left/right to change date ─────────────────────────────────────
  const shiftDate = useCallback((days: number) => {
    setSelectedDate(prev => {
      const d = new Date(prev + 'T12:00:00');
      d.setDate(d.getDate() + days);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    setActiveTab('todos');
  }, []);

  const swipeRef = useRef({ startX: 0, handled: false });
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 30 && Math.abs(gs.dy) < 40,
      onPanResponderGrant: (_, gs) => { swipeRef.current = { startX: gs.x0, handled: false }; },
      onPanResponderRelease: (_, gs) => {
        if (swipeRef.current.handled) return;
        if (gs.dx < -60) { swipeRef.current.handled = true; shiftDate(1); }   // swipe left → tomorrow
        if (gs.dx > 60)  { swipeRef.current.handled = true; shiftDate(-1); }  // swipe right → yesterday
      },
    })
  ).current;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── Top Bar ── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10, backgroundColor: c.bg,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: 'rgba(16,185,129,0.15)',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 18 }}>⚽</Text>
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: c.textPrimary, letterSpacing: -0.5 }}>
            {t('matches.title')}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity style={{
            width: 38, height: 38, borderRadius: 19,
            backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', position: 'relative',
          }} activeOpacity={0.7}>
            <BellIcon color={c.textSecondary} />
            <View style={{
              position: 'absolute', top: 6, right: 8,
              width: 7, height: 7, borderRadius: 4,
              backgroundColor: c.live, borderWidth: 1.5, borderColor: c.bg,
            }} />
          </TouchableOpacity>
          <TouchableOpacity style={{
            width: 38, height: 38, borderRadius: 19,
            backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center',
          }} activeOpacity={0.7} onPress={() => navigation.navigate('GlobalSearch')}>
            <SearchIcon color={c.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 2,
              backgroundColor: 'rgba(255,122,0,0.12)',
              paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12,
            }}
            activeOpacity={0.7}
            onPress={() => setStreakModalVisible(true)}
          >
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#ff7a00' }}>{streakDays}</Text>
            <Text style={{ fontSize: 14 }}>🔥</Text>
          </TouchableOpacity>
        </View>
      </View>

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
        <FilterTabs activeTab={activeTab} onTabChange={setActiveTab} liveCounts={liveCount} totalCount={totalCount} finishedCount={finishedCount} />
      )}

      {/* Live auto-refresh indicator — subtle pulsing dot only, no text */}
      {isPolling && (
        <View style={{
          alignItems: 'center', justifyContent: 'center',
          paddingVertical: 4, backgroundColor: 'rgba(255,69,58,0.05)',
          borderBottomWidth: 1, borderBottomColor: 'rgba(255,69,58,0.10)',
        }}>
          <Animated.View style={{
            width: 6, height: 6, borderRadius: 3,
            backgroundColor: c.live, opacity: liveDotOpacity,
          }} />
        </View>
      )}

      <ScrollView
        {...panResponder.panHandlers}
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
          <>
            {/* ── Mis equipos (cross-league highlight) ─────────────────────── */}
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

            {/* ── Ligas prioritarias (seguidas + inferidas de equipos) ──────── */}
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

            {/* ── Aviso: favoritos sin partidos hoy → introduce la lista global ── */}
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

            {/* ── Tier 1 visible inmediatamente cuando no hay contenido personal ── */}
            {showTier1Immediately && tier1Groups.map((league, idx) => (
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
            ))}

            {/* ── Tiers ya revelados (tras clicks en "Ver más") ────────────── */}
            {revealedGroups.flatMap((group, gi) =>
              group.map((league, idx) => (
                <LeagueSection
                  key={league.id}
                  league={league}
                  index={gi * 20 + idx}
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
              ))
            )}

            {/* ── "Ver más" button ─────────────────────────────────────────── */}
            {nextGroup && nextMatchCount > 0 && (
              <View style={{ marginHorizontal: 16, marginBottom: 8 }}>
                <Text style={{
                  fontSize: 12, color: c.textTertiary, textAlign: 'center',
                  marginBottom: 10, lineHeight: 18,
                }}>
                  {t(isToday(selectedDate) ? 'matches.moreToday' : 'matches.moreOnDay')}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setRevealed(r => r + 1)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
                    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, gap: 8,
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary }}>
                    {t('matches.showMoreMatches', { count: nextMatchCount })}
                  </Text>
                  {hiddenMatchCount > 0 && (
                    <Text style={{
                      fontSize: 12, fontWeight: '500',
                      color: c.textTertiary,
                      backgroundColor: c.bg,
                      paddingHorizontal: 8, paddingVertical: 3,
                      borderRadius: 20,
                    }}>
                      {t('matches.showMoreRemaining', { remaining: hiddenMatchCount })}
                    </Text>
                  )}
                  {/* Chevron › */}
                  <View style={{ marginLeft: 2 }}>
                    <View style={{ width: 6, height: 1.5, backgroundColor: c.textTertiary, borderRadius: 1,
                      transform: [{ rotate: '45deg' }, { translateY: -2 }] }} />
                    <View style={{ width: 6, height: 1.5, backgroundColor: c.textTertiary, borderRadius: 1,
                      transform: [{ rotate: '-45deg' }, { translateY: 2 }] }} />
                  </View>
                </TouchableOpacity>
              </View>
            )}
          </>
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

      <StreakModal
        visible={streakModalVisible}
        onClose={() => setStreakModalVisible(false)}
        streakDays={streakDays}
        streakNotifyEnabled={streakNotifyEnabled}
        onToggleNotify={setStreakNotify}
        c={c}
        isDark={isDark}
      />
    </SafeAreaView>
  );
};
