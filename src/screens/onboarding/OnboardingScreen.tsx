// ── Onboarding Flow (10 screens) ─────────────────────────────────────────────
// Screen 1:  Welcome
// Screen 2:  Fan Level
// Screen 3:  Teams
// Screen 4:  Players
// Screen 5:  Leagues
// Screen 6:  Feed Preview (AHA moment)
// Screen 7:  Notifications
// Screen 8:  Name + Auth
// Screen 9:  Personalizing (auto-advances, applies side effects)
// Screen 10: Welcome Final (confetti)

import React, {
  useState, useRef, useCallback, useEffect, useMemo,
} from 'react';
import {
  View, Text, StyleSheet, Animated, TouchableOpacity, FlatList, ScrollView,
  TextInput, Image, ImageBackground, Dimensions, Platform, ActivityIndicator,
  Easing, KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { useDarkMode } from '../../contexts/DarkModeContext';
import { useFavorites } from '../../contexts/FavoritesContext';
import { useAuth } from '../../contexts/AuthContext';
import { useNotificationPrefs } from '../../contexts/NotificationPrefsContext';
import { getSearchableTeams, getSearchableLeagues, getSearchablePlayers } from '../../services/sportsApi';
import { normalize } from '../../utils/normalize';
import { requestPermissionsAndGetToken } from '../../services/notifications';
import type { SearchableTeam, SearchableLeague, SearchablePlayer } from '../../services/sportsApi';
import type { AuthMethod } from '../../contexts/AuthContext';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Design tokens ─────────────────────────────────────────────────────────────
// BLUE and GOLD are accent colors — same in both light and dark modes.
const BLUE = '#2E7CF6';
const GOLD = '#F5B800';

// ── Theme-aware hook (reads DarkModeContext — single source of truth) ─────────
// BLUE (#2E7CF6) and GOLD (#F5B800) are accent colors — same in both modes.
type OBTheme = {
  BG: string;
  SURFACE: string;
  TEXT_PRIMARY: string;
  TEXT_DIM: string;
  SUB_TEXT: string;
  BORDER: string;
  INPUT_BG: string;
  BLUE_DIM: string;
  GOLD_DIM: string;
  DOT_INACTIVE: string;
  SHADOW: object;
  isDark: boolean;
};

function useOBTheme(): OBTheme {
  const { isDark } = useDarkMode();
  return {
    BG:           isDark ? '#0A0A0A'                : '#F9FAFB',
    SURFACE:      isDark ? '#141414'                : '#FFFFFF',
    TEXT_PRIMARY: isDark ? '#FFFFFF'                : '#111827',
    TEXT_DIM:     isDark ? '#8A8A8A'                : '#6B7280',
    SUB_TEXT:     isDark ? '#D4D4D4'                : '#374151',
    BORDER:       isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB',
    INPUT_BG:     isDark ? '#1A1A1A'                : '#F3F4F6',
    BLUE_DIM:     isDark ? 'rgba(46,124,246,0.15)'  : 'rgba(46,124,246,0.10)',
    GOLD_DIM:     isDark ? 'rgba(245,184,0,0.15)'   : 'rgba(245,184,0,0.10)',
    DOT_INACTIVE: isDark ? '#2A2A2A'                : '#D1D5DB',
    SHADOW:       isDark ? {} : {
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
    },
    isDark,
  };
}

// ── Layout ────────────────────────────────────────────────────────────────────
const SIDE_PAD = 20;
const CARD_GAP = 10;
const CARD_W   = (SCREEN_W - SIDE_PAD * 2 - CARD_GAP * 2) / 3;

// ── Static fallbacks ──────────────────────────────────────────────────────────
const FALLBACK_TEAMS: SearchableTeam[] = [
  { id: 2687,  name: 'América',          shortName: 'AME', logo: 'https://cdn.sportmonks.com/images/soccer/teams/31/2687.png',   leagueName: 'Liga MX',        leagueId: 743 },
  { id: 427,   name: 'Guadalajara',      shortName: 'GUA', logo: 'https://cdn.sportmonks.com/images/soccer/teams/11/427.png',    leagueName: 'Liga MX',        leagueId: 743 },
  { id: 2626,  name: 'Cruz Azul',        shortName: 'CAZ', logo: 'https://cdn.sportmonks.com/images/soccer/teams/2/2626.png',    leagueName: 'Liga MX',        leagueId: 743 },
  { id: 609,   name: 'Tigres UANL',      shortName: 'TUA', logo: 'https://cdn.sportmonks.com/images/soccer/teams/1/609.png',     leagueName: 'Liga MX',        leagueId: 743 },
  { id: 2662,  name: 'Monterrey',        shortName: 'MNT', logo: 'https://cdn.sportmonks.com/images/soccer/teams/6/2662.png',    leagueName: 'Liga MX',        leagueId: 743 },
  { id: 2989,  name: 'Pumas UNAM',       shortName: 'PUM', logo: 'https://cdn.sportmonks.com/images/soccer/teams/13/2989.png',   leagueName: 'Liga MX',        leagueId: 743 },
  { id: 53,    name: 'Real Madrid',      shortName: 'RMA', logo: 'https://cdn.sportmonks.com/images/soccer/teams/21/53.png',     leagueName: 'La Liga',        leagueId: 564 },
  { id: 83,    name: 'Barcelona',        shortName: 'BAR', logo: 'https://cdn.sportmonks.com/images/soccer/teams/19/83.png',     leagueName: 'La Liga',        leagueId: 564 },
  { id: 1044,  name: 'Manchester City',  shortName: 'MCI', logo: 'https://cdn.sportmonks.com/images/soccer/teams/4/1044.png',    leagueName: 'Premier League', leagueId: 8 },
  { id: 42,    name: 'Arsenal',          shortName: 'ARS', logo: 'https://cdn.sportmonks.com/images/soccer/teams/10/42.png',     leagueName: 'Premier League', leagueId: 8 },
  { id: 496,   name: 'Liverpool',        shortName: 'LIV', logo: 'https://cdn.sportmonks.com/images/soccer/teams/8/496.png',     leagueName: 'Premier League', leagueId: 8 },
];

const FALLBACK_LEAGUES: SearchableLeague[] = [
  { id: 743,  name: 'Liga MX',           country: 'México',    flag: '🇲🇽', image: 'https://cdn.sportmonks.com/images/soccer/leagues/743.png' },
  { id: 564,  name: 'La Liga',           country: 'España',    flag: '🇪🇸', image: 'https://cdn.sportmonks.com/images/soccer/leagues/564.png' },
  { id: 8,    name: 'Premier League',    country: 'Inglaterra', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', image: 'https://cdn.sportmonks.com/images/soccer/leagues/8.png' },
  { id: 2,    name: 'Champions League',  country: 'UEFA',       flag: '⭐', image: 'https://cdn.sportmonks.com/images/soccer/leagues/2.png' },
  { id: 82,   name: 'Bundesliga',        country: 'Alemania',   flag: '🇩🇪', image: 'https://cdn.sportmonks.com/images/soccer/leagues/82.png' },
  { id: 384,  name: 'Serie A',           country: 'Italia',     flag: '🇮🇹', image: 'https://cdn.sportmonks.com/images/soccer/leagues/384.png' },
  { id: 325,  name: 'Brasileirão',       country: 'Brasil',     flag: '🇧🇷', image: 'https://cdn.sportmonks.com/images/soccer/leagues/325.png' },
  { id: 155,  name: 'Liga Argentina',    country: 'Argentina',  flag: '🇦🇷', image: 'https://cdn.sportmonks.com/images/soccer/leagues/155.png' },
];

const FALLBACK_PLAYERS: SearchablePlayer[] = [
  { id: 198756, name: 'Henry Martín',    position: 'Delantero',     teamName: 'América' },
  { id: 220665, name: 'Vinícius Jr',     position: 'Delantero',     teamName: 'Real Madrid' },
  { id: 229533, name: 'Jude Bellingham', position: 'Mediocampista', teamName: 'Real Madrid' },
  { id: 950020, name: 'Lamine Yamal',    position: 'Delantero',     teamName: 'Barcelona' },
  { id: 2371,   name: 'Robert Lewandowski', position: 'Delantero',  teamName: 'Barcelona' },
  { id: 163626, name: 'Lionel Messi',    position: 'Delantero',     teamName: 'Inter Miami' },
  { id: 219028, name: 'Erling Haaland',  position: 'Delantero',     teamName: 'Manchester City' },
  { id: 216528, name: 'Kylian Mbappé',   position: 'Delantero',     teamName: 'Real Madrid' },
];

// ── Team IDs for suggestion logic ─────────────────────────────────────────────
const MX_TEAM_IDS = new Set([2687, 427, 2626, 609, 2662, 2989, 2844, 967, 10036, 680]);
const EU_TEAM_IDS = new Set([53, 83, 1044, 42, 496]);

// ── State shape ───────────────────────────────────────────────────────────────
type FanLevel = 'casual' | 'fan' | 'analista';

type NotifKey = 'goals' | 'kickoff' | 'results' | 'lineups' | 'transfers' | 'news';

type OnboardingState = {
  fanLevel: FanLevel | null;
  teamIds: number[];
  playerIds: number[];
  leagueIds: number[];
  notifications: Record<NotifKey, boolean>;
  name: string;
  authMethod: AuthMethod | null;
};

const DEFAULT_NOTIFS_BY_LEVEL: Record<FanLevel, Record<NotifKey, boolean>> = {
  casual:   { goals: false, kickoff: false, results: true,  lineups: true,  transfers: false, news: false },
  fan:      { goals: true,  kickoff: true,  results: true,  lineups: true,  transfers: false, news: false },
  analista: { goals: true,  kickoff: true,  results: true,  lineups: true,  transfers: true,  news: true  },
};

// ── Sub-components ────────────────────────────────────────────────────────────

// Progress dots (screens 2-7, dot index 0-4)
const ProgressDots: React.FC<{ active: number; total?: number }> = ({ active, total = 5 }) => {
  const th = useOBTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
      {Array.from({ length: total }).map((_, i) => {
        const isActive = i === active;
        const isDone   = i < active;
        return (
          <Animated.View
            key={i}
            style={{
              width: isActive ? 22 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: (isActive || isDone) ? BLUE : th.DOT_INACTIVE,
            }}
          />
        );
      })}
    </View>
  );
};

// Top bar (back + dots + optional skip)
const TopBar: React.FC<{
  dotIndex: number;
  onBack: () => void;
  onSkip?: () => void;
  skipLabel?: string;
}> = ({ dotIndex, onBack, onSkip, skipLabel }) => {
  const insets = useSafeAreaInsets();
  const th = useOBTheme();
  return (
    <View style={[tb.row, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity onPress={onBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={tb.backBtn}>
        <View style={[tb.arrow, { borderColor: th.TEXT_PRIMARY }]} />
      </TouchableOpacity>
      <ProgressDots active={dotIndex} />
      {onSkip ? (
        <TouchableOpacity onPress={onSkip} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}>
          <Text style={[tb.skip, { color: th.TEXT_DIM }]}>{skipLabel ?? ''}</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ width: 48 }} />
      )}
    </View>
  );
};

const tb = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SIDE_PAD, paddingBottom: 8,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  arrow: {
    width: 10, height: 10,
    borderLeftWidth: 2.5, borderBottomWidth: 2.5,
    transform: [{ rotate: '45deg' }],
  },
  skip: { fontSize: 14, fontWeight: '500', minWidth: 48, textAlign: 'right' },
});

