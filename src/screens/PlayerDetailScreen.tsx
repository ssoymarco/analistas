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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useThemeColors } from '../theme/useTheme';
import { SkeletonPlayerDetail } from '../components/Skeleton';
import { useDarkMode } from '../contexts/DarkModeContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { usePlayerDetail } from '../hooks/usePlayerDetail';
import type { PlayerDetailData, PlayerSeasonStats } from '../hooks/usePlayerDetail';
import type { PartidosStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<PartidosStackParamList, 'PlayerDetail'>;
type Tab = 'resumen' | 'estadisticas' | 'historial';

// ── Icon: Back arrow ────────────────────────────────────────────────────────
function BackArrow({ color }: { color: string }) {
  return (
    <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', top: 4, left: 2, width: 9, height: 1.8, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '-45deg' }] }} />
      <View style={{ position: 'absolute', bottom: 4, left: 2, width: 9, height: 1.8, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '45deg' }] }} />
    </View>
  );
}

// ── Icon: Share ─────────────────────────────────────────────────────────────
function ShareIcon({ color, size = 18 }: { color: string; size?: number }) {
  const dotR = size * 0.15;
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ position: 'absolute', top: 0, right: 0, width: dotR * 2, height: dotR * 2, borderRadius: dotR, backgroundColor: color }} />
      <View style={{ position: 'absolute', top: size * 0.36, left: 0, width: dotR * 2, height: dotR * 2, borderRadius: dotR, backgroundColor: color }} />
      <View style={{ position: 'absolute', bottom: 0, right: 0, width: dotR * 2, height: dotR * 2, borderRadius: dotR, backgroundColor: color }} />
      <View style={{ position: 'absolute', top: size * 0.18, left: size * 0.18, width: size * 0.52, height: 1.5, backgroundColor: color, transform: [{ rotate: '-25deg' }] }} />
      <View style={{ position: 'absolute', top: size * 0.62, left: size * 0.18, width: size * 0.52, height: 1.5, backgroundColor: color, transform: [{ rotate: '25deg' }] }} />
    </View>
  );
}

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
              <Text style={[rt.ratingTitle, { color: c.textPrimary }]}>Rating de temporada</Text>
              <Text style={[rt.ratingSubtitle, { color: c.textTertiary }]}>
                Basado en {st.appearances} partidos disputados
              </Text>
            </View>
          </View>

          <View style={rt.barsWrap}>
            <StatBar label="Goles" value={st.goals} max={Math.max(st.goals, 30)} color="#3b82f6" />
            <StatBar label="Asistencias" value={st.assists} max={Math.max(st.assists, 20)} color="#f97316" />
            <StatBar label="Partidos" value={st.appearances} max={38} color="#3b82f6" />
            <StatBar label="Minutos" value={st.minutesPlayed} max={3420} color="#3b82f6" suffix="'" />
          </View>
        </View>
      )}

      {/* ── Personal Information Card ── */}
      <View style={[rt.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[rt.sectionTitle, { color: c.textPrimary }]}>Información personal</Text>
        <View style={rt.infoGrid}>
          {[
            { label: 'Nacionalidad', value: `${info.nationalityFlag} ${info.nationality}` },
            { label: 'Edad', value: info.age > 0 ? `${info.age} años` : '-' },
            { label: 'Altura', value: info.height },
            { label: 'Peso', value: info.weight },
            { label: 'Posición', value: info.position },
            { label: 'Dorsal', value: data.jerseyNumber > 0 ? `#${data.jerseyNumber}` : '-' },
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
          <Text style={[rt.sectionTitle, { color: c.textPrimary }]}>Rendimiento</Text>
          <View style={rt.perfGrid}>
            {[
              st.shotsTotal > 0 && { label: 'Tiros', value: st.shotsTotal, sub: `${st.shotsOnTarget} a puerta` },
              st.passes > 0 && { label: 'Pases', value: st.passes, sub: `${st.keyPasses} clave` },
              st.tackles > 0 && { label: 'Tackles', value: st.tackles },
              st.interceptions > 0 && { label: 'Intercepciones', value: st.interceptions },
              st.dribbles > 0 && { label: 'Regates', value: st.dribbles },
              st.duelsWon > 0 && { label: 'Duelos ganados', value: st.duelsWon },
              st.aerialWon > 0 && { label: 'Duelos aéreos', value: st.aerialWon },
              st.crosses > 0 && { label: 'Centros', value: st.crosses },
              st.clearances > 0 && { label: 'Despejes', value: st.clearances },
              st.foulsDrawn > 0 && { label: 'Faltas recibidas', value: st.foulsDrawn },
              // GK-specific
              st.saves > 0 && { label: 'Atajadas', value: st.saves },
              st.cleanSheets > 0 && { label: 'Portería imbatida', value: st.cleanSheets },
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
  const st = data.currentStats;

  if (!st) {
    return (
      <View style={et.outer}>
        <View style={[et.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[et.empty, { color: c.textTertiary }]}>Sin estadísticas disponibles</Text>
        </View>
      </View>
    );
  }

  const seasonLabel = st.seasonName || `${new Date().getFullYear() - 1}/${String(new Date().getFullYear()).slice(2)}`;

  // Main stat cards
  const mainStats = [
    { emoji: '⚽', value: st.goals, label: 'Goles' },
    { emoji: '🅰️', value: st.assists, label: 'Asistencias' },
    { emoji: '🏟️', value: st.appearances, label: 'Partidos' },
    { emoji: '⏱️', value: `${st.minutesPlayed}'`, label: 'Minutos' },
    { emoji: '🟨', value: st.yellowCards, label: 'T. Amarillas' },
    { emoji: '🟥', value: st.redCards, label: 'T. Rojas' },
  ];

  // Penalties
  const hasPens = st.penScored > 0 || st.penMissed > 0;

  // Per-90 stats
  const mins = st.minutesPlayed || 1;
  const per90 = [
    { label: 'Goles / 90', value: ((st.goals / mins) * 90).toFixed(2) },
    { label: 'Asistencias / 90', value: ((st.assists / mins) * 90).toFixed(2) },
    { label: 'G+A / 90', value: (((st.goals + st.assists) / mins) * 90).toFixed(2) },
    { label: 'Minutos / Gol', value: st.goals > 0 ? Math.round(mins / st.goals).toString() : '-' },
  ];

  // Defensive stats
  const hasDefensive = st.tackles > 0 || st.interceptions > 0 || st.clearances > 0;

  // GK stats
  const hasGK = st.saves > 0 || st.cleanSheets > 0;

  return (
    <View style={et.outer}>
      {/* Season header */}
      <View style={[et.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[et.seasonTitle, { color: c.textPrimary }]}>Temporada {seasonLabel}</Text>
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
          <Text style={[et.sectionTitle, { color: c.textPrimary }]}>Promedios por 90 min</Text>
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
          <Text style={[et.sectionTitle, { color: c.textPrimary }]}>Ataque</Text>
          {[
            st.shotsTotal > 0 && { label: 'Tiros totales', value: st.shotsTotal },
            st.shotsOnTarget > 0 && { label: 'Tiros a puerta', value: st.shotsOnTarget },
            st.dribbles > 0 && { label: 'Regates exitosos', value: st.dribbles },
            st.crosses > 0 && { label: 'Centros', value: st.crosses },
            st.offsides > 0 && { label: 'Fueras de juego', value: st.offsides },
            hasPens && { label: 'Penales (anotados/fallados)', value: `${st.penScored}/${st.penMissed}` },
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
          <Text style={[et.sectionTitle, { color: c.textPrimary }]}>Pases</Text>
          {[
            { label: 'Pases totales', value: st.passes },
            st.keyPasses > 0 && { label: 'Pases clave', value: st.keyPasses },
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
          <Text style={[et.sectionTitle, { color: c.textPrimary }]}>Defensa</Text>
          {[
            st.tackles > 0 && { label: 'Tackles', value: st.tackles },
            st.interceptions > 0 && { label: 'Intercepciones', value: st.interceptions },
            st.clearances > 0 && { label: 'Despejes', value: st.clearances },
            st.duelsWon > 0 && { label: 'Duelos ganados', value: st.duelsWon },
            st.aerialWon > 0 && { label: 'Duelos aéreos', value: st.aerialWon },
            st.foulsCommitted > 0 && { label: 'Faltas cometidas', value: st.foulsCommitted },
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
          <Text style={[et.sectionTitle, { color: c.textPrimary }]}>Portero</Text>
          {[
            { label: 'Atajadas', value: st.saves },
            { label: 'Portería imbatida', value: st.cleanSheets },
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
  const { seasonHistory } = data;

  if (seasonHistory.length === 0) {
    return (
      <View style={ht.outer}>
        <View style={[ht.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[ht.empty, { color: c.textTertiary }]}>Sin historial disponible</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={ht.outer}>
      {/* Season history table */}
      <View style={[ht.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[ht.sectionTitle, { color: c.textPrimary }]}>Temporadas recientes</Text>

        {/* Table header */}
        <View style={[ht.headerRow, { borderBottomColor: c.border }]}>
          <Text style={[ht.colSeason, ht.headerText, { color: c.textTertiary }]}>TEMPORADA</Text>
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
            <Text style={[ht.sectionTitle, { color: c.textPrimary }]}>Totales de carrera</Text>
            {[
              { label: 'Partidos jugados', value: totals.apps },
              { label: 'Goles', value: totals.goals },
              { label: 'Asistencias', value: totals.assists },
              { label: 'Minutos jugados', value: `${totals.mins.toLocaleString()}'` },
              { label: 'Tarjetas amarillas', value: totals.yellows },
              { label: 'Tarjetas rojas', value: totals.reds },
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
  const { isDark } = useDarkMode();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();
  const { isFollowingPlayer, toggleFollowPlayer } = useFavorites();

  const { data, loading } = usePlayerDetail(playerId, playerName, playerImage, teamName, teamLogo, jerseyNumber);

  const isFollowing = isFollowingPlayer(String(playerId));

  // ── Tabs ──
  const TABS: { key: Tab; label: string }[] = [
    { key: 'resumen', label: 'Resumen' },
    { key: 'estadisticas', label: 'Estadísticas' },
    { key: 'historial', label: 'Historial' },
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
    items.push({ value: String(st.goals), label: 'Goles' });
    items.push({ value: String(st.assists), label: 'Asist.' });
    items.push({ value: String(st.appearances), label: 'PJ' });
    if (st.rating > 0) items.push({ value: st.rating.toFixed(1), label: 'Rating', color: ratingColor(st.rating) });
    return items;
  }, [st]);

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

            {/* Team link */}
            {displayTeam ? (
              <TouchableOpacity
                style={ps.teamLink}
                activeOpacity={0.7}
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
                <Text style={[ps.teamLinkText, { color: c.accent }]}>{displayTeam}</Text>
              </TouchableOpacity>
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
                {isFollowing ? '✓ Siguiendo' : '+ Seguir'}
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
          {TABS.map(tab => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[ps.tab, active && { borderBottomColor: c.accent }]}
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
        </View>

        {/* ── Tab content ── */}
        {loading ? (
          <SkeletonPlayerDetail />
        ) : !data ? (
          <View style={{ alignItems: 'center', paddingTop: 80, gap: 10 }}>
            <Text style={{ fontSize: 36 }}>👤</Text>
            <Text style={{ fontSize: 14, color: c.textSecondary }}>Jugador no disponible</Text>
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

  // Team link
  teamLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  teamDot: {
    width: 18, height: 18, borderRadius: 9,
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
