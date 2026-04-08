import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

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
  const getCount = (key: FilterTab): number | null => {
    if (key === 'todos' && totalCount > 0) return totalCount;
    if (key === 'vivo' && liveCounts > 0) return liveCounts;
    if (key === 'finalizados' && finishedCount > 0) return finishedCount;
    return null;
  };

  return (
    <View style={s.wrapper}>
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
              style={[s.tab, isActive && s.tabActive]}
              onPress={() => onTabChange(tab.key)}
              activeOpacity={0.7}
            >
              <Text style={s.emoji}>{tab.emoji}</Text>
              <Text style={[s.label, isActive && s.labelActive]}>{tab.label}</Text>
              {count != null && (
                <View style={[s.badge, isLive && s.badgeLive]}>
                  {isLive && <View style={s.liveDot} />}
                  <Text style={[s.badgeText, isLive && s.badgeTextLive]}>{count}</Text>
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
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
  tabActive: {
    backgroundColor: colors.surface,
  },
  emoji: { fontSize: 12 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  labelActive: {
    color: colors.textPrimary,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeLive: {
    backgroundColor: colors.liveDim,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.live,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  badgeTextLive: {
    color: colors.live,
  },
});
