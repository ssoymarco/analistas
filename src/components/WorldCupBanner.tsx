// ── World Cup 2026 floating countdown banner ─────────────────────────────────
// Floating two-state widget over the Partidos screen.
//
//   • Expanded:  full pill with D:H:M:S countdown + "−" minimize button.
//                Tap anywhere on the pill → navigates to the tournament page.
//                Tap − → collapses to the minimized circle.
//   • Minimized: compact circle with the 🌍 emoji + a small "×" dismiss badge.
//                Tap circle body → re-expands.
//                Tap × badge → dismisses the banner for 24 hours.
//
// Auto-states based on tournament dates (Jun 11 → Jul 19, 2026):
//   • Pre:   countdown (D · H · M · S)
//   • Live:  "EN CURSO" with pulsing red dot
//   • Done:  returns null (component hides itself permanently)
//
// User preferences (minimized + dismissed-until) are persisted in AsyncStorage.
//
// COPYRIGHT NOTE: Only uses the generic label "Mundial 2026" + 🌍 emoji.
// No FIFA-trademarked terms or imagery anywhere.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Easing, Platform, Alert,
  PanResponder, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PartidosStackParamList } from '../navigation/AppNavigator';

// ── Tournament dates (UTC) ───────────────────────────────────────────────────
const KICKOFF_UTC = new Date('2026-06-11T16:00:00Z').getTime();
const FINAL_UTC   = new Date('2026-07-19T22:00:00Z').getTime();

// League info passed to the detail screen on tap
const WC_LEAGUE_ID   = 732;
const WC_LEAGUE_NAME = 'Mundial 2026';
const WC_SEASON_ID   = 26618;

// AsyncStorage keys
const KEY_MINIMIZED = 'analistas_wc_banner_minimized';
const KEY_POSITION  = 'analistas_wc_banner_position'; // {x,y} translate offsets
// Master toggle (Perfil → Ajustes). Default = enabled.
export const KEY_WC_BANNER_ENABLED = 'analistas_wc_banner_enabled';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const DRAG_THRESHOLD = 6; // px before a press becomes a drag

// SportMonks-inspired pink/magenta palette
const COLOR_DEEP = '#9C1C4E';
const COLOR_MAIN = '#C2185B';
const COLOR_LITE = '#E91E63';

// ── Countdown state ──────────────────────────────────────────────────────────
type CountdownState =
  | { phase: 'pre'; days: number; hours: number; minutes: number; seconds: number }
  | { phase: 'live'; daysElapsed: number }
  | { phase: 'done' };

function computeState(now = Date.now()): CountdownState {
  if (now < KICKOFF_UTC) {
    const diff = Math.max(0, KICKOFF_UTC - now);
    const days    = Math.floor(diff / (24 * 3600 * 1000));
    const hours   = Math.floor((diff % (24 * 3600 * 1000)) / (3600 * 1000));
    const minutes = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
    const seconds = Math.floor((diff % (60 * 1000)) / 1000);
    return { phase: 'pre', days, hours, minutes, seconds };
  }
  if (now <= FINAL_UTC) {
    return { phase: 'live', daysElapsed: Math.floor((now - KICKOFF_UTC) / (24 * 3600 * 1000)) };
  }
  return { phase: 'done' };
}

const pad = (n: number) => n.toString().padStart(2, '0');

interface Props {
  /** When true, banner stays visible even after the tournament ends (debug only) */
  forceShow?: boolean;
}

