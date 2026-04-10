// ── Match Detail Screen ───────────────────────────────────────────────────────
// Collapsible animated hero, 4 tabs, dark/light mode, tab bar always visible.
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useThemeColors } from '../theme/useTheme';
import { useDarkMode } from '../contexts/DarkModeContext';
import { useFixtureDetail } from '../hooks/useFixtureDetail';
import { useCountdown } from '../hooks/useCountdown';
import type { PartidosStackParamList } from '../navigation/AppNavigator';
import { EnVivoTab }       from './matchDetail/EnVivoTab';
import { EstadisticasTab } from './matchDetail/EstadisticasTab';
import { AlineacionTab }   from './matchDetail/AlineacionTab';
import { TablaTab }        from './matchDetail/TablaTab';

type Props = NativeStackScreenProps<PartidosStackParamList, 'MatchDetail'>;
type Tab   = 'envivo' | 'estadisticas' | 'alineacion' | 'tabla';

// ── Animation constants ───────────────────────────────────────────────────────
const HERO_EXPANDED  = 160;  // px — full hero height
const HERO_COMPACT   = 52;   // px — collapsed hero height
const COLLAPSE_RANGE = 90;   // scroll px over which the collapse happens

// ── Back arrow ────────────────────────────────────────────────────────────────
function BackArrow({ color }: { color: string }) {
  return (
    <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', top: 4,    left: 2, width: 9,  height: 1.8, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '-45deg' }] }} />
      <View style={{ position: 'absolute', bottom: 4, left: 2, width: 9,  height: 1.8, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '45deg'  }] }} />
      <View style={{ position: 'absolute',             left: 2, width: 14, height: 1.8, backgroundColor: color, borderRadius: 1 }} />
    </View>
  );
}

// ── Team badge (large) ────────────────────────────────────────────────────────
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

