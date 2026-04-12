// ── Onboarding Flow ─────────────────────────────────────────────────────────
// 6-step onboarding: Welcome → Teams → Players → Leagues → Notifications → Presentación
// Shown on first launch. Syncs selections to FavoritesContext on completion.
// Professional quality — animated transitions, custom toggles, team/player grids,
// social auth placeholders, progress bar, emotional "Presentación" login.

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, Animated, TouchableOpacity, FlatList, ScrollView,
  TextInput, Image, Dimensions, Platform, StatusBar, ActivityIndicator,
  Keyboard, Easing, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../theme/useTheme';
import { useDarkMode } from '../../contexts/DarkModeContext';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { useFavorites } from '../../contexts/FavoritesContext';
import { useAuth } from '../../contexts/AuthContext';
import type { AuthMethod } from '../../contexts/AuthContext';
import { getSearchableTeams, getSearchableLeagues, getSearchablePlayers } from '../../services/sportsApi';
import type { SearchableTeam, SearchableLeague, SearchablePlayer } from '../../services/sportsApi';

const { width: SCREEN_W } = Dimensions.get('window');
const TOTAL_STEPS = 6;

// ── Accent colors ───────────────────────────────────────────────────────────
const GREEN = '#10b981';
const GREEN_DIM = 'rgba(16,185,129,0.12)';
const GOLD = '#fbbf24';
const GOLD_DIM = 'rgba(251,191,36,0.12)';

// ── Card layout ─────────────────────────────────────────────────────────────
const CARD_GAP = 10;
const SIDE_PAD = 20;
const CARD_W = (SCREEN_W - SIDE_PAD * 2 - CARD_GAP * 2) / 3;

// ═══════════════════════════════════════════════════════════════════════════════
// ── Shared sub-components ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ── Progress Bar ────────────────────────────────────────────────────────────
const ProgressBar: React.FC<{ step: number; bgColor: string }> = ({ step, bgColor }) => {
  const widthAnim = useRef(new Animated.Value((step + 1) / TOTAL_STEPS)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: (step + 1) / TOTAL_STEPS,
      duration: 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [step]);

  return (
    <View style={[pgb.track, { backgroundColor: bgColor }]}>
      <Animated.View
        style={[pgb.fill, {
          width: widthAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }]}
      />
    </View>
  );
};

const pgb = StyleSheet.create({
  track: { height: 3, borderRadius: 2 },
  fill: { height: '100%', borderRadius: 2, backgroundColor: GREEN },
});

// ── Custom Toggle ───────────────────────────────────────────────────────────
const CustomToggle: React.FC<{ value: boolean; onToggle: () => void }> = ({ value, onToggle }) => {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: value ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 50,
    }).start();
  }, [value]);

  const thumbX = anim.interpolate({ inputRange: [0, 1], outputRange: [2, 22] });

  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.8} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <View style={[tog.track, { backgroundColor: value ? GREEN : 'rgba(128,128,128,0.25)' }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: GREEN, borderRadius: 14, opacity: anim }]} />
        <Animated.View style={[tog.thumb, { transform: [{ translateX: thumbX }] }]} />
      </View>
    </TouchableOpacity>
  );
};

const tog = StyleSheet.create({
  track: { width: 48, height: 28, borderRadius: 14, justifyContent: 'center', overflow: 'hidden' },
  thumb: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3 },
      android: { elevation: 3 },
    }),
  },
});

// ── Generic Logo ────────────────────────────────────────────────────────────
const SmartLogo: React.FC<{ uri: string; size?: number; round?: boolean }> = ({ uri, size = 40, round }) => {
  if (uri && uri.startsWith('http')) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: round ? size / 2 : 4 }}
        resizeMode="contain"
      />
    );
  }
  return <Text style={{ fontSize: size * 0.7 }}>{uri || '⚽'}</Text>;
};

// ── Back Arrow ──────────────────────────────────────────────────────────────
const BackArrow: React.FC<{ color: string }> = ({ color }) => (
  <View style={{ width: 12, height: 12, borderLeftWidth: 2.5, borderBottomWidth: 2.5, borderColor: color, transform: [{ rotate: '45deg' }] }} />
);

// ── Checkmark Icon ──────────────────────────────────────────────────────────
const CheckIcon: React.FC<{ size?: number; color?: string }> = ({ size = 14, color = '#fff' }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{
      width: size * 0.35, height: size * 0.65,
      borderRightWidth: 2.5, borderBottomWidth: 2.5, borderColor: color,
      transform: [{ rotate: '45deg' }, { translateY: -1 }],
    }} />
  </View>
);

// ── Analistas Logo ───────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ANALISTAS_LOGO = require('../../../assets/logo-white.png');

const AnalistasLogo: React.FC<{ size?: number }> = ({ size = 48 }) => (
  <Image
    source={ANALISTAS_LOGO}
    style={{ width: size, height: size }}
    resizeMode="contain"
  />
);

