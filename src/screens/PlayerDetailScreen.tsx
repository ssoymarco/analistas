// ── Player Detail Screen ──────────────────────────────────────────────────────
// Full player profile: collapsible header, 3 tabs (Resumen, Estadísticas, Historial).
// Dark/Light mode responsive. Uses SportMonks data with mock fallback.
import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Dimensions,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../theme/useTheme';
import { SkeletonPlayerDetail } from '../components/Skeleton';
import { useDarkMode } from '../contexts/DarkModeContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { usePlayerDetail } from '../hooks/usePlayerDetail';
import type { PlayerDetailData, PlayerSeasonStats } from '../hooks/usePlayerDetail';
import type { PartidosStackParamList } from '../navigation/AppNavigator';
import { BackArrow, ShareIcon } from '../components/NavIcons';

type Props = NativeStackScreenProps<PartidosStackParamList, 'PlayerDetail'>;
type Tab = 'resumen' | 'estadisticas' | 'historial';


// ── Icon: Chevron right ─────────────────────────────────────────────────────
function ChevronRight({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', top: 1, right: 2, width: 6, height: 1.5, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '45deg' }] }} />
      <View style={{ position: 'absolute', bottom: 1, right: 2, width: 6, height: 1.5, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '-45deg' }] }} />
    </View>
  );
}

// ── Position color ──────────────────────────────────────────────────────────
function positionColor(posId: number): string {
  switch (posId) {
    case 24: return '#f59e0b'; // POR — gold
    case 25: return '#3b82f6'; // DEF — blue
    case 26: return '#10b981'; // MED — green
    case 27: return '#ef4444'; // DEL — red
    default: return '#6b7280';
  }
}

// ── Rating color ────────────────────────────────────────────────────────────
function ratingColor(r: number): string {
  if (r >= 8.0) return '#10b981';
  if (r >= 7.0) return '#3b82f6';
  if (r >= 6.0) return '#f59e0b';
  return '#ef4444';
}

