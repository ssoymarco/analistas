/**
 * PlaceholderBannerAd.tsx
 *
 * Caliente sponsor banners — the only paid advertiser for v1.0.
 *
 * Other generic-brand mocks (telcel, amazon, corona, netflix, walmart) were
 * removed in v1.0 cleanup; they had served as visual placeholders during
 * design but Analistas ships with Caliente only until AdMob lands in v1.1.
 *
 * Variants
 * ─────────────────────────────────────────────────
 * LARGE BANNER  (full content width × 100)
 *   'caliente-banner'   Strategic — momios + CTA
 *
 * MREC  (full content width × 250)
 *   'caliente-mrec'     Strategic — match card + odds
 */

import React from 'react';
import { View, Text, TouchableOpacity, Dimensions, Linking } from 'react-native';

const SW = Dimensions.get('window').width;
const BANNER_W = SW - 32;
const BANNER_H = 100;
const MREC_W   = SW - 32;
const MREC_H   = 250;

export type PlaceholderVariant =
  | 'caliente-banner'
  | 'caliente-mrec';

const AdLabel = ({ dark = true }: { dark?: boolean }) => (
  <Text style={{
    fontSize: 8, color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)',
    fontWeight: '500', letterSpacing: 0.5,
  }}>
    Publicidad
  </Text>
);

// ── LARGE BANNER (full width × 100) ───────────────────────────────────────────

function CalienteBanner({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress} activeOpacity={0.88}
      style={{
        width: BANNER_W, height: BANNER_H,
        borderRadius: 12, overflow: 'hidden',
        backgroundColor: '#0d0808',
        borderWidth: 1, borderColor: '#c0392b33',
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      {/* Left accent strip */}
      <View style={{ width: 4, height: '100%', backgroundColor: '#e51c23' }} />

      {/* Left: logo + tagline */}
      <View style={{ paddingHorizontal: 12, justifyContent: 'center', gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#e51c23', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff' }}>C</Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: '900', color: '#fff', letterSpacing: -0.3 }}>caliente</Text>
          <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontWeight: '500' }}>.mx</Text>
        </View>
        <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', lineHeight: 12 }}>
          Casa de apuestas oficial
        </Text>
        <AdLabel />
      </View>

      {/* Divider */}
      <View style={{ width: 1, height: 64, backgroundColor: 'rgba(255,255,255,0.08)' }} />

      {/* Right: odds + CTA */}
      <View style={{ flex: 1, paddingHorizontal: 12, gap: 6, justifyContent: 'center' }}>
        {/* Odds row */}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[{ label: '1', val: '-150' }, { label: 'X', val: '+280' }, { label: '2', val: '+390' }].map(o => (
            <View key={o.label} style={{ flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 6, paddingVertical: 4 }}>
              <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', marginBottom: 1 }}>{o.label}</Text>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>{o.val}</Text>
            </View>
          ))}
        </View>
        {/* CTA */}
        <View style={{ backgroundColor: '#e51c23', borderRadius: 8, paddingVertical: 6, alignItems: 'center' }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.5 }}>
            APUESTA AHORA  ›
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── MREC (full width × 250) ───────────────────────────────────────────────────

function CalienteMREC({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress} activeOpacity={0.88}
      style={{
        width: MREC_W, height: MREC_H,
        borderRadius: 16, overflow: 'hidden',
        backgroundColor: '#0d0808',
        borderWidth: 1, borderColor: '#c0392b22',
      }}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#e51c23', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 11, fontWeight: '900', color: '#fff' }}>C</Text>
          </View>
          <Text style={{ fontSize: 15, fontWeight: '900', color: '#fff' }}>caliente.mx</Text>
        </View>
        <AdLabel />
      </View>

      {/* Match card */}
      <View style={{ paddingHorizontal: 20, paddingTop: 16, alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.8, textTransform: 'uppercase' }}>
          Liga MX · Semifinales
        </Text>
        {/* Teams */}
        <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'space-between', paddingHorizontal: 8 }}>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 36 }}>🦅</Text>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>América</Text>
          </View>
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Hoy · 20:00</Text>
            <Text style={{ fontSize: 22, fontWeight: '900', color: '#e51c23' }}>VS</Text>
          </View>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 36 }}>🐐</Text>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>Chivas</Text>
          </View>
        </View>
      </View>

      {/* Odds */}
      <View style={{ flexDirection: 'row', marginHorizontal: 16, marginTop: 12, gap: 8 }}>
        {[{ label: 'América', val: '-140' }, { label: 'Empate', val: '+290' }, { label: 'Chivas', val: '+360' }].map(o => (
          <View key={o.label} style={{ flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 8, paddingVertical: 8 }}>
            <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>{o.label}</Text>
            <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>{o.val}</Text>
          </View>
        ))}
      </View>

      {/* Promo + CTA */}
      <View style={{ marginHorizontal: 16, marginTop: 10 }}>
        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: 6 }}>
          🎁 Recibe <Text style={{ color: '#f59e0b', fontWeight: '800' }}>$1,000</Text> sin depósito
        </Text>
        <View style={{ backgroundColor: '#e51c23', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '900', color: '#fff', letterSpacing: 0.5 }}>
            APUESTA EN VIVO  ›
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

const LINKS: Record<PlaceholderVariant, string> = {
  'caliente-banner': 'https://caliente.mx',
  'caliente-mrec':   'https://caliente.mx',
};

interface Props {
  variant: PlaceholderVariant;
  style?: object;
}

export const PlaceholderBannerAd: React.FC<Props> = ({ variant, style }) => {
  const handlePress = () => Linking.openURL(LINKS[variant]).catch(() => {});

  return (
    <View style={[{ alignItems: 'center', marginVertical: 8 }, style]}>
      {variant === 'caliente-banner' && <CalienteBanner onPress={handlePress} />}
      {variant === 'caliente-mrec'   && <CalienteMREC   onPress={handlePress} />}
    </View>
  );
};
