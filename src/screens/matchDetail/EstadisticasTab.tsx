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

const HOME_COLOR    = '#3b82f6';   // blue
const AWAY_COLOR    = '#f97316';   // orange

// Pill backgrounds — strong (winner) vs subtle (loser)
const HOME_BG_WIN   = 'rgba(59,130,246,0.22)';
const HOME_BG_IDLE  = 'rgba(59,130,246,0.07)';
const AWAY_BG_WIN   = 'rgba(249,115,22,0.22)';
const AWAY_BG_IDLE  = 'rgba(249,115,22,0.07)';

// Proportion bar fills
const HOME_FILL     = 'rgba(59,130,246,0.65)';
const AWAY_FILL     = 'rgba(249,115,22,0.65)';
const HOME_TRACK    = 'rgba(59,130,246,0.10)';
const AWAY_TRACK    = 'rgba(249,115,22,0.10)';

const BAR_H         = 4;
const INITIAL_SHOW  = 4;   // stats visible before "Mostrar más"

// ── Format helper ──────────────────────────────────────────────────────────────

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
}

function StatRow({ label, home, away, type, textSecondary, textPrimary }: StatRowProps) {
  const homeWins = home > away;
  const awayWins = away > home;
  const total    = home + away;
  const showBar  = total > 0;

  // Bar proportions (fill grows toward center from each side)
  const homeBar  = showBar ? home / total : 0.5;
  const awayBar  = showBar ? away / total : 0.5;

  const homeStr = formatVal(home, type);
  const awayStr = formatVal(away, type);

  return (
    <View style={styles.statRow}>
      {/* ── Values row ── */}
      <View style={styles.valuesRow}>

        {/* Home pill — always shown, stronger when winning */}
        <View style={styles.valSide}>
          <View style={[
            styles.pill,
            { backgroundColor: homeWins ? HOME_BG_WIN : HOME_BG_IDLE },
          ]}>
            <Text style={[
              styles.pillText,
              { color: homeWins ? HOME_COLOR : textPrimary },
              homeWins && styles.pillWin,
            ]}>
              {homeStr}
            </Text>
          </View>
        </View>

        {/* Stat label */}
        <Text style={[styles.statLabel, { color: textSecondary }]} numberOfLines={2}>
          {label}
        </Text>

        {/* Away pill — always shown, stronger when winning */}
        <View style={styles.valSide}>
          <View style={[
            styles.pill,
            styles.pillRight,
            { backgroundColor: awayWins ? AWAY_BG_WIN : AWAY_BG_IDLE },
          ]}>
            <Text style={[
              styles.pillText,
              { color: awayWins ? AWAY_COLOR : textPrimary },
              awayWins && styles.pillWin,
            ]}>
              {awayStr}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Proportion bar (tug-of-war) ── */}
      {showBar && (
        <View style={styles.barRow}>
          {/* Home side: fill grows from right → toward center */}
          <View style={[styles.barHalf, { backgroundColor: HOME_TRACK }]}>
            <View style={{ flex: 1 - homeBar }} />
            <View style={{ flex: homeBar, backgroundColor: HOME_FILL }} />
          </View>

          {/* Center gap */}
          <View style={styles.barGap} />

          {/* Away side: fill grows from left → toward center */}
          <View style={[styles.barHalf, { backgroundColor: AWAY_TRACK }]}>
            <View style={{ flex: awayBar, backgroundColor: AWAY_FILL }} />
            <View style={{ flex: 1 - awayBar }} />
          </View>
        </View>
      )}
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
  accent: string;
}

