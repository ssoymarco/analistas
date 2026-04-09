import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useThemeColors } from '../theme/useTheme';

export type FilterTab = 'todos' | 'vivo' | 'finalizados' | 'proximos';

interface FilterTabsProps {
  activeTab: FilterTab;
  onTabChange: (tab: FilterTab) => void;
  liveCounts?: number;
  totalCount?: number;
  finishedCount?: number;
}

const TABS: { key: FilterTab; label: string; emoji: string }[] = [
  { key: 'todos',       label: 'Todos',       emoji: '⚽' },
  { key: 'vivo',        label: 'En vivo',     emoji: '🔴' },
  { key: 'finalizados', label: 'Finalizados', emoji: '🏁' },
  { key: 'proximos',    label: 'Próximos',    emoji: '🕐' },
];

export const FilterTabs: React.FC<FilterTabsProps> = ({
  activeTab,
  onTabChange,
  liveCounts = 0,
  totalCount = 0,
  finishedCount = 0,
}) => {
  const c = useThemeColors();

  const getCount = (key: FilterTab): number | null => {
    if (key === 'todos' && totalCount > 0) return totalCount;
    if (key === 'vivo' && liveCounts > 0) return liveCounts;
    if (key === 'finalizados' && finishedCount > 0) return finishedCount;
    return null;
  };

  return (
    <View style={[s.wrapper, { backgroundColor: c.bg, borderBottomColor: c.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.container}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const count = getCount(tab.key);
          const isLive = tab.key === 'vivo' && liveCounts > 0;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[s.tab, isActive && { backgroundColor: c.surface }]}
              onPress={() => onTabChange(tab.key)}
              activeOpacity={0.7}
            >
              <Text style={s.emoji}>{tab.emoji}</Text>
              <Text style={[s.label, { color: c.textTertiary }, isActive && { color: c.textPrimary }]}>{tab.label}</Text>
              {count != null && (
                <View style={[s.badge, { backgroundColor: c.surface }, isLive && { backgroundColor: c.liveDim }]}>
                  {isLive && <View style={[s.liveDot, { backgroundColor: c.live }]} />}
                  <Text style={[s.badgeText, { color: c.textSecondary }, isLive && { color: c.live }]}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  wrapper: {
    borderBottomWidth: 1,
  },
  container: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  emoji: { fontSize: 12 },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
