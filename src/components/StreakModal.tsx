// ── Streak Modal (Redesign) ────────────────────────────────────────────────────
// World-class streak display with hero gradient card, dynamic motivational
// copies, 9 achievement tiers, and per-achievement hero gradients.
// Dark + light mode fully supported.

import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, Animated, Platform, PanResponder,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import type { ColorPalette } from '../theme/colors';

// ── Toggle ─────────────────────────────────────────────────────────────────────
function Toggle({ value, onToggle, activeColor }: {
  value: boolean; onToggle: () => void; activeColor: string;
}) {
  return (
    <TouchableOpacity
      style={{
        width: 48, height: 28, borderRadius: 14, justifyContent: 'center',
        backgroundColor: value ? activeColor : 'rgba(128,128,128,0.25)',
      }}
      onPress={onToggle} activeOpacity={0.8}
    >
      <View style={{
        width: 22, height: 22, borderRadius: 11, backgroundColor: '#ffffff',
        transform: [{ translateX: value ? 22 : 3 }],
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
      }} />
    </TouchableOpacity>
  );
}

// ── Achievement data ───────────────────────────────────────────────────────────
const MILESTONE_META = [
  { days: 3,   emoji: '🌱', nameKey: 'firstSprout',  descKey: 'firstSproutDesc',  color: '#22C55E' },
  { days: 7,   emoji: '🔥', nameKey: 'onFire',       descKey: 'onFireDesc',       color: '#F97316' },
  { days: 15,  emoji: '⚡', nameKey: 'electrifying',  descKey: 'electrifyingDesc', color: '#8B5CF6' },
  { days: 30,  emoji: '🏆', nameKey: 'champion',     descKey: 'championDesc',     color: '#F59E0B' },
  { days: 50,  emoji: '💎', nameKey: 'diamond',      descKey: 'diamondDesc',      color: '#3B82F6' },
  { days: 100, emoji: '👑', nameKey: 'legend',       descKey: 'legendDesc',       color: '#EC4899' },
  { days: 200, emoji: '🚀', nameKey: 'absoluteIdol', descKey: 'absoluteIdolDesc', color: '#6366F1' },
  { days: 300, emoji: '⭐', nameKey: 'livingLegend', descKey: 'livingLegendDesc', color: '#EAB308' },
  { days: 365, emoji: '🐐', nameKey: 'immortal',     descKey: 'immortalDesc',     color: '#F97316' },
] as const;

/** Re-export for any consumer that references the old name. */
export { MILESTONE_META as STREAK_MILESTONES_META };

function getStreakMilestones(t: (k: string) => string) {
  return MILESTONE_META.map(m => ({
    days: m.days,
    emoji: m.emoji,
    color: m.color,
    name: t(`streak.milestones.${m.nameKey}`),
    desc: t(`streak.milestones.${m.descKey}`),
  }));
}

// ── Hero gradient per achievement ──────────────────────────────────────────────
const HERO_GRADIENTS: Record<string, { light: [string, string]; dark: [string, string] }> = {
  '🌱': { light: ['#F0FDF4', '#DCFCE7'], dark: ['#1A3A2A', '#2A5A3A'] },
  '🔥': { light: ['#FFEDD5', '#FEC89A'], dark: ['#1E1208', '#271608'] },
  '⚡': { light: ['#F5F3FF', '#EDE9FE'], dark: ['#2E2645', '#3D3458'] },
  '🏆': { light: ['#FEF3C7', '#FDE68A'], dark: ['#4A3F1F', '#5C4E2A'] },
  '💎': { light: ['#DBEAFE', '#BFDBFE'], dark: ['#1E3A5F', '#2A4A6F'] },
  '👑': { light: ['#FCE7F3', '#FBCFE8'], dark: ['#4A2D3F', '#5C3A4F'] },
  '🚀': { light: ['#E0E7FF', '#C7D2FE'], dark: ['#2D3A5F', '#3A4A6F'] },
  '⭐': { light: ['#FEF9C3', '#FEF08A'], dark: ['#4A4420', '#5C5530'] },
  '🐐': { light: ['#FFEDD5', '#FED7AA'], dark: ['#4A3420', '#5C4230'] },
};