// ── Team badge (small — compact header) ──────────────────────────────────────
function TeamBadgeSmall({ name, logo }: { name: string; logo: string }) {
  const SIZE = 26;
  const isUrl = logo.startsWith('http');
  const hue = name.charCodeAt(0) * 37 % 360;
  const bg  = `hsl(${hue}, 40%, 18%)`;
  const fg  = `hsl(${hue}, 70%, 70%)`;
  const init = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <View style={{ width: SIZE, height: SIZE, borderRadius: SIZE * 0.22, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      {isUrl
        ? <Image source={{ uri: logo }} style={{ width: SIZE * 0.75, height: SIZE * 0.75 }} resizeMode="contain" />
        : logo.length <= 2
          ? <Text style={{ fontSize: SIZE * 0.42 }}>{logo}</Text>
          : <Text style={{ fontWeight: '800', color: fg, fontSize: 7 }}>{init}</Text>
      }
    </View>
  );
}

// ── Countdown badge ───────────────────────────────────────────────────────────
function CountdownBadge({ startingAtUtc }: { startingAtUtc: string }) {
  const c  = useThemeColors();
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
      <View style={[cdb.wrap, { backgroundColor: c.surface, borderColor: c.border }]}>
        {cd.days > 0 && (
          <View style={cdb.unit}>
            <Text style={[cdb.num, { color: c.textPrimary }]}>{cd.days}</Text>
            <Text style={[cdb.lbl, { color: c.textTertiary }]}>d</Text>
          </View>
        )}
        <View style={cdb.unit}>
          <Text style={[cdb.num, { color: c.textPrimary }]}>{pad(cd.hours)}</Text>
          <Text style={[cdb.lbl, { color: c.textTertiary }]}>h</Text>
        </View>
        <Text style={[cdb.sep, { color: c.textTertiary }]}>:</Text>
        <View style={cdb.unit}>
          <Text style={[cdb.num, { color: c.textPrimary }]}>{pad(cd.minutes)}</Text>
          <Text style={[cdb.lbl, { color: c.textTertiary }]}>m</Text>
        </View>
        <Text style={[cdb.sep, { color: c.textTertiary }]}>:</Text>
        <View style={cdb.unit}>
          <Text style={[cdb.num, { color: c.textPrimary }]}>{pad(cd.seconds)}</Text>
          <Text style={[cdb.lbl, { color: c.textTertiary }]}>s</Text>
        </View>
      </View>
    );
  }
  return null;
}
const cdb = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#7f1d1d', paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#ef4444' },
  imminent: { fontSize: 12, fontWeight: '800', color: '#fca5a5', letterSpacing: 0.8 },
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6,
  },
  unit: { alignItems: 'center', minWidth: 28 },
  num:  { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  lbl:  { fontSize: 9, fontWeight: '600', letterSpacing: 0.5, marginTop: -2 },
  sep:  { fontSize: 16, fontWeight: '800', marginBottom: 6 },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export const MatchDetailScreen: React.FC<Props> = ({ route }) => {
  const { match } = route.params;
  const c          = useThemeColors();
  const { isDark } = useDarkMode();
  const navigation = useNavigation();

  const isLive      = match.status === 'live';
  const isFinished  = match.status === 'finished';
  const isScheduled = match.status === 'scheduled';

  const { detail, loading } = useFixtureDetail(match.id, match.homeTeam.id, match.awayTeam.id);

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const TABS: { key: Tab; label: string }[] = isScheduled
    ? [
        { key: 'envivo',     label: 'Previa' },
        { key: 'alineacion', label: 'Alineación' },
        { key: 'tabla',      label: 'Tabla' },
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

  // ── Animated collapsible hero ─────────────────────────────────────────────
  const scrollY = useRef(new Animated.Value(0)).current;

  // Hero container height animates from HERO_EXPANDED → HERO_COMPACT
  const heroHeight = scrollY.interpolate({
    inputRange: [0, COLLAPSE_RANGE],
    outputRange: [HERO_EXPANDED, HERO_COMPACT],
    extrapolate: 'clamp',
  });

  // Expanded content fades out in first half of collapse
  const expandedOpacity = scrollY.interpolate({
    inputRange: [0, COLLAPSE_RANGE * 0.55],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // Compact content fades in in second half of collapse
  const compactOpacity = scrollY.interpolate({
    inputRange: [COLLAPSE_RANGE * 0.45, COLLAPSE_RANGE],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // Slight elevation on the sticky header when scrolled
  const headerShadowOpacity = scrollY.interpolate({
    inputRange: [COLLAPSE_RANGE - 10, COLLAPSE_RANGE + 10],
    outputRange: [0, 0.12],
    extrapolate: 'clamp',
  });

  // ── Score label for compact header ────────────────────────────────────────
  const compactScoreText = isScheduled
    ? match.time
    : `${match.homeScore}–${match.awayScore}`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ══════════════════════════════════════════════════════════════════
          STICKY HEADER — nav bar + animated hero
      ══════════════════════════════════════════════════════════════════ */}
      <Animated.View style={[
        scr.stickyHeader,
        { backgroundColor: c.bg, shadowOpacity: headerShadowOpacity }
      ]}>

        {/* ── Nav row (always full height, always visible) ── */}
        <View style={scr.navBar}>
          <TouchableOpacity
            style={[scr.backBtn, { backgroundColor: c.surface }]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <BackArrow color={c.textPrimary} />
          </TouchableOpacity>

          {/* League label — centre */}
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[scr.navLeague, { color: c.textTertiary }]} numberOfLines={1}>
              {match.league}
            </Text>
          </View>

          {/* Right spacer */}
          <View style={{ width: 38 }} />
        </View>

        {/* ── Animated hero container ── */}
        <Animated.View style={[scr.heroWrap, { height: heroHeight, overflow: 'hidden' }]}>

          {/* ── EXPANDED view (fades out) ── */}
          <Animated.View style={[scr.heroExpanded, { opacity: expandedOpacity }]}>
            {/* Live pill */}
            {isLive && (
              <View style={scr.livePill}>
                <View style={scr.liveDot} />
                <Text style={scr.livePillText}>
                  {match.stateLabel === 'HT'
                    ? 'DESCANSO'
                    : `EN VIVO · ${match.stateLabel ? `${match.stateLabel} · ` : ''}${match.minute ?? match.time}'`}
                </Text>
              </View>
            )}

            <View style={scr.heroRow}>
              {/* Home */}
              <View style={scr.teamCol}>
                <TeamBadge name={match.homeTeam.name} logo={match.homeTeam.logo} size={64} />
                <Text style={[scr.teamName, { color: c.textPrimary }]} numberOfLines={2}>
                  {match.homeTeam.name}
                </Text>
              </View>

              {/* Center score */}
              <View style={scr.centerCol}>
                {isScheduled ? (
                  <>
                    <Text style={[scr.schedTime, { color: c.textPrimary }]}>{match.time}</Text>
                    {match.startingAtUtc && <CountdownBadge startingAtUtc={match.startingAtUtc} />}
                  </>
                ) : (
                  <>
                    <View style={scr.scoreRow}>
                      <Text style={[scr.score, { color: c.textPrimary }]}>{match.homeScore}</Text>
                      <Text style={[scr.scoreDash, { color: c.textTertiary }]}>–</Text>
                      <Text style={[scr.score, { color: c.textPrimary }]}>{match.awayScore}</Text>
                    </View>
                    {match.homeScoreHT !== undefined && match.awayScoreHT !== undefined && (
                      <Text style={[scr.htLabel, { color: c.textTertiary }]}>
                        MT: {match.homeScoreHT}–{match.awayScoreHT}
                      </Text>
                    )}
                    {isFinished && (
                      <Text style={[scr.finishedLabel, { color: c.textTertiary }]}>Finalizado</Text>
                    )}
                  </>
                )}
              </View>

              {/* Away */}
              <View style={scr.teamCol}>
                <TeamBadge name={match.awayTeam.name} logo={match.awayTeam.logo} size={64} />
                <Text style={[scr.teamName, { color: c.textPrimary }]} numberOfLines={2}>
                  {match.awayTeam.name}
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* ── COMPACT view (fades in) — logos + score in one row ── */}
          <Animated.View style={[scr.heroCompact, { opacity: compactOpacity }]}>
            {/* Back button space already in navBar row */}
            <View style={scr.compactInner}>
              <TeamBadgeSmall name={match.homeTeam.name} logo={match.homeTeam.logo} />
              <View style={scr.compactCenter}>
                {isLive && <View style={scr.compactLiveDot} />}
                <Text style={[scr.compactScore, { color: c.textPrimary }]}>
                  {compactScoreText}
                </Text>
              </View>
              <TeamBadgeSmall name={match.awayTeam.name} logo={match.awayTeam.logo} />
            </View>
            {isFinished && (
              <Text style={[scr.compactStatus, { color: c.textTertiary }]}>Finalizado</Text>
            )}
          </Animated.View>

        </Animated.View>

        {/* ── Tab selector bar ── */}
        <View style={[scr.tabBarWrap, { borderBottomColor: c.border, borderTopColor: c.border }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={scr.tabBar}
          >
            {TABS.map(t => {
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
      </Animated.View>

      {/* ══════════════════════════════════════════════════════════════════
          SCROLLABLE CONTENT — drives the hero collapse animation
      ══════════════════════════════════════════════════════════════════ */}
      <Animated.ScrollView
        style={{ flex: 1, backgroundColor: c.bg }}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
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
                <Text style={[scr.emptyText, { color: c.textSecondary }]}>Detalle no disponible</Text>
              </>
            )}
          </View>
        ) : (
          <>
            {activeTab === 'envivo'       && <EnVivoTab       match={match} detail={detail} />}
            {activeTab === 'estadisticas' && <EstadisticasTab  match={match} detail={detail} />}
            {activeTab === 'alineacion'   && <AlineacionTab    match={match} detail={detail} />}
            {activeTab === 'tabla'        && <TablaTab         match={match} detail={detail} />}
          </>
        )}
      </Animated.ScrollView>
    </SafeAreaView>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const scr = StyleSheet.create({
  // Sticky header wraps nav + hero + tabs
  stickyHeader: {
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 8,
  },

  // Nav bar row
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 6,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  navLeague: { fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },

  // Hero container (animated height)
  heroWrap: { position: 'relative' },

  // ── Expanded hero ──
  heroExpanded: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#7f1d1d', paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: 20,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#ef4444' },
  livePillText: { fontSize: 11, fontWeight: '800', color: '#fca5a5', letterSpacing: 0.5 },

  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  teamCol: { flex: 1, alignItems: 'center', gap: 6 },
  teamName: { fontSize: 11, fontWeight: '600', textAlign: 'center', lineHeight: 15 },

  centerCol: { alignItems: 'center', paddingHorizontal: 4, gap: 3 },
  schedTime: { fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  scoreRow:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  score:     { fontSize: 40, fontWeight: '900', lineHeight: 46 },
  scoreDash: { fontSize: 26, fontWeight: '300', lineHeight: 46 },
  htLabel:   { fontSize: 10, fontWeight: '500' },
  finishedLabel: { fontSize: 10, fontWeight: '500' },

  // ── Compact hero ──
  heroCompact: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  compactInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  compactCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  compactLiveDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: '#ef4444',
  },
  compactScore: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  compactStatus: { fontSize: 9, fontWeight: '500', letterSpacing: 0.3 },

  // Tab bar
  tabBarWrap: { borderBottomWidth: 1, borderTopWidth: StyleSheet.hairlineWidth },
  tabBar: { paddingHorizontal: 12 },
  tabBtn: {
    paddingHorizontal: 16, paddingVertical: 11,
    borderBottomWidth: 2.5, borderBottomColor: 'transparent',
  },
  tabText: { fontSize: 13, fontWeight: '600' },

  // Empty / loading
  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15, fontWeight: '500' },
});
