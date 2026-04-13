// ── Hazte Titular (Premium) ──────────────────────────────────────────────────
// Full-screen paywall with hero, benefits, app icon preview, pricing cards,
// trial banner, CTA button, and subscriber management state.
// Uses football terminology: Titular (annual), Revulsivo (monthly), Banca (free).

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Animated, Platform,
  Easing, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { useThemeColors } from '../theme/useTheme';
import { useDarkMode } from '../contexts/DarkModeContext';
import type { ColorPalette } from '../theme/colors';

// ── Constants ────────────────────────────────────────────────────────────────
const GREEN = '#10b981';
const GREEN_DIM = 'rgba(16,185,129,0.12)';
const GOLD = '#fbbf24';

type PlanId = 'titular' | 'revulsivo' | 'banca';

interface Plan {
  id: PlanId;
  name: string;
  subtitle: string;
  price: string;
  period: string;
  monthly?: string;
  badge?: string;
  benefits?: string[];
  savings?: string;
}

const PLANS: Plan[] = [
  {
    id: 'titular',
    name: 'TITULAR',
    subtitle: 'Plan anual',
    price: '$80',
    period: '/año',
    monthly: '≈ $6.67 al mes',
    badge: '★ MEJOR PRECIO',
    benefits: [
      'Sin publicidad en toda la app',
      'Velocidad máxima garantizada',
      'Ícono de app personalizable (4 diseños)',
      'Estadísticas avanzadas exclusivas',
    ],
    savings: 'Ahorras $40/año 🚀',
  },
  {
    id: 'revulsivo',
    name: 'REVULSIVO',
    subtitle: 'Plan mensual',
    price: '$10',
    period: '/mes',
    monthly: 'Sin anuncios',
  },
  {
    id: 'banca',
    name: 'BANCA',
    subtitle: 'Plan gratuito',
    price: 'Gratis',
    period: '',
    monthly: 'Con anuncios',
  },
];

const BENEFITS = [
  { emoji: '🚫', title: 'Sin publicidad', desc: 'Los jerseys se ven mejor sin publicidad. Tu app también.' },
  { emoji: '⚡', title: 'Velocidad máxima', desc: 'Tu app volará. Sin anuncios que la frenen.' },
  { emoji: '📊', title: 'Estadísticas avanzadas', desc: 'Datos de élite directo de las ligas. Solo para titulares.' },
  { emoji: '📱', title: 'Ícono personalizable', desc: 'Elige entre 4 diseños exclusivos. Sé diferente.' },
];

const APP_ICONS = [
  { id: 'clasico', name: 'CLÁSICO', bg: '#1a2e1a', border: GREEN, emoji: '⚽', accent: GREEN },
  { id: 'blanco', name: 'BLANCO', bg: '#f0f0f0', border: '#d4d4d4', emoji: '⚽', accent: '#374151' },
  { id: 'noche', name: 'NOCHE', bg: '#111111', border: '#333333', emoji: '⚽', accent: '#9ca3af' },
  { id: 'oro', name: 'ORO', bg: '#2a2210', border: '#b8860b', emoji: '⚽', accent: GOLD },
];

// ── Sub-components ───────────────────────────────────────────────────────────

function BackArrow({ color }: { color: string }) {
  return (
    <View style={{ width: 11, height: 11, borderLeftWidth: 2.5, borderBottomWidth: 2.5, borderColor: color, transform: [{ rotate: '45deg' }] }} />
  );
}

function BenefitCard({ emoji, title, desc, c, isDark, delay }: {
  emoji: string; title: string; desc: string; c: ColorPalette; isDark: boolean; delay: number;
}) {
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeIn, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(slideUp, { toValue: 0, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }, delay);
    return () => clearTimeout(t);
  }, []);

  return (
    <Animated.View style={{
      flex: 1, padding: 14, borderRadius: 16,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)',
      borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      opacity: fadeIn, transform: [{ translateY: slideUp }],
    }}>
      <View style={{
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: GREEN_DIM, alignItems: 'center', justifyContent: 'center', marginBottom: 10,
      }}>
        <Text style={{ fontSize: 18 }}>{emoji}</Text>
      </View>
      <Text style={{ fontSize: 13, fontWeight: '700', color: c.textPrimary, marginBottom: 4 }}>{title}</Text>
      <Text style={{ fontSize: 11, color: c.textTertiary, lineHeight: 16 }}>{desc}</Text>
    </Animated.View>
  );
}

