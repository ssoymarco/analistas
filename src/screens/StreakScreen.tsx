// ── StreakScreen ────────────────────────────────────────────────────────────
// Streak hero + achievements as a full stack screen.
//
// Was a Modal with custom slide animation + PanResponder. Now it's a regular
// stack screen with `slide_from_bottom` + vertical-swipe dismissal handled
// natively by React Navigation — same behavior as NotificationSettings
// and GlobalSearch for a uniform feel across the app.
//
// Content (hero gradient card, next achievement, tier list, motivational
// quote, notification toggle) is identical to the old modal.
// ────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Switch, Platform, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { haptics } from '../utils/haptics';
import { useThemeColors } from '../theme/useTheme';
import { useDarkMode } from '../contexts/DarkModeContext';
import { useUserStats } from '../contexts/UserStatsContext';

// ── Achievement data ───────────────────────────────────────────────────────

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

/** Re-export so legacy callers (e.g. profile-level badge calc) still resolve. */
export { MILESTONE_META as STREAK_MILESTONES_META };

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

function pickMotivationalCopy(copies: string[]): string {
  if (!Array.isArray(copies) || copies.length === 0) return '';
  return copies[Math.floor(Math.random() * copies.length)];
}

// ── Screen ─────────────────────────────────────────────────────────────────

