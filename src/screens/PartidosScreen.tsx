import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../theme/colors';
import { mockLeagues, generateDates, matches } from '../data/mockData';
import type { Match, MatchStatus } from '../data/mockData';
import { DateNavigator } from '../components/DateNavigator';
import { FilterTabs, FilterTab } from '../components/FilterTabs';
import { LeagueSection } from '../components/LeagueSection';
import { MatchDetailScreen } from './MatchDetailScreen';

const DATES = generateDates();
const TODAY_INDEX = 3;

// ── Header icons ──────────────────────────────────────────────────────────────
const BellIcon = () => (
  <View style={st.bellIcon}>
    <View style={st.bellBody} />
    <View style={st.bellHandle} />
    <View style={st.bellBottom} />
    <View style={st.bellDot} />
  </View>
);
const SearchIcon = () => (
  <View style={st.searchIcon}>
    <View style={st.searchCircle} />
    <View style={st.searchHandle} />
  </View>
);

// ── Screen ────────────────────────────────────────────────────────────────────
export const PartidosScreen: React.FC = () => {
  const [selectedDateIndex, setSelectedDateIndex] = useState(TODAY_INDEX);
  const [activeTab, setActiveTab] = useState<FilterTab>('todos');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

  const allMatches = matches;
  const totalCount    = allMatches.length;
  const liveCount     = useMemo(() => allMatches.filter(m => m.status === 'live').length, [allMatches]);
  const finishedCount = useMemo(() => allMatches.filter(m => m.status === 'finished').length, [allMatches]);

  const filterStatus = useMemo<MatchStatus | null>(() => {
    if (activeTab === 'todos') return null;
    if (activeTab === 'vivo') return 'live';
    if (activeTab === 'finalizados') return 'finished';
    if (activeTab === 'proximos') return 'scheduled';
    return null;
  }, [activeTab]);

  const filteredLeagues = useMemo(() => {
    if (!filterStatus) return mockLeagues;
    return mockLeagues
      .map(league => ({ ...league, matches: league.matches.filter(m => m.status === filterStatus) }))
      .filter(league => league.matches.length > 0);
  }, [filterStatus]);

  return (
    <SafeAreaView style={st.safeArea} edges={['top']}>
      <StatusBar style="light" />

      {/* ── Top Bar ── */}
      <View style={st.topBar}>
        {/* Left: trophy + title */}
        <View style={st.topLeft}>
          <Text style={st.trophyEmoji}>⚽</Text>
          <Text style={st.title}>Partidos</Text>
        </View>
        {/* Right: bell, search, streak */}
        <View style={st.topActions}>
          <TouchableOpacity style={st.iconBtn} activeOpacity={0.7}>
            <BellIcon />
            {/* Notification dot */}
            <View style={st.notifDot} />
          </TouchableOpacity>
          <TouchableOpacity style={st.iconBtn} activeOpacity={0.7}>
            <SearchIcon />
          </TouchableOpacity>
          {/* Streak badge */}
          <View style={st.streakBadge}>
            <Text style={st.streakNum}>7</Text>
            <Text style={st.streakFire}>🔥</Text>
          </View>
        </View>
      </View>

      {/* ── Date Navigator ── */}
      <DateNavigator dates={DATES} selectedIndex={selectedDateIndex} onSelectDate={setSelectedDateIndex} />

      {/* ── Filter Tabs ── */}
      <FilterTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        liveCounts={liveCount}
        totalCount={totalCount}
        finishedCount={finishedCount}
      />

      {/* ── Match List ── */}
      <ScrollView style={st.scroll} contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false}>
        {filteredLeagues.length === 0 ? (
          <View style={st.empty}>
            <Text style={st.emptyIcon}>⚽</Text>
            <Text style={st.emptyTitle}>Sin partidos</Text>
            <Text style={st.emptySub}>No hay partidos en esta categoría</Text>
          </View>
        ) : (
          filteredLeagues.map(league => (
            <LeagueSection key={league.id} league={league} onMatchPress={m => setSelectedMatch(m)} />
          ))
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      {selectedMatch && (
        <MatchDetailScreen match={selectedMatch} visible={!!selectedMatch} onClose={() => setSelectedMatch(null)} />
      )}
    </SafeAreaView>
  );
};

const st = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
    backgroundColor: colors.bg,
  },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trophyEmoji: { fontSize: 24 },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notifDot: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.live,
    borderWidth: 1.5,
    borderColor: colors.bg,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(249,115,22,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
  },
  streakNum: { fontSize: 14, fontWeight: '800', color: '#fb923c' },
  streakFire: { fontSize: 14 },

  // Icons
  searchIcon: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  searchCircle: {
    position: 'absolute', top: 0, left: 0,
    width: 11, height: 11, borderRadius: 6,
    borderWidth: 1.5, borderColor: colors.textSecondary,
  },
  searchHandle: {
    position: 'absolute', bottom: 0, right: 0,
    width: 5, height: 1.5, backgroundColor: colors.textSecondary,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }, { translateX: 1 }, { translateY: -2 }],
  },
  bellIcon: { width: 16, height: 18, alignItems: 'center', justifyContent: 'center' },
  bellBody: {
    position: 'absolute', top: 3,
    width: 12, height: 10, borderRadius: 6,
    borderWidth: 1.5, borderColor: colors.textSecondary, borderBottomWidth: 0,
  },
  bellHandle: {
    position: 'absolute', top: 0,
    width: 3, height: 3, borderRadius: 2, backgroundColor: colors.textSecondary,
  },
  bellBottom: {
    position: 'absolute', bottom: 2,
    width: 14, height: 1.5, borderRadius: 1, backgroundColor: colors.textSecondary,
  },
  bellDot: {
    position: 'absolute', bottom: 0,
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.textSecondary,
  },

  // Scroll
  scroll: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { paddingTop: 8 },

  // Empty
  empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  emptySub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
});