function IconOption({ icon, selected, locked, onPress, c, isDark }: {
  icon: typeof APP_ICONS[0]; selected: boolean; locked: boolean;
  onPress: () => void; c: ColorPalette; isDark: boolean;
}) {
  return (
    <TouchableOpacity
      style={{ alignItems: 'center', gap: 6 }}
      onPress={onPress} activeOpacity={0.7}
    >
      <View style={{
        width: 56, height: 56, borderRadius: 14,
        backgroundColor: icon.bg, borderWidth: 2,
        borderColor: selected ? GREEN : icon.border,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: selected ? GREEN : '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: selected ? 0.3 : 0.1,
        shadowRadius: 6, elevation: selected ? 6 : 2,
      }}>
        {locked ? (
          <Text style={{ fontSize: 18, opacity: 0.4 }}>🔒</Text>
        ) : (
          <Text style={{ fontSize: 24 }}>{icon.emoji}</Text>
        )}
        {selected && (
          <View style={{
            position: 'absolute', top: -4, right: -4,
            width: 18, height: 18, borderRadius: 9, backgroundColor: GREEN,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 2, borderColor: isDark ? '#0f1117' : '#fff',
          }}>
            <Text style={{ fontSize: 9, color: '#fff', fontWeight: '900' }}>✓</Text>
          </View>
        )}
      </View>
      <Text style={{ fontSize: 9, fontWeight: '700', color: selected ? GREEN : c.textTertiary, letterSpacing: 0.5 }}>
        {icon.name}
      </Text>
    </TouchableOpacity>
  );
}

function PlanCheckRow({ text, c }: { text: string; c: ColorPalette }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: GREEN_DIM, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 9, color: GREEN, fontWeight: '900' }}>✓</Text>
      </View>
      <Text style={{ fontSize: 13, color: c.textSecondary, flex: 1 }}>{text}</Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── Main Screen ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

