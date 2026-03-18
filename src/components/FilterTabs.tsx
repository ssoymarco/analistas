import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { colors } from '../theme/colors';

export type FilterTab = 'todos' | 'vivo' | 'finalizados' | 'proximos';

interface FilterTabsProps {
  activeTab: FilterTab;
  onTabChange: (tab: FilterTab) => void;
  liveCounts?: number;
}

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'vivo', label: 'En vivo' },
  { key: 'finalizados', label: 'Finalizados' },
  { key: 'proximos', label: 'Próximos' },
];

export const FilterTabs: React.FC<FilterTabsProps> = ({
  activeTab,
  onTabChange,
  liveCounts,
}) => {
  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.container}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const showBadge = tab.key === 'vivo' && liveCounts && liveCounts > 0;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => onTabChange(tab.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab.label}
              </Text>
              {showBadge && (
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveBadgeText}>{liveCounts}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: 'transparent',
    marginRight: 6,
  },
  tabActive: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderLight,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.liveDim,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 3,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.live,
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.live,
  },
});