// Blue CTA button
const CTAButton: React.FC<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  glow?: boolean;
}> = ({ label, onPress, disabled, glow }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.85}
    style={[
      cta.btn,
      disabled && { opacity: 0.4 },
      glow && { shadowColor: BLUE, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.55, shadowRadius: 14, elevation: 10 },
    ]}
  >
    <Text style={cta.label}>{label}</Text>
  </TouchableOpacity>
);

const cta = StyleSheet.create({
  btn: {
    backgroundColor: BLUE, borderRadius: 16, paddingVertical: 18,
    alignItems: 'center', justifyContent: 'center', marginHorizontal: SIDE_PAD,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8 },
      android: { elevation: 6 },
    }),
  },
  label: { fontSize: 17, fontWeight: '900', color: '#FFFFFF', letterSpacing: 1 },
});

// Custom Toggle
const CustomToggle: React.FC<{ value: boolean; onToggle: () => void }> = ({ value, onToggle }) => {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: value ? 1 : 0, useNativeDriver: true, friction: 8, tension: 50 }).start();
  }, [value, anim]);
  const thumbX = anim.interpolate({ inputRange: [0, 1], outputRange: [2, 18] });
  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.8} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <View style={[tog.track, { backgroundColor: value ? BLUE : 'rgba(128,128,128,0.25)' }]}>
        <Animated.View style={[tog.thumb, { transform: [{ translateX: thumbX }] }]} />
      </View>
    </TouchableOpacity>
  );
};

const tog = StyleSheet.create({
  track: { width: 46, height: 28, borderRadius: 14, justifyContent: 'center', overflow: 'hidden' },
  thumb: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3 },
      android: { elevation: 3 },
    }),
  },
});

// "South Korea" → "southKorea"  |  "England" → "england"
const toCountryKey = (country: string) =>
  country.trim().split(/\s+/).map((w, i) => i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()).join('');

// SmartLogo
const SmartLogo: React.FC<{ uri: string; size?: number; round?: boolean; fallback?: string }> = ({ uri, size = 40, round, fallback }) => {
  const [failed, setFailed] = useState(false);
  if (uri && uri.startsWith('http') && !failed) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: round ? size / 2 : 4 }}
        resizeMode="contain"
        onError={() => setFailed(true)}
      />
    );
  }
  const display = failed ? (fallback ?? '⚽') : (uri || '⚽');
  return <Text style={{ fontSize: size * 0.65 }}>{display}</Text>;
};

// Checkmark icon
const CheckIcon: React.FC<{ size?: number; color?: string }> = ({ size = 14, color = '#FFFFFF' }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{
      width: size * 0.35, height: size * 0.65,
      borderRightWidth: 2, borderBottomWidth: 2, borderColor: color,
      transform: [{ rotate: '45deg' }, { translateY: -1 }],
    }} />
  </View>
);

