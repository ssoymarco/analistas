// ── LiveActivityButton — "Seguir en vivo" (Live Activity / lock screen) ──────
//
// Pill que inicia/termina la Live Activity del partido. Solo se renderiza si:
//   • el binario trae el módulo nativo (isLiveActivitySupported → guard OTA), y
//   • el partido está EN VIVO.
// GRATIS para todos — sin checks de premium (decisión de producto).
// Iconos = primitivas RN (convención del app: sin librerías de iconos).

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../theme/useTheme';
import { useLiveActivity, canFollowMatch } from '../hooks/useLiveActivity';
import { haptics } from '../utils/haptics';
import type { Match } from '../data/types';

const LIVE_RED = '#FF453A';

export const LiveActivityButton: React.FC<{ match: Match }> = ({ match }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const { supported, following, start, end } = useLiveActivity(match);

  // En vivo, o por comenzar dentro de ≤4 h (previa con cuenta regresiva).
  if (!supported || !canFollowMatch(match)) return null;

  const onPress = async () => {
    haptics.selection();
    if (following) {
      await end();
    } else {
      await start();
    }
  };

  return (
    <TouchableOpacity
      style={[
        s.pill,
        { backgroundColor: c.card, borderColor: following ? c.accent : c.border },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Punto LIVE (rojo) / activo (accent) */}
      <View style={[s.dot, { backgroundColor: following ? c.accent : LIVE_RED }]} />
      {/* Nombre fijo de la feature — el ESTADO va en el chip (feedback dueño:
          cambiar la frase completa no dejaba claro qué hace el botón). */}
      <Text style={[s.label, { color: c.textPrimary }]} numberOfLines={1}>
        {t('liveActivity.title')}
      </Text>
      <View
        style={[
          s.chip,
          following
            ? { backgroundColor: c.accent + '22', borderColor: c.accent }
            : { backgroundColor: 'transparent', borderColor: c.border },
        ]}
      >
        <Text style={[s.chipText, { color: following ? c.accent : c.textTertiary }]}>
          {following ? t('liveActivity.on') : t('liveActivity.off')}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const s = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { flex: 1, fontSize: 13, fontWeight: '700' },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
});
