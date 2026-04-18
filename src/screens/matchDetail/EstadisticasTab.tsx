import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../theme/useTheme';
import type { Match, MatchDetail, MatchStatCategory } from '../../data/types';

// ── Design tokens ─────────────────────────────────────────────────────────────

const HOME_COLOR   = '#3b82f6';
const AWAY_COLOR   = '#f97316';
const HOME_BG_WIN  = 'rgba(59,130,246,0.22)';
const HOME_BG_IDLE = 'rgba(59,130,246,0.08)';
const AWAY_BG_WIN  = 'rgba(249,115,22,0.22)';
const AWAY_BG_IDLE = 'rgba(249,115,22,0.08)';
const HOME_FILL    = 'rgba(59,130,246,0.65)';
const AWAY_FILL    = 'rgba(249,115,22,0.65)';
const HOME_TRACK   = 'rgba(59,130,246,0.10)';
const AWAY_TRACK   = 'rgba(249,115,22,0.10)';

const BAR_H        = 4;
const INITIAL_SHOW = 4;

// ── Format helper ─────────────────────────────────────────────────────────────

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
  const total    = home + away;
  const showBar  = total > 0;
  const homeBar  = showBar ? home / total : 0.5;
  const awayBar  = showBar ? away / total : 0.5;

  return (
    <View style={[
      styles.statRow,
      !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border },
    ]}>
      <View style={styles.valuesRow}>
        {/* Home pill */}
        <View style={styles.valSide}>
          <View style={[styles.pill, { backgroundColor: homeWins ? HOME_BG_WIN : HOME_BG_IDLE }]}>
            <Text style={[styles.pillText, { color: homeWins ? HOME_COLOR : textPrimary }, homeWins && styles.pillWin]}>
              {formatVal(home, type)}
            </Text>
          </View>
        </View>

        {/* Label */}
        <Text style={[styles.statLabel, { color: textSecondary }]} numberOfLines={2}>
          {label}
        </Text>

        {/* Away pill */}
        <View style={styles.valSide}>
          <View style={[styles.pill, styles.pillRight, { backgroundColor: awayWins ? AWAY_BG_WIN : AWAY_BG_IDLE }]}>
            <Text style={[styles.pillText, { color: awayWins ? AWAY_COLOR : textPrimary }, awayWins && styles.pillWin]}>
              {formatVal(away, type)}
            </Text>
          </View>
        </View>
      </View>

      {/* Proportion bar */}
      {showBar && (
        <View style={styles.barRow}>
          <View style={[styles.barHalf, { backgroundColor: HOME_TRACK }]}>
            <View style={{ flex: 1 - homeBar }} />
            <View style={{ flex: homeBar, backgroundColor: HOME_FILL }} />
          </View>
          <View style={styles.barGap} />
          <View style={[styles.barHalf, { backgroundColor: AWAY_TRACK }]}>
            <View style={{ flex: awayBar, backgroundColor: AWAY_FILL }} />
            <View style={{ flex: 1 - awayBar }} />
          </View>
        </View>
      )}
    </View>
  );
}

// ── StatSection card ──────────────────────────────────────────────────────────

interface SectionProps {
  category: MatchStatCategory;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  card: string;
  accent: string;
}