// Analistas logo (shield) — tintColor lets us reuse the white asset for any color
const LOGO_SRC = require('../../../assets/logo-white.png');
const AnalistasLogo: React.FC<{ size?: number; tint?: string }> = ({ size = 44, tint = '#FFFFFF' }) => (
  <Image source={LOGO_SRC} style={{ width: size, height: size, tintColor: tint }} resizeMode="contain" />
);

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN 1 — Welcome
// ─────────────────────────────────────────────────────────────────────────────
const Screen1Welcome: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const th = useOBTheme();
  const bgImage = th.isDark
    ? require('../../../assets/DarkModeAnalistas.png')
    : require('../../../assets/LightModeAnalistas.png');

  const logoOpacity  = useRef(new Animated.Value(0)).current;
  const logoY        = useRef(new Animated.Value(-10)).current;
  const orbScale1    = useRef(new Animated.Value(0.5)).current;
  const orbScale2    = useRef(new Animated.Value(0.4)).current;
  const iconOpacity  = useRef(new Animated.Value(0)).current;
  const iconScale    = useRef(new Animated.Value(0.3)).current;
  const floatY       = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleY       = useRef(new Animated.Value(20)).current;
  const subOpacity   = useRef(new Animated.Value(0)).current;
  const subY         = useRef(new Animated.Value(15)).current;
  const pillOpacity  = useRef(new Animated.Value(0)).current;
  const btnOpacity   = useRef(new Animated.Value(0)).current;
  const btnY         = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(logoY, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(orbScale1, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(orbScale2, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    setTimeout(() => {
      Animated.parallel([
        Animated.spring(iconScale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 40 }),
        Animated.timing(iconOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
    }, 200);

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(titleY, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }, 700);

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(subOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(subY, { toValue: 0, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }, 1100);

    setTimeout(() => {
      Animated.timing(pillOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }, 1450);

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(btnOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(btnY, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }, 1750);

    Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: -8, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(floatY, { toValue: 0,  duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  return (
    <ImageBackground source={bgImage} resizeMode="cover" style={{ flex: 1 }}>
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.50)', 'rgba(0,0,0,0.85)']}
        locations={[0, 0.45, 1]}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' }}
        pointerEvents="none"
      />
    <View style={[s1.container, { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: 'transparent' }]}>
      {/* Logo centered in stands area */}
      <Animated.View style={[s1.logoWrap, { opacity: logoOpacity, transform: [{ translateY: Animated.add(logoY, floatY) }], top: insets.top + 24 }]}>
        <View style={[s1.logoBadge, {
          backgroundColor: th.isDark ? 'rgba(0,0,0,0.40)' : '#FFFFFF',
          ...(th.isDark ? {} : { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 }),
        }]}>
          <AnalistasLogo size={56} tint={th.isDark ? '#FFFFFF' : '#2E7CF6'} />
        </View>
      </Animated.View>

      {/* Title */}
      <Animated.View style={{ opacity: titleOpacity, transform: [{ translateY: titleY }], alignItems: 'center' }}>
        <Text style={[s1.title, { color: '#FFFFFF' }]}>{t('onboarding.welcomeTitle')}</Text>
        <Text style={[s1.subtitle, { color: 'rgba(255,255,255,0.88)' }]}>{t('onboarding.welcomeSubtitle')}</Text>
      </Animated.View>

      {/* Pill */}
      <Animated.View style={[s1.pill, { opacity: pillOpacity, backgroundColor: th.BLUE_DIM }]}>
        <Text style={s1.pillText}>⏱ {t('onboarding.welcomePill')}</Text>
      </Animated.View>

      {/* CTA */}
      <Animated.View style={{ opacity: btnOpacity, transform: [{ translateY: btnY }], width: '100%' }}>
        <CTAButton label={t('onboarding.start')} onPress={onNext} />
      </Animated.View>
    </View>
    </ImageBackground>
  );
};

const s1 = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center', justifyContent: 'flex-end',
    paddingHorizontal: SIDE_PAD, gap: 20,
    paddingBottom: 32,
  },
  orb1: {
    position: 'absolute', width: 280, height: 280, borderRadius: 140,
    backgroundColor: 'rgba(46,124,246,0.08)', top: -60, right: -80,
  },
  orb2: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(46,124,246,0.05)', bottom: 80, left: -60,
  },
  logoWrap: {
    position: 'absolute', left: 0, right: 0,
    alignItems: 'center',
  },
  logoBadge: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(0,0,0,0.40)',
    alignItems: 'center', justifyContent: 'center',
  },
  logoText: { fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  illWrap: {
    width: 220, height: 220, borderRadius: 110,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  ring: {
    width: 180, height: 180, borderRadius: 90,
    borderWidth: 2, borderColor: 'rgba(46,124,246,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  innerCircle: {
    width: 90, height: 90, borderRadius: 45,
    alignItems: 'center', justifyContent: 'center',
  },
  ballEmoji: { fontSize: 44 },
  title: { fontSize: 68, fontWeight: '900', textTransform: 'uppercase', letterSpacing: -1, textAlign: 'center' },
  subtitle: { fontSize: 26, fontWeight: '600', textAlign: 'center', marginTop: 4 },
  pill: {
    borderRadius: 24,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  pillText: { fontSize: 14, fontWeight: '700', color: BLUE },
});

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN 2 — Fan Level
// ─────────────────────────────────────────────────────────────────────────────
const Screen2FanLevel: React.FC<{
  selected: FanLevel | null;
  onSelect: (l: FanLevel) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}> = ({ selected, onSelect, onNext, onBack, onSkip }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const th = useOBTheme();

  const options: { key: FanLevel; icon: string; title: string; sub: string }[] = [
    { key: 'casual',   icon: '🙂', title: t('onboarding.casual'),   sub: t('onboarding.casualSub') },
    { key: 'fan',      icon: '⚽', title: t('onboarding.fan'),      sub: t('onboarding.fanSub') },
    { key: 'analista', icon: '🔥', title: t('onboarding.analista'), sub: t('onboarding.analistaSub') },
  ];

  return (
    <View style={[base.screen, { paddingBottom: insets.bottom + 16, backgroundColor: th.BG }]}>
      <TopBar dotIndex={0} onBack={onBack} onSkip={onSkip} skipLabel={t('onboarding.skip')} />

      <ScrollView contentContainerStyle={base.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[base.headline, { color: th.TEXT_PRIMARY }]}>{t('onboarding.fanLevelTitle')}</Text>
        <Text style={[base.sub, { color: th.TEXT_DIM }]}>{t('onboarding.fanLevelSub')}</Text>

        <View style={{ gap: 12, marginTop: 24 }}>
          {options.map(opt => {
            const isSelected = selected === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                onPress={() => { Haptics.selectionAsync(); onSelect(opt.key); }}
                activeOpacity={0.85}
              >
                <View style={[s2.card, { backgroundColor: th.SURFACE, borderColor: th.isDark ? '#222' : '#E5E7EB' }, isSelected && { backgroundColor: th.BLUE_DIM, borderColor: BLUE }]}>
                  <View style={[s2.iconBox, { backgroundColor: th.isDark ? '#1E1E1E' : '#F3F4F6' }, isSelected && { backgroundColor: th.BLUE_DIM }]}>
                    <Text style={{ fontSize: 24 }}>{opt.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s2.cardTitle, { color: th.TEXT_PRIMARY }, isSelected && { color: BLUE }]}>{opt.title}</Text>
                    <Text style={[s2.cardSub, { color: th.TEXT_DIM }]}>{opt.sub}</Text>
                  </View>
                  {/* Radio */}
                  <View style={[s2.radio, { borderColor: th.isDark ? '#444' : '#D1D5DB' }, isSelected && { borderColor: BLUE }]}>
                    {isSelected && <View style={s2.radioDot} />}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <CTAButton label={t('onboarding.continue')} onPress={onNext} disabled={!selected} />
    </View>
  );
};

const s2 = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 16, borderWidth: 1.5,
    padding: 16,
  },
  iconBox: {
    width: 48, height: 48, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: 22, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardSub: { fontSize: 13, marginTop: 2 },
  radio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: BLUE },
});

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN 3 — Teams
// ─────────────────────────────────────────────────────────────────────────────
const TeamCard: React.FC<{
  team: SearchableTeam;
  selected: boolean;
  onToggle: () => void;
}> = React.memo(({ team, selected, onToggle }) => {
  const th = useOBTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4, tension: 100 }),
    ]).start();
    Haptics.selectionAsync();
    onToggle();
  };
  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.85} style={{ width: CARD_W, marginBottom: CARD_GAP }}>
      <Animated.View style={[s3.card, { backgroundColor: th.SURFACE, borderColor: th.isDark ? '#222' : '#E5E7EB' }, selected && { backgroundColor: th.BLUE_DIM, borderColor: BLUE }, { transform: [{ scale }] }]}>
        <SmartLogo uri={team.logo} size={38} />
        <Text style={[s3.name, { color: th.TEXT_PRIMARY }, selected && { color: BLUE }]} numberOfLines={1}>{team.shortName}</Text>
        {selected && <View style={s3.check}><CheckIcon size={10} /></View>}
      </Animated.View>
    </TouchableOpacity>
  );
});

const s3 = StyleSheet.create({
  card: {
    height: CARD_W * 1.05, borderRadius: 14, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', gap: 8, padding: 8,
  },
  name: { fontSize: 11, fontWeight: '700', textAlign: 'center', letterSpacing: 0.2 },
  check: {
    position: 'absolute', top: 6, right: 6,
    width: 20, height: 20, borderRadius: 10, backgroundColor: BLUE,
    alignItems: 'center', justifyContent: 'center',
  },
});

const Screen3Teams: React.FC<{
  teams: SearchableTeam[];
  loading: boolean;
  selectedIds: number[];
  onToggle: (id: number) => void;
  fanLevel: FanLevel | null;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}> = ({ teams, loading, selectedIds, onToggle, fanLevel, onNext, onBack, onSkip }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const th = useOBTheme();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return teams;
    const q = normalize(query);
    return teams.filter(t2 => normalize(t2.name).includes(q) || normalize(t2.shortName).includes(q));
  }, [teams, query]);

  const renderItem = useCallback(({ item }: { item: SearchableTeam }) => (
    <TeamCard
      team={item}
      selected={selectedIds.includes(item.id)}
      onToggle={() => onToggle(item.id)}
    />
  ), [selectedIds, onToggle]);

  const headline = fanLevel === 'casual' ? t('onboarding.teamsTitleCasual') : t('onboarding.teamsTitle');
  const countLabel = t('onboarding.teamsSelected', { count: selectedIds.length });

  return (
    <View style={[base.screen, { paddingBottom: insets.bottom + 16, backgroundColor: th.BG }]}>
      <TopBar dotIndex={1} onBack={onBack} onSkip={onSkip} skipLabel={t('onboarding.skip')} />

      <View style={{ flex: 1, paddingHorizontal: SIDE_PAD }}>
        <Text style={[base.headline, { color: th.TEXT_PRIMARY }]}>{headline}</Text>
        <Text style={[base.sub, { color: th.TEXT_DIM }]}>{t('onboarding.teamsSub')}</Text>

        {/* Search */}
        <View style={[searchS.wrap, { backgroundColor: th.SURFACE, borderColor: th.isDark ? '#333' : '#E5E7EB' }]}>
          <Text style={{ fontSize: 14, opacity: 0.5 }}>🔍</Text>
          <TextInput
            style={[searchS.input, { color: th.TEXT_PRIMARY }]}
            placeholder={t('onboarding.searchTeam')}
            placeholderTextColor={th.TEXT_DIM}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 14, color: th.TEXT_DIM }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {selectedIds.length > 0 && (
          <Text style={[base.counter, { color: BLUE, marginBottom: 10 }]}>{countLabel}</Text>
        )}

        {loading ? (
          <View style={base.loading}>
            <ActivityIndicator size="large" color={BLUE} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            renderItem={renderItem}
            keyExtractor={it => String(it.id)}
            numColumns={3}
            columnWrapperStyle={{ gap: CARD_GAP }}
            contentContainerStyle={{ paddingBottom: 12 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </View>

      <CTAButton
        label={selectedIds.length > 0 ? `${t('onboarding.continue')} (${selectedIds.length})` : t('onboarding.continue')}
        onPress={onNext}
        disabled={selectedIds.length === 0}
      />
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN 4 — Players
// ─────────────────────────────────────────────────────────────────────────────
const PlayerRow: React.FC<{
  player: SearchablePlayer;
  selected: boolean;
  isYourTeam: boolean;
  onToggle: () => void;
}> = React.memo(({ player, selected, isYourTeam, onToggle }) => {
  const { t } = useTranslation();
  const th = useOBTheme();
  const [imgFailed, setImgFailed] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.97, duration: 60, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4, tension: 100 }),
    ]).start();
    Haptics.selectionAsync();
    onToggle();
  };

  const parts = player.name.split(' ');
  const lastName  = parts.length > 1 ? parts[parts.length - 1] : player.name;
  const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.85}>
      <Animated.View style={[s4.row, { backgroundColor: th.SURFACE, borderColor: th.isDark ? '#222' : '#E5E7EB' }, selected && { backgroundColor: th.GOLD_DIM, borderColor: GOLD }, { transform: [{ scale }] }]}>
        {/* Avatar */}
        <View style={s4.avatar}>
          {player.image && !imgFailed ? (
            <Image
              source={{ uri: player.image }}
              style={{ width: 48, height: 48, borderRadius: 24 }}
              resizeMode="cover"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <LinearGradient colors={[GOLD, '#E68A00']} style={s4.avatarGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Text style={s4.avatarInitial}>{lastName.charAt(0)}</Text>
            </LinearGradient>
          )}
        </View>

        {/* Info */}
        <View style={{ flex: 1 }}>
          {firstName ? <Text style={[s4.firstName, { color: th.TEXT_DIM }]} numberOfLines={1}>{firstName}</Text> : null}
          <Text style={[s4.lastName, { color: th.TEXT_PRIMARY }]} numberOfLines={1}>{lastName.toUpperCase()}</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 3 }}>
            {player.position ? <View style={[s4.badge, { backgroundColor: th.isDark ? '#222' : '#F3F4F6', borderColor: th.isDark ? '#333' : '#E5E7EB' }]}><Text style={[s4.badgeText, { color: th.TEXT_DIM }]}>{player.position}</Text></View> : null}
            {isYourTeam ? <View style={[s4.badge, { backgroundColor: th.BLUE_DIM, borderColor: BLUE }]}><Text style={[s4.badgeText, { color: BLUE }]}>{t('onboarding.yourTeam')}</Text></View> : null}
          </View>
        </View>

        {/* Checkbox */}
        <View style={[s4.checkbox, { borderColor: th.isDark ? '#444' : '#D1D5DB' }, selected && { backgroundColor: GOLD, borderColor: GOLD }]}>
          {selected && <CheckIcon size={12} />}
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
});