// ── Achievement card theme per emoji ──────────────────────────────────────────
const ACHIEVEMENT_THEME: Record<string, {
  lightBg: string; lightBorder: string; lightColor: string;
  darkBg: string;  darkBorder: string;  darkColor: string;
}> = {
  '🌱': { lightBg: '#F0FDF4', lightBorder: '#22C55E', lightColor: '#22C55E', darkBg: '#1A3A2A', darkBorder: '#22C55E', darkColor: '#22C55E' },
  '🔥': { lightBg: '#FFEDD5', lightBorder: '#F97316', lightColor: '#EA580C', darkBg: '#1E1208', darkBorder: '#F97316', darkColor: '#FB923C' },
  '⚡': { lightBg: '#F5F3FF', lightBorder: '#8B5CF6', lightColor: '#8B5CF6', darkBg: '#2E2645', darkBorder: '#8B5CF6', darkColor: '#A78BFA' },
  '🏆': { lightBg: '#FEF3C7', lightBorder: '#F59E0B', lightColor: '#D97706', darkBg: '#4A3F1F', darkBorder: '#F59E0B', darkColor: '#F59E0B' },
  '💎': { lightBg: '#DBEAFE', lightBorder: '#3B82F6', lightColor: '#3B82F6', darkBg: '#1E3A5F', darkBorder: '#3B82F6', darkColor: '#60A5FA' },
  '👑': { lightBg: '#FCE7F3', lightBorder: '#EC4899', lightColor: '#EC4899', darkBg: '#4A2D3F', darkBorder: '#EC4899', darkColor: '#F472B6' },
  '🚀': { lightBg: '#E0E7FF', lightBorder: '#6366F1', lightColor: '#6366F1', darkBg: '#2D3A5F', darkBorder: '#6366F1', darkColor: '#818CF8' },
  '⭐': { lightBg: '#FEF9C3', lightBorder: '#EAB308', lightColor: '#CA8A04', darkBg: '#4A4420', darkBorder: '#EAB308', darkColor: '#EAB308' },
  '🐐': { lightBg: '#FFEDD5', lightBorder: '#F97316', lightColor: '#EA580C', darkBg: '#4A3420', darkBorder: '#F97316', darkColor: '#F97316' },
};

// NOTE: keep outside component so it's not re-created on each render.
// Called from useEffect with the `t` function via a closure — no prop needed.
function pickMotivationalCopy(streakDays: number, copies: string[]): string {
  void streakDays; // used by caller to choose tier
  if (!Array.isArray(copies) || copies.length === 0) return '';
  return copies[Math.floor(Math.random() * copies.length)];
}

// ── Component ─────────────────────────────────────────────────────────────────
export interface StreakModalProps {
  visible: boolean;
  onClose: () => void;
  streakDays: number;
  streakNotifyEnabled: boolean;
  onToggleNotify: (v: boolean) => void;
  c: ColorPalette;
  isDark: boolean;
}