function StatSection({ category, textPrimary, textSecondary, textTertiary, border, card, accent }: SectionProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const hasMore      = category.stats.length > INITIAL_SHOW;
  const visibleStats = (hasMore && !expanded) ? category.stats.slice(0, INITIAL_SHOW) : category.stats;

  return (
    <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>

      {/* Header — same card bg, separated by a hairline border */}
      <View style={[styles.cardHeader, { borderBottomColor: border }]}>
        <View style={[styles.sectionAccent, { backgroundColor: accent }]} />
        <Text style={[styles.sectionTitle, { color: textTertiary }]}>
          {category.category.toUpperCase()}
        </Text>
      </View>

      {/* Rows */}
      <View style={styles.cardBody}>
        {visibleStats.map((stat, idx) => (
          <StatRow
            key={`${stat.label}-${idx}`}
            label={stat.label}
            home={stat.home}
            away={stat.away}
            type={stat.type}
            textSecondary={textSecondary}
            textPrimary={textPrimary}
            isLast={idx === visibleStats.length - 1}
            border={border}
          />
        ))}
      </View>

      {hasMore && (
        <TouchableOpacity onPress={() => setExpanded(v => !v)} activeOpacity={0.6}
          style={[styles.showMoreBtn, { borderTopColor: border }]}>
          <Text style={[styles.showMoreText, { color: textTertiary }]}>
            {expanded ? t('stats.showLess') : t('stats.showMore')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Team header card ──────────────────────────────────────────────────────────

function TeamHeader({
  homeName, awayName, homeLogo, awayLogo, textSecondary, border, card,
}: {
  homeName: string; awayName: string;
  homeLogo?: string; awayLogo?: string;
  textSecondary: string; border: string; card: string;
}) {
  return (
    <View style={[styles.teamCard, { backgroundColor: card, borderColor: border }]}>
      <View style={styles.teamSide}>
        {homeLogo
          ? <Image source={{ uri: homeLogo }} style={styles.teamLogo} resizeMode="contain" />
          : <View style={[styles.teamLogoFallback, { backgroundColor: HOME_BG_IDLE }]}>
              <Text style={[styles.teamLogoInitial, { color: HOME_COLOR }]}>{homeName.charAt(0).toUpperCase()}</Text>
            </View>
        }
        <Text style={[styles.teamName, { color: HOME_COLOR }]} numberOfLines={1}>{homeName}</Text>
        <View style={[styles.teamDot, { backgroundColor: HOME_COLOR }]} />
      </View>
      <Text style={[styles.vsText, { color: textSecondary }]}>VS</Text>
      <View style={[styles.teamSide, styles.teamSideRight]}>
        <View style={[styles.teamDot, { backgroundColor: AWAY_COLOR }]} />
        <Text style={[styles.teamName, { color: AWAY_COLOR }]} numberOfLines={1}>{awayName}</Text>
        {awayLogo
          ? <Image source={{ uri: awayLogo }} style={styles.teamLogo} resizeMode="contain" />
          : <View style={[styles.teamLogoFallback, { backgroundColor: AWAY_BG_IDLE }]}>
              <Text style={[styles.teamLogoInitial, { color: AWAY_COLOR }]}>{awayName.charAt(0).toUpperCase()}</Text>
            </View>
        }
      </View>
    </View>
  );
}

// ── Skeleton stats preview ────────────────────────────────────────────────────

const SKELETON_ROWS = [0.72, 0.45, 0.61, 0.38, 0.55, 0.80];
const SKELETON_SECTIONS = [
  { width: 96 },
  { width: 72 },
];

function SkeletonSection({ border, card, shimmer }: { border: string; card: string; shimmer: Animated.Value }) {
  return (
    <View style={[styles.card, { backgroundColor: card, borderColor: border, marginBottom: 0 }]}>
      <View style={[styles.cardHeader, { borderBottomColor: border }]}>
        <View style={[styles.sectionAccent, { backgroundColor: border }]} />
        <Animated.View style={{ width: 80, height: 9, borderRadius: 4, backgroundColor: border, opacity: shimmer }} />
      </View>
      <View style={[styles.cardBody, { paddingTop: 4 }]}>
        {SKELETON_ROWS.slice(0, 3).map((ratio, i) => (
          <View key={i} style={[styles.statRow, i < 2 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border }]}>
            <View style={styles.valuesRow}>
              {/* left pill */}
              <Animated.View style={{ width: 40, height: 28, borderRadius: 14, backgroundColor: HOME_BG_IDLE, opacity: shimmer }} />
              {/* center label */}
              <Animated.View style={{ flex: 1, height: 9, borderRadius: 4, backgroundColor: border, marginHorizontal: 12, opacity: shimmer }} />
              {/* right pill */}
              <Animated.View style={{ width: 40, height: 28, borderRadius: 14, backgroundColor: AWAY_BG_IDLE, opacity: shimmer }} />
            </View>
            <View style={styles.barRow}>
              <View style={[styles.barHalf, { backgroundColor: HOME_TRACK }]}>
                <View style={{ flex: 1 - ratio }} />
                <Animated.View style={{ flex: ratio, backgroundColor: HOME_FILL, opacity: shimmer }} />
              </View>
              <View style={styles.barGap} />
              <View style={[styles.barHalf, { backgroundColor: AWAY_TRACK }]}>
                <Animated.View style={{ flex: 1 - ratio, backgroundColor: AWAY_FILL, opacity: shimmer }} />
                <View style={{ flex: ratio }} />
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Stats empty state ─────────────────────────────────────────────────────────

function StatsEmptyState({ match }: { match: Match }) {
  const c  = useThemeColors();
  const { t } = useTranslation();
  const shimmer = useRef(new Animated.Value(0.35)).current;

  // Shimmer pulse — only for scheduled/live
  useEffect(() => {
    if (match.status === 'finished') return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 0.85, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [match.status, shimmer]);

  const isScheduled = match.status === 'scheduled';
  const isLive      = match.status === 'live';
  const isFinished  = match.status === 'finished';

  const emoji   = isScheduled ? '📊' : isLive ? '⚡' : '📉';
  const title   = isScheduled
    ? t('stats.emptyScheduled')
    : isLive
    ? t('stats.emptyLive')
    : t('stats.emptyFinished');
  const sub     = isScheduled
    ? t('stats.emptyScheduledSub')
    : isLive
    ? t('stats.emptyLiveSub')
    : t('stats.emptyFinishedSub');

  return (
    <View style={styles.emptyWrap}>

      {/* Message card — always first so the user sees it immediately */}
      <View style={[
        styles.emptyCard,
        {
          backgroundColor: isScheduled
            ? 'rgba(59,130,246,0.06)'
            : isLive
            ? 'rgba(255,69,58,0.06)'
            : 'rgba(142,142,147,0.08)',
          borderColor: isScheduled
            ? 'rgba(59,130,246,0.18)'
            : isLive
            ? 'rgba(255,69,58,0.18)'
            : c.border,
        },
      ]}>
        <Text style={styles.emptyCardEmoji}>{emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.emptyCardTitle, { color: c.textPrimary }]}>{title}</Text>
          <Text style={[styles.emptyCardSub, { color: c.textSecondary }]}>{sub}</Text>
        </View>
      </View>

      {/* Category chips — only for scheduled to preview what's coming */}
      {isScheduled && (
        <View style={styles.chipsRow}>
          {(['⚽ Posesión', '🎯 Tiros', '🛡️ Defensa', '🟨 Disciplina'] as const).map((chip, i) => (
            <View key={i} style={[styles.chip, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.chipText, { color: c.textTertiary }]}>{chip}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Skeleton preview below the message — only for scheduled/live */}
      {!isFinished && (
        <View style={[styles.skeletonWrap, { gap: 8 }]}>
          <SkeletonSection border={c.border} card={c.card} shimmer={shimmer} />
          <SkeletonSection border={c.border} card={c.card} shimmer={shimmer} />
        </View>
      )}

    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export const EstadisticasTab: React.FC<{ match: Match; detail: MatchDetail }> = ({ match, detail }) => {
  const c = useThemeColors();
  const { t } = useTranslation();

  if (!detail.statistics || detail.statistics.length === 0) {
    return <StatsEmptyState match={match} />;
  }

  return (
    // Mirror EnVivoTab root: paddingHorizontal + gap, NO explicit backgroundColor
    <View style={styles.root}>
      <TeamHeader
        homeName={match.homeTeam.shortName || match.homeTeam.name}
        awayName={match.awayTeam.shortName || match.awayTeam.name}
        homeLogo={match.homeTeam.logo?.startsWith('http') ? match.homeTeam.logo : undefined}
        awayLogo={match.awayTeam.logo?.startsWith('http') ? match.awayTeam.logo : undefined}
        textSecondary={c.textSecondary}
        border={c.border}
        card={c.card}
      />
      {detail.statistics.map((cat, idx) => (
        <StatSection
          key={idx}
          category={cat}
          textPrimary={c.textPrimary}
          textSecondary={c.textSecondary}
          textTertiary={c.textTertiary}
          border={c.border}
          card={c.card}
          accent={c.accent}
        />
      ))}
      <View style={{ height: 32 }} />
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Root — exactly like EnVivoTab: paddingHorizontal + gap, no bg override
  root: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },

  // ── Team header card ─────────────────────────────────────────────────────────
  teamCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    overflow: 'hidden',
  },
  teamSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  teamSideRight: { justifyContent: 'flex-end' },
  teamLogo: { width: 26, height: 26 },
  teamLogoFallback: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  teamLogoInitial: { fontSize: 13, fontWeight: '800' },
  teamName: { fontSize: 13, fontWeight: '700', flex: 1 },
  teamDot: { width: 5, height: 5, borderRadius: 2.5 },
  vsText: { fontSize: 10, fontWeight: '700', paddingHorizontal: 10, opacity: 0.4 },

  // ── Section card — identical frame to EnVivoTab cards ────────────────────────
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },

  // Card header: same bg as card, separated from body by hairline
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionAccent: { width: 3, height: 13, borderRadius: 1.5, opacity: 0.8 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9 },

  cardBody: {
    paddingHorizontal: 16,
    paddingBottom: 2,
  },

  // ── Stat row ─────────────────────────────────────────────────────────────────
  statRow: { paddingVertical: 11 },
  valuesRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  valSide: { width: 76 },

  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    minWidth: 42,
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  pillRight: { alignSelf: 'flex-end' },
  pillText: { fontSize: 14, fontWeight: '600' },
  pillWin: { fontWeight: '800' },

  statLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'center',
    paddingHorizontal: 4,
    lineHeight: 18,
  },

  // ── Proportion bar ────────────────────────────────────────────────────────────
  barRow: { flexDirection: 'row', height: BAR_H, borderRadius: BAR_H / 2, overflow: 'hidden' },
  barHalf: { flex: 1, flexDirection: 'row', height: BAR_H },
  barGap: { width: 2, height: BAR_H },

  // ── Show more ─────────────────────────────────────────────────────────────────
  showMoreBtn: { alignItems: 'center', paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  showMoreText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },

  // ── Empty state ───────────────────────────────────────────────────────────────
  emptyWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
    paddingBottom: 32,
  },
  skeletonWrap: { opacity: 0.6 },

  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  emptyCardEmoji: { fontSize: 28 },
  emptyCardTitle: { fontSize: 14, fontWeight: '700', lineHeight: 20, marginBottom: 4 },
  emptyCardSub:   { fontSize: 12, fontWeight: '400', lineHeight: 17, opacity: 0.7 },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: '500' },
});