const s4 = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1.5,
    padding: 12, marginBottom: 10,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, overflow: 'hidden' },
  avatarGradient: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 20, fontWeight: '900', color: '#FFFFFF' },
  firstName: { fontSize: 12 },
  lastName: { fontSize: 18, fontWeight: '900', letterSpacing: 0.5 },
  badge: {
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1,
  },
  badgeText: { fontSize: 10, fontWeight: '700' },
  checkbox: {
    width: 26, height: 26, borderRadius: 6, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
});

const Screen4Players: React.FC<{
  players: SearchablePlayer[];
  loading: boolean;
  selectedTeamIds: number[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  teamNames: string[];
}> = ({ players, loading, selectedTeamIds, selectedIds, onToggle, onNext, onBack, onSkip, teamNames }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const th = useOBTheme();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return players;
    const q = normalize(query);
    return players.filter(p =>
      normalize(p.name).includes(q) ||
      (p.teamName && normalize(p.teamName).includes(q)),
    );
  }, [players, query]);

  const countLabel = t('onboarding.playersSelected', { count: selectedIds.length });

  return (
    <View style={[base.screen, { paddingBottom: insets.bottom + 16, backgroundColor: th.BG }]}>
      <TopBar dotIndex={2} onBack={onBack} onSkip={onSkip} skipLabel={t('onboarding.skip')} />

      <View style={{ flex: 1, paddingHorizontal: SIDE_PAD }}>
        {/* Teams chip */}
        {teamNames.length > 0 && (
          <View style={[s4b.chip, { backgroundColor: th.BLUE_DIM }]}>
            <Text style={s4b.chipText}>⚡ Sigues a {teamNames.slice(0, 2).join(', ')}{teamNames.length > 2 ? ` +${teamNames.length - 2}` : ''}. Ahora, ¿algún jugador?</Text>
          </View>
        )}

        <Text style={[base.headline, { color: th.TEXT_PRIMARY }]}>{t('onboarding.playersTitle')}</Text>

        {/* Search */}
        <View style={[searchS.wrap, { backgroundColor: th.SURFACE, borderColor: th.isDark ? '#333' : '#E5E7EB' }]}>
          <Text style={{ fontSize: 14, opacity: 0.5 }}>🔍</Text>
          <TextInput
            style={[searchS.input, { color: th.TEXT_PRIMARY }]}
            placeholder={t('onboarding.searchPlayer')}
            placeholderTextColor={th.TEXT_DIM}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 14, color: th.TEXT_DIM }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {selectedIds.length > 0 && (
          <Text style={[base.counter, { color: GOLD, marginBottom: 10 }]}>{countLabel}</Text>
        )}

        {loading ? (
          <View style={base.loading}><ActivityIndicator size="large" color={GOLD} /></View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={it => String(it.id)}
            renderItem={({ item }) => (
              <PlayerRow
                player={item}
                selected={selectedIds.includes(item.id)}
                isYourTeam={item.teamId !== undefined && selectedTeamIds.includes(item.teamId)}
                onToggle={() => onToggle(item.id)}
              />
            )}
            contentContainerStyle={{ paddingBottom: 12 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </View>

      <CTAButton
        label={selectedIds.length > 0 ? `${t('onboarding.continue')} (${selectedIds.length})` : t('onboarding.continue')}
        onPress={onNext}
      />
    </View>
  );
};

// s4b chip uses BLUE which is theme-invariant; BLUE_DIM is applied inline via th
const s4b = StyleSheet.create({
  chip: {
    borderRadius: 12, padding: 12,
    marginBottom: 12, borderWidth: 1, borderColor: BLUE,
  },
  chipText: { fontSize: 13, color: BLUE, fontWeight: '600', lineHeight: 18 },
});

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN 5 — Leagues
// ─────────────────────────────────────────────────────────────────────────────
const LeagueRow: React.FC<{
  league: SearchableLeague;
  selected: boolean;
  isSuggested: boolean;
  onToggle: () => void;
}> = React.memo(({ league, selected, isSuggested, onToggle }) => {
  const { t } = useTranslation();
  const th = useOBTheme();
  const handlePress = () => { Haptics.selectionAsync(); onToggle(); };
  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.85}>
      <View style={[s5.row, { backgroundColor: th.SURFACE, borderColor: th.isDark ? '#222' : '#E5E7EB' }, selected && { backgroundColor: th.BLUE_DIM, borderColor: BLUE }]}>
        {/* Badge — always white; falls back to country flag if logo fails to load */}
        <View style={[s5.badge, s5.badgeLight]}>
          <SmartLogo uri={league.image} size={30} fallback={league.flag} />
        </View>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={s5.flag}>{league.flag}</Text>
            <Text style={[s5.name, { color: th.TEXT_PRIMARY }, selected && { color: BLUE }]} numberOfLines={1}>{league.name}</Text>
          </View>
          <Text style={[s5.country, { color: th.TEXT_DIM }]}>{t(`countries.${toCountryKey(league.country)}` as any, { defaultValue: league.country })}</Text>
        </View>

        {isSuggested && (
          <View style={[s5.suggestedChip, { backgroundColor: th.GOLD_DIM }]}>
            <Text style={s5.suggestedText}>{t('onboarding.suggested')}</Text>
          </View>
        )}

        {/* Checkbox */}
        <View style={[s5.checkbox, { borderColor: th.isDark ? '#444' : '#D1D5DB' }, selected && { backgroundColor: BLUE, borderColor: BLUE }]}>
          {selected && <CheckIcon size={12} />}
        </View>
      </View>
    </TouchableOpacity>
  );
});

const s5 = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1.5,
    padding: 12, marginBottom: 10,
  },
  badge: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  badgeLight: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB' },
  flag: { fontSize: 16 },
  name: { fontSize: 15, fontWeight: '700' },
  country: { fontSize: 12, marginTop: 2 },
  suggestedChip: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  suggestedText: { fontSize: 10, fontWeight: '700', color: GOLD },
  checkbox: {
    width: 26, height: 26, borderRadius: 6, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
});

