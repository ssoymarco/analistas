import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../theme/colors';
import { mockLeagues, generateDates } from '../data/mockData';
import type { Match, MatchStatus } from '../data/mockData';
import { DateNavigator } from '../components/DateNavigator';
import { FilterTabs, FilterTab } from '../components/FilterTabs';
import { LeagueSection } from '../components/LeagueSection';
import { MatchDetailScreen } from './MatchDetailScreen';

const DATES = generateDates();
const TODAY_INDEX = 3; // index 0..6, today is in the middle at index 3

const BellIcon = () => (
  <View style={styles.bellIcon}>
    <View style={styles.bellBody} />
    <View style={styles.bellHandle} />
    <View style={styles.bellBottom} />
    <View style={styles.bellDot} />
  </View>
);

const SearchIcon = () => (
  <View style={styles.searchIcon}>
    <View style={styles.searchCircle} />
    <View style={styles.searchHandle} />
  </View>
);

export const PartidosScreen: React.FC = () => {
  const [selectedDateIndex, setSelectedDateIndex] = useState(TODAY_INDEX);
  const [activeTab, setActiveTab] = useState<FilterTab>('todos');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

  const liveCount = useMemo(
    () =>
      mockLeagues.reduce(
        (acc, l) => acc + l.matches.filter((m) => m.status === 'live').length,
        0
      ),
    []
  );

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
      .map((league) => ({
        ...league,
        matches: league.matches.filter((m) => m.status === filterStatus),
      }))
      .filter((league) => league.matches.length > 0);
  }, [filterStatus]);

  const handleMatchPress = (match: Match) => {
    setSelectedMatch(match);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="light" />

      {/* Top Bar */}
      <View style={styles.topBar}>
        <Text style={styles.title}>Partidos</Text>
        <View style={styles.topActions}>
          <TouchableOpacity style={styles.iconButton} activeOpacity={0.7}>
            <SearchIcon />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} activeOpacity={0.7}>
            <BellIcon />
          </TouchableOpacity>
        </View>
      </View>

      {/* Date Navigator */}
      <DateNavigator
        dates={DATES}
        selectedIndex={selectedDateIndex}
        onSelectDate={setSelectedDateIndex}
      />

      {/* Filter Tabs */}
      <FilterTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        liveCounts={liveCount}
      />

      {/* Match List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {filteredLeagues.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>⚽</Text>
            <Text style={styles.emptyTitle}>Sin partidos</Text>
            <Text style={styles.emptySubtitle}>
              No hay partidos en esta categoría
            </Text>
          </View>
        ) : (
          filteredLeagues.map((league) => (
            <LeagueSection
              key={league.id}
              league={league}
              onMatchPress={handleMatchPress}
            />
          ))
        )}
        <View style={styles.bottomPad} />
      </ScrollView>

      {selectedMatch && (
        <MatchDetailScreen
          match={selectedMatch}
          visible={!!selectedMatch}
          onClose={() => setSelectedMatch(null)}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    backgroundColor: colors.bg,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.8,
  },
  topActions: {
    flexDirection: 'row',
    gap: 4,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Search icon drawn with primitives
  searchIcon: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchCircle: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.textSecondary,
  },
  searchHandle: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 6,
    height: 2,
    backgroundColor: colors.textSecondary,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }, { translateX: 1 }, { translateY: -2 }],
  },
  // Bell icon drawn with primitives
  bellIcon: {
    width: 18,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBody: {
    position: 'absolute',
    top: 3,
    width: 14,
    height: 12,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.textSecondary,
    borderBottomWidth: 0,
  },
  bellHandle: {
    position: 'absolute',
    top: 0,
    width: 3,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textSecondary,
  },
  bellBottom: {
    position: 'absolute',
    bottom: 2,
    width: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.textSecondary,
  },
  bellDot: {
    position: 'absolute',
    bottom: 0,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.textSecondary,
  },
  scrollView: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  listContent: {
    paddingTop: 12,
    gap: 0,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  bottomPad: {
    height: 20,
  },
});