// ═══════════════════════════════════════════════════════════════════════════════
// ── Step 0: Welcome ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const WelcomeStep: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const c = useThemeColors();
  const { isDark } = useDarkMode();

  // Entrance animations
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoY = useRef(new Animated.Value(-10)).current;
  const iconScale = useRef(new Animated.Value(0.3)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleY = useRef(new Animated.Value(20)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleY = useRef(new Animated.Value(15)).current;
  const badgeOpacity = useRef(new Animated.Value(0)).current;
  const btnOpacity = useRef(new Animated.Value(0)).current;
  const btnY = useRef(new Animated.Value(20)).current;
  const floatY = useRef(new Animated.Value(0)).current;
  const orbScale1 = useRef(new Animated.Value(0.5)).current;
  const orbScale2 = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    // Staggered entrance using delays (more reliable than Animated.sequence with springs)
    const anims = [
      // Logo at 0ms
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(logoY, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      // Orbs at 0ms
      Animated.timing(orbScale1, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(orbScale2, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ];
    Animated.parallel(anims).start();

    // Icon at 200ms
    setTimeout(() => {
      Animated.parallel([
        Animated.spring(iconScale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 40 }),
        Animated.timing(iconOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
    }, 200);

    // Title at 700ms
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(titleY, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }, 700);

    // Subtitle at 1100ms
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(subtitleOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(subtitleY, { toValue: 0, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }, 1100);

    // Badge at 1450ms
    setTimeout(() => {
      Animated.timing(badgeOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }, 1450);

    // Button at 1750ms
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(btnOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(btnY, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }, 1750);

    // Floating loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: -8, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(floatY, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  return (
    <View style={[wst.container, { backgroundColor: c.bg }]}>
      {/* Background orbs */}
      <Animated.View style={[wst.orb1, {
        backgroundColor: isDark ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.08)',
        transform: [{ scale: orbScale1 }],
      }]} />
      <Animated.View style={[wst.orb2, {
        backgroundColor: isDark ? 'rgba(59,130,246,0.05)' : 'rgba(59,130,246,0.06)',
        transform: [{ scale: orbScale2 }],
      }]} />

      {/* Analistas logo — top right */}
      <Animated.View style={[wst.logoWrap, { opacity: logoOpacity, transform: [{ translateY: logoY }] }]}>
        <AnalistasLogo size={44} />
      </Animated.View>

      {/* Floating illustration placeholder */}
      <Animated.View style={[wst.illustrationWrap, {
        opacity: iconOpacity,
        transform: [{ scale: iconScale }, { translateY: floatY }],
      }]}>
        {/* Placeholder circle — will be replaced by illustration */}
        <View style={[wst.illustrationCircle, { backgroundColor: GREEN_DIM }]}>
          <Text style={wst.illustrationEmoji}>⚽</Text>
        </View>
        {/* Subtle "measuring tape" hint for the concept */}
        <View style={wst.measureHint}>
          <View style={[wst.measureLine, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]} />
          <View style={[wst.measureTick]} />
          <View style={[wst.measureTick, { left: '25%' }]} />
          <View style={[wst.measureTick, { left: '50%' }]} />
          <View style={[wst.measureTick, { left: '75%' }]} />
          <View style={[wst.measureTick, { left: '100%' }]} />
        </View>
      </Animated.View>

      {/* Title */}
      <Animated.View style={{ opacity: titleOpacity, transform: [{ translateY: titleY }] }}>
        <Text style={[wst.titleBig, { color: c.textPrimary }]}>LOS MEJORES</Text>
        <Text style={[wst.titleSmall, { color: c.textSecondary }]}>piden todo a su medida.</Text>
      </Animated.View>

      {/* Subtitle */}
      <Animated.Text style={[wst.subtitle, {
        color: c.textTertiary,
        opacity: subtitleOpacity,
        transform: [{ translateY: subtitleY }],
      }]}>
        Personalicemos tu app solo para ti.
      </Animated.Text>

      {/* Timer badge */}
      <Animated.View style={[wst.timeBadge, { backgroundColor: GREEN_DIM, opacity: badgeOpacity }]}>
        <Text style={wst.timeIcon}>⏱</Text>
        <Text style={[wst.timeText, { color: GREEN }]}>Solo toma 40 segundos</Text>
      </Animated.View>

      {/* CTA */}
      <Animated.View style={{ opacity: btnOpacity, transform: [{ translateY: btnY }], width: '100%', paddingHorizontal: SIDE_PAD }}>
        <TouchableOpacity style={wst.ctaBtn} onPress={onNext} activeOpacity={0.85}>
          <Text style={wst.ctaText}>COMENZAR</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const wst = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SIDE_PAD },
  orb1: { position: 'absolute', width: 220, height: 220, borderRadius: 110, top: '12%', right: '-18%' },
  orb2: { position: 'absolute', width: 160, height: 160, borderRadius: 80, bottom: '18%', left: '-12%' },
  logoWrap: { position: 'absolute', top: 16, right: 20 },
  illustrationWrap: { alignItems: 'center', marginBottom: 28 },
  illustrationCircle: {
    width: 100, height: 100, borderRadius: 50,
    alignItems: 'center', justifyContent: 'center',
  },
  illustrationEmoji: { fontSize: 48 },
  measureHint: {
    width: 80, height: 6, marginTop: 12, position: 'relative',
  },
  measureLine: { height: 1, width: '100%', position: 'absolute', top: 2.5 },
  measureTick: {
    position: 'absolute', left: 0, top: 0,
    width: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.1)',
  },
  titleBig: { fontSize: 32, fontWeight: '900', textAlign: 'center', letterSpacing: 1 },
  titleSmall: { fontSize: 20, fontWeight: '500', textAlign: 'center', marginTop: 4 },
  subtitle: { fontSize: 14, fontWeight: '500', textAlign: 'center', marginTop: 12, marginBottom: 20 },
  timeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 24, marginBottom: 28,
  },
  timeIcon: { fontSize: 16 },
  timeText: { fontSize: 14, fontWeight: '700' },
  ctaBtn: {
    backgroundColor: GREEN, borderRadius: 16, paddingVertical: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { fontSize: 17, fontWeight: '900', color: '#fff', letterSpacing: 1.5 },
});

// ═══════════════════════════════════════════════════════════════════════════════
// ── Step 1: Teams ──────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const TeamCard: React.FC<{
  team: SearchableTeam;
  selected: boolean;
  onToggle: () => void;
  cardBg: string;
  textColor: string;
  borderColor: string;
}> = React.memo(({ team, selected, onToggle, cardBg, textColor, borderColor }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, friction: 4, tension: 100 }),
    ]).start();
    onToggle();
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.85} style={{ width: CARD_W, marginBottom: CARD_GAP }}>
      <Animated.View style={[tc.card, {
        backgroundColor: selected ? GREEN_DIM : cardBg,
        borderColor: selected ? GREEN : borderColor,
        transform: [{ scale: scaleAnim }],
      }]}>
        <SmartLogo uri={team.logo} size={38} />
        <Text style={[tc.name, { color: textColor }]} numberOfLines={1}>{team.shortName}</Text>
        {selected && (
          <View style={tc.check}>
            <CheckIcon size={10} color="#fff" />
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
});