const Screen5Leagues: React.FC<{
  leagues: SearchableLeague[];
  selectedIds: number[];
  suggestedIds: Set<number>;
  onToggle: (id: number) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}> = ({ leagues, selectedIds, suggestedIds, onToggle, onNext, onBack, onSkip }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const th = useOBTheme();
  const countLabel = t('onboarding.leaguesSelected', { count: selectedIds.length });

  return (
    <View style={[base.screen, { paddingBottom: insets.bottom + 16, backgroundColor: th.BG }]}>
      <TopBar dotIndex={3} onBack={onBack} onSkip={onSkip} skipLabel={t('onboarding.skip')} />

      <View style={{ flex: 1, paddingHorizontal: SIDE_PAD }}>
        <Text style={[base.headline, { color: th.TEXT_PRIMARY }]}>{t('onboarding.leaguesTitle')}</Text>
        <Text style={[base.sub, { color: th.TEXT_DIM }]}>{t('onboarding.leaguesSub')}</Text>

        {selectedIds.length > 0 && (
          <Text style={[base.counter, { color: BLUE, marginBottom: 10 }]}>{countLabel}</Text>
        )}

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
          {leagues.map(l => (
            <LeagueRow
              key={l.id}
              league={l}
              selected={selectedIds.includes(l.id)}
              isSuggested={suggestedIds.has(l.id)}
              onToggle={() => onToggle(l.id)}
            />
          ))}
        </ScrollView>
      </View>

      <CTAButton
        label={selectedIds.length > 0 ? `${t('onboarding.continue')} (${selectedIds.length})` : t('onboarding.continue')}
        onPress={onNext}
      />
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN 6 — Feed Preview
// ─────────────────────────────────────────────────────────────────────────────
const Screen6Feed: React.FC<{
  state: OnboardingState;
  teams: SearchableTeam[];
  players: SearchablePlayer[];
  leagues: SearchableLeague[];
  onNext: () => void;
  onBack: () => void;
}> = ({ state, teams, players, leagues, onNext, onBack }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const th = useOBTheme();

  const cardAnims = [0, 150, 300, 450].map(delay => {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(30)).current;
    return { opacity, translateY, delay };
  });

  useEffect(() => {
    cardAnims.forEach(({ opacity, translateY, delay }) => {
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start();
      }, delay);
    });
  }, []);

  const firstTeam = teams.find(t2 => state.teamIds.includes(t2.id));
  const firstPlayer = players.find(p => state.playerIds.includes(p.id));
  const firstLeague = leagues.find(l => state.leagueIds.includes(l.id));

  return (
    <View style={[base.screen, { paddingBottom: insets.bottom + 16, backgroundColor: th.BG }]}>
      <TopBar dotIndex={4} onBack={onBack} />

      <ScrollView
        contentContainerStyle={[base.scrollContent, { paddingHorizontal: SIDE_PAD }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[base.headline, { color: th.TEXT_PRIMARY }]}>{t('onboarding.feedTitle')}</Text>
        <Text style={[base.sub, { color: th.TEXT_DIM }]}>{t('onboarding.feedSub')}</Text>

        <View style={{ gap: 12, marginTop: 20 }}>
          {/* Card 1 — Next Match */}
          <Animated.View style={[{ opacity: cardAnims[0].opacity, transform: [{ translateY: cardAnims[0].translateY }] }, th.SHADOW]}>
            <LinearGradient colors={[th.isDark ? '#1A2A4A' : '#EFF6FF', th.isDark ? '#0D1520' : '#DBEAFE']} style={s6.card} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <View style={[s6.badge, { backgroundColor: th.BLUE_DIM }]}>
                <Text style={[s6.badgeText, { color: BLUE }]}>{t('onboarding.nextMatchLabel')}</Text>
              </View>
              <View style={s6.matchRow}>
                <View style={s6.teamBox}>
                  {firstTeam ? <SmartLogo uri={firstTeam.logo} size={40} /> : <Text style={{ fontSize: 40 }}>⚽</Text>}
                  <Text style={[s6.teamName, { color: th.TEXT_PRIMARY }]} numberOfLines={1}>{firstTeam?.shortName ?? 'EQP'}</Text>
                </View>
                <Text style={[s6.vs, { color: th.TEXT_DIM }]}>VS</Text>
                <View style={s6.teamBox}>
                  <Text style={{ fontSize: 40 }}>🆚</Text>
                  <Text style={[s6.teamName, { color: th.TEXT_PRIMARY }]}>OPP</Text>
                </View>
              </View>
              <Text style={[s6.matchTime, { color: th.SUB_TEXT }]}>Sábado · 21:00</Text>
              {firstLeague && <Text style={[s6.leagueName, { color: th.TEXT_DIM }]}>{firstLeague.name}</Text>}
            </LinearGradient>
          </Animated.View>

          {/* Card 2 — News */}
          <Animated.View style={[{ opacity: cardAnims[1].opacity, transform: [{ translateY: cardAnims[1].translateY }] }, th.SHADOW]}>
            <View style={[s6.card, { backgroundColor: th.SURFACE }]}>
              <View style={s6.newsRow}>
                <LinearGradient colors={[GOLD, '#E68A00']} style={s6.newsAvatar} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <Text style={{ fontSize: 22 }}>⚽</Text>
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <View style={[s6.badge, { backgroundColor: th.GOLD_DIM, alignSelf: 'flex-start', marginBottom: 4 }]}>
                    <Text style={[s6.badgeText, { color: GOLD }]}>{t('onboarding.newsLabel')}</Text>
                  </View>
                  <Text style={[s6.newsTitle, { color: th.TEXT_PRIMARY }]} numberOfLines={2}>
                    {firstPlayer ? `${firstPlayer.name} anotó doblete anoche` : 'Tu jugador favorito anotó anoche'}
                  </Text>
                </View>
              </View>
            </View>
          </Animated.View>

          {/* Card 3 — Table */}
          <Animated.View style={[{ opacity: cardAnims[2].opacity, transform: [{ translateY: cardAnims[2].translateY }] }, th.SHADOW]}>
            <View style={[s6.card, { backgroundColor: th.SURFACE }]}>
              <View style={[s6.badge, { backgroundColor: th.BLUE_DIM, marginBottom: 10 }]}>
                <Text style={[s6.badgeText, { color: BLUE }]}>{t('onboarding.tableLabel')}</Text>
              </View>
              {[1, 2, 3].map(pos => (
                <View key={pos} style={[s6.tableRow, pos === 1 && firstTeam && { backgroundColor: th.BLUE_DIM, borderRadius: 8 }]}>
                  <Text style={[s6.tablePos, { color: th.TEXT_DIM }]}>{pos}</Text>
                  <Text style={[s6.tableName, { color: th.TEXT_PRIMARY }]} numberOfLines={1}>
                    {pos === 1 && firstTeam ? firstTeam.name : pos === 2 ? 'Equipo B' : 'Equipo C'}
                  </Text>
                  <Text style={[s6.tablePoints, { color: th.TEXT_PRIMARY }]}>{36 - pos * 3} pts</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          {/* Card 4 — Stat */}
          <Animated.View style={[{ opacity: cardAnims[3].opacity, transform: [{ translateY: cardAnims[3].translateY }] }, th.SHADOW]}>
            <LinearGradient colors={[th.isDark ? '#1A1A1D' : '#FFFBEB', th.isDark ? '#2a1f00' : '#FEF3C7']} style={s6.card} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <View style={[s6.badge, { backgroundColor: th.GOLD_DIM, marginBottom: 10 }]}>
                <Text style={[s6.badgeText, { color: GOLD }]}>{t('onboarding.statLabel')}</Text>
              </View>
              <Text style={s6.statNumber}>15</Text>
              <View style={[s6.barContainer, { backgroundColor: th.isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB' }]}>
                <LinearGradient colors={[GOLD, '#E68A00']} style={[s6.bar, { width: '75%' }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
              </View>
              <Text style={[s6.statSub, { color: th.TEXT_DIM }]}>
                {firstPlayer ? `${firstPlayer.name} · Delantero` : 'Tu jugador · Delantero'}
              </Text>
            </LinearGradient>
          </Animated.View>
        </View>
      </ScrollView>

      <CTAButton label={t('onboarding.likeWhatISee')} onPress={onNext} glow />
    </View>
  );
};

const s6 = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, overflow: 'hidden' },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  matchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginVertical: 12 },
  teamBox: { alignItems: 'center', gap: 6, width: 80 },
  teamName: { fontSize: 12, fontWeight: '800' },
  vs: { fontSize: 18, fontWeight: '900' },
  matchTime: { fontSize: 13, textAlign: 'center', marginTop: 4 },
  leagueName: { fontSize: 11, textAlign: 'center', marginTop: 2 },
  newsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  newsAvatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  newsTitle: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 4 },
  tablePos: { fontSize: 14, fontWeight: '800', width: 20 },
  tableName: { flex: 1, fontSize: 14, fontWeight: '600' },
  tablePoints: { fontSize: 13, fontWeight: '700' },
  statNumber: { fontSize: 84, fontWeight: '900', color: GOLD, lineHeight: 90 },
  barContainer: { height: 6, borderRadius: 3, overflow: 'hidden', marginVertical: 8 },
  bar: { height: 6, borderRadius: 3 },
  statSub: { fontSize: 13 },
});

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN 7 — Notifications
// ─────────────────────────────────────────────────────────────────────────────
type NotifRowItem = {
  key: NotifKey;
  icon: string;
  titleKey: string;
  subKey: string;
};

const NOTIF_ROWS: NotifRowItem[] = [
  { key: 'goals',     icon: '⚽', titleKey: 'onboarding.nGoals',     subKey: 'onboarding.nGoalsSub' },
  { key: 'kickoff',   icon: '📣', titleKey: 'onboarding.nKickoff',   subKey: 'onboarding.nKickoffSub' },
  { key: 'results',   icon: '🏆', titleKey: 'onboarding.nResults',   subKey: 'onboarding.nResultsSub' },
  { key: 'lineups',   icon: '📋', titleKey: 'onboarding.nLineups',   subKey: 'onboarding.nLineupsSub' },
  { key: 'transfers', icon: '🔄', titleKey: 'onboarding.nTransfers', subKey: 'onboarding.nTransfersSub' },
  { key: 'news',      icon: '📰', titleKey: 'onboarding.nNews',      subKey: 'onboarding.nNewsSub' },
];

const Screen7Notifs: React.FC<{
  notifs: Record<NotifKey, boolean>;
  onToggle: (key: NotifKey) => void;
  fanLevel: FanLevel | null;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}> = ({ notifs, onToggle, fanLevel, onNext, onBack, onSkip }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const th = useOBTheme();

  const subCopy =
    fanLevel === 'analista' ? t('onboarding.notifsSubAnalista') :
    fanLevel === 'fan'      ? t('onboarding.notifsSubFan') :
    t('onboarding.notifsSubCasual');

  return (
    <View style={[base.screen, { paddingBottom: insets.bottom + 16, backgroundColor: th.BG }]}>
      <TopBar dotIndex={4} onBack={onBack} onSkip={onSkip} skipLabel={t('onboarding.skip')} />

      <ScrollView contentContainerStyle={[base.scrollContent, { paddingHorizontal: SIDE_PAD }]} showsVerticalScrollIndicator={false}>
        <Text style={[base.headline, { color: th.TEXT_PRIMARY }]}>{t('onboarding.notifsTitle')}</Text>
        <Text style={[base.sub, { color: th.TEXT_DIM }]}>{subCopy}</Text>

        {/* Info chip */}
        <View style={[s7.infoChip, { backgroundColor: th.BLUE_DIM }]}>
          <Text style={s7.infoText}>🔔 {t('onboarding.notifsInfo')}</Text>
        </View>

        <View style={{ gap: 8, marginTop: 8 }}>
          {NOTIF_ROWS.map(row => (
            <View key={row.key} style={[s7.row, { backgroundColor: th.SURFACE, borderColor: th.isDark ? '#222' : '#E5E7EB' }]}>
              <View style={[s7.iconBox, { backgroundColor: th.isDark ? '#1E1E1E' : '#F3F4F6' }]}>
                <Text style={{ fontSize: 20 }}>{row.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s7.rowTitle, { color: th.TEXT_PRIMARY }]}>{t(row.titleKey)}</Text>
                <Text style={[s7.rowSub, { color: th.TEXT_DIM }]}>{t(row.subKey)}</Text>
              </View>
              <CustomToggle value={notifs[row.key]} onToggle={() => onToggle(row.key)} />
            </View>
          ))}
        </View>
      </ScrollView>

      <CTAButton label={t('onboarding.continue')} onPress={onNext} />
    </View>
  );
};

const s7 = StyleSheet.create({
  infoChip: {
    borderRadius: 12, padding: 12,
    marginVertical: 12, borderWidth: 1, borderColor: BLUE,
  },
  infoText: { fontSize: 13, color: BLUE, fontWeight: '600', lineHeight: 18 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, padding: 14,
    borderWidth: 1.5,
  },
  iconBox: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSub: { fontSize: 12, marginTop: 2 },
});

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN 8 — Name + Auth
// ─────────────────────────────────────────────────────────────────────────────
const Screen8Name: React.FC<{
  name: string;
  onChangeName: (n: string) => void;
  state: OnboardingState;
  onAuth: (method: AuthMethod) => void;
  onBack: () => void;
}> = ({ name, onChangeName, state, onAuth, onBack }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const th = useOBTheme();

  const displayName = name.trim() || '___';
  const jerseyAnim  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(jerseyAnim, { toValue: 1.04, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(jerseyAnim, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  return (
    <KeyboardAvoidingView
      style={[base.screen, { paddingBottom: insets.bottom + 16, backgroundColor: th.BG }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TopBar dotIndex={4} onBack={onBack} />

      <ScrollView
        contentContainerStyle={[base.scrollContent, { paddingHorizontal: SIDE_PAD }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Jersey illustration */}
        <Animated.View style={[s8.jerseyWrap, { transform: [{ scale: jerseyAnim }] }]}>
          {/* Simple jersey shape via Views */}
          <View style={s8.jersey}>
            {/* Collar */}
            <View style={s8.collar} />
            {/* Name on back */}
            <Text style={s8.jerseyName} numberOfLines={1}>{displayName.toUpperCase().slice(0, 10)}</Text>
            <Text style={s8.jerseyNumber}>10</Text>
          </View>
        </Animated.View>

        <Text style={[s8.title, { color: th.TEXT_PRIMARY }]}>{t('onboarding.nameTitle')}</Text>
        <Text style={s8.hub}>{t('onboarding.nameHub')}</Text>
        <Text style={[base.sub, { color: BLUE, marginBottom: 16, textAlign: 'center' }]}>{t('onboarding.nameSubtitle')}</Text>

        {/* Name input */}
        <View style={[s8.inputWrap, { backgroundColor: th.SURFACE, borderColor: th.isDark ? '#333' : '#E5E7EB' }]}>
          <TextInput
            style={[s8.input, { color: th.TEXT_PRIMARY }]}
            placeholder={t('onboarding.namePlaceholder')}
            placeholderTextColor={th.TEXT_DIM}
            value={name}
            onChangeText={v => onChangeName(v.slice(0, 16))}
            autoCapitalize="words"
            returnKeyType="done"
            maxLength={16}
          />
        </View>

        {/* Micro-reflect */}
        <Text style={[s8.reflect, { color: th.TEXT_DIM }]}>
          {t('onboarding.nameFollowing', {
            teams: state.teamIds.length,
            players: state.playerIds.length,
            leagues: state.leagueIds.length,
          })}
        </Text>

        <Text style={[s8.registerHint, { color: th.TEXT_DIM }]}>{t('onboarding.nameRegister')}</Text>

        {/* Auth buttons */}
        <TouchableOpacity style={s8.appleBtn} onPress={() => onAuth('apple')} activeOpacity={0.85}>
          <View style={s8.appleLogo}>
            {/* Apple logo drawn with View */}
            <Text style={{ fontSize: 18, color: '#000' }}>🍎</Text>
          </View>
          <Text style={s8.appleBtnText}>{t('onboarding.continueWithApple')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[s8.googleBtn, { borderColor: th.isDark ? '#333' : '#E5E7EB' }]} onPress={() => onAuth('google')} activeOpacity={0.85}>
          <Text style={{ fontSize: 18 }}>🌐</Text>
          <Text style={[s8.googleBtnText, { color: th.TEXT_PRIMARY }]}>{t('onboarding.continueWithGoogle')}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => onAuth('guest')} style={{ paddingVertical: 16, alignItems: 'center' }}>
          <Text style={s8.guestLink}>{t('onboarding.continueWithoutAccount')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const s8 = StyleSheet.create({
  jerseyWrap: { alignSelf: 'center', marginBottom: 12 },
  jersey: {
    width: 100, height: 110, backgroundColor: BLUE,
    borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    position: 'relative', overflow: 'hidden',
  },
  collar: {
    position: 'absolute', top: -6, width: 36, height: 22,
    backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 18,
  },
  jerseyName: {
    fontSize: 11, fontWeight: '900', color: '#FFFFFF',
    letterSpacing: 1, textAlign: 'center', marginTop: 12,
  },
  jerseyNumber: { fontSize: 32, fontWeight: '900', color: '#FFFFFF' },
  title: {
    fontSize: 20, fontWeight: '900',
    textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center',
  },
  hub: { fontSize: 20, fontWeight: '900', color: BLUE, textAlign: 'center', marginBottom: 8 },
  inputWrap: {
    borderRadius: 14, borderWidth: 1.5,
    paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 16 : 12,
    marginBottom: 12,
  },
  input: { fontSize: 18, fontWeight: '700' },
  reflect: { fontSize: 13, textAlign: 'center', marginBottom: 8 },
  registerHint: { fontSize: 14, textAlign: 'center', marginBottom: 20 },
  appleBtn: {
    backgroundColor: '#FFFFFF', borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    marginBottom: 10,
  },
  appleLogo: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  appleBtnText: { fontSize: 16, fontWeight: '700', color: '#000' },
  googleBtn: {
    backgroundColor: 'transparent', borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1.5, marginBottom: 4,
  },
  googleBtnText: { fontSize: 16, fontWeight: '700' },
  guestLink: { fontSize: 15, color: BLUE, fontWeight: '600', textDecorationLine: 'underline' },
});

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN 9 — Personalizing (auto-advances after 3s)
// ─────────────────────────────────────────────────────────────────────────────
const Screen9Personalizing: React.FC<{
  state: OnboardingState;
  teams: SearchableTeam[];
  players: SearchablePlayer[];
  leagues: SearchableLeague[];
  onDone: () => void;
}> = ({ state, teams, players, leagues, onDone }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const th = useOBTheme();
  const { setFanLevel } = useOnboarding();
  const { isFollowingTeam, toggleFollowTeam, isFollowingLeague, toggleFollowLeague, isFollowingPlayer, toggleFollowPlayer } = useFavorites();
  const { login } = useAuth();
  const { togglePref, prefs } = useNotificationPrefs();

  const [pct, setPct] = useState(0);
  const [msgIndex, setMsgIndex] = useState(0);
  const pctAnim   = useRef(new Animated.Value(0)).current;
  const circleScale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0.3)).current;
  const appliedRef  = useRef(false);

  // Build cycling messages
  const msgs = useMemo(() => {
    const list: string[] = [];
    const selectedTeams   = teams.filter(t2 => state.teamIds.includes(t2.id));
    const selectedPlayers = players.filter(p => state.playerIds.includes(p.id));
    const selectedLeagues = leagues.filter(l => state.leagueIds.includes(l.id));

    if (selectedTeams.length > 0) {
      list.push(t('onboarding.connectingTeam', { team: selectedTeams[0].name }));
    } else {
      list.push(t('onboarding.connectingTeams'));
    }
    if (selectedPlayers.length > 0) {
      list.push(t('onboarding.loadingPlayer', { player: selectedPlayers[0].name }));
    } else {
      list.push(t('onboarding.loadingPlayers'));
    }
    if (selectedLeagues.length > 0) {
      list.push(t('onboarding.preparingLeague', { league: selectedLeagues[0].name }));
    } else {
      list.push(t('onboarding.preparingLeagues'));
    }
    list.push(t('onboarding.readyMessage'));
    return list;
  }, [state, teams, players, leagues]);

  useEffect(() => {
    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(circleScale,  { toValue: 1.08, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(circleScale,  { toValue: 1,    duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, { toValue: 0.7, duration: 900, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: 0.2, duration: 900, useNativeDriver: true }),
      ]),
    ).start();

    // Percentage counter
    const start = Date.now();
    const duration = 3000;
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out
      const eased = 1 - Math.pow(1 - progress, 3);
      setPct(Math.round(eased * 100));
      if (progress >= 1) clearInterval(interval);
    }, 30);

    // Message cycling
    const msgInterval = setInterval(() => {
      setMsgIndex(i => Math.min(i + 1, msgs.length - 1));
    }, 800);

    // Side effects — run ONCE
    if (!appliedRef.current) {
      appliedRef.current = true;

      // Apply fan level
      if (state.fanLevel) setFanLevel(state.fanLevel);

      // Apply teams
      state.teamIds.forEach(id => {
        if (!isFollowingTeam(String(id))) toggleFollowTeam(String(id));
      });

      // Apply players
      state.playerIds.forEach(id => {
        if (!isFollowingPlayer(String(id))) toggleFollowPlayer(String(id));
      });

      // Apply leagues
      state.leagueIds.forEach(id => {
        if (!isFollowingLeague(String(id))) toggleFollowLeague(String(id));
      });

      // Apply notifications (map design keys → NotificationPrefsContext keys)
      const notifMap: Partial<Record<NotifKey, keyof typeof prefs>> = {
        goals:   'goals',
        kickoff: 'matchStart',
        results: 'matchEnd',
        lineups: 'lineups',
      };
      Object.entries(notifMap).forEach(([designKey, prefKey]) => {
        const desired = state.notifications[designKey as NotifKey];
        const current = prefs[prefKey as keyof typeof prefs];
        if (typeof current === 'boolean' && desired !== current) {
          togglePref(prefKey as Parameters<typeof togglePref>[0]);
        }
      });

      // Request push permissions
      requestPermissionsAndGetToken().catch(() => {});

      // Auth
      if (state.authMethod) {
        login(state.authMethod, state.name.trim() || 'Analista').catch(() => {});
      }
    }

    // Auto-advance after 3s
    const advanceTimer = setTimeout(() => {
      clearInterval(interval);
      clearInterval(msgInterval);
      onDone();
    }, 3200);

    return () => {
      clearInterval(interval);
      clearInterval(msgInterval);
      clearTimeout(advanceTimer);
    };
  }, []);

  return (
    <View style={[s9.container, { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: th.BG }]}>
      {/* Pulsing A circle */}
      <Animated.View style={[s9.glowOuter, { opacity: glowOpacity }]} />
      <Animated.View style={[s9.circleWrap, { transform: [{ scale: circleScale }] }]}>
        <LinearGradient colors={[BLUE, '#1A4DB0']} style={s9.circle} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={s9.aLetter}>A</Text>
        </LinearGradient>
      </Animated.View>

      <Text style={[s9.title, { color: th.TEXT_DIM }]}>{t('onboarding.personalizingTitle')}</Text>

      {/* Big percentage */}
      <Text style={s9.pct}>{pct}<Text style={s9.pctSymbol}>%</Text></Text>

      {/* Progress bar */}
      <View style={[s9.barTrack, { backgroundColor: th.isDark ? '#1A1A1A' : '#E5E7EB' }]}>
        <LinearGradient
          colors={[BLUE, '#6BAAFF']}
          style={[s9.barFill, { width: `${pct}%` }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />
      </View>

      {/* Status message */}
      <Text style={[s9.msg, { color: th.TEXT_DIM }]}>{msgs[msgIndex]}</Text>
    </View>
  );
};

const s9 = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center', justifyContent: 'center', gap: 16,
    paddingHorizontal: SIDE_PAD,
  },
  glowOuter: {
    position: 'absolute',
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(46,124,246,0.20)',
  },
  circleWrap: { marginBottom: 8 },
  circle: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center',
  },
  aLetter: { fontSize: 48, fontWeight: '900', color: '#FFFFFF' },
  title: { fontSize: 20, fontWeight: '700' },
  pct: { fontSize: 84, fontWeight: '900', color: BLUE, lineHeight: 90 },
  pctSymbol: { fontSize: 40, fontWeight: '700' },
  barTrack: {
    width: SCREEN_W - SIDE_PAD * 2, height: 6,
    borderRadius: 3, overflow: 'hidden',
  },
  barFill: { height: 6, borderRadius: 3 },
  msg: { fontSize: 14, textAlign: 'center', minHeight: 22 },
});

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN 10 — Welcome Final (confetti)
// ─────────────────────────────────────────────────────────────────────────────
const CONFETTI_COUNT = 36;
const CONFETTI_COLORS = [BLUE, GOLD, '#FF6B6B', '#51CF66', '#845EF7', '#FF922B', '#FFFFFF'];

const Screen10Final: React.FC<{
  name: string;
  teams: SearchableTeam[];
  selectedTeamIds: number[];
  onStart: () => void;
}> = ({ name, teams, selectedTeamIds, onStart }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const th = useOBTheme();

  // Confetti anims
  const confettiAnims = useRef(
    Array.from({ length: CONFETTI_COUNT }).map(() => ({
      y: new Animated.Value(-80),
      x: new Animated.Value(Math.random() * SCREEN_W),
      rotate: new Animated.Value(0),
      opacity: new Animated.Value(1),
    })),
  ).current;

  const contentOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Start confetti
    confettiAnims.forEach((anim, i) => {
      const startDelay = (i % 6) * 120;
      const duration   = 2500 + Math.random() * 2000;
      anim.x.setValue(Math.random() * SCREEN_W);
      Animated.loop(
        Animated.sequence([
          Animated.delay(startDelay),
          Animated.parallel([
            Animated.timing(anim.y, { toValue: 900, duration, useNativeDriver: true, easing: Easing.linear }),
            Animated.timing(anim.rotate, { toValue: Math.random() * 360, duration, useNativeDriver: true }),
            Animated.sequence([
              Animated.timing(anim.opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
              Animated.delay(duration - 400),
              Animated.timing(anim.opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
            ]),
          ]),
        ]),
      ).start();
    });

    Animated.timing(contentOpacity, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  const firstTeam = teams.find(t2 => selectedTeamIds.includes(t2.id));
  const displayName = name.trim() || t('onboarding.defaultName');

  return (
    <View style={[s10.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 16, backgroundColor: th.BG }]}>
      {/* Confetti layer */}
      {confettiAnims.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            s10.confetti,
            {
              transform: [
                { translateX: anim.x },
                { translateY: anim.y },
                { rotate: anim.rotate.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] }) },
              ],
              opacity: anim.opacity,
              backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            },
          ]}
        />
      ))}

      {/* Content */}
      <Animated.View style={[s10.content, { opacity: contentOpacity }]}>
        {/* Big logo */}
        <AnalistasLogo size={80} tint={th.isDark ? '#FFFFFF' : '#2E7CF6'} />

        {/* Name */}
        <Text style={[s10.nameText, { fontSize: Math.max(28, Math.min(56, Math.floor(220 / Math.max(displayName.length, 4)))) }]}>
          {displayName},
        </Text>

        <Text style={[s10.finalHeadline, { color: th.TEXT_PRIMARY }]}>{t('onboarding.welcomeFinalTitle')}</Text>

        {/* Accent line */}
        <View style={s10.accentLine} />

        <Text style={[s10.finalSub, { color: th.TEXT_DIM }]}>{t('onboarding.welcomeFinalSub')}</Text>

        {/* Hook card */}
        {firstTeam && (
          <View style={[s10.hookCard, { backgroundColor: th.SURFACE, borderColor: 'rgba(46,124,246,0.35)' }]}>
            <Text style={s10.hookIcon}>⚡</Text>
            <Text style={[s10.hookLabel, { color: th.TEXT_DIM }]}>{t('onboarding.firstMatch')}</Text>
            <SmartLogo uri={firstTeam.logo} size={32} />
            <Text style={[s10.hookTeam, { color: th.TEXT_PRIMARY }]}>{firstTeam.name}</Text>
            <Text style={s10.hookTime}>Pronto</Text>
          </View>
        )}

        <CTAButton label={t('onboarding.start_btn')} onPress={onStart} glow />
      </Animated.View>
    </View>
  );
};

