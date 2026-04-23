// ── Match Detail Screen ───────────────────────────────────────────────────────
// Redesigned header with dark navy gradient, bell & share icons, time capsule,
// team badges with "VS", collapsible hero, 4 tabs, "Volver arriba" FAB.
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { haptics } from '../utils/haptics';
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
import { useLiveTick, computeLiveMinuteSeconds, formatLiveClock } from '../hooks/useLiveTick';
import { useNotificationPrefs } from '../contexts/NotificationPrefsContext';
import type { PartidosStackParamList } from '../navigation/AppNavigator';
import { getLeagueConfig }  from '../config/leagues';
import { EnVivoTab }        from './matchDetail/EnVivoTab';
import { PreviewTab }      from './matchDetail/PreviewTab';
import { AlineacionTab }    from './matchDetail/AlineacionTab';
import { TablaTab }         from './matchDetail/TablaTab';
import { NoticiasTab }      from './matchDetail/NoticiasTab';
import { EstadisticasTab }  from './matchDetail/EstadisticasTab';
import { BackArrow, ShareIcon } from '../components/NavIcons';
import { useTimeFormat } from '../contexts/TimeFormatContext';
import { formatMatchTime } from '../utils/formatMatchTime';

type Props = NativeStackScreenProps<PartidosStackParamList, 'MatchDetail'>;
type Tab  = 'previa' | 'alineacion' | 'estadisticas' | 'tabla' | 'noticias';