const tc = StyleSheet.create({
  card: {
    height: CARD_W * 1.05, borderRadius: 14, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', gap: 8, padding: 8,
  },
  name: { fontSize: 11, fontWeight: '700', textAlign: 'center', letterSpacing: 0.2 },
  check: {
    position: 'absolute', top: 6, right: 6,
    width: 20, height: 20, borderRadius: 10, backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
  },
});

const TeamsStep: React.FC<{
  teams: SearchableTeam[];
  loading: boolean;
  selectedTeams: string[];
  toggleTeam: (id: string) => void;
}> = ({ teams, loading, selectedTeams, toggleTeam }) => {
  const c = useThemeColors();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return teams;
    const q = query.toLowerCase();
    return teams.filter(t =>
      t.name.toLowerCase().includes(q) || t.shortName.toLowerCase().includes(q),
    );
  }, [teams, query]);

  const renderTeam = useCallback(({ item }: { item: SearchableTeam }) => (
    <TeamCard
      team={item}
      selected={selectedTeams.includes(String(item.id))}
      onToggle={() => toggleTeam(String(item.id))}
      cardBg={c.card}
      textColor={c.textPrimary}
      borderColor={c.border}
    />
  ), [selectedTeams, c]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={GREEN} />
        <Text style={{ color: c.textTertiary, fontSize: 13, marginTop: 14 }}>Cargando equipos...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={[searchS.wrap, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text style={{ fontSize: 14, opacity: 0.5 }}>🔍</Text>
        <TextInput
          style={[searchS.input, { color: c.textPrimary }]}
          placeholder="Buscar equipo..."
          placeholderTextColor={c.textTertiary}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 14, color: c.textTertiary }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {selectedTeams.length > 0 && (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: GREEN }}>
            {selectedTeams.length} equipo{selectedTeams.length !== 1 ? 's' : ''} seleccionado{selectedTeams.length !== 1 ? 's' : ''}
          </Text>
        </View>
      )}

      <FlatList
        data={filtered}
        renderItem={renderTeam}
        keyExtractor={item => String(item.id)}
        numColumns={3}
        columnWrapperStyle={{ gap: CARD_GAP }}
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 40 }}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>🔍</Text>
            <Text style={{ color: c.textTertiary, fontSize: 14 }}>No se encontraron equipos</Text>
          </View>
        }
      />
    </View>
  );
};

const searchS = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    borderRadius: 12, borderWidth: 1, marginBottom: 14,
  },
  input: { flex: 1, fontSize: 15, fontWeight: '500', padding: 0 },
});