export function StreakModal({
  visible, onClose, streakDays, streakNotifyEnabled, onToggleNotify, c, isDark,
}: StreakModalProps) {
  const { t } = useTranslation();
  const slideAnim   = useRef(new Animated.Value(60)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const dragY       = useRef(new Animated.Value(0)).current;
  const [motivationalCopy, setMotivationalCopy] = useState('');

  // ── Animated close (used by X button, swipe, and background tap) ──────────
  const dismiss = () => {
    Animated.parallel([
      Animated.timing(dragY,      { toValue: 500, duration: 220, useNativeDriver: true }),
      Animated.timing(opacityAnim,{ toValue: 0,   duration: 180, useNativeDriver: true }),
    ]).start(() => {
      dragY.setValue(0);
      onClose();
    });
  };

  // ── Swipe-down on the pull handle only (no conflict with ScrollView) ──────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, { dy, dx }) =>
        dy > 6 && Math.abs(dy) > Math.abs(dx),
      onPanResponderMove: (_, { dy }) => {
        if (dy > 0) dragY.setValue(dy);
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy > 80 || vy > 0.7) {
          dismiss();
        } else {
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true, tension: 120, friction: 14 }).start();
        }
      },
    })
  ).current;

  // Derived data
  const MILESTONES = getStreakMilestones(t);
  const currentMilestone = [...MILESTONES].reverse().find(m => streakDays >= m.days) ?? null;
  const nextMilestone    = MILESTONES.find(m => m.days > streakDays) ?? null;
  const progressBase     = currentMilestone?.days ?? 0;
  const progressTarget   = nextMilestone?.days ?? streakDays + 1;
  const progressPct      = nextMilestone
    ? Math.min(1, (streakDays - progressBase) / (progressTarget - progressBase))
    : 1;

  // Hero theming
  const heroEmoji    = currentMilestone?.emoji ?? '🔥';
  const heroGrad     = HERO_GRADIENTS[heroEmoji] ?? HERO_GRADIENTS['🔥'];
  const heroColors   = isDark ? heroGrad.dark : heroGrad.light;
  const currentColor = currentMilestone?.color ?? '#F5B800';

  useEffect(() => {
    if (visible) {
      const tier =
        streakDays <= 7  ? 'tier1' :
        streakDays <= 30 ? 'tier2' :
        streakDays <= 99 ? 'tier3' : 'tier4';
      const copies = t(`streak.motivational.${tier}`, { returnObjects: true }) as unknown as string[];
      setMotivationalCopy(pickMotivationalCopy(streakDays, copies));
      slideAnim.setValue(60);
      opacityAnim.setValue(0);
      dragY.setValue(0);
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 90, friction: 9 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 240, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  // Color tokens
  const BG      = isDark ? '#0D0D0D' : '#F4F4F5';
  const SURFACE = isDark ? '#1A1A1A' : '#FFFFFF';
  const BORDER  = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)';
  const TEXT    = isDark ? '#FFFFFF' : '#111827';
  const TEXTSUB = isDark ? '#9CA3AF' : '#6B7280';
  const SHADOW  = isDark
    ? {}
    : { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 3 };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={dismiss}>
      {/* Dim background — tap to dismiss */}
      <Animated.View
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end', opacity: opacityAnim }}
      >
        <TouchableOpacity style={{ position: 'absolute', inset: 0 } as any} activeOpacity={1} onPress={dismiss} />

        <Animated.View style={{
          backgroundColor: BG,
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          maxHeight: '93%', overflow: 'hidden',
          transform: [{ translateY: Animated.add(slideAnim, dragY) }],
        }}>

          {/* ── Handle row: pill (draggable) + X button ── */}
          <View
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              paddingTop: 12, paddingBottom: 6, paddingHorizontal: 16,
              backgroundColor: BG, zIndex: 10,
            }}
            {...panResponder.panHandlers}
          >
            {/* Centered pull pill */}
            <View style={{
              width: 36, height: 4, borderRadius: 2, backgroundColor: BORDER,
            }} />

            {/* X button */}
            <TouchableOpacity
              style={{
                position: 'absolute', right: 14, top: 8,
                width: 42, height: 42, borderRadius: 21,
                backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#E5E7EB',
                borderWidth: 1.5,
                borderColor: isDark ? 'rgba(255,255,255,0.22)' : '#9CA3AF',
                alignItems: 'center', justifyContent: 'center',
              }}
              onPress={dismiss}
              activeOpacity={0.65}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={{
                fontSize: 15, fontWeight: '800', lineHeight: 18,
                color: isDark ? 'rgba(255,255,255,0.85)' : '#374151',
              }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: Platform.OS === 'ios' ? 44 : 28 }}
          >

            {/* ═══════════════════════════════════════════════════
                1 — HERO CARD (compact)
            ═══════════════════════════════════════════════════ */}
            <View style={{ marginHorizontal: 16, marginTop: 44 }}>
              <LinearGradient
                colors={heroColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  borderRadius: 22, overflow: 'hidden',
                  paddingTop: 18, paddingBottom: 16, paddingHorizontal: 20,
                  borderWidth: 1.5,
                  borderColor: currentColor + (isDark ? '55' : '35'),
                }}
              >
                {/* Ghost number */}
                <View style={{ position: 'absolute', right: -6, top: -8, zIndex: 0 }} pointerEvents="none">
                  <Text style={{
                    fontSize: 120, fontWeight: '900', lineHeight: 130,
                    color: currentColor, opacity: isDark ? 0.12 : 0.09,
                    letterSpacing: -4,
                  }}>
                    {streakDays}
                  </Text>
                </View>

                {/* Achievement emoji */}
                <View style={{ position: 'absolute', top: 14, right: 16, zIndex: 2 }}>
                  <Text style={{ fontSize: 48, lineHeight: 56 }}>{heroEmoji}</Text>
                </View>

                {/* Label */}
                <Text style={{
                  fontSize: 10, fontWeight: '700', letterSpacing: 2,
                  textTransform: 'uppercase', color: currentColor, marginBottom: 4,
                }}>
                  {t('streak.dayPlural')}
                </Text>

                {/* Big streak number — smaller */}
                <Text style={{
                  fontSize: 80, fontWeight: '900', lineHeight: 72,
                  letterSpacing: -3, color: currentColor,
                }}>
                  {streakDays}
                </Text>

                {/* Achievement pill */}
                {currentMilestone && (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 5,
                    marginTop: 12, alignSelf: 'flex-start',
                    paddingHorizontal: 12, paddingVertical: 5,
                    borderRadius: 999,
                    backgroundColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.65)',
                    borderWidth: 1, borderColor: currentColor + '45',
                  }}>
                    <Text style={{ fontSize: 12 }}>{currentMilestone.emoji}</Text>
                    <Text style={{
                      fontWeight: '700', fontSize: 11, color: currentColor,
                      letterSpacing: 0.4, textTransform: 'uppercase',
                    }}>
                      {currentMilestone.name}
                    </Text>
                    <Text style={{ fontSize: 10, color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)' }}>
                      · {currentMilestone.desc}
                    </Text>
                  </View>
                )}
              </LinearGradient>

              {/* ── Streak description ── */}
              <Text style={{
                fontSize: 12, color: TEXTSUB, lineHeight: 17,
                textAlign: 'center', marginTop: 10, paddingHorizontal: 4,
              }}>
                {t('streak.description')}
              </Text>
            </View>

            {/* ═══════════════════════════════════════════════════
                2 — SIGUIENTE LOGRO
            ═══════════════════════════════════════════════════ */}
            {nextMilestone && (
              <View style={[{
                marginHorizontal: 16, marginTop: 14,
                backgroundColor: SURFACE,
                borderRadius: 20, padding: 20,
                borderWidth: isDark ? 1 : 0, borderColor: BORDER,
              }, SHADOW]}>
                {/* Section label */}
                <Text style={{
                  fontSize: 11, fontWeight: '700', letterSpacing: 1.5,
                  textTransform: 'uppercase', color: TEXTSUB, marginBottom: 16,
                }}>
                  {t('streak.nextAchievement')}
                </Text>

                {/* Icon + name + days left */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                  {/* Icon */}
                  <View style={{
                    width: 56, height: 56, borderRadius: 16, flexShrink: 0,
                    backgroundColor: isDark ? '#2A1F3D' : '#EDE9FE',
                    borderWidth: 1.5, borderColor: '#8B5CF655',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 28 }}>{nextMilestone.emoji}</Text>
                  </View>

                  {/* Name + desc */}
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      fontSize: 22, fontWeight: '800', color: TEXT,
                      lineHeight: 26, marginBottom: 3, letterSpacing: -0.4,
                    }}>
                      {nextMilestone.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: TEXTSUB }}>{nextMilestone.desc}</Text>
                  </View>

                  {/* Days remaining */}
                  <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                    <Text style={{
                      fontSize: 24, fontWeight: '900', color: '#8B5CF6', letterSpacing: -1,
                    }}>
                      {nextMilestone.days - streakDays}
                    </Text>
                    <Text style={{ fontSize: 11, fontWeight: '500', color: TEXTSUB }}>
                      {t('streak.days')}
                    </Text>
                  </View>
                </View>

                {/* Progress bar */}
                <View style={{
                  height: 8, borderRadius: 4,
                  backgroundColor: isDark ? '#374151' : '#E5E7EB',
                  overflow: 'hidden', marginBottom: 10,
                }}>
                  <LinearGradient
                    colors={['#8B5CF6', '#A78BFA']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={{
                      height: '100%',
                      width: `${Math.max(2, Math.round(progressPct * 100))}%`,
                      borderRadius: 4,
                    }}
                  />
                </View>

                {/* Labels */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 10, color: TEXTSUB }}>
                    {progressBase} {t('streak.days')}
                  </Text>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#8B5CF6' }}>
                    {Math.round(progressPct * 100)}%
                  </Text>
                  <Text style={{ fontSize: 10, color: TEXTSUB }}>
                    {nextMilestone.days} {t('streak.days')}
                  </Text>
                </View>
              </View>
            )}

            {/* ═══════════════════════════════════════════════════
                3 — TUS LOGROS (horizontal scroll)
            ═══════════════════════════════════════════════════ */}
            <View style={{ marginTop: 22 }}>
              <Text style={{
                fontSize: 13, fontWeight: '800', color: TEXT,
                letterSpacing: 1.2, textTransform: 'uppercase',
                paddingHorizontal: 20, marginBottom: 14,
              }}>
                {t('streak.yourAchievements')}
              </Text>

              <ScrollView
                horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 4 }}
              >
                {MILESTONES.map(m => {
                  const achieved = streakDays >= m.days;
                  const theme    = ACHIEVEMENT_THEME[m.emoji] ?? ACHIEVEMENT_THEME['🔥'];
                  const bg       = isDark ? theme.darkBg     : theme.lightBg;
                  const border   = isDark ? theme.darkBorder  : theme.lightBorder;
                  const color    = isDark ? theme.darkColor   : theme.lightColor;

                  return (
                    <View key={m.days} style={{
                      width: 136, height: 156,
                      paddingTop: 14, paddingBottom: 10, paddingHorizontal: 10,
                      borderRadius: 16, backgroundColor: bg,
                      borderWidth: 1.5, borderColor: border,
                      alignItems: 'center', gap: 5,
                      opacity: achieved ? 1 : 0.5,
                    }}>
                      {/* Check / lock badge */}
                      <View style={{
                        position: 'absolute', top: 7, right: 7,
                        width: 20, height: 20, borderRadius: 10,
                        backgroundColor: achieved ? '#10b981' : (isDark ? '#374151' : '#E5E7EB'),
                        borderWidth: 1.5,
                        borderColor: achieved ? '#10b981' : border,
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Text style={{
                          fontSize: achieved ? 10 : 8,
                          fontWeight: '700',
                          color: achieved ? '#fff' : TEXTSUB,
                        }}>
                          {achieved ? '✓' : '🔒'}
                        </Text>
                      </View>

                      {/* Emoji */}
                      <Text style={{
                        fontSize: 38, lineHeight: 44,
                        marginTop: 4, opacity: achieved ? 1 : 0.3,
                      }}>
                        {m.emoji}
                      </Text>

                      {/* Days */}
                      <Text style={{
                        fontSize: 14, fontWeight: '800',
                        color: color, letterSpacing: -0.3,
                      }}>
                        {m.days} {t('streak.days')}
                      </Text>

                      {/* Name */}
                      <Text style={{
                        fontSize: 10, fontWeight: '600', color: TEXT,
                        textAlign: 'center', lineHeight: 14,
                        opacity: achieved ? 0.9 : 0.5,
                      }} numberOfLines={2}>
                        {m.name}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>
            </View>

            {/* ═══════════════════════════════════════════════════
                4 — MOTIVATIONAL COPY
            ═══════════════════════════════════════════════════ */}
            {motivationalCopy.length > 0 && (
              <View style={[{
                marginHorizontal: 16, marginTop: 16,
                backgroundColor: SURFACE, borderRadius: 20,
                paddingVertical: 28, paddingHorizontal: 24,
                borderWidth: isDark ? 1 : 0, borderColor: BORDER,
                overflow: 'hidden',
              }, SHADOW]}>
                {/* Decorative quote mark */}
                <Text style={{
                  position: 'absolute', top: 8, left: 16,
                  fontSize: 72, fontWeight: '900', lineHeight: 72,
                  color: '#3b82f6', opacity: 0.13,
                }}>
                  "
                </Text>
                <Text style={{
                  fontStyle: 'italic', fontWeight: '500',
                  fontSize: 17, color: TEXT, lineHeight: 27,
                  textAlign: 'center', paddingTop: 4,
                }}>
                  {motivationalCopy}
                </Text>
              </View>
            )}

            {/* ═══════════════════════════════════════════════════
                5 — DON'T BREAK STREAK
            ═══════════════════════════════════════════════════ */}
            <View style={[{
              marginHorizontal: 16, marginTop: 14,
              backgroundColor: SURFACE, borderRadius: 20, padding: 20,
              borderWidth: isDark ? 1 : 0, borderColor: BORDER,
            }, SHADOW]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Text style={{ fontSize: 20, lineHeight: 24 }}>🔔</Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT, flexShrink: 1 }}>
                      {t('streak.dontBreakStreak')}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, color: TEXTSUB, lineHeight: 20 }}>
                    {t('streak.streakNotification')}
                  </Text>
                </View>
                <Toggle
                  value={streakNotifyEnabled}
                  onToggle={() => onToggleNotify(!streakNotifyEnabled)}
                  activeColor="#3b82f6"
                />
              </View>
            </View>

            {/* ═══════════════════════════════════════════════════
                6 — CLOSE BUTTON (muted, at bottom of scroll)
            ═══════════════════════════════════════════════════ */}
            <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
              <TouchableOpacity
                style={{
                  backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                  borderRadius: 16, height: 52,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1, borderColor: BORDER,
                }}
                onPress={dismiss} activeOpacity={0.7}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: TEXTSUB }}>
                  {t('common.close')}
                </Text>
              </TouchableOpacity>
            </View>

          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
