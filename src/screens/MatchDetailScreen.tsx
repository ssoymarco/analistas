// ── Match Detail Screen ───────────────────────────────────────────────────────
// Redesigned header with dark navy gradient, bell & share icons, time capsule,
// team badges with "VS", collapsible hero, 4 tabs, "Volver arriba" FAB.
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { SkeletonMatchDetail } from '../components/Skeleton';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useThemeColors } from '../theme/useTheme';
import { useUserStats } from '../contexts/UserStatsContext';
import { useDarkMode } from '../contexts/DarkModeContext';
import { useFixtureDetail } from '../hooks/useFixtureDetail';
import { useCountdown } from '../hooks/useCountdown';
import type { PartidosStackParamList } from '../navigation/AppNavigator';
import { EnVivoTab }     from './matchDetail/EnVivoTab';
import { AlineacionTab } from './matchDetail/AlineacionTab';
import { TablaTab }      from './matchDetail/TablaTab';
import { NoticiasTab }   from './matchDetail/NoticiasTab';

type Props = NativeStackScreenProps<PartidosStackParamList, 'MatchDetail'>;
type Tab  = 'previa' | 'alineacion' | 'tabla' | 'noticias';

// ── Animation constants ──────────────────────────────────────────────────────
const HERO_EXPANDED  = 210;
const HERO_COMPACT   = 64;
const COLLAPSE_RANGE = 110;
const SCROLL_TOP_THRESHOLD = 400;

// ── Icon: Back chevron ───────────────────────────────────────────────────────
function BackArrow({ color }: { color: string }) {
  return (
    <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', top: 4, left: 2, width: 9, height: 1.8, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '-45deg' }] }} />
      <View style={{ position: 'absolute', bottom: 4, left: 2, width: 9, height: 1.8, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '45deg' }] }} />
    </View>
  );
}

// ── Icon: Bell ───────────────────────────────────────────────────────────────
function BellIcon({ size = 18 }: { size?: number }) {
  const s = size;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      {/* Bell body */}
      <View style={{
        width: s * 0.65, height: s * 0.55,
        backgroundColor: '#10b981',
        borderTopLeftRadius: s * 0.32,
        borderTopRightRadius: s * 0.32,
        borderBottomLeftRadius: 2,
        borderBottomRightRadius: 2,
        position: 'absolute', top: s * 0.08,
      }} />
      {/* Bell brim */}
      <View style={{
        width: s * 0.8, height: s * 0.12,
        backgroundColor: '#10b981',
        borderRadius: s * 0.06,
        position: 'absolute', bottom: s * 0.18,
      }} />
      {/* Bell handle */}
      <View style={{
        width: s * 0.18, height: s * 0.18,
        borderRadius: s * 0.09,
        borderWidth: 1.5,
        borderColor: '#10b981',
        position: 'absolute', top: 0,
      }} />
      {/* Clapper */}
      <View style={{
        width: s * 0.14, height: s * 0.14,
        borderRadius: s * 0.07,
        backgroundColor: '#10b981',
        position: 'absolute', bottom: s * 0.06,
      }} />
      {/* Notification dot */}
      <View style={{
        width: 6, height: 6, borderRadius: 3,
        backgroundColor: '#ef4444',
        position: 'absolute', top: 0, right: 0,
      }} />
    </View>
  );
}

// ── Icon: Share (node) ───────────────────────────────────────────────────────
function ShareNodeIcon({ color, size = 18 }: { color: string; size?: number }) {
  const s = size;
  const dotR = s * 0.15;
  return (
    <View style={{ width: s, height: s }}>
      {/* Top-right dot */}
      <View style={{ position: 'absolute', top: 0, right: 0, width: dotR * 2, height: dotR * 2, borderRadius: dotR, backgroundColor: color }} />
      {/* Middle-left dot */}
      <View style={{ position: 'absolute', top: s * 0.36, left: 0, width: dotR * 2, height: dotR * 2, borderRadius: dotR, backgroundColor: color }} />
      {/* Bottom-right dot */}
      <View style={{ position: 'absolute', bottom: 0, right: 0, width: dotR * 2, height: dotR * 2, borderRadius: dotR, backgroundColor: color }} />
      {/* Line top */}
      <View style={{
        position: 'absolute', top: s * 0.18, left: s * 0.18,
        width: s * 0.52, height: 1.5, backgroundColor: color,
        transform: [{ rotate: '-25deg' }],
      }} />
      {/* Line bottom */}
      <View style={{
        position: 'absolute', top: s * 0.62, left: s * 0.18,
        width: s * 0.52, height: 1.5, backgroundColor: color,
        transform: [{ rotate: '25deg' }],
      }} />
    </View>
  );
}