// ═══════════════════════════════════════════════════════════════════════════════
// ── Step 2: Players ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const PlayerCard: React.FC<{
  player: SearchablePlayer;
  selected: boolean;
  onToggle: () => void;
  cardBg: string;
  textColor: string;
  textSecondary: string;
  borderColor: string;
}> = React.memo(({ player, selected, onToggle, cardBg, textColor, textSecondary, borderColor }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.95, duration: 60, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, friction: 4, tension: 100 }),
    ]).start();
    onToggle();
  };

  // Split name to show last name bigger
  const nameParts = player.name.split(' ');
  const displayName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : player.name;
  const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : '';

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.85}>
      <Animated.View style={[pc.card, {
        backgroundColor: selected ? GOLD_DIM : cardBg,
        borderColor: selected ? GOLD : borderColor,
        transform: [{ scale: scaleAnim }],
      }]}>
        {/* Photo */}
        <View style={pc.photoWrap}>
          {player.image ? (
            <Image source={{ uri: player.image }} style={pc.photo} resizeMode="cover" />
          ) : (
            <View style={[pc.photoPlaceholder, { backgroundColor: 'rgba(128,128,128,0.2)' }]}>
              <Text style={{ fontSize: 22 }}>⚽</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={pc.info}>
          {firstName ? (
            <Text style={[pc.firstName, { color: textSecondary }]} numberOfLines={1}>{firstName}</Text>
          ) : null}
          <Text style={[pc.lastName, { color: textColor }]} numberOfLines={1}>{displayName}</Text>
          {player.position ? (
            <Text style={[pc.position, { color: textSecondary }]} numberOfLines={1}>{player.position}</Text>
          ) : null}
        </View>

        {/* Checkbox */}
        <View style={[pc.checkbox, selected ? pc.checkboxOn : { borderColor }]}>
          {selected && <CheckIcon size={12} color="#fff" />}
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
});

const pc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14,
    borderWidth: 1.5, marginBottom: 8,
  },
  photoWrap: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },
  photo: { width: 44, height: 44 },
  photoPlaceholder: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  info: { flex: 1 },
  firstName: { fontSize: 11, fontWeight: '500' },
  lastName: { fontSize: 15, fontWeight: '800' },
  position: { fontSize: 11, fontWeight: '500', marginTop: 1, textTransform: 'capitalize' },
  checkbox: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: GOLD, borderColor: GOLD },
});

const PlayersStep: React.FC<{
  players: SearchablePlayer[];
  loading: boolean;
  selectedPlayers: string[];
  togglePlayer: (id: string) => void;
}> = ({ players, loading, selectedPlayers, togglePlayer }) => {
  const c = useThemeColors();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return players;
    const q = query.toLowerCase();
    return players.filter(p => p.name.toLowerCase().includes(q));
  }, [players, query]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={GOLD} />
        <Text style={{ color: c.textTertiary, fontSize: 13, marginTop: 14 }}>Cargando jugadores...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={[searchS.wrap, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text style={{ fontSize: 14, opacity: 0.5 }}>🔍</Text>
        <TextInput
          style={[searchS.input, { color: c.textPrimary }]}
          placeholder="Buscar jugador..."
          placeholderTextColor={c.textTertiary}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 14, color: c.textTertiary }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {selectedPlayers.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: GOLD }}>
            {selectedPlayers.length} jugador{selectedPlayers.length !== 1 ? 'es' : ''} seleccionado{selectedPlayers.length !== 1 ? 's' : ''}
          </Text>
        </View>
      )}

      <FlatList
        data={filtered}
        renderItem={({ item }) => (
          <PlayerCard
            player={item}
            selected={selectedPlayers.includes(String(item.id))}
            onToggle={() => togglePlayer(String(item.id))}
            cardBg={c.card}
            textColor={c.textPrimary}
            textSecondary={c.textSecondary}
            borderColor={c.border}
          />
        )}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 40 }}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>🔍</Text>
            <Text style={{ color: c.textTertiary, fontSize: 14 }}>No se encontraron jugadores</Text>
          </View>
        }
      />
    </View>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── Step 3: Leagues ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const LeagueCard: React.FC<{
  league: SearchableLeague;
  selected: boolean;
  onToggle: () => void;
  cardBg: string;
  borderColor: string;
  textPrimary: string;
  textSecondary: string;
}> = React.memo(({ league, selected, onToggle, cardBg, borderColor, textPrimary, textSecondary }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.97, duration: 60, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, friction: 5, tension: 120 }),
    ]).start();
    onToggle();
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.85}>
      <Animated.View style={[lc.card, {
        backgroundColor: selected ? GREEN_DIM : cardBg,
        borderColor: selected ? GREEN : borderColor,
        transform: [{ scale: scaleAnim }],
      }]}>
        <Text style={lc.flag}>{league.flag}</Text>
        <View style={lc.info}>
          <Text style={[lc.name, { color: textPrimary }]}>{league.name}</Text>
          <Text style={[lc.country, { color: textSecondary }]}>{league.country}</Text>
        </View>
        <View style={[lc.sugBadge, { backgroundColor: GREEN_DIM }]}>
          <Text style={[lc.sugText, { color: GREEN }]}>Sugerida</Text>
        </View>
        <View style={[lc.checkbox, selected ? lc.checkboxOn : { borderColor }]}>
          {selected && <CheckIcon size={12} color="#fff" />}
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
});

const lc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 18, borderRadius: 14,
    borderWidth: 1.5, marginBottom: 10,
  },
  flag: { fontSize: 28 },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700' },
  country: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  sugBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  sugText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  checkbox: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: GREEN, borderColor: GREEN },
});