const s10 = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  confetti: {
    position: 'absolute', top: 0,
    width: 8, height: 14, borderRadius: 3,
  },
  content: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: SIDE_PAD, gap: 12,
  },
  nameText: { fontWeight: '900', color: BLUE, letterSpacing: -1, textAlign: 'center' },
  finalHeadline: {
    fontSize: 22, fontWeight: '700',
    textAlign: 'center', lineHeight: 30,
  },
  accentLine: { width: 48, height: 3, backgroundColor: BLUE, borderRadius: 2 },
  finalSub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  hookCard: {
    borderRadius: 16, padding: 16,
    borderWidth: 1.5,
    width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  hookIcon: { fontSize: 20 },
  hookLabel: { flex: 1, fontSize: 13 },
  hookTeam: { fontSize: 14, fontWeight: '700' },
  hookTime: { fontSize: 12, color: BLUE },
});

// ─────────────────────────────────────────────────────────────────────────────
// Shared styles
// ─────────────────────────────────────────────────────────────────────────────
const base = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { paddingBottom: 20, paddingTop: 8 },
  headline: {
    fontSize: 30, fontWeight: '900',
    letterSpacing: -0.5, marginBottom: 6,
  },
  sub: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  counter: { fontSize: 13, fontWeight: '700' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 200 },
});

