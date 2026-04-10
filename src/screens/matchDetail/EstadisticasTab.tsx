import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useThemeColors } from '../../theme/useTheme';
import type { Match, MatchDetail, MatchStatCategory } from '../../data/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const HOME_COLOR = '#3b82f6';
const AWAY_COLOR = '#f97316';
const HOME_FILL = 'rgba(59,130,246,0.85)';
const AWAY_FILL = 'rgba(249,115,22,0.85)';
const HOME_TRACK = 'rgba(59,130,246,0.15)';
const AWAY_TRACK = 'rgba(249,115,22,0.15)';
const BAR_HEIGHT = 6;
const BAR_RADIUS = 3;

// ── Sub-components ────────────────────────────────────────────────────────────

interface StatRowProps {
  label: string;
  home: number;
  away: number;
  type?: 'percentage' | 'number';
  textSecondary: string;
}

function StatRow({ label, home, away, type, textSecondary }: StatRowProps) {
  const suffix = type === 'percentage' ? '%' : '';
  const max = Math.max(home, away, 1);
  const homePct = home / max;
  const awayPct = away / max;

  return (
    <View style={styles.statRow}>
      {/* Value row */}
      <View style={styles.valueRow}>
        <Text style={[styles.homeValue, { color: HOME_COLOR }]}>
          {home}{suffix}
        </Text>
        <Text style={[styles.statLabel, { color: textSecondary }]}>
          {label}
        </Text>
        <Text style={[styles.awayValue, { color: AWAY_COLOR }]}>
          {away}{suffix}
        </Text>
      </View>

      {/* Bar row */}
      <View style={styles.barRow}>
        {/* Home side: track fills full left half, fill is right-aligned */}
        <View style={[styles.barHalf, { backgroundColor: HOME_TRACK }]}>
          <View style={styles.homeFillWrapper}>
            <View
              style={[
                styles.homeFill,
                { width: `${homePct * 100}%` },
              ]}
            />
          </View>
        </View>

        {/* Divider */}
        <View style={styles.barDivider} />

        {/* Away side: track fills full right half, fill is left-aligned */}
        <View style={[styles.barHalf, { backgroundColor: AWAY_TRACK }]}>
          <View
            style={[
              styles.awayFill,
              { width: `${awayPct * 100}%` },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

interface SectionProps {
  category: MatchStatCategory;
  defaultExpanded: boolean;
  textTertiary: string;
  textSecondary: string;
  surface: string;
  border: string;
  card: string;
}

function StatSection({
  category,
  defaultExpanded,
  textTertiary,
  textSecondary,
  surface,
  border,
  card,
}: SectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <View style={[styles.card, { borderColor: border, backgroundColor: card }]}>
      {/* Section header */}
      <TouchableOpacity
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
        style={[styles.sectionHeader, { backgroundColor: surface }]}
      >
        <Text style={[styles.categoryLabel, { color: textTertiary }]}>
          {category.category}
        </Text>
        <Text style={[styles.chevron, { color: textTertiary }]}>
          {expanded ? '▲' : '▼'}
        </Text>
      </TouchableOpacity>

      {/* Stats */}
      {expanded && (
        <View style={styles.statsContainer}>
          {category.stats.map((stat, idx) => (
            <StatRow
              key={idx}
              label={stat.label}
              home={stat.home}
              away={stat.away}
              type={stat.type}
              textSecondary={textSecondary}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export const EstadisticasTab: React.FC<{ match: Match; detail: MatchDetail }> = ({
  match,
  detail,
}) => {
  const c = useThemeColors();

  if (!detail.statistics || detail.statistics.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyEmoji}>📊</Text>
        <Text style={[styles.emptyText, { color: c.textSecondary }]}>
          Sin estadísticas disponibles
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {detail.statistics.map((cat, idx) => (
        <StatSection
          key={idx}
          category={cat}
          defaultExpanded
          textTertiary={c.textTertiary}
          textSecondary={c.textSecondary}
          surface={c.surface}
          border={c.border}
          card={c.card}
        />
      ))}
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },

  // Card
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 8,
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  chevron: {
    fontSize: 11,
  },

  // Stats container
  statsContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },

  // Stat row
  statRow: {
    marginBottom: 12,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  homeValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'left',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  awayValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },

  // Bar row
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: BAR_HEIGHT,
    borderRadius: BAR_RADIUS,
    overflow: 'hidden',
  },
  barHalf: {
    flex: 1,
    height: BAR_HEIGHT,
    overflow: 'hidden',
  },
  barDivider: {
    width: 2,
    height: BAR_HEIGHT,
  },

  // Home fill: grows from right edge of the left half
  homeFillWrapper: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  homeFill: {
    height: BAR_HEIGHT,
    backgroundColor: HOME_FILL,
    borderRadius: BAR_RADIUS,
  },

  // Away fill: grows from left edge of the right half
  awayFill: {
    height: BAR_HEIGHT,
    backgroundColor: AWAY_FILL,
    borderRadius: BAR_RADIUS,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
