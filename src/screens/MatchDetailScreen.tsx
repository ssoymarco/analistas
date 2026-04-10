// ── Match Detail Screen ───────────────────────────────────────────────────────
// World-class football match detail: pre/live/finished states, 4 tabs, dark/light mode
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useThemeColors } from '../theme/useTheme';
import { useDarkMode } from '../contexts/DarkModeContext';
import { useFixtureDetail } from '../hooks/useFixtureDetail';
import { useCountdown } from '../hooks/useCountdown';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { EnVivoTab }      from './matchDetail/EnVivoTab';
import { EstadisticasTab } from './matchDetail/EstadisticasTab';
import { AlineacionTab }  from './matchDetail/AlineacionTab';
import { TablaTab }       from './matchDetail/TablaTab';

type Props = NativeStackScreenProps<RootStackParamList, 'MatchDetail'>;
type Tab = 'envivo' | 'estadisticas' | 'alineacion' | 'tabla';

// ── Back arrow (drawn with primitives) ───────────────────────────────────────
function BackArrow({ color }: { color: string }) {
  return (
    <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', top: 4,    left: 2, width: 9,  height: 1.8, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '-45deg' }] }} />
      <View style={{ position: 'absolute', bottom: 4, left: 2, width: 9,  height: 1.8, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '45deg'  }] }} />
      <View style={{ position: 'absolute',             left: 2, width: 14, height: 1.8, backgroundColor: color, borderRadius: 1 }} />
    </View>
  );
}

// ── Team badge ────────────────────────────────────────────────────────────────
function TeamBadge({ name, logo, size = 64 }: { name: string; logo: string; size?: number }) {
  const isUrl = logo.startsWith('http');
  const hue   = name.charCodeAt(0) * 37 % 360;
  const bg    = `hsl(${hue}, 40%, 18%)`;
  const fg    = `hsl(${hue}, 70%, 70%)`;
  const init  = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <View style={[bdg.wrap, { width: size, height: size, borderRadius: size * 0.22, backgroundColor: bg }]}>
      {isUrl
        ? <Image source={{ uri: logo }} style={{ width: size * 0.72, height: size * 0.72 }} resizeMode="contain" />
        : logo.length <= 2
          ? <Text style={{ fontSize: size * 0.4 }}>{logo}</Text>
          : <Text style={[bdg.init, { color: fg, fontSize: size * 0.27 }]}>{init}</Text>
      }
    </View>
  );
}
const bdg = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  init: { fontWeight: '800' },
});

// ── Countdown display ─────────────────────────────────────────────────────────
function CountdownBadge({ startingAtUtc }: { startingAtUtc: string }) {
  const c = useThemeColors();
  const cd = useCountdown(startingAtUtc);

  if (!cd || cd.isPast) return null;

  if (cd.isImminent) {
    return (
      <View style={cdb.pill}>
        <View style={cdb.dot} />
        <Text style={cdb.imminent}>POR COMENZAR</Text>
      </View>
    );
  }

  if (cd.showCountdown) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      <View style={[cdb.countdownWrap, { backgroundColor: c.surface, borderColor: c.border }]}>
        {cd.days > 0 && (
          <View style={cdb.unit}>
            <Text style={[cdb.num, { color: c.textPrimary }]}>{cd.days}</Text>
            <Text style={[cdb.label, { color: c.textTertiary }]}>d</Text>
          </View>
        )}
        <View style={cdb.unit}>
          <Text style={[cdb.num, { color: c.textPrimary }]}>{pad(cd.hours)}</Text>
          <Text style={[cdb.label, { color: c.textTertiary }]}>h</Text>
        </View>
        <Text style={[cdb.sep, { color: c.textTertiary }]}>:</Text>
        <View style={cdb.unit}>
          <Text style={[cdb.num, { color: c.textPrimary }]}>{pad(cd.minutes)}</Text>
          <Text style={[cdb.label, { color: c.textTertiary }]}>m</Text>
        </View>
        <Text style={[cdb.sep, { color: c.textTertiary }]}>:</Text>
        <View style={cdb.unit}>
          <Text style={[cdb.num, { color: c.textPrimary }]}>{pad(cd.seconds)}</Text>
          <Text style={[cdb.label, { color: c.textTertiary }]}>s</Text>
        </View>
      </View>
    );
  }

  // > 24h away — just show the match time
  return null;
}

