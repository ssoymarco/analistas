// ── PromoBanner — aviso promocional in-app con interruptor remoto ────────────
//
// Nacido como remediación del bug de favoritos (3 jul 2026): los usuarios que
// perdieron follows son inalcanzables por push (el propio bug los desuscribió
// de FCM), así que el único canal que llega al 100% es DENTRO de la app. El
// copy es puro contexto mundialista — jamás menciona el bug.
//
// Control remoto vía `_meta/promoBanner` { enabled: bool, id: string }:
//   • enabled:false → se apaga para todos sin OTA.
//   • cambiar `id` → se re-muestra a quien ya lo descartó (reusar en octavos,
//     cuartos, etc. — actualizar el copy i18n por OTA si cambia la ronda).
// El descarte guarda el id en AsyncStorage; mismo id no vuelve a aparecer.

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { db } from '../services/firebase';
import { useThemeColors } from '../theme/useTheme';

const DISMISSED_KEY = 'analistas_promo_banner_dismissed';

interface Props {
  /** Acción del CTA (p.ej. navegar a la búsqueda para seguir equipos). */
  onPress: () => void;
}

export const PromoBanner: React.FC<Props> = ({ onPress }) => {
  const { t } = useTranslation();
  const c = useThemeColors();
  const [bannerId, setBannerId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [snap, dismissed] = await Promise.all([
          getDoc(doc(db, '_meta', 'promoBanner')),
          AsyncStorage.getItem(DISMISSED_KEY),
        ]);
        if (!alive || !snap.exists()) return;
        const data = snap.data() as { enabled?: boolean; id?: string };
        if (data.enabled && data.id && data.id !== dismissed) {
          setBannerId(data.id);
        }
      } catch {
        // offline / doc ausente → simplemente no se muestra
      }
    })();
    return () => { alive = false; };
  }, []);

  const dismiss = useCallback(() => {
    if (bannerId) AsyncStorage.setItem(DISMISSED_KEY, bannerId).catch(() => {});
    setBannerId(null);
  }, [bannerId]);

  if (!bannerId) return null;

  return (
    <View style={[s.card, { backgroundColor: c.card, borderColor: c.accent + '55' }]}>
      <View style={s.row}>
        <Text style={s.emoji}>🏆</Text>
        <View style={s.textCol}>
          <Text style={[s.title, { color: c.textPrimary }]}>{t('promoBanner.title')}</Text>
          <Text style={[s.body, { color: c.textSecondary }]}>{t('promoBanner.body')}</Text>
        </View>
        <TouchableOpacity onPress={dismiss} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[s.close, { color: c.textSecondary }]}>✕</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={[s.cta, { backgroundColor: c.accent }]}
        onPress={onPress}
        activeOpacity={0.85}
      >
        <Text style={s.ctaText}>{t('promoBanner.cta')}</Text>
      </TouchableOpacity>
    </View>
  );
};

const s = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  emoji: { fontSize: 26, marginRight: 10, marginTop: 1 },
  textCol: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  body: { fontSize: 13, lineHeight: 18 },
  close: { fontSize: 15, fontWeight: '600', padding: 2 },
  cta: {
    marginTop: 12,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  ctaText: { color: '#0D0D0D', fontSize: 14, fontWeight: '700' },
});