// ── Icon: Clock ──────────────────────────────────────────────────────────────
function ClockIcon({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        borderWidth: 1.5, borderColor: color,
      }} />
      {/* Hour hand */}
      <View style={{
        position: 'absolute',
        top: size * 0.2, left: size / 2 - 0.75,
        width: 1.5, height: size * 0.3,
        backgroundColor: color, borderRadius: 0.75,
      }} />
      {/* Minute hand */}
      <View style={{
        position: 'absolute',
        top: size / 2 - 0.75, left: size / 2,
        width: size * 0.25, height: 1.5,
        backgroundColor: color, borderRadius: 0.75,
      }} />
    </View>
  );
}

// ── Icon: Up chevron ─────────────────────────────────────────────────────────
function UpChevron({ color }: { color: string }) {
  return (
    <View style={{ width: 14, height: 10, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', left: 0, bottom: 0, width: 8, height: 1.8, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '-45deg' }] }} />
      <View style={{ position: 'absolute', right: 0, bottom: 0, width: 8, height: 1.8, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '45deg' }] }} />
    </View>
  );
}

// ── Team badge (large) ───────────────────────────────────────────────────────
function TeamBadge({ name, logo, size = 80 }: { name: string; logo: string; size?: number }) {
  const isUrl = logo.startsWith('http');
  const hue = name.charCodeAt(0) * 37 % 360;
  const bg  = `hsl(${hue}, 40%, 18%)`;
  const fg  = `hsl(${hue}, 70%, 70%)`;
  const init = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <View style={{
      width: size, height: size, borderRadius: size * 0.22,
      backgroundColor: bg, alignItems: 'center', justifyContent: 'center',
    }}>
      {isUrl
        ? <Image source={{ uri: logo }} style={{ width: size * 0.72, height: size * 0.72 }} resizeMode="contain" />
        : logo.length <= 2
          ? <Text style={{ fontSize: size * 0.4 }}>{logo}</Text>
          : <Text style={{ fontWeight: '800', color: fg, fontSize: size * 0.27 }}>{init}</Text>
      }
    </View>
  );
}

