// ── SectionHeader ──────────────────────────────────────────────────────────
// Canonical uppercase section label used everywhere in the app — Favoritos,
// Noticias, Perfil, NotificationSettings. Centralises the typography
// (fontSize/weight/letterSpacing) so the same visual concept always renders
// the same way.
//
// Variants are opt-in:
//   • `icon`     — leading emoji  (used by FavoritosScreen suggestion lists)
//   • `accent`   — 3×13 vertical accent bar + green tint + green badge
//                  (used by FavoritosScreen "Mis seguidos" hero section)
//   • `count`    — numeric badge after the label
//   • `line`     — full-width divider line filling remaining row space
//                  (used by Favoritos and Noticias section labels)
//   • `paddingHorizontal` / `marginTop` / `marginBottom` — escape hatches
//     when a screen needs different spacing without forking the component.
// ────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors } from '../theme/useTheme';
import { useDarkMode } from '../contexts/DarkModeContext';

export const SECTION_HEADER_ACCENT = '#00E096';

interface SectionHeaderProps {
  label: string;
  icon?: string;
  accent?: boolean;
  count?: number;
  line?: boolean;
  paddingHorizontal?: number;
  marginTop?: number;
  marginBottom?: number;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  label,
  icon,
  accent,
  count,
  line,
  paddingHorizontal = 20,
  marginTop = 16,
  marginBottom = 10,
}) => {
  const c = useThemeColors();
  const { isDark } = useDarkMode();

  const mutedLabel  = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.40)';
  const dividerCol  = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const badgeBg     = accent
    ? 'rgba(0,224,150,0.15)'
    : (isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)');
  const badgeColor  = accent ? SECTION_HEADER_ACCENT : mutedLabel;
  const labelColor  = accent ? SECTION_HEADER_ACCENT : (c.textTertiary ?? mutedLabel);

  return (
    <View style={[s.row, { paddingHorizontal, marginTop, marginBottom }]}>
      {accent && <View style={[s.accentBar, { backgroundColor: SECTION_HEADER_ACCENT }]} />}
      {icon && <Text style={s.icon}>{icon}</Text>}
      <Text style={[s.label, { color: labelColor }]}>{label}</Text>
      {count !== undefined && (
        <View style={[s.badge, { backgroundColor: badgeBg }]}>
          <Text style={[s.badgeNum, { color: badgeColor }]}>{count > 99 ? '99+' : count}</Text>
        </View>
      )}
      {line && <View style={[s.line, { backgroundColor: dividerCol }]} />}
    </View>
  );
};

const s = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: 7 },
  accentBar: { width: 3, height: 13, borderRadius: 2 },
  icon:      { fontSize: 12 },
  label:     { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  badge:     { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  badgeNum:  { fontSize: 10, fontWeight: '700' },
  line:      { flex: 1, height: 1 },
});
