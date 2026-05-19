// ── ScreenHeader ────────────────────────────────────────────────────────────
// Top bar used by the 4 main tab screens (Partidos, Favoritos, Noticias,
// Perfil). Centralised so dimensions, typography, padding and divider
// position stay identical across screens — the divider line lands at the
// exact same Y on every tab.
//
// Each screen passes:
//   • `icon`     — the emoji shown inside the chip (⚽, ⭐, 📰, 👤, …)
//   • `iconBg`   — chip tint, conveys screen identity (green, gold, blue, …)
//   • `title`    — the title text (font size + weight are fixed)
//   • `right`    — optional render-prop slot for screen-specific actions
//                  (round buttons, stat pills, etc.). Wrapped in a row with
//                  consistent spacing.
//   • `titleSuffix` — optional ReactNode rendered to the right of the title
//                     (used by Perfil for the sticky username chip).
// ────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors } from '../theme/useTheme';

/** Minimum height of the header inner row. Matches the 38px round buttons
 *  used in Partidos so every screen lands at the same total header height,
 *  regardless of whether the right side has buttons, a pill or nothing. */
export const SCREEN_HEADER_ROW_HEIGHT = 38;

interface ScreenHeaderProps {
  icon: string;
  iconBg: string;
  title: string;
  right?: React.ReactNode;
  titleSuffix?: React.ReactNode;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  icon, iconBg, title, right, titleSuffix,
}) => {
  const c = useThemeColors();
  return (
    <View style={[s.wrapper, { backgroundColor: c.bg, borderBottomColor: c.border }]}>
      <View style={s.row}>
        <View style={s.left}>
          <View style={[s.iconChip, { backgroundColor: iconBg }]}>
            <Text style={s.iconChar}>{icon}</Text>
          </View>
          <Text style={[s.title, { color: c.textPrimary }]}>{title}</Text>
          {titleSuffix}
        </View>
        {right && <View style={s.right}>{right}</View>}
      </View>
    </View>
  );
};

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: SCREEN_HEADER_ROW_HEIGHT,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconChip: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChar: { fontSize: 14 },
  title: { fontSize: 18, fontWeight: '800' },
});