function StatSection({
  category, isFirst, textPrimary, textSecondary, textTertiary, border, accent,
}: SectionProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const hasMore      = category.stats.length > INITIAL_SHOW;
  const visibleStats = (hasMore && !expanded) ? category.stats.slice(0, INITIAL_SHOW) : category.stats;

  return (
    <View style={[styles.section, isFirst && styles.sectionFirst, { borderTopColor: border }]}>
      {/* Section header with accent mark */}
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionAccent, { backgroundColor: accent }]} />
        <Text style={[styles.sectionTitle, { color: textTertiary }]}>
          {category.category.toUpperCase()}
        </Text>
      </View>

      {/* Stat rows */}
      {visibleStats.map((stat, idx) => (
        <StatRow
          key={`${stat.label}-${idx}`}
          label={stat.label}
          home={stat.home}
          away={stat.away}
          type={stat.type}
          textSecondary={textSecondary}
          textPrimary={textPrimary}
        />
      ))}

      {/* Expand / collapse */}
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
      {/* Home */}
      <View style={styles.teamSide}>
        {homeLogo
          ? <Image source={{ uri: homeLogo }} style={styles.teamLogo} resizeMode="contain" />
          : (
            <View style={[styles.teamLogoFallback, { backgroundColor: HOME_BG_IDLE }]}>
              <Text style={[styles.teamLogoInitial, { color: HOME_COLOR }]}>
                {homeName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )
        }
        <Text style={[styles.teamName, { color: HOME_COLOR }]} numberOfLines={1}>
          {homeName}
        </Text>
        <View style={[styles.teamDot, { backgroundColor: HOME_COLOR }]} />
      </View>

      <Text style={[styles.vsText, { color: textSecondary }]}>VS</Text>

      {/* Away */}
      <View style={[styles.teamSide, styles.teamSideRight]}>
        <View style={[styles.teamDot, { backgroundColor: AWAY_COLOR }]} />
        <Text style={[styles.teamName, { color: AWAY_COLOR }]} numberOfLines={1}>
          {awayName}
        </Text>
        {awayLogo
          ? <Image source={{ uri: awayLogo }} style={styles.teamLogo} resizeMode="contain" />
          : (
            <View style={[styles.teamLogoFallback, { backgroundColor: AWAY_BG_IDLE }]}>
              <Text style={[styles.teamLogoInitial, { color: AWAY_COLOR }]}>
                {awayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )
        }
      </View>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

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
      {/* Team legend header */}
      <TeamHeader
        homeName={match.homeTeam.shortName || match.homeTeam.name}
        awayName={match.awayTeam.shortName || match.awayTeam.name}
        homeLogo={match.homeTeam.logo?.startsWith('http') ? match.homeTeam.logo : undefined}
        awayLogo={match.awayTeam.logo?.startsWith('http') ? match.awayTeam.logo : undefined}
        textSecondary={c.textSecondary}
        border={c.border}
        surface={c.surface}
      />

      {/* Sections */}
      {detail.statistics.map((cat, idx) => (
        <StatSection
          key={idx}
          category={cat}
          isFirst={idx === 0}
          textPrimary={c.textPrimary}
          textSecondary={c.textSecondary}
          textTertiary={c.textTertiary}
          border={c.border}
          accent={c.accent}
        />
      ))}

      <View style={styles.bottomSpacer} />
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

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
  teamSideRight: { justifyContent: 'flex-end' },
  teamLogo: { width: 26, height: 26 },
  teamLogoFallback: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamLogoInitial: { fontSize: 13, fontWeight: '800' },
  teamName: { fontSize: 13, fontWeight: '700', flex: 1 },
  teamDot: { width: 5, height: 5, borderRadius: 2.5 },
  vsText: { fontSize: 10, fontWeight: '700', paddingHorizontal: 10, opacity: 0.4 },

  // ── Section ──────────────────────────────────────────────────────────────────
  section: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sectionFirst: {
    paddingTop: 14,
    borderTopWidth: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  sectionAccent: {
    width: 3,
    height: 13,
    borderRadius: 1.5,
    opacity: 0.7,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.9,
  },

  // ── Stat row ──────────────────────────────────────────────────────────────────
  statRow: {
    marginBottom: 14,
  },
  valuesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 7,
  },
  valSide: {
    width: 76,
  },

  // Pill — always present; background changes strength based on winner
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    minWidth: 42,
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  pillRight: {
    alignSelf: 'flex-end',
  },
  pillText: {
    fontSize: 14,
    fontWeight: '600',
  },
  pillWin: {
    fontWeight: '800',
  },

  // Stat name
  statLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'center',
    paddingHorizontal: 4,
    lineHeight: 18,
  },

  // ── Proportion bar (tug-of-war) ───────────────────────────────────────────────
  barRow: {
    flexDirection: 'row',
    height: BAR_H,
    borderRadius: BAR_H / 2,
    overflow: 'hidden',
  },
  barHalf: {
    flex: 1,
    flexDirection: 'row',
    height: BAR_H,
  },
  barGap: {
    width: 2,
    height: BAR_H,
    backgroundColor: 'transparent',
  },

  // ── Show more ─────────────────────────────────────────────────────────────────
  showMoreBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
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
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 15, fontWeight: '500' },

  bottomSpacer: { height: 32 },
});
