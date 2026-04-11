import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
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

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
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
  const c = useThemeColors();
  const { isDark } = useDarkMode();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [activeTab, setActiveTab] = useState<FilterTab>('todos');
  const [showCalendar, setShowCalendar] = useState(false);

  // ── Real data via hook ──────────────────────────────────────────────────────
  const { matches: allMatches, leagues: allLeagues, loading, refreshing, refresh } = useFixtures(selectedDate);

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
            Partidos
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
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 2,
            backgroundColor: 'rgba(249,115,22,0.12)',
            paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12,
          }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#fb923c' }}>7</Text>
            <Text style={{ fontSize: 14 }}>🔥</Text>
          </View>
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

      <FilterTabs activeTab={activeTab} onTabChange={setActiveTab} liveCounts={liveCount} totalCount={totalCount} finishedCount={finishedCount} />

      <ScrollView
        style={{ flex: 1, backgroundColor: c.bg }}
        contentContainerStyle={{ paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.emerald} />
        }
      >
        {loading ? (
          <View style={{ alignItems: 'center', paddingTop: 80, gap: 10 }}>
            <ActivityIndicator size="large" color={c.emerald} />
            <Text style={{ fontSize: 14, color: c.textSecondary, marginTop: 8 }}>Cargando partidos...</Text>
          </View>
        ) : filteredLeagues.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 80, gap: 10 }}>
            <Text style={{ fontSize: 48 }}>⚽</Text>
            <Text style={{ fontSize: 18, fontWeight: '700', color: c.textPrimary }}>Sin partidos</Text>
            <Text style={{ fontSize: 14, color: c.textSecondary, textAlign: 'center' }}>
              {filterStatus && allLeagues.length > 0 ? 'No hay partidos en esta categoría' : 'No hay partidos en este día'}
            </Text>
          </View>
        ) : (
          filteredLeagues.map(league => (
            <LeagueSection
              key={league.id}
              league={league}
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
        <View style={{ height: 80 }} />
      </ScrollView>

      {!isToday(selectedDate) && (
        <TouchableOpacity style={{
          position: 'absolute', bottom: 24, alignSelf: 'center',
          backgroundColor: c.emerald, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24,
          shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
        }} activeOpacity={0.85} onPress={handleGoToday}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#ffffff', letterSpacing: -0.2 }}>↩ Volver a Hoy</Text>
        </TouchableOpacity>
      )}

      <CalendarPicker visible={showCalendar} selectedDate={selectedDate} onSelectDate={handleCalendarSelect} onClose={() => setShowCalendar(false)} onGoToday={() => { handleGoToday(); setShowCalendar(false); }} />
    </SafeAreaView>
  );
};