// ── Stat progress bar ───────────────────────────────────────────────────────
const StatBar: React.FC<{
  label: string;
  value: number;
  max: number;
  color: string;
  suffix?: string;
}> = ({ label, value, max, color, suffix = '' }) => {
  const c = useThemeColors();
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <View style={sb.row}>
      <View style={sb.labelRow}>
        <Text style={[sb.label, { color: c.textSecondary }]}>{label}</Text>
        <Text style={[sb.value, { color: c.textPrimary }]}>{value}{suffix}</Text>
      </View>
      <View style={[sb.track, { backgroundColor: c.surface }]}>
        <View style={[sb.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
};

const sb = StyleSheet.create({
  row: { gap: 4 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 13, fontWeight: '600' },
  value: { fontSize: 14, fontWeight: '800' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Resumen
// ══════════════════════════════════════════════════════════════════════════════

const ResumenTab: React.FC<{ data: PlayerDetailData }> = ({ data }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();
  const { info, currentStats } = data;
  const st = currentStats;

  return (
    <View style={rt.outer}>
      {/* ── Season Rating Card ── */}
      {st && st.rating > 0 && (
        <View style={[rt.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={rt.ratingHeader}>
            <View style={[rt.ratingBadge, { backgroundColor: ratingColor(st.rating) + '20' }]}>
              <Text style={[rt.ratingValue, { color: ratingColor(st.rating) }]}>{st.rating.toFixed(1)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[rt.ratingTitle, { color: c.textPrimary }]}>{t('player.seasonRating')}</Text>
              <Text style={[rt.ratingSubtitle, { color: c.textTertiary }]}>
                {t('player.basedOnAppearances', { count: st.appearances })}
              </Text>
            </View>
          </View>

          <View style={rt.barsWrap}>
            <StatBar label={t('player.goals')} value={st.goals} max={Math.max(st.goals, 30)} color="#3b82f6" />
            <StatBar label={t('player.assists')} value={st.assists} max={Math.max(st.assists, 20)} color="#f97316" />
            <StatBar label={t('player.appearances')} value={st.appearances} max={38} color="#3b82f6" />
            <StatBar label={t('player.minutes')} value={st.minutesPlayed} max={3420} color="#3b82f6" suffix="'" />
          </View>
        </View>
      )}

      {/* ── Personal Information Card ── */}
      <View style={[rt.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[rt.sectionTitle, { color: c.textPrimary }]}>{t('player.personalInfo')}</Text>
        <View style={rt.infoGrid}>
          {[
            { label: t('player.nationality'), value: `${info.nationalityFlag} ${info.nationality}` },
            { label: t('player.age'), value: info.age > 0 ? t('player.ageValue', { age: info.age }) : '-' },
            { label: t('player.height'), value: info.height },
            { label: t('player.weight'), value: info.weight },
            { label: t('player.position'), value: info.position },
            { label: t('player.jersey'), value: data.jerseyNumber > 0 ? t('player.jerseyNumber', { number: data.jerseyNumber }) : '-' },
          ].map((item, i) => (
            <View key={i} style={[rt.infoCell, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[rt.infoCellLabel, { color: c.textTertiary }]}>{item.label}</Text>
              <Text style={[rt.infoCellValue, { color: c.textPrimary }]}>{item.value}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Additional Stats Card (if available) ── */}
      {st && (st.tackles > 0 || st.passes > 0 || st.dribbles > 0 || st.saves > 0) && (
        <View style={[rt.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[rt.sectionTitle, { color: c.textPrimary }]}>{t('player.performance')}</Text>
          <View style={rt.perfGrid}>
            {[
              st.shotsTotal > 0 && { label: t('player.shots'), value: st.shotsTotal, sub: t('player.shotsOnTarget', { count: st.shotsOnTarget }) },
              st.passes > 0 && { label: t('player.passes'), value: st.passes, sub: t('player.keyPasses', { count: st.keyPasses }) },
              st.tackles > 0 && { label: t('player.tackles'), value: st.tackles },
              st.interceptions > 0 && { label: t('player.interceptions'), value: st.interceptions },
              st.dribbles > 0 && { label: t('player.dribbles'), value: st.dribbles },
              st.duelsWon > 0 && { label: t('player.duelsWon'), value: st.duelsWon },
              st.aerialWon > 0 && { label: t('player.aerialDuels'), value: st.aerialWon },
              st.crosses > 0 && { label: t('player.crosses'), value: st.crosses },
              st.clearances > 0 && { label: t('player.clearances'), value: st.clearances },
              st.foulsDrawn > 0 && { label: t('player.foulsDrawn'), value: st.foulsDrawn },
              // GK-specific
              st.saves > 0 && { label: t('player.saves'), value: st.saves },
              st.cleanSheets > 0 && { label: t('player.cleanSheets'), value: st.cleanSheets },
            ].filter(Boolean).map((item: any, i) => (
              <View key={i} style={[rt.perfRow, { borderTopColor: c.border }]}>
                <View>
                  <Text style={[rt.perfLabel, { color: c.textSecondary }]}>{item.label}</Text>
                  {item.sub && <Text style={[rt.perfSub, { color: c.textTertiary }]}>{item.sub}</Text>}
                </View>
                <Text style={[rt.perfValue, { color: c.textPrimary }]}>{item.value}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── Team Link Card ── */}
      {data.teamId > 0 && (
        <TouchableOpacity
          style={[rt.card, rt.teamCard, { backgroundColor: c.card, borderColor: c.border }]}
          activeOpacity={0.7}
          onPress={() => {
            navigation.push('TeamDetail', {
              teamId: data.teamId,
              teamName: data.teamName,
              teamLogo: data.teamLogo,
            });
          }}
        >
          <View style={rt.teamRow}>
            {data.teamLogo?.startsWith('http') ? (
              <Image source={{ uri: data.teamLogo }} style={rt.teamLogo} resizeMode="contain" />
            ) : (
              <View style={[rt.teamLogo, { backgroundColor: c.surface, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ fontSize: 20 }}>⚽</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[rt.teamName, { color: c.textPrimary }]}>{data.teamName}</Text>
              {data.leagueName ? (
                <Text style={[rt.teamLeague, { color: c.textTertiary }]}>{data.leagueName}</Text>
              ) : null}
            </View>
            <ChevronRight color={c.textTertiary} size={14} />
          </View>
        </TouchableOpacity>
      )}

      <View style={{ height: 16 }} />
    </View>
  );
};

const rt = StyleSheet.create({
  outer: { paddingHorizontal: 16, gap: 12 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '800' },

  // Rating
  ratingHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  ratingBadge: {
    width: 56, height: 56, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  ratingValue: { fontSize: 22, fontWeight: '900' },
  ratingTitle: { fontSize: 15, fontWeight: '700' },
  ratingSubtitle: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  barsWrap: { gap: 12 },

  // Info grid
  infoGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  infoCell: {
    width: '47%', flexGrow: 1,
    borderRadius: 12, borderWidth: 1, padding: 14, gap: 4,
  },
  infoCellLabel: { fontSize: 11, fontWeight: '600' },
  infoCellValue: { fontSize: 15, fontWeight: '700' },

  // Performance
  perfGrid: { gap: 0 },
  perfRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderTopWidth: 1,
  },
  perfLabel: { fontSize: 13, fontWeight: '600' },
  perfSub: { fontSize: 11, fontWeight: '500', marginTop: 1 },
  perfValue: { fontSize: 15, fontWeight: '800' },

  // Team card
  teamCard: { padding: 14 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  teamLogo: { width: 44, height: 44, borderRadius: 22 },
  teamName: { fontSize: 16, fontWeight: '700' },
  teamLeague: { fontSize: 12, fontWeight: '500', marginTop: 2 },
});

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Estadísticas
// ══════════════════════════════════════════════════════════════════════════════

const EstadisticasTab: React.FC<{ data: PlayerDetailData }> = ({ data }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const st = data.currentStats;

  if (!st) {
    return (
      <View style={et.outer}>
        <View style={[et.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[et.empty, { color: c.textTertiary }]}>{t('player.noStats')}</Text>
        </View>
      </View>
    );
  }

  const seasonLabel = st.seasonName || `${new Date().getFullYear() - 1}/${String(new Date().getFullYear()).slice(2)}`;

  // Main stat cards
  const mainStats = [
    { emoji: '⚽', value: st.goals, label: t('player.goals') },
    { emoji: '🅰️', value: st.assists, label: t('player.assists') },
    { emoji: '🏟️', value: st.appearances, label: t('player.appearances') },
    { emoji: '⏱️', value: `${st.minutesPlayed}'`, label: t('player.minutes') },
    { emoji: '🟨', value: st.yellowCards, label: t('player.yellowCards') },
    { emoji: '🟥', value: st.redCards, label: t('player.redCards') },
  ];

  // Penalties
  const hasPens = st.penScored > 0 || st.penMissed > 0;

  // Per-90 stats
  const mins = st.minutesPlayed || 1;
  const per90 = [
    { label: t('player.goalsPer90'), value: ((st.goals / mins) * 90).toFixed(2) },
    { label: t('player.assistsPer90'), value: ((st.assists / mins) * 90).toFixed(2) },
    { label: t('player.gaPer90'), value: (((st.goals + st.assists) / mins) * 90).toFixed(2) },
    { label: t('player.minutesPerGoal'), value: st.goals > 0 ? Math.round(mins / st.goals).toString() : '-' },
  ];

  // Defensive stats
  const hasDefensive = st.tackles > 0 || st.interceptions > 0 || st.clearances > 0;

  // GK stats
  const hasGK = st.saves > 0 || st.cleanSheets > 0;

  return (
    <View style={et.outer}>
      {/* Season header */}
      <View style={[et.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[et.seasonTitle, { color: c.textPrimary }]}>{t('player.season', { season: seasonLabel })}</Text>
        <View style={et.grid}>
          {mainStats.map((s, i) => (
            <View key={i} style={[et.statCell, { backgroundColor: c.surface }]}>
              <Text style={{ fontSize: 18 }}>{s.emoji}</Text>
              <Text style={[et.statValue, { color: c.textPrimary }]}>{s.value}</Text>
              <Text style={[et.statLabel, { color: c.textTertiary }]}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Per 90 stats */}
      {st.minutesPlayed > 0 && (
        <View style={[et.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[et.sectionTitle, { color: c.textPrimary }]}>{t('player.averagesPer90')}</Text>
          {per90.map((s, i) => (
            <View key={i} style={[et.avgRow, { borderTopColor: c.border }]}>
              <Text style={[et.avgLabel, { color: c.textSecondary }]}>{s.label}</Text>
              <Text style={[et.avgValue, { color: c.textPrimary }]}>{s.value}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Offensive breakdown */}
      {(st.shotsTotal > 0 || st.dribbles > 0 || st.offsides > 0) && (
        <View style={[et.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[et.sectionTitle, { color: c.textPrimary }]}>{t('player.attack')}</Text>
          {[
            st.shotsTotal > 0 && { label: t('player.shots'), value: st.shotsTotal },
            st.shotsOnTarget > 0 && { label: t('player.shotsOnTarget', { count: st.shotsOnTarget }), value: st.shotsOnTarget },
            st.dribbles > 0 && { label: t('player.dribbles'), value: st.dribbles },
            st.crosses > 0 && { label: t('player.crosses'), value: st.crosses },
            st.offsides > 0 && { label: t('player.offsides'), value: st.offsides },
            hasPens && { label: t('player.penalties'), value: `${st.penScored}/${st.penMissed}` },
          ].filter(Boolean).map((s: any, i) => (
            <View key={i} style={[et.avgRow, { borderTopColor: c.border }]}>
              <Text style={[et.avgLabel, { color: c.textSecondary }]}>{s.label}</Text>
              <Text style={[et.avgValue, { color: c.textPrimary }]}>{s.value}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Passing */}
      {st.passes > 0 && (
        <View style={[et.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[et.sectionTitle, { color: c.textPrimary }]}>{t('player.passesSection')}</Text>
          {[
            { label: t('player.passes'), value: st.passes },
            st.keyPasses > 0 && { label: t('player.keyPasses', { count: st.keyPasses }), value: st.keyPasses },
          ].filter(Boolean).map((s: any, i) => (
            <View key={i} style={[et.avgRow, { borderTopColor: c.border }]}>
              <Text style={[et.avgLabel, { color: c.textSecondary }]}>{s.label}</Text>
              <Text style={[et.avgValue, { color: c.textPrimary }]}>{s.value}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Defensive */}
      {hasDefensive && (
        <View style={[et.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[et.sectionTitle, { color: c.textPrimary }]}>{t('player.defense')}</Text>
          {[
            st.tackles > 0 && { label: t('player.tackles'), value: st.tackles },
            st.interceptions > 0 && { label: t('player.interceptions'), value: st.interceptions },
            st.clearances > 0 && { label: t('player.clearances'), value: st.clearances },
            st.duelsWon > 0 && { label: t('player.duelsWon'), value: st.duelsWon },
            st.aerialWon > 0 && { label: t('player.aerialDuels'), value: st.aerialWon },
            st.foulsCommitted > 0 && { label: t('player.foulsCommitted'), value: st.foulsCommitted },
          ].filter(Boolean).map((s: any, i) => (
            <View key={i} style={[et.avgRow, { borderTopColor: c.border }]}>
              <Text style={[et.avgLabel, { color: c.textSecondary }]}>{s.label}</Text>
              <Text style={[et.avgValue, { color: c.textPrimary }]}>{s.value}</Text>
            </View>
          ))}
        </View>
      )}

      {/* GK */}
      {hasGK && (
        <View style={[et.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[et.sectionTitle, { color: c.textPrimary }]}>{t('player.goalkeeper')}</Text>
          {[
            { label: t('player.saves'), value: st.saves },
            { label: t('player.cleanSheets'), value: st.cleanSheets },
          ].map((s, i) => (
            <View key={i} style={[et.avgRow, { borderTopColor: c.border }]}>
              <Text style={[et.avgLabel, { color: c.textSecondary }]}>{s.label}</Text>
              <Text style={[et.avgValue, { color: c.textPrimary }]}>{s.value}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 16 }} />
    </View>
  );
};

const et = StyleSheet.create({
  outer: { paddingHorizontal: 16, gap: 12 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  empty: { fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  seasonTitle: { fontSize: 17, fontWeight: '800' },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  statCell: {
    width: '30%', flexGrow: 1,
    borderRadius: 12, padding: 14,
    alignItems: 'center', gap: 4,
  },
  statValue: { fontSize: 20, fontWeight: '900' },
  statLabel: { fontSize: 11, fontWeight: '600' },
  avgRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderTopWidth: 1,
  },
  avgLabel: { fontSize: 13, fontWeight: '600' },
  avgValue: { fontSize: 15, fontWeight: '800' },
});

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Historial
// ══════════════════════════════════════════════════════════════════════════════

const HistorialTab: React.FC<{ data: PlayerDetailData }> = ({ data }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const { seasonHistory } = data;

  if (seasonHistory.length === 0) {
    return (
      <View style={ht.outer}>
        <View style={[ht.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[ht.empty, { color: c.textTertiary }]}>{t('player.noHistory')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={ht.outer}>
      {/* Season history table */}
      <View style={[ht.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[ht.sectionTitle, { color: c.textPrimary }]}>{t('player.recentSeasons')}</Text>

        {/* Table header */}
        <View style={[ht.headerRow, { borderBottomColor: c.border }]}>
          <Text style={[ht.colSeason, ht.headerText, { color: c.textTertiary }]}>{t('player.seasonHeader')}</Text>
          <Text style={[ht.colNum, ht.headerText, { color: c.textTertiary }]}>PJ</Text>
          <Text style={[ht.colNum, ht.headerText, { color: c.textTertiary }]}>G</Text>
          <Text style={[ht.colNum, ht.headerText, { color: c.textTertiary }]}>A</Text>
        </View>

        {seasonHistory.map((season, i) => (
          <View key={i} style={[ht.row, { borderBottomColor: c.border }]}>
            <View style={ht.colSeason}>
              <Text style={[ht.seasonName, { color: c.accent }]}>{season.seasonName}</Text>
              {season.teamName ? (
                <Text style={[ht.teamName, { color: c.textTertiary }]}>{season.teamName}</Text>
              ) : null}
            </View>
            <Text style={[ht.colNum, ht.numVal, { color: c.textPrimary }]}>{season.appearances}</Text>
            <Text style={[ht.colNum, ht.numVal, { color: c.textPrimary }]}>{season.goals}</Text>
            <Text style={[ht.colNum, ht.numVal, { color: c.textPrimary }]}>{season.assists}</Text>
          </View>
        ))}
      </View>

      {/* Career totals */}
      {seasonHistory.length > 1 && (() => {
        const totals = seasonHistory.reduce(
          (acc, s) => ({
            apps: acc.apps + s.appearances,
            goals: acc.goals + s.goals,
            assists: acc.assists + s.assists,
            mins: acc.mins + s.minutesPlayed,
            yellows: acc.yellows + s.yellowCards,
            reds: acc.reds + s.redCards,
          }),
          { apps: 0, goals: 0, assists: 0, mins: 0, yellows: 0, reds: 0 },
        );
        return (
          <View style={[ht.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[ht.sectionTitle, { color: c.textPrimary }]}>{t('player.careerTotals')}</Text>
            {[
              { label: t('player.matchesPlayed'), value: totals.apps },
              { label: t('player.goalsShort'), value: totals.goals },
              { label: t('player.assists'), value: totals.assists },
              { label: t('player.minutesPlayedLabel'), value: `${totals.mins.toLocaleString()}'` },
              { label: t('player.yellowCardsLong'), value: totals.yellows },
              { label: t('player.redCardsLong'), value: totals.reds },
            ].map((s, i) => (
              <View key={i} style={[ht.totalRow, { borderTopColor: c.border }]}>
                <Text style={[ht.totalLabel, { color: c.textSecondary }]}>{s.label}</Text>
                <Text style={[ht.totalValue, { color: c.textPrimary }]}>{s.value}</Text>
              </View>
            ))}
          </View>
        );
      })()}

      <View style={{ height: 16 }} />
    </View>
  );
};

const ht = StyleSheet.create({
  outer: { paddingHorizontal: 16, gap: 12 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  empty: { fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingBottom: 8, borderBottomWidth: 1,
  },
  headerText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1,
  },
  colSeason: { flex: 1 },
  colNum: { width: 44, textAlign: 'center' },
  seasonName: { fontSize: 14, fontWeight: '700' },
  teamName: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  numVal: { fontSize: 14, fontWeight: '700' },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, borderTopWidth: 1,
  },
  totalLabel: { fontSize: 13, fontWeight: '600' },
  totalValue: { fontSize: 15, fontWeight: '800' },
});

// ══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════════════════════════════

export const PlayerDetailScreen: React.FC<Props> = ({ route }) => {
  const { playerId, playerName, playerImage, teamName, teamLogo, jerseyNumber } = route.params;
  const c = useThemeColors();
  const { t } = useTranslation();
  const { isDark } = useDarkMode();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();
  const { isFollowingPlayer, toggleFollowPlayer } = useFavorites();

  const { data, loading } = usePlayerDetail(playerId, playerName, playerImage, teamName, teamLogo, jerseyNumber);

  const isFollowing = isFollowingPlayer(String(playerId));

  // ── Tabs ──
  const TABS: { key: Tab; label: string }[] = [
    { key: 'resumen', label: t('player.summaryTab') },
    { key: 'estadisticas', label: t('player.statsTab') },
    { key: 'historial', label: t('player.historyTab') },
  ];
  const [activeTab, setActiveTab] = useState<Tab>('resumen');

  // ── Scroll animation ──
  const scrollY = useRef(new Animated.Value(0)).current;
  const compactOpacity = scrollY.interpolate({
    inputRange: [80, 140],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // ── Header theme colors ──
  const headerBg   = c.bg;
  const hText      = isDark ? '#fff' : '#111827';
  const hTextSoft  = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(17,24,39,0.5)';
  const hBtnBg     = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)';
  const hLogoBg    = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
  const hBorderCol = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.2)';

  // ── Display values ──
  const displayName  = data?.info.displayName || data?.info.name || playerName;
  const displayImage = data?.info.image || playerImage || '';
  const displayFlag  = data?.info.nationalityFlag || '🏳️';
  const displayPos   = data?.info.position || '';
  const displayTeam  = data?.teamName || teamName || '';
  const displayTeamLogo = data?.teamLogo || teamLogo || '';
  const displayNumber = data?.jerseyNumber || jerseyNumber || 0;
  const posColor     = positionColor(data?.info.positionId || 0);

  // Quick stats for hero strip
  const st = data?.currentStats;
  const heroStats = useMemo(() => {
    if (!st) return [];
    const items: { value: string; label: string; color?: string }[] = [];
    items.push({ value: String(st.goals), label: t('player.goalsShort') });
    items.push({ value: String(st.assists), label: t('player.assistsShort') });
    items.push({ value: String(st.appearances), label: t('player.matchesShort') });
    if (st.rating > 0) items.push({ value: st.rating.toFixed(1), label: t('player.ratingLabel'), color: ratingColor(st.rating) });
    return items;
  }, [st, t]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── Sticky compact header ── */}
      <View style={[ps.stickyHeader, { backgroundColor: headerBg }]}>
        <View style={ps.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[ps.navBtn, { backgroundColor: hBtnBg }]} activeOpacity={0.7}>
            <BackArrow color={hText} />
          </TouchableOpacity>
          <Animated.View style={[ps.compactCenter, { opacity: compactOpacity }]}>
            {displayFlag ? <Text style={{ fontSize: 18 }}>{displayFlag}</Text> : null}
            <Text style={[ps.compactName, { color: hText }]} numberOfLines={1}>{displayName}</Text>
          </Animated.View>
          <TouchableOpacity style={[ps.navBtn, { backgroundColor: hBtnBg }]} activeOpacity={0.7}>
            <ShareIcon color={hText} size={16} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
        scrollEventThrottle={16}
      >
        {/* ── Hero Header (scrolls with content) ── */}
        <View style={[ps.hero, { backgroundColor: headerBg }]}>

          <View style={ps.expanded}>
            {/* Player avatar */}
            <View style={[ps.avatarWrap, { backgroundColor: hLogoBg }]}>
              {displayImage?.startsWith('http') ? (
                <Image source={{ uri: displayImage }} style={ps.avatar} resizeMode="cover" />
              ) : (
                <Text style={{ fontSize: 40 }}>{displayFlag}</Text>
              )}
              {/* Jersey number badge */}
              {displayNumber > 0 && (
                <View style={[ps.numberBadge, { backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.6)' }]}>
                  <Text style={ps.numberText}>#{displayNumber}</Text>
                </View>
              )}
            </View>

            {/* Player name */}
            <Text style={[ps.playerName, { color: hText }]}>{displayName}</Text>

            {/* Club + Country, side-by-side on a single horizontal line */}
            {(displayTeam || (data?.info.nationality && data.info.nationality !== 'Desconocido')) ? (
              <View style={ps.affiliationRow}>
                {/* Club (the team they play for week-to-week) */}
                {displayTeam ? (
                  <TouchableOpacity
                    style={ps.teamLink}
                    activeOpacity={0.7}
                    disabled={!(data?.teamId && data.teamId > 0)}
                    onPress={() => {
                      if (data?.teamId && data.teamId > 0) {
                        navigation.push('TeamDetail', {
                          teamId: data.teamId,
                          teamName: displayTeam,
                          teamLogo: displayTeamLogo,
                        });
                      }
                    }}
                  >
                    {displayTeamLogo?.startsWith('http') ? (
                      <Image source={{ uri: displayTeamLogo }} style={ps.teamDot} resizeMode="contain" />
                    ) : (
                      <View style={[ps.teamDot, { backgroundColor: c.accent }]} />
                    )}
                    <Text style={[ps.teamLinkText, { color: c.accent }]} numberOfLines={1}>
                      {displayTeam}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {/* Separator dot — only shown when both pieces are present */}
                {displayTeam && data?.info.nationality && data.info.nationality !== 'Desconocido' ? (
                  <Text style={[ps.affiliationSep, { color: hTextSoft }]}>·</Text>
                ) : null}

                {/* Nationality (always shown when known — independent of being
                 *  called up). Clickable when SportMonks has a record of the
                 *  player on the national team; otherwise plain text. */}
                {data?.info.nationality && data.info.nationality !== 'Desconocido' ? (
                  <TouchableOpacity
                    style={ps.teamLink}
                    activeOpacity={data.nationalTeamId ? 0.7 : 1}
                    disabled={!data.nationalTeamId}
                    onPress={() => {
                      if (data.nationalTeamId) {
                        navigation.push('TeamDetail', {
                          teamId: data.nationalTeamId,
                          teamName: data.nationalTeamName || data.info.nationality,
                          teamLogo: data.nationalTeamLogo || '',
                        });
                      }
                    }}
                  >
                    <Text style={{ fontSize: 14 }}>{data.info.nationalityFlag}</Text>
                    <Text style={[
                      ps.teamLinkText,
                      { color: data.nationalTeamId ? c.accent : hTextSoft },
                    ]} numberOfLines={1}>
                      {data.info.nationality}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {/* Position + League */}
            {displayPos ? (
              <Text style={[ps.posLeague, { color: hTextSoft }]}>
                {displayPos}{data?.leagueName ? ` · ${data.leagueName}` : ''}
              </Text>
            ) : null}

            {/* Follow button */}
            <TouchableOpacity
              style={[
                ps.followBtn,
                { borderColor: hBorderCol },
                isFollowing && { backgroundColor: c.accent, borderColor: c.accent },
              ]}
              onPress={() => toggleFollowPlayer(String(playerId))}
              activeOpacity={0.8}
            >
              <Text style={[
                ps.followText,
                { color: hText },
                isFollowing && { color: '#fff' },
              ]}>
                {isFollowing ? t('player.following') : t('player.follow')}
              </Text>
            </TouchableOpacity>

            {/* Stats strip */}
            {heroStats.length > 0 && (
              <View style={ps.statsStrip}>
                {heroStats.map((s, i) => (
                  <View key={i} style={ps.statItem}>
                    <Text style={[ps.statValue, { color: s.color || hText }]}>{s.value}</Text>
                    <Text style={[ps.statLabel, { color: hTextSoft }]}>{s.label}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* ── Tab bar (sticky on scroll) ── */}
        <View style={[ps.tabBar, { backgroundColor: c.bg, borderBottomColor: c.border }]}>
          <ScrollView
            horizontal
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection: 'row', width: SCREEN_WIDTH }}
          >
            {TABS.map(tab => {
              const active = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={[ps.tab, { width: SCREEN_WIDTH / TABS.length }, active && { borderBottomColor: c.accent }]}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    ps.tabText,
                    { color: active ? c.accent : c.textTertiary },
                    active && { fontWeight: '700' },
                  ]}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Tab content ── */}
        {loading ? (
          <SkeletonPlayerDetail />
        ) : !data ? (
          <View style={{ alignItems: 'center', paddingTop: 80, gap: 10 }}>
            <Text style={{ fontSize: 36 }}>👤</Text>
            <Text style={{ fontSize: 14, color: c.textSecondary }}>{t('player.unavailable')}</Text>
          </View>
        ) : (
          <View style={{ paddingTop: 12 }}>
            {activeTab === 'resumen'       && <ResumenTab data={data} />}
            {activeTab === 'estadisticas'  && <EstadisticasTab data={data} />}
            {activeTab === 'historial'     && <HistorialTab data={data} />}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const ps = StyleSheet.create({
  // Sticky compact header
  stickyHeader: {
    position: 'relative',
    zIndex: 20,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    height: 48,
    zIndex: 2,
  },
  navBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  compactCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  compactName: {
    fontSize: 15, fontWeight: '700',
    flexShrink: 1,
  },

  // Hero
  hero: {
    position: 'relative',
  },
  expanded: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 18,
    gap: 6,
  },

  // Avatar
  avatarWrap: {
    width: 88, height: 88,
    borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
    overflow: 'visible',
  },
  avatar: {
    width: 88, height: 88,
    borderRadius: 22,
  },
  numberBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  numberText: {
    fontSize: 10, fontWeight: '800', color: '#fff',
  },

  // Player name
  playerName: {
    fontSize: 22, fontWeight: '800',
    letterSpacing: -0.3,
  },

  // Affiliation row — wraps club + country side-by-side (with " · " separator)
  affiliationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',          // graceful wrap if the player has very long club + country names
    gap: 8,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  affiliationSep: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Team link
  teamLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  teamDot: {
    // Rounded square (not full circle) so shield-shaped club crests like
    // Barcelona, Atlético Madrid or Inter aren't cropped at the edges.
    width: 18, height: 18, borderRadius: 4,
  },
  teamLinkText: {
    fontSize: 14, fontWeight: '600',
  },

  // Position
  posLeague: {
    fontSize: 12, fontWeight: '500',
  },

  // Follow
  followBtn: {
    paddingHorizontal: 22, paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
    marginTop: 4,
  },
  followText: {
    fontSize: 13, fontWeight: '700',
  },

  // Stats strip
  statsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    marginTop: 6,
  },
  statItem: { alignItems: 'center', gap: 2 },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 9, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
  },
  tabText: { fontSize: 14, fontWeight: '600' },
});