// ── Animation constants ──────────────────────────────────────────────────────
const HERO_EXPANDED  = 205;
const HERO_COMPACT   = 64;
const COLLAPSE_RANGE = 110;
const SCROLL_TOP_THRESHOLD = 400;


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
  // Real logo → transparent container (logo is self-contained)
  // Fallback text/emoji → colored pill so the initials are legible
  const bg  = isUrl ? 'transparent' : `hsl(${hue}, 40%, 18%)`;
  const fg  = `hsl(${hue}, 70%, 70%)`;
  const init = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <View style={{
      width: size, height: size, borderRadius: size * 0.22,
      backgroundColor: bg, alignItems: 'center', justifyContent: 'center',
    }}>
      {isUrl
        ? <Image source={{ uri: logo }} style={{ width: size * 0.92, height: size * 0.92 }} resizeMode="contain" />
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
  const bg  = isUrl ? 'transparent' : `hsl(${hue}, 40%, 18%)`;
  const fg  = `hsl(${hue}, 70%, 70%)`;
  const init = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <View style={{
      width: size, height: size, borderRadius: size * 0.22,
      backgroundColor: bg, alignItems: 'center', justifyContent: 'center',
    }}>
      {isUrl
        ? <Image source={{ uri: logo }} style={{ width: size * 0.92, height: size * 0.92 }} resizeMode="contain" />
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
  const { t } = useTranslation();
  const { match } = route.params;
  const c         = useThemeColors();
  const { isDark } = useDarkMode();
  const { timeFormat } = useTimeFormat();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();
  const scrollRef  = useRef<any>(null);

  const { detail, liveMatch, loading } = useFixtureDetail(match.id, match.homeTeam.id, match.awayTeam.id, match.status);
  // Prefer the API-fresh match (real score, correct minute) over the prop (may be time-inferred)
  const displayMatch = liveMatch ?? match;

  const isLive      = displayMatch.status === 'live';
  const isFinished  = displayMatch.status === 'finished';
  const isScheduled = displayMatch.status === 'scheduled';
  const { incrementMatchesViewed } = useUserStats();
  const {
    prefs,
    toggleMatchEstadio, isMatchEstadio,
  } = useNotificationPrefs();
  // When global is ON: being in the set means "excluded for this match" (off)
  // When global is OFF: being in the set means "enabled for this match" (on)
  const matchEstadioActive = prefs.estadioMode
    ? !isMatchEstadio(match.id)
    : isMatchEstadio(match.id);
  const countdown = useCountdown(isScheduled ? match.startingAtUtc : undefined);

  // ── Centralized live clock ─────────────────────────────────────────────────
  // Previously we ran a local `setInterval` here that reset to 0 on every
  // mount AND every time `minute` advanced — that's why seconds restarted from
  // 00 whenever you navigated in/out of a match. Now we derive minute/seconds
  // from the shared `useLiveTick()` + the server anchor (`displayMatch.liveClock`)
  // so the clock stays in sync with the Partidos list and survives navigation.
  const tickNow = useLiveTick(isLive);
  const liveDisplay = isLive ? computeLiveMinuteSeconds(displayMatch, tickNow) : null;
  const liveClock = liveDisplay ? formatLiveClock(liveDisplay) : null;

  // Track match view (once per unique match)
  useEffect(() => { incrementMatchesViewed(match.id); }, [match.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tabs ───────────────────────────────────────────────────────────────────
  // Determine immediately (without waiting for TablaTab to render) whether this
  // league is a knockout cup — so the tab always shows the right label upfront.
  const leagueIsCup = getLeagueConfig(Number(match.leagueId))?.isCup ?? false;
  const tablaLabel  = leagueIsCup ? t('matchTabs.bracket') : t('matchTabs.standings');
  // Keep callback for safety (covers leagues not yet tagged as isCup in config)
  const handleCupDetected = useCallback(() => { /* label already correct */ }, []);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'previa',        label: isScheduled ? t('matchTabs.preview') : isLive ? t('matchTabs.live') : t('matchTabs.summary') },
    { key: 'alineacion',   label: t('matchTabs.lineup') },
    { key: 'estadisticas', label: t('matchTabs.stats') },
    { key: 'tabla',        label: tablaLabel },
    { key: 'noticias',     label: t('matchTabs.news') },
  ];
  const [activeTab, setActiveTab] = useState<Tab>('previa');

  // ── Scrollable tab indicator ───────────────────────────────────────────────
  const screenWidth  = Dimensions.get('window').width;
  const INDICATOR_W  = 28;
  const indicatorX   = useRef(new Animated.Value(0)).current;
  const tabScrollRef = useRef<ScrollView>(null);
  // Measured positions for each tab (set via onLayout)
  const tabPositions = useRef<Array<{ x: number; width: number }>>([]);

  const handleTabSwitch = useCallback((key: Tab, idx: number) => {
    haptics.selection();
    setActiveTab(key);
    const pos = tabPositions.current[idx];
    if (pos) {
      // Slide indicator to center of this tab
      Animated.spring(indicatorX, {
        toValue: pos.x + (pos.width - INDICATOR_W) / 2,
        useNativeDriver: true,
        speed: 22,
        bounciness: 5,
      }).start();
      // Auto-scroll the tab bar so the active tab is centered
      tabScrollRef.current?.scrollTo({
        x: Math.max(0, pos.x - screenWidth / 2 + pos.width / 2),
        animated: true,
      });
    }
  }, [indicatorX, screenWidth]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Modo Estadio toast ─────────────────────────────────────────────────────
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toastActivating, setToastActivating] = useState(true);

  const showEstadioToast = useCallback((activating: boolean) => {
    setToastActivating(activating);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.delay(3000),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
    toastTimer.current = setTimeout(() => {}, 3600);
  }, [toastOpacity]);

  const handleToggleEstadio = useCallback(() => {
    haptics.medium();
    toggleMatchEstadio(match.id);          // always flip set membership
    showEstadioToast(!matchEstadioActive); // toast = what the NEW state will be
  }, [match.id, toggleMatchEstadio, matchEstadioActive, showEstadioToast]);

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

  // ── Scorers summary (goals only, grouped by player) ───────────────────────
  const scorerLines = useMemo(() => {
    if (isScheduled) return { home: [], away: [] };
    const goals = (detail?.events ?? [])
      .filter(e => e.type === 'goal' || e.type === 'own-goal' || e.type === 'penalty-goal')
      .sort((a, b) => a.minute - b.minute);

    // "Guillermo Martínez Ayala" → "Martínez"
    const firstLastName = (name: string) => {
      const parts = name.trim().split(/\s+/);
      return parts.length >= 2 ? parts[1] : parts[0];
    };

    const build = (side: 'home' | 'away') => {
      const sideGoals = goals.filter(g => g.team === side);
      const byPlayer = new Map<string, number[]>();
      for (const g of sideGoals) {
        if (!byPlayer.has(g.player)) byPlayer.set(g.player, []);
        byPlayer.get(g.player)!.push(g.minute);
      }
      const seen = new Set<string>();
      return sideGoals.reduce<string[]>((acc, g) => {
        if (seen.has(g.player)) return acc;
        seen.add(g.player);
        const mins = byPlayer.get(g.player)!.map(m => `${m}'`).join(', ');
        const suffix = g.type === 'own-goal' ? ' (pp)' : '';
        acc.push(`${firstLastName(g.player)}${suffix} ${mins}`);
        return acc;
      }, []);
    };

    return { home: build('home'), away: build('away') };
  }, [detail?.events, isScheduled]);

  const hasScorers = scorerLines.home.length > 0 || scorerLines.away.length > 0;

  // ── Header colors ──────────────────────────────────────────────────────────
  const headerBg       = c.bg;
  const hText          = isDark ? '#fff' : '#111827';
  const hTextSoft      = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(17,24,39,0.5)';
  const hTextMuted     = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(17,24,39,0.25)';
  const hBtnBg         = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)';
  const hCapsuleBg     = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';

  // ── Display values — use liveMatch (API-fresh) when available ─────────────
  const displayTime = formatMatchTime(displayMatch.time, timeFormat);
  const displayDate = (() => {
    // Format "YYYY-MM-DD" → "Jue, 21 abr" using i18n locale arrays
    const [y, m, d] = displayMatch.date.split('-').map(Number);
    if (!y || !m || !d) return displayMatch.date;
    const dt = new Date(y, m - 1, d);
    const daysShort   = t('dates.daysShort',   { returnObjects: true }) as string[];
    const monthsShort = t('dates.monthsShort', { returnObjects: true }) as string[];
    const dayName  = daysShort[dt.getDay()];
    const monthStr = monthsShort[m - 1];
    return `${dayName} ${d} ${monthStr}`;
  })();
  const compactScoreText = isScheduled ? displayTime : `${displayMatch.homeScore} - ${displayMatch.awayScore}`;

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
              leagueLogo: `https://cdn.sportmonks.com/images/soccer/leagues/${match.leagueId}.png`,
            })}
          >
            <Text style={[scr.navLeague, { color: hText }]} numberOfLines={1}>
              <Text style={[scr.navLeagueBold, { color: hText }]}>{match.league}</Text>
              {'  '}
              <Text style={[scr.navRound, { color: hTextSoft }]}>·  {t('matches.matchday')}</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={[scr.navBtn, { backgroundColor: hBtnBg }]} activeOpacity={0.7}>
            <BellIcon size={18} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              scr.navBtn,
              matchEstadioActive && { backgroundColor: 'rgba(0,224,150,0.18)', borderWidth: 1, borderColor: 'rgba(0,224,150,0.35)' },
              !matchEstadioActive && { backgroundColor: hBtnBg },
            ]}
            onPress={handleToggleEstadio}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 15, opacity: matchEstadioActive ? 1 : 0.5 }}>🏟️</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[scr.navBtn, { backgroundColor: hBtnBg }]} activeOpacity={0.7}>
            <ShareIcon color={hText} size={16} />
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
                  {displayMatch.stateLabel === 'HT'
                    ? t('matchStatus.halfTimeLong')
                    : `EN VIVO · ${liveClock ?? `${displayMatch.minute ?? displayMatch.time}'`}`}
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
                  <>
                    <Text style={[scr.vsText, { color: hTextMuted }]}>{t('common.vs')}</Text>
                    {/* Compact countdown below VS */}
                    {countdown && !countdown.isPast && (
                      <View style={scr.countdownWrap}>
                        {countdown.isImminent ? (
                          <Text style={[scr.countdownImminent, { color: c.emerald }]}>
                            ¡Por comenzar!
                          </Text>
                        ) : countdown.showCountdown ? (
                          <Text style={[scr.countdownText, { color: c.emerald }]}>
                            {String(countdown.hours).padStart(2,'0')}:{String(countdown.minutes).padStart(2,'0')}:{String(countdown.seconds).padStart(2,'0')}
                          </Text>
                        ) : (
                          <Text style={[scr.countdownDays, { color: hTextSoft }]}>
                            {countdown.days}d {String(countdown.hours).padStart(2,'0')}h
                          </Text>
                        )}
                      </View>
                    )}
                  </>
                ) : (
                  <>
                    <View style={scr.scoreRow}>
                      <Text style={[scr.score, { color: hText }]}>{displayMatch.homeScore}</Text>
                      <Text style={[scr.scoreDash, { color: hTextMuted }]}>–</Text>
                      <Text style={[scr.score, { color: hText }]}>{displayMatch.awayScore}</Text>
                    </View>
                    {detail?.aggregateScore && (
                      <Text style={[scr.aggregateLabel, { color: hTextSoft }]}>
                        ({detail.aggregateScore.home}-{detail.aggregateScore.away} {t('matches.aggregateAbbr')})
                      </Text>
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

            {/* ── Scorers summary ── */}
            {hasScorers && (
              <View style={scr.scorersRow}>
                <View style={scr.scorersSide}>
                  {scorerLines.home.map((line, i) => (
                    <Text key={i} style={[scr.scorerLine, { color: hTextSoft, textAlign: 'right' }]} numberOfLines={1}>{line}</Text>
                  ))}
                </View>
                <Text style={scr.scorersBall}>⚽</Text>
                <View style={scr.scorersSide}>
                  {scorerLines.away.map((line, i) => (
                    <Text key={i} style={[scr.scorerLine, { color: hTextSoft, textAlign: 'left' }]} numberOfLines={1}>{line}</Text>
                  ))}
                </View>
              </View>
            )}
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
              {isLive
                ? displayMatch.stateLabel === 'HT'
                  ? t('matchStatus.halfTimeLong')
                  : liveClock ?? `${displayMatch.minute ?? displayMatch.time}'`
                : isFinished
                ? 'Finalizado'
                : displayDate}
            </Text>
          </Animated.View>
        </Animated.View>

        {/* ── Tab bar — horizontal scroll with sliding underline ── */}
        <View style={[scr.tabBarWrap, { backgroundColor: c.bg, borderBottomColor: c.border }]}>
          <ScrollView
            ref={tabScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={scr.tabBarContent}
          >
            {TABS.map((t, idx) => {
              const active = activeTab === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  style={scr.tabBtn}
                  onPress={() => handleTabSwitch(t.key, idx)}
                  onLayout={(e) => {
                    tabPositions.current[idx] = {
                      x: e.nativeEvent.layout.x,
                      width: e.nativeEvent.layout.width,
                    };
                    // Position indicator under the default active tab (index 0)
                    if (idx === 0) {
                      indicatorX.setValue(
                        e.nativeEvent.layout.x + (e.nativeEvent.layout.width - INDICATOR_W) / 2,
                      );
                    }
                  }}
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
            {/* Sliding underline — inside ScrollView so it scrolls with tabs */}
            <Animated.View style={[
              scr.tabIndicator,
              { backgroundColor: c.accent, transform: [{ translateX: indicatorX }] },
            ]} />
          </ScrollView>
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
              <Text style={[scr.emptyText, { color: c.textSecondary }]}>{t('matches.detailUnavailable')}</Text>
            </View>
          )
        ) : (
          <>
            {activeTab === 'previa' && isScheduled && <PreviewTab    match={match} detail={detail} />}
            {activeTab === 'previa' && !isScheduled && <EnVivoTab     match={match} detail={detail} />}
            {activeTab === 'alineacion'   && <AlineacionTab    match={match} detail={detail} />}
            {activeTab === 'estadisticas' && <EstadisticasTab  match={match} detail={detail} />}
            {activeTab === 'tabla'        && <TablaTab         match={displayMatch} detail={detail} onCupDetected={handleCupDetected} />}
            {activeTab === 'noticias'     && <NoticiasTab      match={match} detail={detail} />}
          </>
        )}
      </Animated.ScrollView>

      {/* ── Modo Estadio toast ── */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute', bottom: 24, left: 20, right: 20,
          opacity: toastOpacity,
          backgroundColor: isDark ? 'rgba(20,20,20,0.96)' : 'rgba(30,30,30,0.94)',
          borderRadius: 16,
          paddingVertical: 12, paddingHorizontal: 16,
          flexDirection: 'row', alignItems: 'center', gap: 12,
          borderWidth: 1,
          borderColor: toastActivating ? 'rgba(0,224,150,0.35)' : 'rgba(255,255,255,0.08)',
          shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
        }}
      >
        <Text style={{ fontSize: 22 }}>🏟️</Text>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: toastActivating ? '#00E096' : '#fff' }}>
          {toastActivating
            ? t('estadioMode.toastActivated', { delay: prefs.estadioDelay })
            : t('estadioMode.toastDeactivated')}
        </Text>
      </Animated.View>

      {/* ── "Volver arriba" FAB ── */}
      {showScrollTop && (
        <TouchableOpacity
          style={[scr.scrollTopBtn, { backgroundColor: c.accent }]}
          onPress={scrollToTop}
          activeOpacity={0.85}
        >
          <UpChevron color="#fff" />
          <Text style={scr.scrollTopText}>{t('matches.scrollToTop')}</Text>
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
  countdownWrap: { alignItems: 'center', marginTop: 4 },
  countdownText: { fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  countdownImminent: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  countdownDays: { fontSize: 12, fontWeight: '600', opacity: 0.7 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  score: { fontSize: 36, fontWeight: '900', color: '#fff', lineHeight: 42 },
  scoreDash: { fontSize: 22, fontWeight: '300', color: 'rgba(255,255,255,0.4)', lineHeight: 42 },
  aggregateLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.6)', marginTop: 2, letterSpacing: 0.3 },

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

  // Tab bar — scrollable
  tabBarWrap: {
    borderBottomWidth: 1,
  },
  tabBarContent: {
    flexDirection: 'row' as const,
  },
  tabBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center' as const,
  },
  tabText: { fontSize: 13, fontWeight: '600' },
  tabIndicator: {
    position: 'absolute' as const,
    bottom: -1,
    width: 28,
    height: 2.5,
    borderRadius: 1.25,
  },

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

  // Scorers summary row
  scorersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 8,
    gap: 8,
  },
  scorersSide: {
    flex: 1,
  },
  scorersBall: {
    fontSize: 13,
  },
  scorerLine: {
    fontSize: 10,
    fontWeight: '500',
    lineHeight: 15,
  },
});