const searchS = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    borderRadius: 12, borderWidth: 1,
    marginBottom: 10,
  },
  input: { flex: 1, fontSize: 15, fontWeight: '500', padding: 0 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main OnboardingScreen component
// ─────────────────────────────────────────────────────────────────────────────
export function OnboardingScreen() {
  const { completeOnboarding } = useOnboarding();

  // ── Data loading ────────────────────────────────────────────────────────────
  const [teams, setTeams]     = useState<SearchableTeam[]>(FALLBACK_TEAMS);
  const [leagues, setLeagues] = useState<SearchableLeague[]>(FALLBACK_LEAGUES);
  const [players, setPlayers] = useState<SearchablePlayer[]>(FALLBACK_PLAYERS);
  const [teamsLoading, setTeamsLoading]   = useState(true);
  const [playersLoading, setPlayersLoading] = useState(true);

  useEffect(() => {
    const timeout3s = (promise: Promise<unknown>) =>
      Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))]);

    timeout3s(getSearchableTeams())
      .then(data => { if (Array.isArray(data) && data.length > 0) setTeams(data as SearchableTeam[]); })
      .catch(() => {})
      .finally(() => setTeamsLoading(false));

    // Leagues are synchronous
    const ls = getSearchableLeagues();
    if (ls.length > 0) setLeagues(ls);

    timeout3s(getSearchablePlayers())
      .then(data => { if (Array.isArray(data) && data.length > 0) setPlayers(data as SearchablePlayer[]); })
      .catch(() => {})
      .finally(() => setPlayersLoading(false));
  }, []);

  // ── Onboarding state ────────────────────────────────────────────────────────
  const [screen, setScreen] = useState(1);

  const [obState, setObState] = useState<OnboardingState>({
    fanLevel: null,
    teamIds: [],
    playerIds: [],
    leagueIds: [],
    notifications: DEFAULT_NOTIFS_BY_LEVEL.fan,
    name: '',
    authMethod: null,
  });

  const goTo  = (n: number) => setScreen(n);
  const goNext = () => setScreen(s => s + 1);
  const goBack = () => setScreen(s => Math.max(1, s - 1));

  // Team names for the "following chip" in players screen
  const selectedTeamNames = useMemo(
    () => teams.filter(t2 => obState.teamIds.includes(t2.id)).map(t2 => t2.name),
    [teams, obState.teamIds],
  );

  // League suggestion logic
  const suggestedLeagueIds = useMemo(() => {
    const ids = new Set<number>();
    const hasMX = obState.teamIds.some(id => MX_TEAM_IDS.has(id));
    const hasEU = obState.teamIds.some(id => EU_TEAM_IDS.has(id));
    if (hasMX) { ids.add(743); ids.add(2); } // Liga MX + Champions
    if (hasEU) { ids.add(564); ids.add(8); ids.add(2); } // La Liga, Premier, Champions
    if (!hasMX && !hasEU) { ids.add(743); ids.add(564); ids.add(8); }
    return ids;
  }, [obState.teamIds]);

  // Auto-suggest leagues when entering screen 5
  const leagues5Initialized = useRef(false);
  useEffect(() => {
    if (screen === 5 && !leagues5Initialized.current) {
      leagues5Initialized.current = true;
      const suggested = [...suggestedLeagueIds].slice(0, 3);
      setObState(prev => ({
        ...prev,
        leagueIds: [...new Set([...prev.leagueIds, ...suggested])],
      }));
    }
  }, [screen, suggestedLeagueIds]);

  // Toggle helpers
  const toggleTeamId = useCallback((id: number) => {
    setObState(prev => ({
      ...prev,
      teamIds: prev.teamIds.includes(id) ? prev.teamIds.filter(x => x !== id) : [...prev.teamIds, id],
    }));
  }, []);

  const togglePlayerId = useCallback((id: number) => {
    setObState(prev => ({
      ...prev,
      playerIds: prev.playerIds.includes(id) ? prev.playerIds.filter(x => x !== id) : [...prev.playerIds, id],
    }));
  }, []);

  const toggleLeagueId = useCallback((id: number) => {
    setObState(prev => ({
      ...prev,
      leagueIds: prev.leagueIds.includes(id) ? prev.leagueIds.filter(x => x !== id) : [...prev.leagueIds, id],
    }));
  }, []);

  const toggleNotif = useCallback((key: NotifKey) => {
    setObState(prev => ({
      ...prev,
      notifications: { ...prev.notifications, [key]: !prev.notifications[key] },
    }));
  }, []);

  // Fan level selection updates notification defaults
  const selectFanLevel = useCallback((lvl: FanLevel) => {
    setObState(prev => ({
      ...prev,
      fanLevel: lvl,
      notifications: DEFAULT_NOTIFS_BY_LEVEL[lvl],
    }));
  }, []);

  const handleAuth = useCallback((method: AuthMethod) => {
    setObState(prev => ({ ...prev, authMethod: method }));
    goTo(9);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────
  switch (screen) {
    case 1:
      return <Screen1Welcome onNext={goNext} />;

    case 2:
      return (
        <Screen2FanLevel
          selected={obState.fanLevel}
          onSelect={selectFanLevel}
          onNext={goNext}
          onBack={goBack}
          onSkip={goNext}
        />
      );

    case 3:
      return (
        <Screen3Teams
          teams={teams}
          loading={teamsLoading}
          selectedIds={obState.teamIds}
          onToggle={toggleTeamId}
          fanLevel={obState.fanLevel}
          onNext={goNext}
          onBack={goBack}
          onSkip={goNext}
        />
      );

    case 4:
      return (
        <Screen4Players
          players={players}
          loading={playersLoading}
          selectedTeamIds={obState.teamIds}
          selectedIds={obState.playerIds}
          onToggle={togglePlayerId}
          onNext={goNext}
          onBack={goBack}
          onSkip={goNext}
          teamNames={selectedTeamNames}
        />
      );

    case 5:
      return (
        <Screen5Leagues
          leagues={leagues}
          selectedIds={obState.leagueIds}
          suggestedIds={suggestedLeagueIds}
          onToggle={toggleLeagueId}
          onNext={goNext}
          onBack={goBack}
          onSkip={goNext}
        />
      );

    case 6:
      return (
        <Screen6Feed
          state={obState}
          teams={teams}
          players={players}
          leagues={leagues}
          onNext={goNext}
          onBack={goBack}
        />
      );

    case 7:
      return (
        <Screen7Notifs
          notifs={obState.notifications}
          onToggle={toggleNotif}
          fanLevel={obState.fanLevel}
          onNext={goNext}
          onBack={goBack}
          onSkip={goNext}
        />
      );

    case 8:
      return (
        <Screen8Name
          name={obState.name}
          onChangeName={n => setObState(prev => ({ ...prev, name: n }))}
          state={obState}
          onAuth={handleAuth}
          onBack={goBack}
        />
      );

    case 9:
      return (
        <Screen9Personalizing
          state={obState}
          teams={teams}
          players={players}
          leagues={leagues}
          onDone={goNext}
        />
      );

    case 10:
    default:
      return (
        <Screen10Final
          name={obState.name}
          teams={teams}
          selectedTeamIds={obState.teamIds}
          onStart={completeOnboarding}
        />
      );
  }
}

export default OnboardingScreen;
