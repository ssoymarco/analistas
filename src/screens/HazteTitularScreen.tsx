// ── Hazte Titular (Premium) ──────────────────────────────────────────────────
// Redesigned paywall: GOLD annual plan, BLUE monthly plan, Banca below CTA.
// Plans: Titular ($80/año) | Suplente ($10/mes) | Banca (gratis, below CTA)
// TODO: Wire up RevenueCat for App Store / Google Play / Huawei AppGallery.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Animated, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../theme/useTheme';
import { useDarkMode } from '../contexts/DarkModeContext';
import type { ColorPalette } from '../theme/colors';

// ── Brand palette ─────────────────────────────────────────────────────────────
const BLUE      = '#2E7CF6';
const BLUE_DIM  = 'rgba(46,124,246,0.15)';
const GOLD      = '#F5B800';
const GOLD_DIM  = 'rgba(245,184,0,0.15)';
const GREEN_CHK = '#22C55E';

type PlanId = 'titular' | 'suplente' | 'banca';

// Benefit emoji icon background colours (per design spec)
const BENEFIT_ICON_BG = [
  'rgba(239,68,68,0.15)',   // 🚫 red
  GOLD_DIM,                  // ⚡ gold
  BLUE_DIM,                  // 📊 blue
  'rgba(168,85,247,0.15)', // 📱 purple
];

const APP_ICONS_META = [
  { id: 'clasico', nameKey: 'classic', color: '#16A34A', emoji: '⚽' },
  { id: 'blanco',  nameKey: 'white',   color: '#9CA3AF', emoji: '⚽' },
  { id: 'noche',   nameKey: 'night',   color: '#1E1B4B', emoji: '⚽' },
  { id: 'oro',     nameKey: 'gold',    color: '#D97706', emoji: '⚽' },
];

// ── Tiny sub-components ───────────────────────────────────────────────────────

function BackArrow({ color }: { color: string }) {
  return (
    <View style={{
      width: 11, height: 11,
      borderLeftWidth: 2.5, borderBottomWidth: 2.5,
      borderColor: color, transform: [{ rotate: '45deg' }],
    }} />
  );
}

function CheckRow({ text, c }: { text: string; c: ColorPalette }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 }}>
      <Text style={{ color: GREEN_CHK, fontSize: 14, fontWeight: '700' }}>✓</Text>
      <Text style={{ fontSize: 13, color: c.textSecondary, flex: 1 }}>{text}</Text>
    </View>
  );
}

