// ── SeasonSelector ───────────────────────────────────────────────────────────
//
// Pill button with a chevron that, on tap, opens a bottom-sheet modal
// listing every season the user can switch to. Used in LeagueDetailScreen
// (and later in TeamDetailScreen) to navigate historical editions of a
// competition without leaving the page.
//
// Design intent (matches FotMob):
//   • Compact pill so it never crowds the hero header.
//   • Disappears entirely when only one season exists — no reason to make
//     the user tap a dropdown with a single option.
//   • Bottom sheet uses the project's accent for the current selection and
//     a green dot for "EN CURSO" so users immediately spot the live season.

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../theme/useTheme';
import type { AvailableSeason } from '../services/firestoreApi';

interface SeasonSelectorProps {
  seasons: AvailableSeason[];
  selectedSeasonId: number | null;
  onSelect: (seasonId: number) => void;
  /** Optional override for the pill label (e.g. just the year "2026"). */
  pillLabel?: string;
  /** Visual mode — "dark" for inside the WC navy hero, "auto" for theme-aware leagues. */
  mode?: 'dark' | 'auto';
}

export const SeasonSelector: React.FC<SeasonSelectorProps> = ({
  seasons,
  selectedSeasonId,
  onSelect,
  pillLabel,
  mode = 'auto',
}) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  // Nothing to choose between → render nothing.
  if (!seasons || seasons.length <= 1) return null;

  const selected = seasons.find(s => s.id === selectedSeasonId) ?? seasons[0];
  const label = pillLabel ?? selected.name;

  // Colour tokens — dark mode used inside the WC hero; auto for league hero.
  const pillBg     = mode === 'dark' ? 'rgba(255,255,255,0.10)' : c.surface;
  const pillBorder = mode === 'dark' ? 'rgba(255,255,255,0.20)' : c.border;
  const pillText   = mode === 'dark' ? '#FFFFFF' : c.textPrimary;
  const chevronCol = mode === 'dark' ? 'rgba(255,255,255,0.85)' : c.textSecondary;

  const sheetBg     = c.card;
  const sheetBorder = c.border;
  const itemHover   = c.surface;

  return (
    <>
      {/* Pill button */}
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        style={[s.pill, { backgroundColor: pillBg, borderColor: pillBorder }]}
      >
        <Text style={[s.pillLabel, { color: pillText }]} numberOfLines={1}>
          {label}
        </Text>
        <Chevron color={chevronCol} />
      </TouchableOpacity>

      {/* Bottom-sheet modal */}
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[s.sheet, { backgroundColor: sheetBg, borderTopColor: sheetBorder }]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Grab handle */}
            <View style={[s.handle, { backgroundColor: c.textTertiary }]} />

            {/* Header */}
            <View style={s.sheetHeader}>
              <Text style={[s.sheetTitle, { color: c.textPrimary }]}>
                {t('season.pickerTitle')}
              </Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10}>
                <Text style={[s.closeX, { color: c.textTertiary }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ maxHeight: 480 }}
              showsVerticalScrollIndicator={false}
            >
              {seasons.map(season => {
                const isSelected = season.id === selected.id;
                return (
                  <TouchableOpacity
                    key={season.id}
                    onPress={() => { onSelect(season.id); setOpen(false); }}
                    style={[
                      s.row,
                      { borderBottomColor: sheetBorder },
                      isSelected && { backgroundColor: itemHover },
                    ]}
                    activeOpacity={0.7}
                  >
                    <View style={s.radio}>
                      <View style={[
                        s.radioOuter,
                        { borderColor: isSelected ? c.accent : c.textTertiary },
                      ]}>
                        {isSelected && (
                          <View style={[s.radioInner, { backgroundColor: c.accent }]} />
                        )}
                      </View>
                    </View>

                    <Text
                      style={[
                        s.rowLabel,
                        { color: isSelected ? c.accent : c.textPrimary },
                        isSelected && { fontWeight: '800' },
                      ]}
                    >
                      {season.name}
                    </Text>

                    {season.current && (
                      <View style={[s.currentBadge, { backgroundColor: '#10b981' }]}>
                        <View style={s.currentDot} />
                        <Text style={s.currentText}>{t('season.live')}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

// ── Chevron down (drawn with two thin lines to avoid an icon dep) ───────────
const Chevron: React.FC<{ color: string; size?: number }> = ({ color, size = 10 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{
      position: 'absolute', top: 1, left: 1,
      width: size - 2, height: 1.5, borderRadius: 1,
      backgroundColor: color, transform: [{ rotate: '45deg' }],
    }} />
    <View style={{
      position: 'absolute', top: 1, right: 1,
      width: size - 2, height: 1.5, borderRadius: 1,
      backgroundColor: color, transform: [{ rotate: '-45deg' }],
    }} />
  </View>
);

const s = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 18, borderWidth: 1, alignSelf: 'center',
  },
  pillLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },

  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: 28,
  },
  handle: {
    width: 38, height: 4, borderRadius: 2,
    alignSelf: 'center', marginTop: 8, opacity: 0.5,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  closeX:     { fontSize: 18, fontWeight: '700' },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  radio: { width: 22, alignItems: 'center' },
  radioOuter: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  radioInner: { width: 10, height: 10, borderRadius: 5 },

  rowLabel: { flex: 1, fontSize: 15, fontWeight: '600' },

  currentBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  currentDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF',
  },
  currentText: {
    fontSize: 10, fontWeight: '800', letterSpacing: 0.5,
    color: '#FFFFFF', textTransform: 'uppercase',
  },
});