export const StreakScreen: React.FC = () => {
  const { t } = useTranslation();
  const c = useThemeColors();
  const { isDark } = useDarkMode();
  const navigation = useNavigation();
  const { streakDays, streakNotifyEnabled, setStreakNotify } = useUserStats();

  const [motivationalCopy, setMotivationalCopy] = useState('');

  const MILESTONES = useMemo(
    () =>
      MILESTONE_META.map(m => ({
        days: m.days,
        emoji: m.emoji,
        color: m.color,
        name: t(`streak.milestones.${m.nameKey}`),
        desc: t(`streak.milestones.${m.descKey}`),
      })),
    [t],
  );

  const currentMilestone = [...MILESTONES].reverse().find(m => streakDays >= m.days) ?? null;
  const nextMilestone    = MILESTONES.find(m => m.days > streakDays) ?? null;
  const progressBase     = currentMilestone?.days ?? 0;
  const progressTarget   = nextMilestone?.days ?? streakDays + 1;
  const progressPct      = nextMilestone
    ? Math.min(1, (streakDays - progressBase) / (progressTarget - progressBase))
    : 1;

  const heroEmoji    = currentMilestone?.emoji ?? '🔥';
  const heroGrad     = HERO_GRADIENTS[heroEmoji] ?? HERO_GRADIENTS['🔥'];
  const heroColors   = isDark ? heroGrad.dark : heroGrad.light;
  const currentColor = currentMilestone?.color ?? '#F5B800';

  // Pick motivational copy once on mount based on tier
  useEffect(() => {
    const tier =
      streakDays <= 7  ? 'tier1' :
      streakDays <= 30 ? 'tier2' :
      streakDays <= 99 ? 'tier3' : 'tier4';
    const copies = t(`streak.motivational.${tier}`, { returnObjects: true }) as unknown as string[];
    setMotivationalCopy(pickMotivationalCopy(copies));
  }, [streakDays, t]);

  // Subtle elevation for cards in light mode — in dark mode borders carry the
  // visual weight, so we skip the shadow entirely.
  const cardShadow = isDark
    ? null
    : { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 3 };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: c.bg }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Standard header — same pattern as NotificationSettings */}
      <View style={[s.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => { haptics.light(); navigation.goBack(); }} hitSlop={12} activeOpacity={0.7}>
          <Text style={[s.headerBack, { color: c.accent }]}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: c.textPrimary }]}>{t('streak.title')}</Text>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 14, paddingBottom: Platform.OS === 'ios' ? 32 : 24 }}
      >
        {/* Hero card */}
        <View style={{ marginHorizontal: 16 }}>
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

            <View style={{ position: 'absolute', top: 14, right: 16, zIndex: 2 }}>
              <Text style={{ fontSize: 48, lineHeight: 56 }}>{heroEmoji}</Text>
            </View>

            <Text style={{
              fontSize: 10, fontWeight: '700', letterSpacing: 2,
              textTransform: 'uppercase', color: currentColor, marginBottom: 4,
            }}>
              {t('streak.dayPlural')}
            </Text>

            <Text style={{
              fontSize: 80, fontWeight: '900', lineHeight: 72,
              letterSpacing: -3, color: currentColor,
            }}>
              {streakDays}
            </Text>

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

          <Text style={{
            fontSize: 12, color: c.textSecondary, lineHeight: 17,
            textAlign: 'center', marginTop: 10, paddingHorizontal: 4,
          }}>
            {t('streak.description')}
          </Text>
        </View>

        {/* Next achievement */}
        {nextMilestone && (
          <View style={[{
            marginHorizontal: 16, marginTop: 14,
            backgroundColor: c.card,
            borderRadius: 20, padding: 20,
            borderWidth: isDark ? 1 : 0, borderColor: c.border,
          }, cardShadow]}>
            <Text style={{
              fontSize: 11, fontWeight: '700', letterSpacing: 1.5,
              textTransform: 'uppercase', color: c.textSecondary, marginBottom: 16,
            }}>
              {t('streak.nextAchievement')}
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <View style={{
                width: 56, height: 56, borderRadius: 16, flexShrink: 0,
                backgroundColor: isDark ? '#2A1F3D' : '#EDE9FE',
                borderWidth: 1.5, borderColor: '#8B5CF655',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 28 }}>{nextMilestone.emoji}</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{
                  fontSize: 22, fontWeight: '800', color: c.textPrimary,
                  lineHeight: 26, marginBottom: 3, letterSpacing: -0.4,
                }}>
                  {nextMilestone.name}
                </Text>
                <Text style={{ fontSize: 12, color: c.textSecondary }}>{nextMilestone.desc}</Text>
              </View>

              <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                <Text style={{
                  fontSize: 24, fontWeight: '900', color: '#8B5CF6', letterSpacing: -1,
                }}>
                  {nextMilestone.days - streakDays}
                </Text>
                <Text style={{ fontSize: 11, fontWeight: '500', color: c.textSecondary }}>
                  {t('streak.days')}
                </Text>
              </View>
            </View>

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

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 10, color: c.textSecondary }}>
                {progressBase} {t('streak.days')}
              </Text>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#8B5CF6' }}>
                {Math.round(progressPct * 100)}%
              </Text>
              <Text style={{ fontSize: 10, color: c.textSecondary }}>
                {nextMilestone.days} {t('streak.days')}
              </Text>
            </View>
          </View>
        )}

        {/* Your achievements */}
        <View style={{ marginTop: 22 }}>
          <Text style={{
            fontSize: 13, fontWeight: '800', color: c.textPrimary,
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
                      color: achieved ? '#fff' : c.textSecondary,
                    }}>
                      {achieved ? '✓' : '🔒'}
                    </Text>
                  </View>

                  <Text style={{
                    fontSize: 38, lineHeight: 44,
                    marginTop: 4, opacity: achieved ? 1 : 0.3,
                  }}>
                    {m.emoji}
                  </Text>

                  <Text style={{
                    fontSize: 14, fontWeight: '800',
                    color: color, letterSpacing: -0.3,
                  }}>
                    {m.days} {t('streak.days')}
                  </Text>

                  <Text style={{
                    fontSize: 10, fontWeight: '600', color: c.textPrimary,
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

        {/* Motivational quote */}
        {motivationalCopy.length > 0 && (
          <View style={[{
            marginHorizontal: 16, marginTop: 16,
            backgroundColor: c.card, borderRadius: 20,
            paddingVertical: 28, paddingHorizontal: 24,
            borderWidth: isDark ? 1 : 0, borderColor: c.border,
            overflow: 'hidden',
          }, cardShadow]}>
            <Text style={{
              position: 'absolute', top: 8, left: 16,
              fontSize: 72, fontWeight: '900', lineHeight: 72,
              color: c.accent, opacity: 0.13,
            }}>
              "
            </Text>
            <Text style={{
              fontStyle: 'italic', fontWeight: '500',
              fontSize: 17, color: c.textPrimary, lineHeight: 27,
              textAlign: 'center', paddingTop: 4,
            }}>
              {motivationalCopy}
            </Text>
          </View>
        )}

        {/* Streak notification toggle — native Switch for consistency */}
        <View style={[{
          marginHorizontal: 16, marginTop: 14,
          backgroundColor: c.card, borderRadius: 20, padding: 20,
          borderWidth: isDark ? 1 : 0, borderColor: c.border,
        }, cardShadow]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Text style={{ fontSize: 20, lineHeight: 24 }}>🔔</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: c.textPrimary, flexShrink: 1 }}>
                  {t('streak.dontBreakStreak')}
                </Text>
              </View>
              <Text style={{ fontSize: 13, color: c.textSecondary, lineHeight: 20 }}>
                {t('streak.streakNotification')}
              </Text>
            </View>
            <Switch
              value={streakNotifyEnabled}
              onValueChange={value => { haptics.selection(); setStreakNotify(value); }}
              trackColor={{ false: c.border, true: c.accent }}
              thumbColor="#fff"
              ios_backgroundColor={c.border}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBack: { fontSize: 15, fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  headerSpacer: { width: 50 },
});