export const HazteTitularScreen: React.FC = () => {
  const c = useThemeColors();
  const { isDark } = useDarkMode();
  const navigation = useNavigation();

  const [selectedPlan, setSelectedPlan] = useState<PlanId>('titular');
  const [selectedIcon, setSelectedIcon] = useState('clasico');

  // Entrance animations
  const heroOp = useRef(new Animated.Value(0)).current;
  const heroScale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroOp, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(heroScale, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleSelectPlan = useCallback((id: PlanId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedPlan(id);
  }, []);

  const handleSubscribe = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const plan = PLANS.find(p => p.id === selectedPlan)!;
    if (selectedPlan === 'banca') {
      navigation.goBack();
      return;
    }
    // TODO: RevenueCat integration
    Alert.alert(
      'Próximamente',
      `La suscripción "${plan.name}" estará disponible cuando lancemos la app. ¡Gracias por tu interés!`,
      [{ text: 'Entendido' }],
    );
  }, [selectedPlan, navigation]);

  const handleRestore = useCallback(() => {
    // TODO: RevenueCat restore
    Alert.alert('Restaurar compra', 'No se encontraron compras previas. Cuando integremos RevenueCat, aquí podrás restaurar tu suscripción.', [{ text: 'OK' }]);
  }, []);

  const activePlan = PLANS.find(p => p.id === selectedPlan)!;

  const ctaText = selectedPlan === 'titular'
    ? `🏟️ Hazte titular · $80/año`
    : selectedPlan === 'revulsivo'
      ? `⚡ Suscríbete · $10/mes`
      : 'Continuar gratis';

  const headerBg = isDark ? '#0a1a0f' : '#f0fdf4';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── HEADER BAR ── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
        paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border,
      }}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}
          activeOpacity={0.7}
        >
          <BackArrow color={c.textSecondary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: c.textPrimary }}>Hazte Titular</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Platform.OS === 'ios' ? 40 : 24 }}
      >
        {/* ═══ HERO ═══ */}
        <Animated.View style={{
          paddingVertical: 36, paddingHorizontal: 24, alignItems: 'center',
          backgroundColor: headerBg,
          opacity: heroOp, transform: [{ scale: heroScale }],
        }}>
          {/* Decorative glows */}
          <View style={{ position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: `rgba(16,185,129,${isDark ? '0.12' : '0.06'})` }} />
          <View style={{ position: 'absolute', bottom: -30, left: -30, width: 100, height: 100, borderRadius: 50, backgroundColor: `rgba(16,185,129,${isDark ? '0.08' : '0.04'})` }} />

          {/* PRO badge */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: GREEN, borderRadius: 20,
            paddingHorizontal: 14, paddingVertical: 6, marginBottom: 20,
          }}>
            <Text style={{ fontSize: 12 }}>👑</Text>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 1.5 }}>ANALISTAS PRO</Text>
          </View>

          {/* Headline */}
          <Text style={{
            fontSize: 30, fontWeight: '900', color: c.textPrimary,
            textAlign: 'center', letterSpacing: -0.5, lineHeight: 36, marginBottom: 4,
          }}>
            El once inicial
          </Text>
          <Text style={{
            fontSize: 30, fontWeight: '900', color: GREEN,
            textAlign: 'center', letterSpacing: -0.5, lineHeight: 36, marginBottom: 14,
          }}>
            te espera
          </Text>

          {/* Subtitle */}
          <Text style={{ fontSize: 14, color: c.textTertiary, textAlign: 'center', lineHeight: 20 }}>
            Sin anuncios · Más rápido · Más tuyo
          </Text>
          <Text style={{ fontSize: 12, color: c.textTertiary, textAlign: 'center', marginTop: 2 }}>
            Juega en otro nivel
          </Text>
        </Animated.View>

        {/* ═══ BENEFITS GRID ═══ */}
        <View style={{ paddingHorizontal: 20, paddingTop: 28 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: c.textPrimary, textAlign: 'center', marginBottom: 20 }}>
            ¿Qué incluye ser titular?
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            <BenefitCard {...BENEFITS[0]} c={c} isDark={isDark} delay={100} />
            <BenefitCard {...BENEFITS[1]} c={c} isDark={isDark} delay={200} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <BenefitCard {...BENEFITS[2]} c={c} isDark={isDark} delay={300} />
            <BenefitCard {...BENEFITS[3]} c={c} isDark={isDark} delay={400} />
          </View>
        </View>

        {/* ═══ APP ICON PREVIEW ═══ */}
        <View style={{ paddingHorizontal: 20, paddingTop: 28 }}>
          <View style={{
            backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            borderRadius: 20, padding: 20,
            borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary }}>Personaliza tu ícono</Text>
                <Text style={{ fontSize: 11, color: c.textTertiary, marginTop: 2 }}>4 diseños exclusivos para titulares</Text>
              </View>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                backgroundColor: GREEN_DIM, borderRadius: 8,
                paddingHorizontal: 8, paddingVertical: 4,
              }}>
                <Text style={{ fontSize: 10 }}>👑</Text>
                <Text style={{ fontSize: 9, fontWeight: '800', color: GREEN, letterSpacing: 0.5 }}>PRO</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              {APP_ICONS.map((icon, i) => (
                <IconOption
                  key={icon.id}
                  icon={icon}
                  selected={selectedIcon === icon.id}
                  locked={i > 0}
                  onPress={() => {
                    if (i > 0) {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
                      // Could show a message that they need PRO
                    } else {
                      setSelectedIcon(icon.id);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    }
                  }}
                  c={c}
                  isDark={isDark}
                />
              ))}
            </View>
          </View>
        </View>

        {/* ═══ PRICING ═══ */}
        <View style={{ paddingHorizontal: 20, paddingTop: 32 }}>
          <Text style={{ fontSize: 22, fontWeight: '900', color: c.textPrimary, textAlign: 'center', marginBottom: 20 }}>
            Elige tu posición
          </Text>

          {/* ── TITULAR (annual) — large card ── */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => handleSelectPlan('titular')}
            style={{
              borderRadius: 20, padding: 20, marginBottom: 12,
              backgroundColor: selectedPlan === 'titular'
                ? (isDark ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.05)')
                : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
              borderWidth: selectedPlan === 'titular' ? 2 : 1,
              borderColor: selectedPlan === 'titular'
                ? GREEN
                : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
            }}
          >
            {/* Best price badge */}
            <View style={{
              position: 'absolute', top: -11, left: 16,
              flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: GREEN, borderRadius: 10,
              paddingHorizontal: 10, paddingVertical: 4,
            }}>
              <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.5 }}>★ MEJOR PRECIO</Text>
            </View>

            {/* Radio + header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 4 }}>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Text style={{ fontSize: 12, color: GREEN }}>⚽</Text>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: GREEN, letterSpacing: 1 }}>TITULAR</Text>
                </View>
                <Text style={{ fontSize: 16, fontWeight: '700', color: c.textPrimary }}>Plan anual</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Text style={{ fontSize: 32, fontWeight: '900', color: c.textPrimary }}>$80</Text>
                  <Text style={{ fontSize: 14, color: c.textTertiary }}>/año</Text>
                </View>
                <Text style={{ fontSize: 11, color: c.textTertiary }}>≈ $6.67 al mes</Text>
              </View>
            </View>

            {/* Radio indicator */}
            <View style={{
              position: 'absolute', top: 18, right: 18,
              width: 24, height: 24, borderRadius: 12,
              borderWidth: 2,
              borderColor: selectedPlan === 'titular' ? GREEN : c.textTertiary,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: selectedPlan === 'titular' ? GREEN : 'transparent',
            }}>
              {selectedPlan === 'titular' && (
                <Text style={{ fontSize: 11, color: '#fff', fontWeight: '900' }}>✓</Text>
              )}
            </View>

            {/* Benefits list */}
            {selectedPlan === 'titular' && (
              <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
                {PLANS[0].benefits!.map((b, i) => (
                  <PlanCheckRow key={i} text={b} c={c} />
                ))}

                {/* Savings banner */}
                <View style={{
                  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                  borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginTop: 12,
                }}>
                  <Text style={{ fontSize: 12, color: c.textTertiary }}>vs plan mensual</Text>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: GREEN }}>Ahorras $40/año 🚀</Text>
                </View>
              </View>
            )}
          </TouchableOpacity>

          {/* ── REVULSIVO + BANCA — side by side ── */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {/* Revulsivo */}
            <TouchableOpacity
              style={{
                flex: 1, borderRadius: 16, padding: 16,
                backgroundColor: selectedPlan === 'revulsivo'
                  ? (isDark ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.04)')
                  : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                borderWidth: selectedPlan === 'revulsivo' ? 2 : 1,
                borderColor: selectedPlan === 'revulsivo'
                  ? GREEN
                  : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
              }}
              activeOpacity={0.85}
              onPress={() => handleSelectPlan('revulsivo')}
            >
              {/* Radio */}
              <View style={{
                position: 'absolute', top: 12, right: 12,
                width: 20, height: 20, borderRadius: 10,
                borderWidth: 2,
                borderColor: selectedPlan === 'revulsivo' ? GREEN : c.textTertiary,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: selectedPlan === 'revulsivo' ? GREEN : 'transparent',
              }}>
                {selectedPlan === 'revulsivo' && <Text style={{ fontSize: 9, color: '#fff', fontWeight: '900' }}>✓</Text>}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                <Text style={{ fontSize: 11 }}>⚡</Text>
                <Text style={{ fontSize: 9, fontWeight: '800', color: c.textTertiary, letterSpacing: 0.5 }}>REVULSIVO</Text>
              </View>
              <Text style={{ fontSize: 26, fontWeight: '900', color: c.textPrimary }}>$10</Text>
              <Text style={{ fontSize: 12, color: c.textTertiary }}>/mes · Sin anuncios</Text>
            </TouchableOpacity>

            {/* Banca */}
            <TouchableOpacity
              style={{
                flex: 1, borderRadius: 16, padding: 16,
                backgroundColor: selectedPlan === 'banca'
                  ? (isDark ? 'rgba(107,114,128,0.08)' : 'rgba(0,0,0,0.03)')
                  : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                borderWidth: selectedPlan === 'banca' ? 2 : 1,
                borderColor: selectedPlan === 'banca'
                  ? c.textTertiary
                  : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
              }}
              activeOpacity={0.85}
              onPress={() => handleSelectPlan('banca')}
            >
              {/* Radio */}
              <View style={{
                position: 'absolute', top: 12, right: 12,
                width: 20, height: 20, borderRadius: 10,
                borderWidth: 2,
                borderColor: selectedPlan === 'banca' ? c.textTertiary : c.textTertiary,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: selectedPlan === 'banca' ? c.textTertiary : 'transparent',
              }}>
                {selectedPlan === 'banca' && <Text style={{ fontSize: 9, color: '#fff', fontWeight: '900' }}>✓</Text>}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                <Text style={{ fontSize: 11 }}>🪑</Text>
                <Text style={{ fontSize: 9, fontWeight: '800', color: c.textTertiary, letterSpacing: 0.5 }}>BANCA</Text>
              </View>
              <Text style={{ fontSize: 22, fontWeight: '900', color: c.textPrimary }}>Gratis</Text>
              <Text style={{ fontSize: 12, color: c.textTertiary }}>Con anuncios</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ═══ TRIAL BANNER ═══ */}
        <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', gap: 10,
            backgroundColor: isDark ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.04)',
            borderRadius: 16, padding: 16,
            borderWidth: 1, borderColor: isDark ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.1)',
          }}>
            <Text style={{ fontSize: 20, marginTop: 2 }}>🤝</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, color: c.textSecondary, lineHeight: 20 }}>
                ¿Aún no te convence?{' '}
                <Text style={{ fontWeight: '800', color: GREEN, textDecorationLine: 'underline' }}>
                  Prueba 7 días sin cargo
                </Text>
                {' '}con el plan anual — cancela antes y no se cobra nada.
              </Text>
            </View>
          </View>
        </View>

        {/* ═══ CTA BUTTON ═══ */}
        <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
          <TouchableOpacity
            style={{
              backgroundColor: selectedPlan === 'banca' ? c.textTertiary : GREEN,
              borderRadius: 16, paddingVertical: 18, alignItems: 'center',
              shadowColor: selectedPlan === 'banca' ? '#000' : GREEN,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: selectedPlan === 'banca' ? 0.1 : 0.3,
              shadowRadius: 12, elevation: 6,
            }}
            activeOpacity={0.85}
            onPress={handleSubscribe}
          >
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: -0.2 }}>
              {ctaText}
            </Text>
          </TouchableOpacity>

          {/* Fine print */}
          {selectedPlan !== 'banca' && (
            <Text style={{ fontSize: 11, color: c.textTertiary, textAlign: 'center', marginTop: 10, lineHeight: 16 }}>
              {selectedPlan === 'titular'
                ? 'Después $80/año · Cancela antes del día 7 y no se cobra nada.'
                : 'Renovación automática cada mes · Cancela cuando quieras.'}
            </Text>
          )}
        </View>

        {/* ═══ FOOTER LINKS ═══ */}
        <View style={{ alignItems: 'center', paddingTop: 24, gap: 12 }}>
          <TouchableOpacity onPress={handleRestore} activeOpacity={0.7}>
            <Text style={{ fontSize: 13, color: GREEN, fontWeight: '600' }}>
              ¿Ya eras titular? Restaura tu compra
            </Text>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity activeOpacity={0.7}>
              <Text style={{ fontSize: 11, color: c.textTertiary, textDecorationLine: 'underline' }}>Términos del servicio</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 11, color: c.textTertiary }}>·</Text>
            <TouchableOpacity activeOpacity={0.7}>
              <Text style={{ fontSize: 11, color: c.textTertiary, textDecorationLine: 'underline' }}>Política de privacidad</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
};