export const WorldCupBanner: React.FC<Props> = ({ forceShow }) => {
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();
  const insets = useSafeAreaInsets();

  const [state, setState]       = useState<CountdownState>(() => computeState());
  const [minimized, setMinimized] = useState<boolean>(false);
  const [enabled, setEnabled]   = useState<boolean>(true);
  const [hydrated, setHydrated] = useState(false);

  // ── Hydrate persisted preferences ─────────────────────────────────────────
  // Re-read prefs every few seconds so toggle changes from Perfil propagate
  // even without remounting this component.
  const readPrefs = React.useCallback(() => {
    Promise.all([
      AsyncStorage.getItem(KEY_MINIMIZED),
      AsyncStorage.getItem(KEY_WC_BANNER_ENABLED),
    ])
      .then(([min, en]) => {
        setMinimized(min === '1');
        setEnabled(en !== '0'); // default true unless explicitly disabled
      })
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    readPrefs();
    // Poll every 3s while mounted so the toggle in Perfil takes effect quickly
    const id = setInterval(readPrefs, 3000);
    return () => clearInterval(id);
  }, [readPrefs]);

  // ── Tick: 1s during pre-tournament (we display seconds), 60s otherwise ────
  useEffect(() => {
    const intervalMs = state.phase === 'pre' ? 1000 : 60 * 1000;
    const id = setInterval(() => setState(computeState()), intervalMs);
    return () => clearInterval(id);
  }, [state.phase]);

  // ── Pulse for live red dot ────────────────────────────────────────────────
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (state.phase !== 'live') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [state.phase, pulse]);

  // ── Morph: expanded ↔ minimized ───────────────────────────────────────────
  const morph = useRef(new Animated.Value(minimized ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(morph, {
      toValue: minimized ? 1 : 0,
      useNativeDriver: true,
      tension: 60, friction: 11,
    }).start();
  }, [minimized, morph]);

  // ── Drag: position of the minimized circle relative to default (bottom-right)
  // We use translate offsets — negative X moves left, negative Y moves up.
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const lastPos = useRef({ x: 0, y: 0 });

  // Hydrate saved position on mount
  useEffect(() => {
    AsyncStorage.getItem(KEY_POSITION).then(raw => {
      if (!raw) return;
      try {
        const p = JSON.parse(raw);
        if (typeof p?.x === 'number' && typeof p?.y === 'number') {
          lastPos.current = p;
          pan.setValue(p);
        }
      } catch {}
    }).catch(() => {});
  }, [pan]);

  // Compute drag bounds (we only let the circle move within the screen)
  // Default circle position is bottom-right; pan.x ≤ 0 (drag left), pan.y ≤ 0 (drag up)
  const minX = -(SCREEN_W - MINI_SIZE - 28);                 // can drag left edge
  const maxX = 0;                                            // can't go further right
  const minY = -(SCREEN_H - insets.top - MINI_SIZE - 120);   // top boundary (keep below status bar)
  const maxY = 0;                                            // can't go further down

  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

  const panResponder = useMemo(() => PanResponder.create({
    // Only the minimized circle should be draggable
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) =>
      minimized && (Math.abs(g.dx) > DRAG_THRESHOLD || Math.abs(g.dy) > DRAG_THRESHOLD),
    onPanResponderGrant: () => {
      pan.setOffset({ x: lastPos.current.x, y: lastPos.current.y });
      pan.setValue({ x: 0, y: 0 });
    },
    onPanResponderMove: Animated.event(
      [null, { dx: pan.x, dy: pan.y }],
      { useNativeDriver: false },
    ),
    onPanResponderRelease: (_, g) => {
      pan.flattenOffset();
      const next = {
        x: clamp(lastPos.current.x + g.dx, minX, maxX),
        y: clamp(lastPos.current.y + g.dy, minY, maxY),
      };
      lastPos.current = next;
      // Spring it into the clamped position
      Animated.spring(pan, {
        toValue: next, useNativeDriver: false, tension: 70, friction: 11,
      }).start();
      AsyncStorage.setItem(KEY_POSITION, JSON.stringify(next)).catch(() => {});
    },
  }), [minimized, minX, maxX, minY, maxY, pan]);

  // ── Persistence helpers ───────────────────────────────────────────────────
  const setMinimizedPersist = (v: boolean) => {
    setMinimized(v);
    AsyncStorage.setItem(KEY_MINIMIZED, v ? '1' : '0').catch(() => {});
  };
  const dismissBanner = () => {
    // Tapping × disables the banner via the master toggle. The user can
    // re-enable it from Perfil → Banner Mundial 2026.
    setEnabled(false);
    AsyncStorage.setItem(KEY_WC_BANNER_ENABLED, '0').catch(() => {});
    Alert.alert(
      'Banner ocultado',
      'Para volver a mostrarlo, ve a Perfil → Banner Mundial 2026.',
      [{ text: 'Entendido', style: 'default' }],
    );
  };

  // ── Visibility gates ──────────────────────────────────────────────────────
  if (state.phase === 'done' && !forceShow) return null;
  if (!hydrated) return null;
  if (!enabled && !forceShow) return null;          // master toggle off

  const goToLeague = () => {
    navigation.push('LeagueDetail', {
      leagueId: WC_LEAGUE_ID,
      leagueName: WC_LEAGUE_NAME,
      leagueLogo: '',
      seasonId: WC_SEASON_ID,
    });
  };

  // Animated style interpolations
  const expandedOpacity = morph.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const expandedScale   = morph.interpolate({ inputRange: [0, 1], outputRange: [1, 0.85] });
  const miniOpacity     = morph.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const miniScale       = morph.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });

  // Floating position — bottom-right, above the tab bar + safe area
  const bottomOffset = insets.bottom + 72;

  return (
    <View pointerEvents="box-none" style={[s.root, { bottom: bottomOffset }]}>
      {/* ── EXPANDED PILL ─────────────────────────────────────────────────── */}
      <Animated.View
        pointerEvents={minimized ? 'none' : 'auto'}
        style={[
          s.expandedWrap,
          { opacity: expandedOpacity, transform: [{ scale: expandedScale }] },
        ]}
      >
        <TouchableOpacity activeOpacity={0.88} onPress={goToLeague} style={s.expandedTouchable}>
          <LinearGradient
            colors={[COLOR_DEEP, COLOR_MAIN, COLOR_LITE]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.expandedGradient}
          >
            {/* Header row: emoji + title + minimize */}
            <View style={s.headerRow}>
              <View style={s.titleRow}>
                <Text style={s.emoji}>🌍</Text>
                <Text style={s.title}>Mundial 2026</Text>
              </View>
              <TouchableOpacity
                onPress={() => setMinimizedPersist(true)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={s.headerBtn}
              >
                <Text style={s.minimizeText}>−</Text>
              </TouchableOpacity>
            </View>

            {/* Body */}
            {state.phase === 'pre' ? (
              <View style={s.timerRow}>
                <TimerBlock value={pad(state.days)}    label="DÍAS" />
                <Separator />
                <TimerBlock value={pad(state.hours)}   label="HRS"  />
                <Separator />
                <TimerBlock value={pad(state.minutes)} label="MIN"  />
                <Separator />
                <TimerBlock value={pad(state.seconds)} label="SEG"  />
              </View>
            ) : state.phase === 'live' ? (
              <View style={s.liveRow}>
                <Animated.View
                  style={[s.liveDot, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }]}
                />
                <Text style={s.liveText}>EN CURSO · Día {state.daysElapsed + 1}</Text>
              </View>
            ) : null}

            <Text style={s.footerHint}>11 jun · USA · CAN · MEX  ›</Text>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      {/* ── MINIMIZED CIRCLE — draggable ──────────────────────────────────── */}
      {/* Outer: handles drag (JS driver). Inner: handles morph scale (native). */}
      <Animated.View
        pointerEvents={minimized ? 'auto' : 'none'}
        {...panResponder.panHandlers}
        style={[
          s.miniWrap,
          { transform: [{ translateX: pan.x }, { translateY: pan.y }] },
        ]}
      ><Animated.View
        style={{
          opacity: miniOpacity,
          transform: [{ scale: miniScale }],
          width: '100%',
          height: '100%',
          alignItems: 'flex-end',
          justifyContent: 'flex-end',
        }}
      >
        {/* Globe circle — tap to expand */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setMinimizedPersist(false)}
          style={s.miniTouchable}
        >
          <LinearGradient
            colors={[COLOR_DEEP, COLOR_LITE]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.miniGradient}
          >
            <Text style={s.miniEmoji}>🌍</Text>
            {state.phase === 'live' ? (
              <Animated.View
                style={[s.miniLiveDot, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }]}
              />
            ) : null}
          </LinearGradient>
        </TouchableOpacity>

        {/* × dismiss badge — tap to hide banner for 24h */}
        <TouchableOpacity
          onPress={dismissBanner}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={s.dismissBadge}
          activeOpacity={0.7}
        >
          <Text style={s.dismissText}>×</Text>
        </TouchableOpacity>
      </Animated.View>
      </Animated.View>
    </View>
  );
};

