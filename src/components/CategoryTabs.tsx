// ── CategoryTabs ───────────────────────────────────────────────────────────
// Single, canonical pill-tab row used across the app:
//   • Partidos      → Todos / En vivo / Finalizados / Por jugarse  (scroll)
//   • Favoritos     → Equipos / Ligas / Jugadores                  (fill)
//   • Noticias      → Para ti / Siguiendo / Últimas                (fill)
//
// Every variant lands on identical:
//   - Typography      13px / 600 weight
//   - Pill radius     `radius.md` (12)
//   - Vertical pad    8px  → 36px tall pill (with 13px text + emoji)
//   - Horizontal pad  14px
//   - Inner gap       6px between emoji · label · badge
//   - Inactive bg     `c.surface` (subtle elevated surface, never empty)
//   - Inactive text   `c.textSecondary`
//   - Active bg       brand green `#00E096` (Analistas identity)
//   - Active text     `#0D0D0D`   (dark for AA contrast on green)
//
// The two layout modes (`fill` vs `scroll`) only affect outer flex behavior —
// tabs themselves render the same way. Spacing around the row is wrapped
// once here so screens don't have to reinvent paddingHorizontal/Bottom.
//
// Optional features (any tab):
//   - `badge`     → numeric chip after the label, tinted to match state
//   - `liveBadge` → pulsing red dot + red count, used by "En vivo" tab
// ────────────────────────────────────────────────────────────────────────────

import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useThemeColors } from '../theme/useTheme';
import { haptics } from '../utils/haptics';
import { radius, ui } from '../theme/tokens';

/** Brand green — used as the active pill fill across all tab rows. */
export const CATEGORY_TAB_ACTIVE_BG   = '#00E096';
/** Dark text used on top of the green fill for AA contrast. */
export const CATEGORY_TAB_ACTIVE_TEXT = '#0D0D0D';

export interface CategoryTab<K extends string = string> {
  key: K;
  label: string;
  emoji?: string;
  /** Numeric badge after the label. Pass null/undefined to hide. */
  badge?: number | null;
  /** Renders the badge with a red live dot + red count (used by Partidos > "En vivo"). */
  liveBadge?: boolean;
}

interface CategoryTabsProps<K extends string = string> {
  tabs: CategoryTab<K>[];
  activeKey: K;
  onChange: (key: K) => void;
  /** `fill`   → tabs share width equally (flex: 1). Best for fixed 3-tab rows.
   *  `scroll` → horizontal scroll, intrinsic widths. Best for 4+ tabs or
   *             tabs with badges of variable width. */
  layout?: 'fill' | 'scroll';
}

export function CategoryTabs<K extends string = string>({
  tabs, activeKey, onChange, layout = 'fill',
}: CategoryTabsProps<K>) {
  const c = useThemeColors();

  const handlePress = useCallback(
    (key: K) => { haptics.selection(); onChange(key); },
    [onChange],
  );

  const renderTab = (tab: CategoryTab<K>) => {
    const active = activeKey === tab.key;
    return (
      <TouchableOpacity
        key={tab.key}
        activeOpacity={0.7}
        onPress={() => handlePress(tab.key)}
        style={[
          s.tab,
          layout === 'fill' && s.tabFill,
          {
            backgroundColor: active ? CATEGORY_TAB_ACTIVE_BG : c.surface,
            borderColor:     active ? CATEGORY_TAB_ACTIVE_BG : c.border,
          },
        ]}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
      >
        {tab.emoji && <Text style={s.emoji}>{tab.emoji}</Text>}
        <Text
          style={[
            s.label,
            { color: active ? CATEGORY_TAB_ACTIVE_TEXT : c.textSecondary },
          ]}
          numberOfLines={1}
        >
          {tab.label}
        </Text>
        {tab.badge != null && tab.badge > 0 && (
          <View
            style={[
              s.badge,
              tab.liveBadge
                ? { backgroundColor: c.liveDim }
                : { backgroundColor: active ? 'rgba(0,0,0,0.18)' : 'rgba(0,224,150,0.18)' },
            ]}
          >
            {tab.liveBadge && <View style={[s.liveDot, { backgroundColor: c.live }]} />}
            <Text
              style={[
                s.badgeText,
                {
                  color: tab.liveBadge
                    ? c.live
                    : active ? CATEGORY_TAB_ACTIVE_TEXT : CATEGORY_TAB_ACTIVE_BG,
                },
              ]}
            >
              {tab.badge}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (layout === 'scroll') {
    return (
      <View style={s.wrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.scrollContent}
        >
          {tabs.map(renderTab)}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[s.wrapper, s.fillRow]}>
      {tabs.map(renderTab)}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  wrapper: {
    paddingBottom: ui.tabBarPaddingBottom,
  },
  fillRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  tabFill: { flex: 1 },
  emoji: { fontSize: 13 },
  label: { fontSize: 13, fontWeight: '600' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    justifyContent: 'center',
  },
  liveDot: { width: 5, height: 5, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
});