const LeaguesStep: React.FC<{
  selectedLeagues: string[];
  toggleLeague: (id: string) => void;
}> = ({ selectedLeagues, toggleLeague }) => {
  const c = useThemeColors();
  const leagues = useMemo(() => getSearchableLeagues(), []);

  useEffect(() => {
    if (selectedLeagues.length === 0) {
      leagues.forEach(l => toggleLeague(String(l.id)));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ flex: 1 }}>
      {leagues.map(league => (
        <LeagueCard
          key={league.id}
          league={league}
          selected={selectedLeagues.includes(String(league.id))}
          onToggle={() => toggleLeague(String(league.id))}
          cardBg={c.card}
          borderColor={c.border}
          textPrimary={c.textPrimary}
          textSecondary={c.textSecondary}
        />
      ))}
      <View style={ls.comingSoon}>
        <Text style={{ fontSize: 18 }}>🌍</Text>
        <View style={{ flex: 1 }}>
          <Text style={[ls.comingTitle, { color: c.textSecondary }]}>Más ligas próximamente</Text>
          <Text style={[ls.comingSub, { color: c.textTertiary }]}>
            Premier League, La Liga, Serie A, Bundesliga y más
          </Text>
        </View>
      </View>
    </View>
  );
};

const ls = StyleSheet.create({
  comingSoon: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 18, marginTop: 10, opacity: 0.7,
  },
  comingTitle: { fontSize: 14, fontWeight: '700' },
  comingSub: { fontSize: 12, fontWeight: '500', marginTop: 2 },
});

// ═══════════════════════════════════════════════════════════════════════════════
// ── Step 4: Notifications ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

interface NotifItem { key: string; icon: string; label: string; description: string; }

const NOTIF_ITEMS: NotifItem[] = [
  { key: 'goals',      icon: '⚽', label: 'Goles',              description: 'Cuando alguien anota en tus partidos' },
  { key: 'matchStart', icon: '📣', label: 'Inicio de partido',  description: '5 minutos antes del pitazo inicial' },
  { key: 'results',    icon: '🏆', label: 'Resultados finales', description: 'Resultado final al terminar el partido' },
  { key: 'lineups',    icon: '📋', label: 'Alineaciones',       description: 'Alineaciones confirmadas antes del partido' },
  { key: 'transfers',  icon: '🔄', label: 'Fichajes',           description: 'Noticias de transferencias de tus equipos' },
  { key: 'news',       icon: '📰', label: 'Noticias',           description: 'Artículos y análisis relevantes' },
];

const NotificationRow: React.FC<{
  item: NotifItem; value: boolean; onToggle: () => void;
  borderColor: string; textPrimary: string; textSecondary: string;
}> = React.memo(({ item, value, onToggle, borderColor, textPrimary, textSecondary }) => (
  <View style={[nr.row, { borderBottomColor: borderColor }]}>
    <Text style={nr.icon}>{item.icon}</Text>
    <View style={nr.info}>
      <Text style={[nr.label, { color: textPrimary }]}>{item.label}</Text>
      <Text style={[nr.desc, { color: textSecondary }]}>{item.description}</Text>
    </View>
    <CustomToggle value={value} onToggle={onToggle} />
  </View>
));

const nr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, borderBottomWidth: 1 },
  icon: { fontSize: 22, width: 30, textAlign: 'center' },
  info: { flex: 1 },
  label: { fontSize: 15, fontWeight: '700' },
  desc: { fontSize: 12, fontWeight: '500', marginTop: 2 },
});

const NotificationsStep: React.FC<{
  notifications: Record<string, boolean>;
  toggleNotification: (key: string) => void;
}> = ({ notifications, toggleNotification }) => {
  const c = useThemeColors();
  return (
    <View style={{ flex: 1 }}>
      <View style={[ns.callout, { backgroundColor: GREEN_DIM }]}>
        <Text style={{ fontSize: 16 }}>🔔</Text>
        <Text style={[ns.calloutText, { color: GREEN }]}>Puedes cambiar esto después en Configuración</Text>
      </View>
      {NOTIF_ITEMS.map(item => (
        <NotificationRow
          key={item.key}
          item={item}
          value={notifications[item.key] ?? false}
          onToggle={() => toggleNotification(item.key)}
          borderColor={c.borderLight}
          textPrimary={c.textPrimary}
          textSecondary={c.textSecondary}
        />
      ))}
    </View>
  );
};

const ns = StyleSheet.create({
  callout: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, marginBottom: 8,
  },
  calloutText: { fontSize: 13, fontWeight: '600', flex: 1 },
});

// ═══════════════════════════════════════════════════════════════════════════════
// ── Step 5: Presentación (Login) ───────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const SocialButton: React.FC<{
  icon: React.ReactNode; label: string; bg: string; textColor: string;
  borderColor?: string; onPress: () => void;
}> = ({ icon, label, bg, textColor, borderColor, onPress }) => (
  <TouchableOpacity
    style={[sb.btn, { backgroundColor: bg, borderColor: borderColor || bg }]}
    onPress={onPress}
    activeOpacity={0.85}
  >
    {icon}
    <Text style={[sb.label, { color: textColor }]}>{label}</Text>
  </TouchableOpacity>
);

const sb = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, marginBottom: 8,
  },
  label: { fontSize: 15, fontWeight: '700' },
});