function CrossRow({ text, c }: { text: string; c: ColorPalette }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Text style={{ color: c.textTertiary, fontSize: 11 }}>✕</Text>
      <Text style={{ fontSize: 12, color: c.textTertiary }}>{text}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────

export const HazteTitularScreen: React.FC = () => {
  const c = useThemeColors();
  const { isDark } = useDarkMode();
  const navigation = useNavigation();
  const { t } = useTranslation();

  const [selectedPlan, setSelectedPlan] = useState<PlanId>('titular');
  const [selectedIcon, setSelectedIcon] = useState(0);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Convenience aliases matching the design's surface tokens
  const surfaceBg  = isDark ? '#141414' : '#FFFFFF';
  const surface2Bg = isDark ? '#1E1E1E' : '#F3F4F6';
  const borderCol  = isDark ? 'rgba(255,255,255,0.06)' : '#E5E7EB';
  const borderMid  = isDark ? 'rgba(255,255,255,0.10)' : '#D1D5DB';

  const APP_ICONS = APP_ICONS_META.map(m => ({
    ...m, name: t(`subscription.iconOptions.${m.nameKey}`),
  }));

  const BENEFITS = [
    { emoji: '🚫', iconBg: BENEFIT_ICON_BG[0], title: t('subscription.benefits.noAds'),      desc: t('subscription.benefits.noAdsDesc') },
    { emoji: '⚡', iconBg: BENEFIT_ICON_BG[1], title: t('subscription.benefits.appFaster'),  desc: t('subscription.benefits.appFasterDesc') },
    { emoji: '📊', iconBg: BENEFIT_ICON_BG[2], title: t('subscription.benefits.detailedStats'), desc: t('subscription.benefits.statsDesc') },
    { emoji: '📱', iconBg: BENEFIT_ICON_BG[3], title: t('subscription.benefits.ownIcon'),    desc: t('subscription.benefits.ownIconDesc') },
  ];

  const heroOp = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(heroOp, { toValue: 1, duration: 450, useNativeDriver: true }).start();
  }, []);

  const handleSelectPlan = useCallback((id: PlanId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedPlan(id);
  }, []);

  const handleSubscribe = useCallback(() => {
    if (selectedPlan === 'banca') {
      navigation.goBack();
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setLoading(true);
    // TODO: replace with RevenueCat purchase flow
    setTimeout(() => { setLoading(false); setSuccess(true); }, 1400);
  }, [selectedPlan, navigation]);

  const handleRestore = useCallback(() => {
    // TODO: RevenueCat restore
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  // ── Success screen ──────────────────────────────────────────────────────────
  if (success) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={{
            width: 80, height: 80, borderRadius: 40,
            backgroundColor: 'rgba(34,197,94,0.15)',
            alignItems: 'center', justifyContent: 'center', marginBottom: 24,
          }}>
            <Text style={{ fontSize: 38 }}>✅</Text>
          </View>
          <Text style={{ fontSize: 34, fontWeight: '900', textAlign: 'center', color: c.textPrimary, letterSpacing: -0.5, lineHeight: 38, marginBottom: 4 }}>
            {t('subscription.successLine1')}
          </Text>
          <Text style={{ fontSize: 34, fontWeight: '900', textAlign: 'center', color: GOLD, letterSpacing: -0.5, marginBottom: 18 }}>
            {t('subscription.successLine2')}
          </Text>
          <Text style={{ fontSize: 15, color: c.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 28 }}>
            {t('subscription.successSubtitle')}
          </Text>
          {[
            t('subscription.successFeature1'),
            t('subscription.successFeature2'),
            t('subscription.successFeature3'),
          ].map((f, i) => (
            <View key={i} style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: surfaceBg, borderRadius: 12,
              padding: 14, borderWidth: 1, borderColor: borderCol,
              marginBottom: 8, width: '100%',
            }}>
              <Text style={{ color: GREEN_CHK, fontSize: 16, fontWeight: '700' }}>✓</Text>
              <Text style={{ fontSize: 14, color: c.textSecondary }}>{f}</Text>
            </View>
          ))}
          <TouchableOpacity
            style={{
              backgroundColor: BLUE, borderRadius: 14,
              paddingVertical: 16, alignItems: 'center',
              width: '100%', marginTop: 14,
            }}
            onPress={() => navigation.goBack()}
            activeOpacity={0.85}
          >
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 1.5 }}>
              {t('subscription.successCta').toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // CTA label
  const ctaText = loading
    ? t('subscription.processing')
    : selectedPlan === 'titular'
      ? t('subscription.ctaAnnual')
      : selectedPlan === 'suplente'
        ? t('subscription.ctaMonthly')
        : t('subscription.ctaBanca');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: borderCol,
      }}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{
            width: 36, height: 36, borderRadius: 12,
            backgroundColor: surfaceBg,
            alignItems: 'center', justifyContent: 'center',
          }}
          activeOpacity={0.7}
        >
          <BackArrow color={c.textSecondary} />
        </TouchableOpacity>
        <Text style={{
          flex: 1, textAlign: 'center',
          fontSize: 18, fontWeight: '800', color: c.textPrimary,
          letterSpacing: 0.5, textTransform: 'uppercase',
        }}>
          {t('subscription.title')}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: Platform.OS === 'ios' ? 44 : 28,
        }}
      >
        <Animated.View style={{ opacity: heroOp }}>

          {/* ═══ HERO ════════════════════════════════════════════════════════ */}
          <View style={{ alignItems: 'center', paddingTop: 32, marginBottom: 36 }}>
            {/* GOLD badge */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: GOLD, borderRadius: 24,
              paddingHorizontal: 16, paddingVertical: 7, marginBottom: 18,
            }}>
              <Text style={{ fontSize: 13 }}>👑</Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                ANALISTAS PRO
              </Text>
            </View>

            <Text style={{
              fontSize: 38, fontWeight: '900', color: c.textPrimary,
              textAlign: 'center', letterSpacing: -0.5, lineHeight: 42,
              textTransform: 'uppercase', marginBottom: 4,
            }}>
              {t('subscription.heroLine1')}
            </Text>
            <Text style={{
              fontSize: 38, fontWeight: '900', color: GOLD,
              textAlign: 'center', letterSpacing: -0.5, lineHeight: 42,
              textTransform: 'uppercase', marginBottom: 16,
            }}>
              {t('subscription.heroLine2')}
            </Text>
            <Text style={{ fontSize: 15, color: c.textSecondary, textAlign: 'center', lineHeight: 22 }}>
              {t('subscription.heroSubtitle')}
            </Text>
            <Text style={{ fontSize: 14, color: c.textTertiary, textAlign: 'center', marginTop: 4 }}>
              {t('subscription.heroClaim')}
            </Text>
          </View>

          {/* ═══ BENEFITS ════════════════════════════════════════════════════ */}
          <View style={{ marginBottom: 28 }}>
            <Text style={{
              fontSize: 20, fontWeight: '800', color: c.textPrimary,
              marginBottom: 16, letterSpacing: 0.3, textTransform: 'uppercase',
            }}>
              {t('subscription.benefitsSection')}
            </Text>
            {/* 2-column grid: row 1 */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
              {BENEFITS.slice(0, 2).map((b, i) => (
                <View key={i} style={{
                  flex: 1, backgroundColor: surfaceBg, borderRadius: 20,
                  padding: 18, borderWidth: 1, borderColor: borderCol,
                  minHeight: 150, gap: 10,
                }}>
                  <View style={{
                    width: 44, height: 44, borderRadius: 12,
                    backgroundColor: b.iconBg,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 22 }}>{b.emoji}</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: c.textPrimary, marginBottom: 5, lineHeight: 19 }}>
                      {b.title}
                    </Text>
                    <Text style={{ fontSize: 12, color: c.textTertiary, lineHeight: 17 }}>
                      {b.desc}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
            {/* row 2 */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {BENEFITS.slice(2, 4).map((b, i) => (
                <View key={i} style={{
                  flex: 1, backgroundColor: surfaceBg, borderRadius: 20,
                  padding: 18, borderWidth: 1, borderColor: borderCol,
                  minHeight: 150, gap: 10,
                }}>
                  <View style={{
                    width: 44, height: 44, borderRadius: 12,
                    backgroundColor: b.iconBg,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 22 }}>{b.emoji}</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: c.textPrimary, marginBottom: 5, lineHeight: 19 }}>
                      {b.title}
                    </Text>
                    <Text style={{ fontSize: 12, color: c.textTertiary, lineHeight: 17 }}>
                      {b.desc}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* ═══ ICON PICKER ═════════════════════════════════════════════════ */}
          <View style={{
            backgroundColor: surfaceBg, borderRadius: 20, padding: 20,
            borderWidth: 1, borderColor: borderCol, marginBottom: 32,
          }}>
            {/* PRO badge top-right */}
            <View style={{
              position: 'absolute', top: 14, right: 14,
              flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: GOLD, borderRadius: 20,
              paddingHorizontal: 10, paddingVertical: 4,
            }}>
              <Text style={{ fontSize: 10 }}>👑</Text>
              <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.8 }}>PRO</Text>
            </View>

            <Text style={{ fontSize: 16, fontWeight: '700', color: c.textPrimary, marginBottom: 4 }}>
              {t('subscription.iconCardTitle')}
            </Text>
            <Text style={{ fontSize: 13, color: c.textSecondary, marginBottom: 18 }}>
              {t('subscription.iconCardDesc')}
            </Text>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {APP_ICONS.map((icon, i) => {
                const isSelected = selectedIcon === i;
                const isLocked   = i > 0;
                return (
                  <TouchableOpacity
                    key={icon.id}
                    style={{ alignItems: 'center', gap: 7 }}
                    onPress={() => {
                      if (!isLocked) {
                        setSelectedIcon(i);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      } else {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
                      }
                    }}
                    activeOpacity={0.75}
                  >
                    <View style={{
                      width: 56, height: 56, borderRadius: 14,
                      backgroundColor: isLocked ? surface2Bg : icon.color,
                      borderWidth: isSelected ? 2.5 : 2,
                      borderColor: isSelected ? BLUE : borderMid,
                      alignItems: 'center', justifyContent: 'center',
                      opacity: isLocked ? 0.55 : 1,
                    }}>
                      {isLocked
                        ? <Text style={{ fontSize: 18 }}>🔒</Text>
                        : <Text style={{ fontSize: 24 }}>{icon.emoji}</Text>
                      }
                      {isSelected && (
                        <View style={{
                          position: 'absolute', top: -7, right: -7,
                          width: 18, height: 18, borderRadius: 9,
                          backgroundColor: BLUE,
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>✓</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{
                      fontSize: 9, fontWeight: '800', letterSpacing: 0.8,
                      textTransform: 'uppercase',
                      color: isLocked ? c.textTertiary : c.textSecondary,
                    }}>
                      {icon.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ═══ PLANS ═══════════════════════════════════════════════════════ */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{
              fontSize: 24, fontWeight: '900', color: c.textPrimary,
              marginBottom: 16, letterSpacing: 0.3, textTransform: 'uppercase',
            }}>
              {t('subscription.plansSection')}
            </Text>

            {/* ── TITULAR (annual) — featured ── */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => handleSelectPlan('titular')}
              style={{
                backgroundColor: surfaceBg, borderRadius: 24,
                padding: 22, marginBottom: 14,
                borderWidth: 2.5,
                borderColor: selectedPlan === 'titular' ? GOLD : borderCol,
              }}
            >
              {/* Best-price badge */}
              <View style={{
                position: 'absolute', top: -12, left: 20,
                flexDirection: 'row', alignItems: 'center', gap: 5,
                backgroundColor: GOLD, borderRadius: 20,
                paddingHorizontal: 12, paddingVertical: 5,
              }}>
                <Text style={{ fontSize: 11 }}>⭐</Text>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 1, textTransform: 'uppercase' }}>
                  {t('subscription.bestPrice')}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 4, marginBottom: 16 }}>
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                    <Text style={{ fontSize: 18 }}>👑</Text>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: c.textTertiary, letterSpacing: 1, textTransform: 'uppercase' }}>
                      {t('subscription.starter')}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
                    <Text style={{ fontSize: 58, fontWeight: '900', color: c.textPrimary, lineHeight: 60 }}>$80</Text>
                    <Text style={{ fontSize: 22, fontWeight: '400', color: c.textSecondary, paddingBottom: 7 }}>
                      {t('subscription.perYear')}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, color: c.textTertiary, marginTop: 2 }}>
                    {t('subscription.monthlyPrice')}
                  </Text>
                </View>
                {/* Radio */}
                <View style={{
                  width: 28, height: 28, borderRadius: 14, marginTop: 4,
                  backgroundColor: selectedPlan === 'titular' ? 'rgba(34,197,94,0.15)' : surface2Bg,
                  borderWidth: 2,
                  borderColor: selectedPlan === 'titular' ? GREEN_CHK : borderMid,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {selectedPlan === 'titular' && (
                    <Text style={{ color: GREEN_CHK, fontSize: 13, fontWeight: '700' }}>✓</Text>
                  )}
                </View>
              </View>

              {/* Divider + benefits */}
              <View style={{ height: 1, backgroundColor: borderCol, marginBottom: 14 }} />
              <View style={{ gap: 4 }}>
                {[
                  t('subscription.benefits.noAds'),
                  t('subscription.benefits.detailedStats'),
                  t('subscription.benefits.customIcon'),
                  t('subscription.benefits.exclusiveContent'),
                ].map((b, i) => <CheckRow key={i} text={b} c={c} />)}
              </View>

              {/* Savings row */}
              <View style={{
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                marginTop: 14, paddingTop: 12,
                borderTopWidth: 1, borderTopColor: borderCol,
              }}>
                <Text style={{ fontSize: 12, color: c.textTertiary }}>vs plan mensual</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: GOLD }}>
                  {t('subscription.savingsText')}
                </Text>
              </View>
            </TouchableOpacity>

            {/* ── SUPLENTE (monthly) ── */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => handleSelectPlan('suplente')}
              style={{
                backgroundColor: surfaceBg, borderRadius: 20,
                padding: 20, borderWidth: 2,
                borderColor: selectedPlan === 'suplente' ? BLUE : borderCol,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                    <Text style={{ fontSize: 16 }}>⚽</Text>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: c.textTertiary, letterSpacing: 1, textTransform: 'uppercase' }}>
                      {t('subscription.suplente')}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
                    <Text style={{ fontSize: 38, fontWeight: '900', color: c.textPrimary, lineHeight: 40 }}>$10</Text>
                    <Text style={{ fontSize: 18, fontWeight: '400', color: c.textSecondary, paddingBottom: 4 }}>
                      {t('subscription.perMonth')}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: c.textTertiary, marginTop: 2 }}>
                    {t('subscription.monthlyCostNote')}
                  </Text>
                </View>
                {/* Radio */}
                <View style={{
                  width: 28, height: 28, borderRadius: 14,
                  backgroundColor: selectedPlan === 'suplente' ? BLUE_DIM : surface2Bg,
                  borderWidth: 2,
                  borderColor: selectedPlan === 'suplente' ? BLUE : borderMid,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {selectedPlan === 'suplente' && (
                    <Text style={{ color: BLUE, fontSize: 13, fontWeight: '700' }}>✓</Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          </View>

          {/* ═══ TRIAL BANNER ════════════════════════════════════════════════ */}
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', gap: 12,
            backgroundColor: BLUE_DIM,
            borderWidth: 1, borderColor: 'rgba(46,124,246,0.25)',
            borderRadius: 16, padding: 16, marginBottom: 16,
          }}>
            <Text style={{ fontSize: 20, marginTop: 1 }}>🤝</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, color: c.textSecondary, lineHeight: 19 }}>
                <Text style={{ fontWeight: '600', color: c.textPrimary }}>
                  {t('subscription.trialBannerTitle')}{' '}
                </Text>
                <Text style={{ fontWeight: '800', color: BLUE }}>
                  {t('subscription.trialBannerBold')}
                </Text>
                {' '}
                <Text>{t('subscription.trialBannerBody')}</Text>
              </Text>
            </View>
          </View>

          {/* ═══ CTA ═════════════════════════════════════════════════════════ */}
          <TouchableOpacity
            style={{
              backgroundColor: loading
                ? surface2Bg
                : selectedPlan === 'banca' ? 'transparent' : BLUE,
              borderRadius: 14, paddingVertical: 17,
              alignItems: 'center', marginBottom: 8,
              borderWidth: selectedPlan === 'banca' || loading ? 1.5 : 0,
              borderColor: borderMid,
            }}
            activeOpacity={0.85}
            onPress={handleSubscribe}
            disabled={loading}
          >
            <Text style={{
              fontSize: 15, fontWeight: '800', letterSpacing: 1.5,
              color: loading || selectedPlan === 'banca' ? c.textTertiary : '#fff',
              textTransform: 'uppercase',
            }}>
              {ctaText}
            </Text>
          </TouchableOpacity>

          {/* Cancel note */}
          {selectedPlan !== 'banca' && !loading && (
            <Text style={{ fontSize: 11, color: c.textTertiary, textAlign: 'center', marginBottom: 16, lineHeight: 16 }}>
              {t('subscription.cancelAnytime')}
            </Text>
          )}
          {(selectedPlan === 'banca' || loading) && <View style={{ height: 16 }} />}

          {/* ═══ BANCA ═══════════════════════════════════════════════════════ */}
          <TouchableOpacity
            onPress={() => handleSelectPlan('banca')}
            style={{
              borderRadius: 16, padding: 16,
              borderWidth: 1.5,
              borderColor: selectedPlan === 'banca' ? borderMid : borderCol,
              backgroundColor: 'transparent', marginBottom: 4,
            }}
            activeOpacity={0.85}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Text style={{ fontSize: 13 }}>🪑</Text>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: c.textTertiary, letterSpacing: 1, textTransform: 'uppercase' }}>
                    {t('subscription.bench')}
                  </Text>
                </View>
                <Text style={{ fontSize: 15, fontWeight: '700', color: c.textSecondary, marginBottom: 8 }}>
                  {t('subscription.bancaStay')}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 }}>
                  <CrossRow text={t('subscription.withAds')} c={c} />
                  <CrossRow text={t('subscription.bancaBasicStats')} c={c} />
                  <CrossRow text={t('subscription.bancaOneIcon')} c={c} />
                </View>
              </View>
              {/* Radio */}
              <View style={{
                width: 24, height: 24, borderRadius: 12, marginLeft: 12, flexShrink: 0,
                backgroundColor: selectedPlan === 'banca' ? surface2Bg : 'transparent',
                borderWidth: 1.5,
                borderColor: selectedPlan === 'banca' ? borderMid : borderCol,
                alignItems: 'center', justifyContent: 'center',
              }}>
                {selectedPlan === 'banca' && (
                  <Text style={{ color: c.textTertiary, fontSize: 11, fontWeight: '700' }}>✓</Text>
                )}
              </View>
            </View>
          </TouchableOpacity>

          {/* ═══ FOOTER ══════════════════════════════════════════════════════ */}
          <View style={{ alignItems: 'center', paddingTop: 20, gap: 12 }}>
            <TouchableOpacity onPress={handleRestore} activeOpacity={0.7}>
              <Text style={{ fontSize: 13, color: BLUE, fontWeight: '600' }}>
                {t('subscription.restore')}
              </Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 11, color: c.textTertiary }}>
              {t('subscription.termsPrivacy')}
            </Text>
          </View>

        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
};