const cdb = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#7f1d1d', paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, alignSelf: 'center', marginTop: 2,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#ef4444' },
  imminent: { fontSize: 12, fontWeight: '800', color: '#fca5a5', letterSpacing: 0.8 },
  countdownWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8,
    alignSelf: 'center', marginTop: 2,
  },
  unit: { alignItems: 'center', minWidth: 30 },
  num:  { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  label: { fontSize: 9, fontWeight: '600', letterSpacing: 0.5, marginTop: -2 },
  sep:  { fontSize: 18, fontWeight: '800', marginBottom: 8 },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export const MatchDetailScreen: React.FC<Props> = ({ route }) => {
  const { match } = route.params;
  const c = useThemeColors();
  const { isDark } = useDarkMode();
  const navigation = useNavigation();

  const isLive     = match.status === 'live';
  const isFinished = match.status === 'finished';
  const isScheduled = match.status === 'scheduled';

  // Load full fixture detail (async, with mock fallback)
  const { detail, loading } = useFixtureDetail(
    match.id,
    match.homeTeam.id,
    match.awayTeam.id,
  );

  // Tab configuration per match state
  const TABS: { key: Tab; label: string }[] = isScheduled
    ? [
        { key: 'envivo',       label: 'Previa' },
        { key: 'alineacion',   label: 'Alineación' },
        { key: 'tabla',        label: 'Tabla' },
      ]
    : isLive
    ? [
        { key: 'envivo',       label: 'En vivo' },
        { key: 'estadisticas', label: 'Estadísticas' },
        { key: 'alineacion',   label: 'Alineación' },
        { key: 'tabla',        label: 'Tabla' },
      ]
    : [
        { key: 'envivo',       label: 'Resumen' },
        { key: 'estadisticas', label: 'Estadísticas' },
        { key: 'alineacion',   label: 'Alineación' },
        { key: 'tabla',        label: 'Tabla' },
      ];

  const [activeTab, setActiveTab] = useState<Tab>(TABS[0].key);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── Nav bar ── */}
      <View style={[scr.navBar, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          style={[scr.backBtn, { backgroundColor: c.surface }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <BackArrow color={c.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[scr.navLeague, { color: c.textTertiary }]} numberOfLines={1}>
            {match.league}
          </Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      {/* ── Score hero ── */}
      <View style={scr.hero}>
        {/* Live pulse pill */}
        {isLive && (
          <View style={scr.livePill}>
            <View style={scr.liveDot} />
            <Text style={scr.livePillText}>EN VIVO · {match.minute ?? match.time}'</Text>
          </View>
        )}

        {/* Teams + score row */}
        <View style={scr.heroRow}>
          {/* Home team */}
          <View style={scr.teamCol}>
            <TeamBadge name={match.homeTeam.name} logo={match.homeTeam.logo} size={68} />
            <Text style={[scr.teamName, { color: c.textPrimary }]} numberOfLines={2}>
              {match.homeTeam.name}
            </Text>
          </View>

          {/* Center: score / time / countdown */}
          <View style={scr.centerCol}>
            {isScheduled ? (
              <>
                <Text style={[scr.schedTime, { color: c.textPrimary }]}>{match.time}</Text>
                {match.startingAtUtc && (
                  <CountdownBadge startingAtUtc={match.startingAtUtc} />
                )}
              </>
            ) : (
              <>
                <View style={scr.scoreRow}>
                  <Text style={[scr.score, { color: c.textPrimary }]}>{match.homeScore}</Text>
                  <Text style={[scr.scoreDash, { color: c.textTertiary }]}>–</Text>
                  <Text style={[scr.score, { color: c.textPrimary }]}>{match.awayScore}</Text>
                </View>
                {isFinished && (
                  <Text style={[scr.finishedLabel, { color: c.textTertiary }]}>Finalizado</Text>
                )}
              </>
            )}
          </View>

          {/* Away team */}
          <View style={scr.teamCol}>
            <TeamBadge name={match.awayTeam.name} logo={match.awayTeam.logo} size={68} />
            <Text style={[scr.teamName, { color: c.textPrimary }]} numberOfLines={2}>
              {match.awayTeam.name}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Tab bar ── */}
      <View style={[scr.tabBarWrap, { borderBottomColor: c.border, backgroundColor: c.bg }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={scr.tabBar}>
          {TABS.map((t) => {
            const active = activeTab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[scr.tabBtn, active && { borderBottomColor: c.accent }]}
                onPress={() => setActiveTab(t.key)}
                activeOpacity={0.7}
              >
                <Text style={[scr.tabText, { color: active ? c.accent : c.textTertiary }]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Content ── */}
      <ScrollView
        style={{ flex: 1, backgroundColor: c.bg }}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {loading || !detail ? (
          <View style={scr.emptyWrap}>
            {loading ? (
              <>
                <Text style={{ fontSize: 36 }}>⏳</Text>
                <Text style={[scr.emptyText, { color: c.textTertiary }]}>Cargando…</Text>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 36 }}>📋</Text>
                <Text style={[scr.emptyText, { color: c.textSecondary }]}>
                  Detalle no disponible
                </Text>
              </>
            )}
          </View>
        ) : (
          <>
            {activeTab === 'envivo'       && <EnVivoTab      match={match} detail={detail} />}
            {activeTab === 'estadisticas' && <EstadisticasTab match={match} detail={detail} />}
            {activeTab === 'alineacion'   && <AlineacionTab  match={match} detail={detail} />}
            {activeTab === 'tabla'        && <TablaTab       match={match} detail={detail} />}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// ── Screen styles ─────────────────────────────────────────────────────────────
const scr = StyleSheet.create({
  // Nav
  navBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 0,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  navLeague: { fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },

  // Hero
  hero: { paddingTop: 12, paddingBottom: 16, paddingHorizontal: 16, alignItems: 'center', gap: 10 },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#7f1d1d', paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#ef4444' },
  livePillText: { fontSize: 12, fontWeight: '800', color: '#fca5a5', letterSpacing: 0.5 },

  heroRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', width: '100%',
  },
  teamCol: { flex: 1, alignItems: 'center', gap: 8 },
  teamName: { fontSize: 12, fontWeight: '600', textAlign: 'center', lineHeight: 17 },

  centerCol: { alignItems: 'center', paddingHorizontal: 4, gap: 4 },
  schedTime: { fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  score: { fontSize: 44, fontWeight: '900', lineHeight: 50 },
  scoreDash: { fontSize: 28, fontWeight: '300', lineHeight: 50 },
  finishedLabel: { fontSize: 11, fontWeight: '500' },

  // Tabs
  tabBarWrap: { borderBottomWidth: 1 },
  tabBar: { paddingHorizontal: 12 },
  tabBtn: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 2.5, borderBottomColor: 'transparent',
  },
  tabText: { fontSize: 13, fontWeight: '600' },

  // Loading / empty
  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15, fontWeight: '500' },
});
