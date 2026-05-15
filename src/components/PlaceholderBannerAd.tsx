/**
 * PlaceholderBannerAd.tsx
 *
 * Mock banner ads for development / demo purposes.
 * Replace with real BannerAd <imageUrl> when live creatives arrive.
 *
 * Variants
 * ─────────────────────────────────────────────────
 * LARGE BANNER  (320 × 100 — full content width)
 *   'caliente-banner'   Strategic — momios + CTA
 *   'telcel-banner'     Generic   — telco
 *   'amazon-banner'     Generic   — e-commerce
 *   'corona-banner'     Generic   — beer/lifestyle
 *
 * MREC  (300 × 250)
 *   'caliente-mrec'     Strategic — match card + odds
 *   'netflix-mrec'      Generic   — streaming
 *   'walmart-mrec'      Generic   — retail
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
  | 'telcel-banner'
  | 'amazon-banner'
  | 'corona-banner'
  | 'caliente-mrec'
  | 'netflix-mrec'
  | 'walmart-mrec';

const AdLabel = ({ dark = true }: { dark?: boolean }) => (
  <Text style={{
    fontSize: 8, color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)',
    fontWeight: '500', letterSpacing: 0.5,
  }}>
    Publicidad
  </Text>
);

// ── LARGE BANNERS (320 × 100) ─────────────────────────────────────────────────

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

function TelcelBanner({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress} activeOpacity={0.88}
      style={{
        width: BANNER_W, height: BANNER_H,
        borderRadius: 12, overflow: 'hidden',
        backgroundColor: '#001489',
        flexDirection: 'row', alignItems: 'center',
      }}
    >
      <View style={{ width: 4, height: '100%', backgroundColor: '#00aaff' }} />
      <View style={{ flex: 1, paddingHorizontal: 16, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: -0.5 }}>Telcel</Text>
          <AdLabel />
        </View>
        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>
          Plan ilimitado desde <Text style={{ color: '#00ddff', fontWeight: '900' }}>$399</Text>/mes
        </Text>
        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
          Sin contratos · Red #1 de México
        </Text>
      </View>
      <View style={{ paddingRight: 14 }}>
        <View style={{ backgroundColor: '#00aaff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>VER OFERTA</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function AmazonBanner({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress} activeOpacity={0.88}
      style={{
        width: BANNER_W, height: BANNER_H,
        borderRadius: 12, overflow: 'hidden',
        backgroundColor: '#131921',
        flexDirection: 'row', alignItems: 'center',
      }}
    >
      <View style={{ width: 4, height: '100%', backgroundColor: '#ff9900' }} />
      <View style={{ flex: 1, paddingHorizontal: 14, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 16, fontWeight: '900', color: '#ff9900', letterSpacing: -0.3 }}>amazon</Text>
          <AdLabel />
        </View>
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>
          ⚡ Prime Day — Hasta 50% off
        </Text>
        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
          Envío gratis en millones de productos
        </Text>
      </View>
      <View style={{ paddingRight: 14 }}>
        <View style={{ backgroundColor: '#ff9900', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: '#131921' }}>COMPRAR</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function CoronaBanner({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress} activeOpacity={0.88}
      style={{
        width: BANNER_W, height: BANNER_H,
        borderRadius: 12, overflow: 'hidden',
        backgroundColor: '#0a1628',
        flexDirection: 'row', alignItems: 'center',
      }}
    >
      <View style={{ width: 4, height: '100%', backgroundColor: '#c8a84b' }} />
      {/* Crown icon */}
      <View style={{ width: 64, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 32 }}>👑</Text>
      </View>
      <View style={{ flex: 1, gap: 3, justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '900', color: '#c8a84b', letterSpacing: 2 }}>CORONA</Text>
          <AdLabel />
        </View>
        <Text style={{ fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.85)' }}>
          El sabor del partido
        </Text>
        <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>
          +18 · Beber con moderación
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ── MRECs (300 × 250) ─────────────────────────────────────────────────────────

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

function NetflixMREC({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress} activeOpacity={0.88}
      style={{
        width: MREC_W, height: MREC_H,
        borderRadius: 16, overflow: 'hidden',
        backgroundColor: '#141414',
      }}
    >
      {/* Red gradient bar */}
      <View style={{ height: 6, backgroundColor: '#e50914' }} />

      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 16, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 26, fontWeight: '900', color: '#e50914', letterSpacing: -1 }}>NETFLIX</Text>
          <AdLabel />
        </View>

        {/* Show grid mock */}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
          {['#c0392b', '#2980b9', '#27ae60', '#8e44ad'].map((bg, i) => (
            <View key={i} style={{ flex: 1, height: 72, borderRadius: 6, backgroundColor: bg, opacity: 0.7 }} />
          ))}
        </View>

        <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff', marginTop: 8 }}>
          Fútbol + series + películas
        </Text>
        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
          Todo en un solo lugar. Sin anuncios.
        </Text>
      </View>

      {/* CTA */}
      <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
        <View style={{ backgroundColor: '#e50914', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>
            PRUEBA 30 DÍAS GRATIS
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function WalmartMREC({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress} activeOpacity={0.88}
      style={{
        width: MREC_W, height: MREC_H,
        borderRadius: 16, overflow: 'hidden',
        backgroundColor: '#0071ce',
      }}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 22 }}>✦</Text>
          <Text style={{ fontSize: 18, fontWeight: '900', color: '#fff' }}>Walmart</Text>
        </View>
        <AdLabel dark />
      </View>

      <View style={{ paddingHorizontal: 16, gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff', lineHeight: 22 }}>
          ⚽ Fin de semana{'\n'}de fútbol
        </Text>
        {/* Product tiles */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[
            { icon: '📺', label: 'TV 55"', price: '$8,999' },
            { icon: '🔊', label: 'Bocina', price: '$599' },
            { icon: '👕', label: 'Jersey', price: '$399' },
          ].map(p => (
            <View key={p.label} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: 8, alignItems: 'center', gap: 3 }}>
              <Text style={{ fontSize: 22 }}>{p.icon}</Text>
              <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', fontWeight: '600' }}>{p.label}</Text>
              <Text style={{ fontSize: 10, color: '#ffd700', fontWeight: '800' }}>{p.price}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* CTA */}
      <View style={{ marginHorizontal: 16, marginTop: 14 }}>
        <View style={{ backgroundColor: '#ffd700', borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '900', color: '#0071ce' }}>
            VER PROMOCIONES  ›
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

const LINKS: Record<PlaceholderVariant, string> = {
  'caliente-banner': 'https://caliente.mx',
  'telcel-banner':   'https://telcel.com',
  'amazon-banner':   'https://amazon.com.mx',
  'corona-banner':   'https://corona.com.mx',
  'caliente-mrec':   'https://caliente.mx',
  'netflix-mrec':    'https://netflix.com',
  'walmart-mrec':    'https://walmart.com.mx',
};

interface Props {
  variant: PlaceholderVariant;
  style?: object;
}

export const PlaceholderBannerAd: React.FC<Props> = ({ variant, style }) => {
  const handlePress = () => Linking.openURL(LINKS[variant]).catch(() => {});

  const wrap = (
    <View style={[{ alignItems: 'center', marginVertical: 8 }, style]}>
      {variant === 'caliente-banner' && <CalienteBanner onPress={handlePress} />}
      {variant === 'telcel-banner'   && <TelcelBanner   onPress={handlePress} />}
      {variant === 'amazon-banner'   && <AmazonBanner   onPress={handlePress} />}
      {variant === 'corona-banner'   && <CoronaBanner   onPress={handlePress} />}
      {variant === 'caliente-mrec'   && <CalienteMREC   onPress={handlePress} />}
      {variant === 'netflix-mrec'    && <NetflixMREC    onPress={handlePress} />}
      {variant === 'walmart-mrec'    && <WalmartMREC    onPress={handlePress} />}
    </View>
  );

  return wrap;
};