const AppleIcon: React.FC<{ color: string }> = ({ color }) => (
  <Text style={{ fontSize: 18, color, marginTop: -2 }}></Text>
);

const GoogleIcon: React.FC = () => (
  <View style={gi.wrap}><Text style={gi.text}>G</Text></View>
);
const gi = StyleSheet.create({
  wrap: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#4285F4', alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 14, fontWeight: '900', color: '#fff', marginTop: -1 },
});

const FacebookIcon: React.FC = () => (
  <Text style={{ fontSize: 20, fontWeight: '900', color: '#fff', marginTop: -1 }}>f</Text>
);

const PresentacionStep: React.FC<{
  teamsCount: number;
  leaguesCount: number;
  playersCount: number;
  userName: string;
  onChangeName: (name: string) => void;
  onLogin: (method: AuthMethod) => void;
  onSkip: () => void;
}> = ({ teamsCount, leaguesCount, playersCount, userName, onChangeName, onLogin, onSkip }) => {
  const c = useThemeColors();
  const { isDark } = useDarkMode();

  // Entrance animations
  const jerseyScale = useRef(new Animated.Value(0.5)).current;
  const jerseyOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    // Jersey entrance — use spring for scale so it never goes negative (Easing.back can produce
    // negative intermediate scale values which crash Android's native animation driver)
    Animated.parallel([
      Animated.spring(jerseyScale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 60 }),
      Animated.timing(jerseyOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    // Content fades in after jersey
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(contentOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(contentY, { toValue: 0, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }, 500);
  }, []);

  // Jersey shows last name only (like a real jersey)
  const jerseyDisplayName = useMemo(() => {
    const trimmed = userName.trim();
    if (!trimmed) return '';
    const words = trimmed.split(/\s+/);
    // If only one word, show it. If multiple, show the last word (surname).
    return words[words.length - 1].toUpperCase();
  }, [userName]);

  // Summary
  const parts: string[] = [];
  if (teamsCount > 0) parts.push(`${teamsCount} equipo${teamsCount !== 1 ? 's' : ''}`);
  if (playersCount > 0) parts.push(`${playersCount} jugador${playersCount !== 1 ? 'es' : ''}`);
  if (leaguesCount > 0) parts.push(`${leaguesCount} liga${leaguesCount !== 1 ? 's' : ''}`);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={40}
    >
      <ScrollView
        contentContainerStyle={prs.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Jersey / Presentation visual */}
        <Animated.View style={[prs.jerseyWrap, { opacity: jerseyOpacity, transform: [{ scale: jerseyScale }] }]}>
          <View style={[prs.jersey, { backgroundColor: isDark ? '#1a1d2e' : '#f1f5f9', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}>
            <Text style={{ fontSize: 36 }}>👕</Text>
            {userName.length > 0 ? (
              <Text
                style={[prs.jerseyName, {
                  color: c.textPrimary,
                  fontSize: jerseyDisplayName.length > 10 ? 9 : jerseyDisplayName.length > 7 ? 11 : 13,
                  letterSpacing: jerseyDisplayName.length > 10 ? 0.5 : jerseyDisplayName.length > 7 ? 1 : 2,
                }]}
                numberOfLines={1}
              >
                {jerseyDisplayName}
              </Text>
            ) : (
              <Text style={[prs.jerseyName, { color: c.textTertiary }]}>TU NOMBRE</Text>
            )}
            <Text style={[prs.jerseyNumber, { color: GREEN }]}>10</Text>
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: contentOpacity, transform: [{ translateY: contentY }] }}>
          {/* Headline */}
          <Text style={[prs.headline, { color: c.textPrimary }]}>TE DAMOS LA BIENVENIDA</Text>

          {/* Emotional subtext */}
          <Text style={[prs.emotional, { color: GREEN }]}>
            No eres solo un número.{'\n'}Queremos llamarte por tu nombre.
          </Text>

          {/* Name input */}
          <View style={[prs.nameInputWrap, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={{ fontSize: 16 }}>✏️</Text>
            <TextInput
              style={[prs.nameInput, { color: c.textPrimary }]}
              placeholder="¿Cómo te llaman?"
              placeholderTextColor={c.textTertiary}
              value={userName}
              onChangeText={onChangeName}
              autoCorrect={false}
              autoCapitalize="words"
              returnKeyType="done"
              maxLength={30}
            />
          </View>

          {/* Summary */}
          {parts.length > 0 && (
            <Text style={[prs.summary, { color: c.textTertiary }]}>
              Siguiendo {parts.join(' · ')}
            </Text>
          )}

          {/* Registration subtext */}
          <Text style={[prs.regSubtext, { color: c.textTertiary }]}>
            Regístrate para guardar tu configuración
          </Text>

          {/* Social buttons */}
          <View style={prs.buttons}>
            <SocialButton
              icon={<AppleIcon color={isDark ? '#000' : '#fff'} />}
              label="Continuar con Apple"
              bg={isDark ? '#fff' : '#000'}
              textColor={isDark ? '#000' : '#fff'}
              onPress={() => onLogin('apple')}
            />
            <SocialButton
              icon={<GoogleIcon />}
              label="Continuar con Google"
              bg={c.card}
              textColor={c.textPrimary}
              borderColor={c.border}
              onPress={() => onLogin('google')}
            />
            <SocialButton
              icon={<FacebookIcon />}
              label="Continuar con Facebook"
              bg="#1877F2"
              textColor="#fff"
              onPress={() => onLogin('facebook')}
            />
          </View>

          {/* Guest */}
          <TouchableOpacity onPress={onSkip} style={prs.skipWrap} activeOpacity={0.7}>
            <Text style={[prs.skipText, { color: c.textTertiary }]}>Continuar sin cuenta</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const prs = StyleSheet.create({
  scroll: { paddingHorizontal: 4, paddingBottom: 24 },
  jerseyWrap: { alignItems: 'center', marginTop: 8, marginBottom: 20 },
  jersey: {
    width: 140, height: 140, borderRadius: 20, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  jerseyName: { fontSize: 13, fontWeight: '900', letterSpacing: 2, marginTop: 4, textAlign: 'center' },
  jerseyNumber: { fontSize: 28, fontWeight: '900', marginTop: -2 },
  headline: { fontSize: 24, fontWeight: '900', textAlign: 'center', letterSpacing: 0.5, marginBottom: 10 },
  emotional: { fontSize: 15, fontWeight: '600', textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  nameInputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    borderRadius: 14, borderWidth: 1.5, marginBottom: 14,
  },
  nameInput: { flex: 1, fontSize: 16, fontWeight: '600', padding: 0 },
  summary: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 16 },
  regSubtext: { fontSize: 13, fontWeight: '500', textAlign: 'center', marginBottom: 16 },
  buttons: {},
  skipWrap: { alignItems: 'center', paddingVertical: 14, marginTop: 2 },
  skipText: { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
});

// ═══════════════════════════════════════════════════════════════════════════════
// ── Main Onboarding Screen ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

export const OnboardingScreen: React.FC = () => {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();

  // Contexts
  const {
    selectedTeams, toggleTeam,
    selectedLeagues, toggleLeague,
    selectedPlayers, togglePlayer,
    notifications, toggleNotification,
    completeOnboarding,
  } = useOnboarding();
  const {
    toggleFollowTeam, isFollowingTeam,
    toggleFollowLeague, isFollowingLeague,
    toggleFollowPlayer, isFollowingPlayer,
  } = useFavorites();
  const { login } = useAuth();

  // Step state
  const [step, setStep] = useState(0);

  // User name for presentación
  const [userName, setUserName] = useState('');

  // Data
  const [teams, setTeams] = useState<SearchableTeam[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [players, setPlayers] = useState<SearchablePlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);

  // Transition animation
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Load teams + players on mount (parallel)
  useEffect(() => {
    let cancelled = false;
    getSearchableTeams().then(data => {
      if (!cancelled) { setTeams(data); setTeamsLoading(false); }
    }).catch(() => { if (!cancelled) setTeamsLoading(false); });

    getSearchablePlayers().then(data => {
      if (!cancelled) { setPlayers(data); setPlayersLoading(false); }
    }).catch(() => { if (!cancelled) setPlayersLoading(false); });

    return () => { cancelled = true; };
  }, []);

  // Pending fade-in after step change
  const [pendingFadeIn, setPendingFadeIn] = useState(false);

  useEffect(() => {
    if (pendingFadeIn) {
      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.timing(slideAnim, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start(() => setPendingFadeIn(false));
      });
    }
  }, [pendingFadeIn, step]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation ──────────────────────────────────────────────────────────
  const animateTransition = useCallback((next: number) => {
    const direction = next > step ? 1 : -1;
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -direction * 30, duration: 120, useNativeDriver: true }),
    ]).start(() => {
      slideAnim.setValue(direction * 30);
      setStep(next);
      setPendingFadeIn(true);
    });
  }, [step, fadeAnim, slideAnim]);

  const goNext = useCallback(() => {
    Keyboard.dismiss();
    if (step < TOTAL_STEPS - 1) animateTransition(step + 1);
  }, [step, animateTransition]);

  const goBack = useCallback(() => {
    Keyboard.dismiss();
    if (step > 0) animateTransition(step - 1);
  }, [step, animateTransition]);

  const handleSkipToEnd = useCallback(() => {
    Keyboard.dismiss();
    animateTransition(TOTAL_STEPS - 1);
  }, [animateTransition]);

  // ── Finish ──────────────────────────────────────────────────────────────
  const finishOnboarding = useCallback((method?: AuthMethod) => {
    // Sync to FavoritesContext
    selectedTeams.forEach(id => { if (!isFollowingTeam(id)) toggleFollowTeam(id); });
    selectedLeagues.forEach(id => { if (!isFollowingLeague(id)) toggleFollowLeague(id); });
    selectedPlayers.forEach(id => { if (!isFollowingPlayer(id)) toggleFollowPlayer(id); });
    // Login
    if (method && method !== 'guest') {
      login(method);
    } else {
      login('guest');
    }
    completeOnboarding();
  }, [selectedTeams, selectedLeagues, selectedPlayers, isFollowingTeam, isFollowingLeague, isFollowingPlayer, toggleFollowTeam, toggleFollowLeague, toggleFollowPlayer, login, completeOnboarding]);

  // ── Step metadata ───────────────────────────────────────────────────────
  const stepMeta: Record<number, { title: string; subtitle: string }> = {
    1: { title: 'Elige tus equipos', subtitle: 'Sigue a tus equipos favoritos para contenido personalizado' },
    2: { title: 'Sigue jugadores', subtitle: 'Sigue a tus jugadores favoritos, sin importar el equipo' },
    3: { title: 'Competiciones', subtitle: 'Elige las ligas que te interesan' },
    4: { title: 'Notificaciones', subtitle: 'Elige las alertas que quieres recibir' },
  };

  // ── CTA label ───────────────────────────────────────────────────────────
  const ctaLabel = () => {
    if (step === 1 && selectedTeams.length > 0) return `CONTINUAR (${selectedTeams.length})`;
    if (step === 2 && selectedPlayers.length > 0) return `CONTINUAR (${selectedPlayers.length})`;
    if (step === 3 && selectedLeagues.length > 0) return `CONTINUAR (${selectedLeagues.length})`;
    return 'CONTINUAR';
  };

  // ── Render ──────────────────────────────────────────────────────────────

  // Step 0: Welcome — full-screen
  if (step === 0) {
    return (
      <View style={[ob.root, { backgroundColor: c.bg, paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" />
        <ProgressBar step={0} bgColor={c.border} />
        <WelcomeStep onNext={goNext} />
      </View>
    );
  }

  // Step 5: Presentación — its own layout
  if (step === 5) {
    return (
      <View style={[ob.root, { backgroundColor: c.bg, paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" />
        <ProgressBar step={5} bgColor={c.border} />
        {/* Back button */}
        <View style={ob.topBar}>
          <TouchableOpacity onPress={goBack} style={ob.backBtn} activeOpacity={0.7} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <BackArrow color={c.textSecondary} />
          </TouchableOpacity>
          <View />
        </View>
        <Animated.View style={[ob.content, { opacity: fadeAnim, transform: [{ translateX: slideAnim }] }]}>
          <PresentacionStep
            teamsCount={selectedTeams.length}
            leaguesCount={selectedLeagues.length}
            playersCount={selectedPlayers.length}
            userName={userName}
            onChangeName={setUserName}
            onLogin={(method) => finishOnboarding(method)}
            onSkip={() => finishOnboarding()}
          />
        </Animated.View>
        <View style={{ height: insets.bottom + 8 }} />
      </View>
    );
  }

  // Steps 1–4: shared layout
  const meta = stepMeta[step];

  return (
    <View style={[ob.root, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />
      <ProgressBar step={step} bgColor={c.border} />

      <View style={ob.topBar}>
        <TouchableOpacity onPress={goBack} style={ob.backBtn} activeOpacity={0.7} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <BackArrow color={c.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSkipToEnd} activeOpacity={0.7} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[ob.skipText, { color: c.textTertiary }]}>Omitir</Text>
        </TouchableOpacity>
      </View>

      <Animated.View style={[ob.header, { opacity: fadeAnim, transform: [{ translateX: slideAnim }] }]}>
        <Text style={[ob.title, { color: c.textPrimary }]}>{meta.title}</Text>
        <Text style={[ob.subtitle, { color: c.textSecondary }]}>{meta.subtitle}</Text>
      </Animated.View>

      <Animated.View style={[ob.stepContent, { opacity: fadeAnim, transform: [{ translateX: slideAnim }] }]}>
        {step === 1 && (
          <TeamsStep teams={teams} loading={teamsLoading} selectedTeams={selectedTeams} toggleTeam={toggleTeam} />
        )}
        {step === 2 && (
          <PlayersStep players={players} loading={playersLoading} selectedPlayers={selectedPlayers} togglePlayer={togglePlayer} />
        )}
        {step === 3 && (
          <LeaguesStep selectedLeagues={selectedLeagues} toggleLeague={toggleLeague} />
        )}
        {step === 4 && (
          <NotificationsStep notifications={notifications} toggleNotification={toggleNotification} />
        )}
      </Animated.View>

      <View style={[ob.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={ob.ctaBtn} onPress={goNext} activeOpacity={0.85}>
          <Text style={ob.ctaBtnText}>{ctaLabel()}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── Main Styles ────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const ob = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, paddingHorizontal: SIDE_PAD },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SIDE_PAD, paddingVertical: 14,
  },
  backBtn: { padding: 4 },
  skipText: { fontSize: 14, fontWeight: '600' },
  header: { paddingHorizontal: SIDE_PAD, marginBottom: 20 },
  title: { fontSize: 26, fontWeight: '900', letterSpacing: -0.3, marginBottom: 6 },
  subtitle: { fontSize: 14, fontWeight: '500', lineHeight: 20 },
  stepContent: { flex: 1, paddingHorizontal: SIDE_PAD },
  bottomBar: { paddingHorizontal: SIDE_PAD, paddingTop: 8 },
  ctaBtn: {
    backgroundColor: GREEN, borderRadius: 16, paddingVertical: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaBtnText: { fontSize: 16, fontWeight: '900', color: '#fff', letterSpacing: 1 },
});
