// ── Streak Modal ─────────────────────────────────────────────────────────────
// Shared modal showing streak stats, milestones, motivational quotes,
// and notification toggle. Used from both Perfil and Partidos screens.

import React, { useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, Animated, Platform,
} from 'react-native';
import type { ColorPalette } from '../theme/colors';

// ── Toggle (self-contained so StreakModal has no external deps) ───────────────
function Toggle({ value, onToggle, activeColor, icon }: {
  value: boolean; onToggle: () => void; activeColor: string; icon?: string;
}) {
  return (
    <TouchableOpacity
      style={{ width: 48, height: 28, borderRadius: 14, justifyContent: 'center', backgroundColor: value ? activeColor : 'rgba(128,128,128,0.25)' }}
      onPress={onToggle} activeOpacity={0.8}
    >
      <View style={{
        width: 22, height: 22, borderRadius: 11, backgroundColor: '#ffffff',
        alignItems: 'center', justifyContent: 'center',
        transform: [{ translateX: value ? 22 : 3 }],
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
      }}>
        {icon ? <Text style={{ fontSize: 10 }}>{icon}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

// ── Data ─────────────────────────────────────────────────────────────────────
export const STREAK_MILESTONES = [
  { days: 3,   emoji: '🌱', name: 'Primer brote',   desc: '¡Ya diste el primer paso, sigue así!', color: '#4ade80' },
  { days: 7,   emoji: '🔥', name: 'En llamas',       desc: 'Una semana sin fallar. ¡Verdadero hincha!', color: '#ff7a00' },
  { days: 14,  emoji: '⚡', name: 'Electrizante',    desc: 'Tu compromiso con el fútbol habla por sí solo.', color: '#facc15' },
  { days: 30,  emoji: '🏆', name: 'Campeón',         desc: 'Un mes entero. No eres un aficionado cualquiera.', color: '#60a5fa' },
  { days: 60,  emoji: '💎', name: 'Diamante',        desc: '60 días sin parar. Eres un analista de élite.', color: '#a78bfa' },
  { days: 100, emoji: '👑', name: 'Leyenda',         desc: 'Triple dígito. Tu pasión no tiene límites.', color: '#f472b6' },
  { days: 365, emoji: '🏟️', name: 'Inmortal',       desc: 'Un año entero. Eres historia viva del fútbol.', color: '#34d399' },
];

function getStreakQuote(days: number): { quote: string; sub: string } {
  if (days < 3) return {
    quote: '"El fútbol se vive mejor cada día."',
    sub: 'Abre la app diario y descubre más.',
  };
  if (days < 7) return {
    quote: '"Tu equipo juega aunque tú no lo veas."',
    sub: 'Pero los verdaderos hinchas nunca faltan.',
  };
  if (days < 14) return {
    quote: '"La constancia define al verdadero fan."',
    sub: 'Una semana seguida no es casualidad.',
  };
  if (days < 30) return {
    quote: '"Estar al día es una forma de respeto al deporte."',
    sub: 'Tu dedicación marca la diferencia.',
  };
  if (days < 100) return {
    quote: '"No eres cualquier aficionado. Eres un Analista."',
    sub: 'Un mes entero demuestra quién eres.',
  };
  return {
    quote: '"Tu pasión por el fútbol no tiene límites."',
    sub: 'Aquí está la prueba de tu compromiso.',
  };
}

const HEADER_MAX = 200;
const HEADER_MIN = 60;
const HEADER_SCROLL = HEADER_MAX - HEADER_MIN;

// ── Component ────────────────────────────────────────────────────────────────
export interface StreakModalProps {
  visible: boolean;
  onClose: () => void;
  streakDays: number;
  streakNotifyEnabled: boolean;
  onToggleNotify: (v: boolean) => void;
  c: ColorPalette;
  isDark: boolean;
}

export function StreakModal({ visible, onClose, streakDays, streakNotifyEnabled, onToggleNotify, c, isDark }: StreakModalProps) {
  const scrollY = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scrollY.setValue(0);
      scaleAnim.setValue(0.7);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 100, friction: 8 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  // Header animations driven by scroll
  const headerHeight = scrollY.interpolate({
    inputRange: [0, HEADER_SCROLL],
    outputRange: [HEADER_MAX, HEADER_MIN],
    extrapolate: 'clamp',
  });
  const expandedOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_SCROLL * 0.5],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const collapsedOpacity = scrollY.interpolate({
    inputRange: [HEADER_SCROLL * 0.5, HEADER_SCROLL],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const accent = '#ff7a00';
  const headerBg = isDark ? '#1f1000' : '#fff4e6';

  // Next milestone
  const nextMilestone = STREAK_MILESTONES.find(m => m.days > streakDays) ?? null;
  const prevMilestone = [...STREAK_MILESTONES].reverse().find(m => m.days <= streakDays) ?? null;
  const progressBase = prevMilestone ? prevMilestone.days : 0;
  const progressTarget = nextMilestone ? nextMilestone.days : streakDays;
  const progressPct = nextMilestone
    ? Math.min(1, (streakDays - progressBase) / (progressTarget - progressBase))
    : 1;

  const quote = getStreakQuote(streakDays);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <View style={{
          backgroundColor: c.card, borderTopLeftRadius: 28, borderTopRightRadius: 28,
          maxHeight: '92%', overflow: 'hidden',
        }}>
          {/* ─── COLLAPSIBLE HEADER ─── */}
          <Animated.View style={{
            height: headerHeight,
            backgroundColor: headerBg,
            borderTopLeftRadius: 28, borderTopRightRadius: 28,
            overflow: 'hidden',
            borderBottomWidth: 1,
            borderBottomColor: isDark ? 'rgba(255,122,0,0.2)' : 'rgba(255,122,0,0.15)',
          }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.12)', marginTop: 10, zIndex: 5 }} />

            <TouchableOpacity
              style={{ position: 'absolute', top: 14, right: 16, width: 32, height: 32, borderRadius: 16, backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
              onPress={onClose}
            >
              <Text style={{ fontSize: 14, color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.4)', fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>

            {/* Decorative glows */}
            <View style={{ position: 'absolute', top: -30, right: -30, width: 150, height: 150, borderRadius: 75, backgroundColor: `rgba(255,122,0,${isDark ? '0.18' : '0.1'})` }} />
            <View style={{ position: 'absolute', bottom: -25, left: -25, width: 110, height: 110, borderRadius: 55, backgroundColor: `rgba(255,122,0,${isDark ? '0.12' : '0.06'})` }} />
            <View style={{ position: 'absolute', top: 20, left: 30, width: 60, height: 60, borderRadius: 30, backgroundColor: `rgba(255,180,0,${isDark ? '0.08' : '0.04'})` }} />

            {/* EXPANDED */}
            <Animated.View style={{
              position: 'absolute', top: 20, left: 0, right: 0, bottom: 0,
              alignItems: 'center', justifyContent: 'center',
              opacity: expandedOpacity,
            }}>
              <Animated.View style={{ alignItems: 'center', transform: [{ scale: scaleAnim }], opacity: opacityAnim }}>
                <Text style={{ fontSize: 50 }}>🔥</Text>
                <Text style={{ fontSize: 60, fontWeight: '900', color: accent, lineHeight: 68, marginTop: -6 }}>{streakDays}</Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.5)', marginTop: 2 }}>
                  {streakDays === 1 ? 'día de racha' : 'días de racha'}
                </Text>
              </Animated.View>
            </Animated.View>

            {/* COLLAPSED */}
            <Animated.View style={{
              position: 'absolute', top: 0, left: 0, right: 50, bottom: 0,
              flexDirection: 'row', alignItems: 'center',
              paddingTop: 12, paddingLeft: 20, gap: 8,
              opacity: collapsedOpacity,
            }}>
              <Text style={{ fontSize: 24 }}>🔥</Text>
              <Text style={{ fontSize: 24, fontWeight: '900', color: accent }}>{streakDays}</Text>
              <Text style={{ fontSize: 15, fontWeight: '600', color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.4)' }}>
                {streakDays === 1 ? 'día de racha' : 'días de racha'}
              </Text>
            </Animated.View>
          </Animated.View>

          {/* ─── SCROLLABLE CONTENT ─── */}
          <Animated.ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: Platform.OS === 'ios' ? 40 : 28 }}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              { useNativeDriver: false },
            )}
            scrollEventThrottle={16}
          >
            {/* NEXT MILESTONE */}
            {nextMilestone && (
              <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4 }}>
                <View style={{
                  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)',
                  borderRadius: 16, padding: 16,
                  borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: c.textPrimary }}>Siguiente logro</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        <Text style={{ fontSize: 14 }}>{nextMilestone.emoji}</Text>
                        <Text style={{ fontSize: 12, color: c.textSecondary }}>
                          "{nextMilestone.name}" · faltan <Text style={{ fontWeight: '700', color: accent }}>{nextMilestone.days - streakDays} días</Text>
                        </Text>
                      </View>
                    </View>
                    <View style={{
                      width: 48, height: 48, borderRadius: 14,
                      backgroundColor: nextMilestone.color + '1A',
                      alignItems: 'center', justifyContent: 'center', marginLeft: 12,
                    }}>
                      <Text style={{ fontSize: 24 }}>{nextMilestone.emoji}</Text>
                    </View>
                  </View>

                  <View style={{ height: 6, borderRadius: 3, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', marginTop: 14, overflow: 'hidden' }}>
                    <View style={{ height: '100%', borderRadius: 3, backgroundColor: nextMilestone.color, width: `${Math.max(2, Math.round(progressPct * 100))}%` }} />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                    <Text style={{ fontSize: 10, color: c.textTertiary }}>{progressBase} días</Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: accent }}>{Math.round(progressPct * 100)}%</Text>
                    <Text style={{ fontSize: 10, color: c.textTertiary }}>{nextMilestone.days} días</Text>
                  </View>
                </View>
              </View>
            )}

            {/* TUS LOGROS */}
            <View style={{ paddingTop: 20 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: c.textTertiary, letterSpacing: 1.5, paddingHorizontal: 20, marginBottom: 12 }}>TUS LOGROS</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
                {STREAK_MILESTONES.map(m => {
                  const achieved = streakDays >= m.days;
                  const isCurrent = nextMilestone?.days === m.days;
                  return (
                    <View key={m.days} style={{
                      width: 100, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8,
                      backgroundColor: isDark
                        ? (achieved ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)')
                        : (achieved ? `${m.color}0D` : 'rgba(0,0,0,0.015)'),
                      borderRadius: 16,
                      borderWidth: isCurrent ? 2 : 1,
                      borderColor: isCurrent ? m.color + '66' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
                    }}>
                      <View style={{
                        width: 46, height: 46, borderRadius: 23,
                        backgroundColor: achieved ? m.color + '22' : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
                        alignItems: 'center', justifyContent: 'center', marginBottom: 8,
                      }}>
                        <Text style={{ fontSize: 22, opacity: achieved ? 1 : 0.25 }}>{m.emoji}</Text>
                      </View>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: achieved ? m.color : c.textTertiary, marginBottom: 2 }}>
                        {m.days} días
                      </Text>
                      <Text style={{ fontSize: 9, color: achieved ? c.textSecondary : c.textTertiary, textAlign: 'center' }} numberOfLines={1}>
                        {m.name}
                      </Text>
                      <View style={{ marginTop: 6 }}>
                        {achieved
                          ? <Text style={{ fontSize: 14, color: m.color }}>✅</Text>
                          : <Text style={{ fontSize: 12, opacity: 0.3 }}>🔒</Text>
                        }
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </View>

            {/* MOTIVATIONAL QUOTE */}
            <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
              <View style={{
                backgroundColor: isDark ? 'rgba(255,122,0,0.07)' : 'rgba(255,122,0,0.05)',
                borderRadius: 16, padding: 16,
                borderWidth: 1, borderColor: isDark ? 'rgba(255,122,0,0.15)' : 'rgba(255,122,0,0.1)',
              }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: c.textPrimary, lineHeight: 22, marginBottom: 6 }}>
                  {quote.quote}
                </Text>
                <Text style={{ fontSize: 12, color: c.textTertiary, lineHeight: 18 }}>
                  {quote.sub}
                </Text>
              </View>
            </View>

            {/* NOTIFICATION TOGGLE */}
            <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                borderRadius: 14, padding: 14,
                borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
              }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `rgba(255,122,0,${isDark ? '0.12' : '0.08'})`, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 18 }}>🔔</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: c.textPrimary }}>¡No rompas la racha!</Text>
                  <Text style={{ fontSize: 11, color: c.textTertiary, marginTop: 2 }}>Te avisaremos si estás a punto de perderla para que entres a activarla.</Text>
                </View>
                <Toggle value={streakNotifyEnabled} onToggle={() => onToggleNotify(!streakNotifyEnabled)} activeColor={accent} icon="🔔" />
              </View>
            </View>

            {/* CLOSE */}
            <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
              <TouchableOpacity
                style={{
                  backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                  borderRadius: 14, paddingVertical: 14, alignItems: 'center',
                }}
                onPress={onClose} activeOpacity={0.7}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: c.textTertiary }}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </Animated.ScrollView>
        </View>
      </View>
    </Modal>
  );
}