// ── Team badge (small — compact header) ──────────────────────────────────────
function TeamBadgeSmall({ name, logo, size = 32 }: { name: string; logo: string; size?: number }) {
  const isUrl = logo.startsWith('http');
  const hue = name.charCodeAt(0) * 37 % 360;
  const bg  = `hsl(${hue}, 40%, 18%)`;
  const fg  = `hsl(${hue}, 70%, 70%)`;
  const init = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <View style={{
      width: size, height: size, borderRadius: size * 0.22,
      backgroundColor: bg, alignItems: 'center', justifyContent: 'center',
    }}>
      {isUrl
        ? <Image source={{ uri: logo }} style={{ width: size * 0.75, height: size * 0.75 }} resizeMode="contain" />
        : logo.length <= 2
          ? <Text style={{ fontSize: size * 0.42 }}>{logo}</Text>
          : <Text style={{ fontWeight: '800', color: fg, fontSize: 9 }}>{init}</Text>
      }
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════════════════════════════

export const MatchDetailScreen: React.FC<Props> = ({ route }) => {
  const { match } = route.params;
  const c         = useThemeColors();
  const { isDark } = useDarkMode();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();
  const scrollRef  = useRef<any>(null);

  const isLive      = match.status === 'live';
  const isFinished  = match.status === 'finished';
  const isScheduled = match.status === 'scheduled';

  const { detail, loading } = useFixtureDetail(match.id, match.homeTeam.id, match.awayTeam.id);
  const { incrementMatchesViewed } = useUserStats();

  // Track match view (once per unique match)
  useEffect(() => { incrementMatchesViewed(match.id); }, [match.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const TABS: { key: Tab; label: string }[] = [
    { key: 'previa', label: isScheduled ? 'Previa' : isLive ? 'En vivo' : 'Resumen' },
    { key: 'alineacion', label: 'Alineación' },
    { key: 'tabla', label: 'Tabla' },
    { key: 'noticias', label: 'Noticias' },
  ];
  const [activeTab, setActiveTab] = useState<Tab>('previa');

  // ── Animated hero ──────────────────────────────────────────────────────────
  const scrollY = useRef(new Animated.Value(0)).current;

  const heroHeight = scrollY.interpolate({
    inputRange: [0, COLLAPSE_RANGE],
    outputRange: [HERO_EXPANDED, HERO_COMPACT],
    extrapolate: 'clamp',
  });
  const expandedOpacity = scrollY.interpolate({
    inputRange: [0, COLLAPSE_RANGE * 0.5],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const compactOpacity = scrollY.interpolate({
    inputRange: [COLLAPSE_RANGE * 0.45, COLLAPSE_RANGE],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const headerShadowOpacity = scrollY.interpolate({
    inputRange: [COLLAPSE_RANGE - 10, COLLAPSE_RANGE + 10],
    outputRange: [0, 0.15],
    extrapolate: 'clamp',
  });

  // ── "Volver arriba" FAB ────────────────────────────────────────────────────
  const [showScrollTop, setShowScrollTop] = useState(false);
  const handleScroll = useCallback((e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    setShowScrollTop(y > SCROLL_TOP_THRESHOLD);
  }, []);

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo?.({ y: 0, animated: true });
    // For Animated.ScrollView, try getNode
    scrollRef.current?.getNode?.()?.scrollTo?.({ y: 0, animated: true });
  }, []);

  // ── Header colors ──────────────────────────────────────────────────────────
  const headerBg       = c.bg;
  const hText          = isDark ? '#fff' : '#111827';
  const hTextSoft      = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(17,24,39,0.5)';
  const hTextMuted     = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(17,24,39,0.25)';
  const hBtnBg         = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)';
  const hCapsuleBg     = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';

  // ── Display values ─────────────────────────────────────────────────────────
  const displayTime = match.time;
  const displayDate = match.date;
  const compactScoreText = isScheduled ? match.time : `${match.homeScore} - ${match.awayScore}`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ══════════════════════════════════════════════════════════════════
          STICKY HEADER — nav bar + animated hero + tab bar
      ══════════════════════════════════════════════════════════════════ */}
      <Animated.View style={[
        scr.stickyHeader,
        { backgroundColor: headerBg, shadowOpacity: headerShadowOpacity },
      ]}>
        {/* No gradient — solid bg for consistency */}

        {/* ── Nav row ── */}
        <View style={scr.navBar}>
          <TouchableOpacity
            style={[scr.navBtn, { backgroundColor: hBtnBg }]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <BackArrow color={hText} />
          </TouchableOpacity>

          {/* League + round */}
          <TouchableOpacity
            style={scr.navCenter}
            activeOpacity={0.7}
            onPress={() => navigation.push('LeagueDetail', {
              leagueId: Number(match.leagueId) || 0,
              leagueName: match.league,
              seasonId: match.seasonId,
            })}
          >
            <Text style={[scr.navLeague, { color: hText }]} numberOfLines={1}>
              <Text style={[scr.navLeagueBold, { color: hText }]}>{match.league}</Text>
              {'  '}
              <Text style={[scr.navRound, { color: hTextSoft }]}>·  Jornada</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={[scr.navBtn, { backgroundColor: hBtnBg }]} activeOpacity={0.7}>
            <BellIcon size={18} />
          </TouchableOpacity>
          <TouchableOpacity style={[scr.navBtn, { backgroundColor: hBtnBg }]} activeOpacity={0.7}>
            <ShareNodeIcon color={hText} size={16} />
          </TouchableOpacity>
        </View>

        {/* ── Animated hero container ── */}
        <Animated.View style={[scr.heroWrap, { height: heroHeight, overflow: 'hidden' }]}>

          {/* ── EXPANDED view ── */}
          <Animated.View style={[scr.heroExpanded, { opacity: expandedOpacity }]}>
            {/* Live pill */}
            {isLive && (
              <View style={scr.livePill}>
                <View style={scr.liveDot} />
                <Text style={scr.livePillText}>
                  {match.stateLabel === 'HT'
                    ? 'DESCANSO'
                    : `EN VIVO · ${match.minute ?? match.time}'`}
                </Text>
              </View>
            )}

            {/* Time capsule (scheduled) */}
            {isScheduled && (
              <View style={[scr.timeCapsule, { backgroundColor: hCapsuleBg }]}>
                <ClockIcon color={hTextSoft} size={14} />
                <Text style={[scr.timeText, { color: isDark ? 'rgba(255,255,255,0.85)' : '#374151' }]}>{displayTime} · {displayDate}</Text>
              </View>
            )}

            {/* Finished label */}
            {isFinished && (
              <View style={[scr.timeCapsule, { backgroundColor: hCapsuleBg }]}>
                <Text style={[scr.timeText, { color: hTextSoft }]}>Finalizado</Text>
              </View>
            )}

            {/* Badges row */}
            <View style={scr.badgesRow}>
              {/* Home */}
              <TouchableOpacity
                style={scr.teamCol}
                activeOpacity={0.6}
                onPress={() => {
                  const n = Number(match.homeTeam.id);
                  if (!isNaN(n) && n > 0) {
                    navigation.push('TeamDetail', {
                      teamId: n,
                      teamName: match.homeTeam.name,
                      teamLogo: match.homeTeam.logo,
                      seasonId: match.seasonId,
                    });
                  }
                }}
              >
                <TeamBadge name={match.homeTeam.name} logo={match.homeTeam.logo} size={80} />
                <Text style={[scr.teamName, { color: hText }]} numberOfLines={2}>{match.homeTeam.name}</Text>
              </TouchableOpacity>

              {/* Center */}
              <View style={scr.centerCol}>
                {isScheduled ? (
                  <Text style={[scr.vsText, { color: hTextMuted }]}>VS</Text>
                ) : (
                  <>
                    <View style={scr.scoreRow}>
                      <Text style={[scr.score, { color: hText }]}>{match.homeScore}</Text>
                      <Text style={[scr.scoreDash, { color: hTextMuted }]}>–</Text>
                      <Text style={[scr.score, { color: hText }]}>{match.awayScore}</Text>
                    </View>
                    {match.homeScoreHT !== undefined && match.awayScoreHT !== undefined && (
                      <Text style={[scr.htLabel, { color: hTextSoft }]}>MT: {match.homeScoreHT}–{match.awayScoreHT}</Text>
                    )}
                  </>
                )}
              </View>

              {/* Away */}
              <TouchableOpacity
                style={scr.teamCol}
                activeOpacity={0.6}
                onPress={() => {
                  const n = Number(match.awayTeam.id);
                  if (!isNaN(n) && n > 0) {
                    navigation.push('TeamDetail', {
                      teamId: n,
                      teamName: match.awayTeam.name,
                      teamLogo: match.awayTeam.logo,
                      seasonId: match.seasonId,
                    });
                  }
                }}
              >
                <TeamBadge name={match.awayTeam.name} logo={match.awayTeam.logo} size={80} />
                <Text style={[scr.teamName, { color: hText }]} numberOfLines={2}>{match.awayTeam.name}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* ── COMPACT view ── */}
          <Animated.View style={[scr.heroCompact, { opacity: compactOpacity }]} pointerEvents="none">
            <View style={scr.compactInner}>
              <TeamBadgeSmall name={match.homeTeam.name} logo={match.homeTeam.logo} size={32} />
              <View style={scr.compactCenter}>
                {isLive && <View style={scr.compactLiveDot} />}
                <Text style={[scr.compactScore, { color: hText }]}>{compactScoreText}</Text>
              </View>
              <TeamBadgeSmall name={match.awayTeam.name} logo={match.awayTeam.logo} size={32} />
            </View>
            <Text style={[scr.compactDate, { color: hTextSoft }]}>
              {isFinished ? 'Finalizado' : displayDate}
            </Text>
          </Animated.View>
        </Animated.View>

        {/* ── Tab bar ── */}
        <View style={[scr.tabBarWrap, { backgroundColor: c.bg, borderBottomColor: c.border }]}>
          {TABS.map(t => {
            const active = activeTab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[scr.tabBtn, active && { borderBottomColor: c.accent }]}
                onPress={() => setActiveTab(t.key)}
                activeOpacity={0.7}
              >
                <Text style={[
                  scr.tabText,
                  { color: active ? c.accent : c.textTertiary },
                  active && { fontWeight: '700' },
                ]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Animated.View>

      {/* ══════════════════════════════════════════════════════════════════
          SCROLLABLE CONTENT
      ══════════════════════════════════════════════════════════════════ */}
      <Animated.ScrollView
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: c.bg }}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false, listener: handleScroll },
        )}
      >
        {loading || !detail ? (
          loading ? (
            <SkeletonMatchDetail />
          ) : (
            <View style={scr.emptyWrap}>
              <Text style={{ fontSize: 36 }}>📋</Text>
              <Text style={[scr.emptyText, { color: c.textSecondary }]}>Detalle no disponible</Text>
            </View>
          )
        ) : (
          <>
            {activeTab === 'previa'     && <EnVivoTab     match={match} detail={detail} />}
            {activeTab === 'alineacion' && <AlineacionTab match={match} detail={detail} />}
            {activeTab === 'tabla'      && <TablaTab      match={match} detail={detail} />}
            {activeTab === 'noticias'   && <NoticiasTab   match={match} detail={detail} />}
          </>
        )}
      </Animated.ScrollView>

      {/* ── "Volver arriba" FAB ── */}
      {showScrollTop && (
        <TouchableOpacity
          style={[scr.scrollTopBtn, { backgroundColor: c.accent }]}
          onPress={scrollToTop}
          activeOpacity={0.85}
        >
          <UpChevron color="#fff" />
          <Text style={scr.scrollTopText}>Volver arriba</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const scr = StyleSheet.create({
  // Sticky header
  stickyHeader: {
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 8,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },

  // Nav bar
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 6,
    height: 48,
    zIndex: 2,
    gap: 6,
  },
  navBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  navCenter: {
    flex: 1,
    alignItems: 'center',
  },
  navLeague: {
    fontSize: 14,
    color: '#fff',
  },
  navLeagueBold: {
    fontWeight: '700',
    color: '#fff',
  },
  navRound: {
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
  },

  // Hero container
  heroWrap: { position: 'relative' },

  // ── Expanded hero ──
  heroExpanded: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
  },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#7f1d1d', paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: 20,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#ef4444' },
  livePillText: { fontSize: 11, fontWeight: '800', color: '#fca5a5', letterSpacing: 0.5 },

  timeCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
  },
  timeText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.3,
  },

  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  teamCol: { flex: 1, alignItems: 'center', gap: 8 },
  teamName: {
    fontSize: 13, fontWeight: '700', color: '#fff',
    textAlign: 'center', lineHeight: 17,
  },
  centerCol: { alignItems: 'center', paddingHorizontal: 4, gap: 2 },
  vsText: {
    fontSize: 24, fontWeight: '800', color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2,
  },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  score: { fontSize: 36, fontWeight: '900', color: '#fff', lineHeight: 42 },
  scoreDash: { fontSize: 22, fontWeight: '300', color: 'rgba(255,255,255,0.4)', lineHeight: 42 },
  htLabel: { fontSize: 10, fontWeight: '500', color: 'rgba(255,255,255,0.5)' },

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
    gap: 16,
  },
  compactCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  compactLiveDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: '#ef4444',
  },
  compactScore: {
    fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: -0.5,
  },
  compactDate: {
    fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.5)',
    marginTop: 1,
  },

  // Tab bar
  tabBarWrap: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
  },
  tabText: { fontSize: 13, fontWeight: '600' },

  // Empty / loading
  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15, fontWeight: '500' },

  // Scroll-to-top FAB
  scrollTopBtn: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
  },
  scrollTopText: {
    fontSize: 13, fontWeight: '700', color: '#fff',
  },
});
