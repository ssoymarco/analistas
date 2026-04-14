import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../theme/useTheme';
import type { Match, MatchDetail, MatchStatCategory } from '../../data/types';

// ── Design tokens ─────────────────────────────────────────────────────────────

const HOME_COLOR  = '#3b82f6';  // blue
const AWAY_COLOR  = '#f97316';  // orange
const HOME_BG     = 'rgba(59,130,246,0.18)';
const AWAY_BG     = 'rgba(249,115,22,0.18)';

/** How many stats to show before "Mostrar más" */
const INITIAL_SHOW = 4;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatVal(value: number, type?: 'percentage' | 'decimal' | 'number'): string {
  if (type === 'percentage') return `${Math.round(value)}%`;
  if (type === 'decimal')    return value.toFixed(2);
  return String(Math.round(value));
}

// ── StatRow ───────────────────────────────────────────────────────────────────

interface StatRowProps {
  label: string;
  home: number;
  away: number;
  type?: 'percentage' | 'decimal' | 'number';
  textSecondary: string;
  textPrimary: string;
  isLast: boolean;
  border: string;
}

function StatRow({ label, home, away, type, textSecondary, textPrimary, isLast, border }: StatRowProps) {
  const homeWins = home > away;
  const awayWins = away > home;

  const homeStr = formatVal(home, type);
  const awayStr = formatVal(away, type);

  return (
    <View style={[styles.statRow, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border }]}>
      {/* Home value */}
      <View style={styles.valSide}>
        <View style={[
          styles.pill,
          homeWins && { backgroundColor: HOME_BG },
        ]}>
          <Text style={[
            styles.pillText,
            { color: homeWins ? HOME_COLOR : textPrimary },
            homeWins && styles.pillTextWin,
          ]}>
            {homeStr}
          </Text>
        </View>
      </View>

      {/* Stat label */}
      <Text style={[styles.statLabel, { color: textSecondary }]} numberOfLines={1}>
        {label}
      </Text>

      {/* Away value */}
      <View style={styles.valSide}>
        <View style={[
          styles.pill,
          styles.pillRight,
          awayWins && { backgroundColor: AWAY_BG },
        ]}>
          <Text style={[
            styles.pillText,
            { color: awayWins ? AWAY_COLOR : textPrimary },
            awayWins && styles.pillTextWin,
          ]}>
            {awayStr}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── StatSection ───────────────────────────────────────────────────────────────

interface SectionProps {
  category: MatchStatCategory;
  isFirst: boolean;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
}

function StatSection({ category, isFirst, textPrimary, textSecondary, textTertiary, border }: SectionProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const hasMore = category.stats.length > INITIAL_SHOW;
  const visibleStats = (hasMore && !expanded)
    ? category.stats.slice(0, INITIAL_SHOW)
    : category.stats;

  return (
    <View style={[styles.section, isFirst && styles.sectionFirst]}>
      {/* Section header */}
      <Text style={[styles.sectionTitle, { color: textTertiary }]}>
        {category.category.toUpperCase()}
      </Text>

      {/* Rows */}
      {visibleStats.map((stat, idx) => (
        <StatRow
          key={`${stat.label}-${idx}`}
          label={stat.label}
          home={stat.home}
          away={stat.away}
          type={stat.type}
          textSecondary={textSecondary}
          textPrimary={textPrimary}
          isLast={idx === visibleStats.length - 1 && !hasMore}
          border={border}
        />
      ))}

      {/* Show more / less button */}
      {hasMore && (
        <TouchableOpacity
          onPress={() => setExpanded(v => !v)}
          activeOpacity={0.6}
          style={[styles.showMoreBtn, { borderTopColor: border }]}
        >
          <Text style={[styles.showMoreText, { color: textTertiary }]}>
            {expanded ? t('stats.showLess') : t('stats.showMore')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Team header ───────────────────────────────────────────────────────────────

interface TeamHeaderProps {
  homeName: string;
  awayName: string;
  homeLogo?: string;
  awayLogo?: string;
  textSecondary: string;
  border: string;
  surface: string;
}

function TeamHeader({ homeName, awayName, homeLogo, awayLogo, textSecondary, border, surface }: TeamHeaderProps) {
  return (
    <View style={[styles.teamHeader, { borderBottomColor: border, backgroundColor: surface }]}>
      {/* Home team */}
      <View style={styles.teamSide}>
        {homeLogo ? (
          <Image source={{ uri: homeLogo }} style={styles.teamLogo} resizeMode="contain" />
        ) : (
          <View style={[styles.teamLogoPlaceholder, { backgroundColor: HOME_BG }]}>
            <Text style={[styles.teamLogoEmoji, { color: HOME_COLOR }]}>
              {homeName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={[styles.teamName, { color: HOME_COLOR }]} numberOfLines={1}>{homeName}</Text>
        <View style={[styles.teamDot, { backgroundColor: HOME_COLOR }]} />
      </View>

      {/* VS */}
      <Text style={[styles.vs, { color: textSecondary }]}>VS</Text>

      {/* Away team */}
      <View style={[styles.teamSide, styles.teamSideRight]}>
        <View style={[styles.teamDot, { backgroundColor: AWAY_COLOR }]} />
        <Text style={[styles.teamName, { color: AWAY_COLOR }]} numberOfLines={1}>{awayName}</Text>
        {awayLogo ? (
          <Image source={{ uri: awayLogo }} style={styles.teamLogo} resizeMode="contain" />
        ) : (
          <View style={[styles.teamLogoPlaceholder, { backgroundColor: AWAY_BG }]}>
            <Text style={[styles.teamLogoEmoji, { color: AWAY_COLOR }]}>
              {awayName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export const EstadisticasTab: React.FC<{ match: Match; detail: MatchDetail }> = ({
  match,
  detail,
}) => {
  const c = useThemeColors();
  const { t } = useTranslation();

  if (!detail.statistics || detail.statistics.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyEmoji}>📊</Text>
        <Text style={[styles.emptyText, { color: c.textSecondary }]}>
          {t('stats.noStats')}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      {/* Team color legend */}
      <TeamHeader
        homeName={match.homeTeam.shortName || match.homeTeam.name}
        awayName={match.awayTeam.shortName || match.awayTeam.name}
        homeLogo={match.homeTeam.logo?.startsWith('http') ? match.homeTeam.logo : undefined}
        awayLogo={match.awayTeam.logo?.startsWith('http') ? match.awayTeam.logo : undefined}
        textSecondary={c.textSecondary}
        border={c.border}
        surface={c.surface}
      />

      {/* Stat sections */}
      {detail.statistics.map((cat, idx) => (
        <StatSection
          key={idx}
          category={cat}
          isFirst={idx === 0}
          textPrimary={c.textPrimary}
          textSecondary={c.textSecondary}
          textTertiary={c.textTertiary}
          border={c.border}
        />
      ))}

      <View style={styles.bottomSpacer} />
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  // ── Team header ──────────────────────────────────────────────────────────────
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  teamSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  teamSideRight: {
    justifyContent: 'flex-end',
  },
  teamLogo: {
    width: 28,
    height: 28,
  },
  teamLogoPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamLogoEmoji: {
    fontSize: 14,
    fontWeight: '800',
  },
  teamName: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  teamDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  vs: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 12,
    opacity: 0.5,
  },

  // ── Section ──────────────────────────────────────────────────────────────────
  section: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 4,
  },
  sectionFirst: {
    paddingTop: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 10,
  },

  // ── Stat row ──────────────────────────────────────────────────────────────────
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  valSide: {
    width: 80,
  },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    minWidth: 44,
    alignItems: 'center',
  },
  pillRight: {
    alignSelf: 'flex-end',
  },
  pillText: {
    fontSize: 14,
    fontWeight: '600',
  },
  pillTextWin: {
    fontWeight: '800',
  },
  statLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'center',
    paddingHorizontal: 4,
  },

  // ── Show more button ──────────────────────────────────────────────────────────
  showMoreBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  showMoreText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // ── Empty state ───────────────────────────────────────────────────────────────
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

  bottomSpacer: {
    height: 32,
  },
});