// ── Sub-components ───────────────────────────────────────────────────────────
const TimerBlock: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <View style={s.timerBlock}>
    <Text style={s.timerValue}>{value}</Text>
    <Text style={s.timerLabel}>{label}</Text>
  </View>
);

const Separator: React.FC = () => <Text style={s.timerSep}>:</Text>;

// ── Styles ───────────────────────────────────────────────────────────────────
const MINI_SIZE = 64;

const s = StyleSheet.create({
  root: {
    position: 'absolute',
    right: 14,
    left: 14,
    alignItems: 'flex-end',
    zIndex: 100,
  },

  // EXPANDED
  expandedWrap: {
    shadowColor: COLOR_MAIN,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  },
  expandedTouchable: { borderRadius: 18, overflow: 'hidden' },
  expandedGradient: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    minWidth: 280,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emoji: { fontSize: 22 },
  title: {
    fontSize: 14, fontWeight: '900', color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  headerBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  minimizeText: {
    color: '#FFFFFF', fontSize: 22, fontWeight: '900',
    lineHeight: Platform.OS === 'ios' ? 24 : 26,
    marginTop: Platform.OS === 'ios' ? -4 : 0,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  timerBlock: {
    alignItems: 'center',
    minWidth: 44,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  timerValue: {
    fontSize: 18, fontWeight: '900', color: '#FFFFFF',
    letterSpacing: -0.5, lineHeight: 20,
    fontVariant: ['tabular-nums'],
  },
  timerLabel: {
    fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.82)',
    letterSpacing: 0.8, marginTop: 1,
  },
  timerSep: { fontSize: 18, fontWeight: '900', color: 'rgba(255,255,255,0.5)' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF453A' },
  liveText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
  footerHint: {
    fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.82)',
    letterSpacing: 0.3, marginTop: 2,
  },

  // MINIMIZED
  miniWrap: {
    position: 'absolute',
    right: 0, bottom: 0,
    width:  MINI_SIZE + 16, // extra room for the × badge to overflow
    height: MINI_SIZE + 16,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  miniTouchable: {
    borderRadius: MINI_SIZE / 2,
    overflow: 'hidden',
    shadowColor: COLOR_MAIN,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: 9,
  },
  miniGradient: {
    width: MINI_SIZE, height: MINI_SIZE, borderRadius: MINI_SIZE / 2,
    alignItems: 'center', justifyContent: 'center',
  },
  miniEmoji: { fontSize: 40 },
  miniLiveDot: {
    position: 'absolute',
    bottom: 6, left: 6,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#FF453A',
    borderWidth: 2, borderColor: '#FFFFFF',
  },

  // × dismiss badge (top-right corner of the circle)
  dismissBadge: {
    position: 'absolute',
    top: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#0D0D0D',
    borderWidth: 2, borderColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  dismissText: {
    color: '#FFFFFF', fontSize: 14, fontWeight: '900',
    lineHeight: Platform.OS === 'ios' ? 16 : 18,
    marginTop: Platform.OS === 'ios' ? -2 : 0,
  },
});
