// ── League Detail Screen ──────────────────────────────────────────────────────
// Full league profile: collapsible header, 4 tabs (Clasificación, Goleadores,
// Equipos, Calendario). Dark/Light mode responsive. Uses SportMonks data.
import React, { useState, useRef, useEffect } from 'react';
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
  findNodeHandle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const SCREEN_WIDTH = Dimensions.get('window').width;
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../theme/useTheme';
import { SkeletonLeagueDetail } from '../components/Skeleton';
import { useDarkMode } from '../contexts/DarkModeContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { useLeagueDetail } from '../hooks/useLeagueDetail';
import { useCupBracket } from '../hooks/useCupBracket';
import { useAvailableSeasons } from '../hooks/useAvailableSeasons';
import { CupBracketView } from '../components/CupBracketView';
import { SeasonSelector } from '../components/SeasonSelector';
import type { CupTie } from '../services/sportsApi';
import type { AvailableSeason } from '../services/firestoreApi';
import type {
  LeagueDetailData,
  LeagueStandingRow,
  TopScorerRow,
  LeagueTeam,
  LeagueFixture,
} from '../hooks/useLeagueDetail';
import type { PartidosStackParamList } from '../navigation/AppNavigator';
import { getLeagueConfig, getLeagueDisplayName, isCopyrightSensitiveLeague } from '../config/leagues';
import type { LeagueZone } from '../config/leagues';
import type { Match, MatchStatus } from '../data/types';
import { BackArrow, ShareIcon } from '../components/NavIcons';
import { useTimeFormat } from '../contexts/TimeFormatContext';
import { formatUtcTime } from '../utils/formatMatchTime';
import { translateNationalTeam, translateLeagueCountry } from '../utils/nationalTeams';

type Props = NativeStackScreenProps<PartidosStackParamList, 'LeagueDetail'>;
type Tab = 'clasificacion' | 'grupos' | 'partidos' | 'goleadores' | 'asistencias' | 'equipos';


// ── Icon: Chevron right ─────────────────────────────────────────────────────
function ChevronRight({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', top: 1, right: 2, width: 6, height: 1.5, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '45deg' }] }} />
      <View style={{ position: 'absolute', bottom: 1, right: 2, width: 6, height: 1.5, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '-45deg' }] }} />
    </View>
  );
}

// ── Zone colors ────────────────────────────────────────────────────────────
function getZoneColor(position: number, totalTeams: number, zones?: LeagueZone[]): string | null {
  if (zones) {
    for (const z of zones) {
      if (position >= z.from && position <= z.to) return z.color;
    }
    return null;
  }
  // Generic European fallback for unconfigured leagues
  if (position === 1) return '#fbbf24'; // Champion (gold)
  if (position <= 4)  return '#3b82f6'; // Champions League
  if (position <= 6)  return '#f97316'; // Europa League
  if (position > totalTeams - 3) return '#ef4444'; // Relegation
  return null;
}

// ── Team Logo ──────────────────────────────────────────────────────────────
const TeamLogo: React.FC<{ logo: string; size?: number }> = ({ logo, size = 22 }) => {
  if (logo?.startsWith('http')) {
    return <Image source={{ uri: logo }} style={{ width: size, height: size, borderRadius: 2 }} resizeMode="contain" />;
  }
  return <Text style={{ fontSize: size - 4 }}>⚽</Text>;
};

// ── Format date ────────────────────────────────────────────────────────────
function formatDate(dateStr: string, t: (key: string, opts?: any) => any): string {
  const d = new Date(dateStr);
  const day = d.getDate();
  const months = t('dates.monthsAbbr', { returnObjects: true }) as string[];
  return `${day} ${months[d.getMonth()]}`;
}


// ══════════════════════════════════════════════════════════════════════════════
// TAB: Clasificación
// ══════════════════════════════════════════════════════════════════════════════

// ── Group standings zone palette ─────────────────────────────────────────────
// For multi-group cups (World Cup, Copa Libertadores group stage, etc.):
//   1–2: green  → advance directly
//   3:   amber  → "best 3rd" possibility (depends on competition)
//   4:   red    → eliminated
const GROUP_ZONE_QUALIFY    = '#10b981'; // emerald
const GROUP_ZONE_THIRD      = '#eab308'; // amber
const GROUP_ZONE_ELIMINATED = '#ef4444'; // red

function getGroupZoneColor(positionInGroup: number, teamsInGroup: number): string | null {
  if (positionInGroup <= 2) return GROUP_ZONE_QUALIFY;
  if (positionInGroup === 3 && teamsInGroup >= 4) return GROUP_ZONE_THIRD;
  if (positionInGroup === teamsInGroup) return GROUP_ZONE_ELIMINATED;
  return null;
}

// Convert a 0-based index into a group letter (0→A, 1→B, 25→Z, 26→AA…).
// Supports the 12 groups of WC 2026 (A–L) and any future expansion.
function groupLetter(index: number): string {
  let s = '';
  let n = index;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

// ── Single-group standings table (the inner repeatable card) ─────────────────
const SingleGroupTable: React.FC<{
  rows: LeagueStandingRow[];
  groupLabel?: string;           // e.g. "Grupo A" (omit when single-table league)
  showZones?: boolean;           // colored bar + per-position color
  leagueZones?: LeagueZone[];    // for legacy single-table leagues
  onPressTeam: (r: LeagueStandingRow) => void;
}> = ({ rows, groupLabel, showZones = true, leagueZones, onPressTeam }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const totalInGroup = rows.length;

  return (
    <View style={[cl.card, { backgroundColor: c.card, borderColor: c.border }]}>
      {/* Optional group header */}
      {groupLabel ? (
        <View style={cl.groupHeader}>
          <View style={[cl.groupBadge, { backgroundColor: c.accent + '22' }]}>
            <Text style={[cl.groupBadgeText, { color: c.accent }]}>{groupLabel}</Text>
          </View>
        </View>
      ) : null}

      {/* Column header */}
      <View style={[cl.headerRow, { borderBottomColor: c.border }]}>
        <View style={cl.zoneBar} />
        <Text style={[cl.hPos, { color: c.textTertiary }]}>#</Text>
        <View style={{ width: 26 }} />
        <View style={cl.nameWrap}>
          <Text style={[cl.hText, { color: c.textTertiary }]}>{t('league.teamHeader')}</Text>
        </View>
        <Text style={[cl.hNum, { color: c.textTertiary }]}>J</Text>
        <Text style={[cl.hNum, { color: c.textTertiary }]}>G</Text>
        <Text style={[cl.hNum, { color: c.textTertiary }]}>E</Text>
        <Text style={[cl.hNum, { color: c.textTertiary }]}>P</Text>
        <Text style={[cl.hGfga, { color: c.textTertiary }]}>+/-</Text>
        <Text style={[cl.hGd, { color: c.textTertiary }]}>DG</Text>
        <Text style={[cl.hPts, { color: c.textTertiary }]}>PTS</Text>
      </View>

      {rows.map(row => {
        // Zone color: per-group for cup competitions, else use the legacy
        // single-table league zones (champions, relegation, etc.)
        const zoneColor = !showZones
          ? null
          : groupLabel
            ? getGroupZoneColor(row.position, totalInGroup)
            : getZoneColor(row.position, totalInGroup, leagueZones);

        const gd = row.goalDifference > 0 ? `+${row.goalDifference}` : `${row.goalDifference}`;
        const gdColor = row.goalDifference > 0 ? '#10b981'
          : row.goalDifference < 0 ? '#ef4444'
          : c.textTertiary;

        return (
          <TouchableOpacity
            key={row.teamId}
            style={[cl.row, { borderBottomColor: c.border }]}
            activeOpacity={0.7}
            onPress={() => onPressTeam(row)}
          >
            <View style={[cl.zoneBar, { backgroundColor: zoneColor || 'transparent' }]} />
            <Text style={[cl.pos, { color: zoneColor || c.textTertiary }]}>{row.position}</Text>
            <View style={cl.logoCell}>
              <TeamLogo logo={row.teamLogo} size={22} />
            </View>
            <View style={cl.nameWrap}>
              <Text style={[cl.name, { color: c.textPrimary }]} numberOfLines={1}>{translateNationalTeam(row.teamName)}</Text>
            </View>
            <Text style={[cl.num, { color: c.textSecondary }]}>{row.played}</Text>
            <Text style={[cl.num, { color: c.textSecondary }]}>{row.won}</Text>
            <Text style={[cl.num, { color: c.textSecondary }]}>{row.drawn}</Text>
            <Text style={[cl.num, { color: c.textSecondary }]}>{row.lost}</Text>
            <Text style={[cl.gfga, { color: c.textTertiary }]}>{row.goalsFor}-{row.goalsAgainst}</Text>
            <Text style={[cl.gd, { color: gdColor }]}>{gd}</Text>
            <Text style={[cl.pts, { color: c.textPrimary }]}>{row.points}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const ClasificacionTab: React.FC<{ data: LeagueDetailData }> = ({ data }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();
  const { standings } = data;

  if (standings.length === 0) {
    return (
      <View style={cl.outer}>
        <View style={[cl.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[cl.empty, { color: c.textTertiary }]}>{t('league.standingsUnavailable')}</Text>
        </View>
      </View>
    );
  }

  const onPressTeam = (row: LeagueStandingRow) => navigation.push('TeamDetail', {
    teamId: row.teamId,
    teamName: row.teamName,
    teamLogo: row.teamLogo,
    seasonId: data.seasonId,
  });

  // ── Multi-group competition? (World Cup, Copa Libertadores group, etc.)
  const groupIdsInOrder: number[] = [];
  const byGroup = new Map<number, LeagueStandingRow[]>();
  for (const row of standings) {
    if (row.groupId == null) continue;
    if (!byGroup.has(row.groupId)) {
      byGroup.set(row.groupId, []);
      groupIdsInOrder.push(row.groupId);
    }
    byGroup.get(row.groupId)!.push(row);
  }
  const isMultiGroup = byGroup.size > 1;

  // ── MULTI-GROUP RENDER (one card per group with letter header) ────────────
  if (isMultiGroup) {
    // Sort groups by ascending groupId (matches SportMonks' natural order)
    groupIdsInOrder.sort((a, b) => a - b);
    return (
      <View style={cl.outer}>
        {groupIdsInOrder.map((groupId, idx) => {
          const rows = byGroup.get(groupId)!.slice().sort((a, b) => a.position - b.position);
          return (
            <View key={groupId} style={{ marginBottom: idx === groupIdsInOrder.length - 1 ? 0 : 12 }}>
              <SingleGroupTable
                rows={rows}
                groupLabel={`${t('league.groupLabel')} ${groupLetter(idx)}`}
                showZones
                onPressTeam={onPressTeam}
              />
            </View>
          );
        })}

        {/* Legend for the group zones */}
        <View style={cl.legend}>
          <View style={cl.legendItem}>
            <View style={[cl.legendBar, { backgroundColor: GROUP_ZONE_QUALIFY }]} />
            <Text style={[cl.legendText, { color: c.textTertiary }]}>{t('league.zones.qualifyDirect')}</Text>
          </View>
          <View style={cl.legendItem}>
            <View style={[cl.legendBar, { backgroundColor: GROUP_ZONE_THIRD }]} />
            <Text style={[cl.legendText, { color: c.textTertiary }]}>{t('league.zones.thirdPlace')}</Text>
          </View>
          <View style={cl.legendItem}>
            <View style={[cl.legendBar, { backgroundColor: GROUP_ZONE_ELIMINATED }]} />
            <Text style={[cl.legendText, { color: c.textTertiary }]}>{t('league.zones.eliminated')}</Text>
          </View>
        </View>

        <View style={{ height: 16 }} />
      </View>
    );
  }

  // ── SINGLE-TABLE LEAGUE RENDER (legacy behaviour) ─────────────────────────
  const leagueZones = getLeagueConfig(data.leagueId)?.zones;
  const activeLegendZones: LeagueZone[] = leagueZones
    ? leagueZones.filter(z =>
        standings.some(row => row.position >= z.from && row.position <= z.to),
      )
    : [
        { label: t('league.zones.champion'),       color: '#fbbf24', from: 1, to: 1 },
        { label: t('league.zones.championsLeague'), color: '#3b82f6', from: 2, to: 4 },
        { label: t('league.zones.europaLeague'),    color: '#f97316', from: 5, to: 6 },
        { label: t('league.zones.relegation'),      color: '#ef4444', from: 99, to: 99 },
      ];

  return (
    <View style={cl.outer}>
      <SingleGroupTable
        rows={standings}
        leagueZones={leagueZones}
        onPressTeam={onPressTeam}
      />

      {/* Zone legend — dynamic per league */}
      {activeLegendZones.length > 0 && (
        <View style={cl.legend}>
          {activeLegendZones.map(zone => (
            <View key={zone.label} style={cl.legendItem}>
              <View style={[cl.legendBar, { backgroundColor: zone.color }]} />
              <Text style={[cl.legendText, { color: c.textTertiary }]}>{zone.label}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 16 }} />
    </View>
  );
};

const cl = StyleSheet.create({
  outer: { paddingHorizontal: 16, gap: 12 },
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  empty: { fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  // Group section header ("Grupo A", "Grupo B"…)
  groupHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8,
  },
  groupBadge: {
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 8,
  },
  groupBadgeText: {
    fontSize: 13, fontWeight: '800', letterSpacing: 0.5,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingRight: 10, paddingVertical: 8, borderBottomWidth: 1,
  },
  hPos: { width: 22, fontSize: 10, fontWeight: '700', textAlign: 'center', letterSpacing: 0.3 },
  hText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  hNum: { width: 22, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  hGfga: { width: 38, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  hGd: { width: 30, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  hPts: { width: 30, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingRight: 10, paddingVertical: 10, borderBottomWidth: 1,
  },
  zoneBar: { width: 3, height: '100%', borderRadius: 1.5, marginRight: 6 },
  pos: { width: 22, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  logoCell: { width: 26, alignItems: 'center', marginRight: 4 },
  nameWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  num: { width: 22, fontSize: 12, textAlign: 'center' },
  gfga: { width: 38, fontSize: 11, textAlign: 'center' },
  gd: { width: 30, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  pts: { width: 30, fontSize: 14, fontWeight: '900', textAlign: 'center' },
  legend: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 14,
    paddingHorizontal: 4, paddingVertical: 10,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendBar: { width: 3, height: 14, borderRadius: 1.5 },
  legendText: { fontSize: 11, fontWeight: '600' },
});

// ── Pre-season skeleton (used by Goleadores and Asistentes when no data yet) ──
const PreSeasonStatSkeleton: React.FC<{ title: string; statLabel: string }> = ({ title, statLabel }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const shimmer = c.surface; // slightly lighter than card
  const bar = (w: number, h: number = 10, r: number = 5) => (
    <View style={{ width: w, height: h, borderRadius: r, backgroundColor: shimmer }} />
  );
  return (
    <View style={gs.outer}>
      <View style={[gs.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[gs.title, { color: c.textPrimary }]}>{title}</Text>

        {/* Notice banner */}
        <View style={[sk.notice, { backgroundColor: c.accent + '14', borderColor: c.accent + '30' }]}>
          <Text style={sk.noticeIcon}>🏆</Text>
          <Text style={[sk.noticeText, { color: c.textSecondary }]}>{t('league.preSeasonEmpty')}</Text>
        </View>

        {/* Column header */}
        <View style={[gs.headerRow, { borderBottomColor: c.border }]}>
          <Text style={[gs.hPos, { color: c.textTertiary }]}>#</Text>
          <View style={{ width: 32 }} />
          <View style={gs.hNameWrap}>
            <Text style={[gs.hText, { color: c.textTertiary }]}>{t('league.playerHeader')}</Text>
          </View>
          <Text style={[gs.hGoals, { color: c.textTertiary }]}>{statLabel}</Text>
        </View>

        {/* 10 skeleton rows */}
        {Array.from({ length: 10 }).map((_, i) => (
          <View key={i} style={[gs.row, { borderBottomColor: c.border, opacity: 1 - i * 0.06 }]}>
            {/* Position */}
            <View style={[gs.pos, { width: 24, alignItems: 'center' }]}>{bar(16, 10)}</View>
            {/* Avatar */}
            <View style={[sk.avatar, { backgroundColor: shimmer }]} />
            {/* Name + team */}
            <View style={gs.hNameWrap}>
              {bar(80 + (i % 3) * 20, 11)}
              <View style={{ height: 4 }} />
              {bar(50 + (i % 4) * 10, 9)}
            </View>
            {/* Stat */}
            <View style={{ width: 40, alignItems: 'center' }}>{bar(22, 14, 7)}</View>
          </View>
        ))}
      </View>
    </View>
  );
};

const sk = StyleSheet.create({
  notice: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 12, marginBottom: 8,
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  noticeIcon: { fontSize: 16 },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 16 },
  avatar: { width: 32, height: 32, borderRadius: 16, marginRight: 8 },
});

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Goleadores
// ══════════════════════════════════════════════════════════════════════════════

const GoleadoresTab: React.FC<{ data: LeagueDetailData }> = ({ data }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();
  const { topScorers } = data;

  if (topScorers.length === 0) {
    return <PreSeasonStatSkeleton title={t('league.scorersTitle')} statLabel={t('league.goalsHeader')} />;
  }

  return (
    <View style={gs.outer}>
      <View style={[gs.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[gs.title, { color: c.textPrimary }]}>{t('league.scorersTitle')}</Text>

        {/* Header */}
        <View style={[gs.headerRow, { borderBottomColor: c.border }]}>
          <Text style={[gs.hPos, { color: c.textTertiary }]}>#</Text>
          <View style={{ width: 32 }} />
          <View style={gs.hNameWrap}>
            <Text style={[gs.hText, { color: c.textTertiary }]}>{t('league.playerHeader')}</Text>
          </View>
          <Text style={[gs.hGoals, { color: c.textTertiary }]}>{t('league.goalsHeader')}</Text>
        </View>

        {topScorers.map((scorer, i) => {
          const isTop3 = scorer.position <= 3;
          const posColor = scorer.position === 1 ? '#fbbf24' : scorer.position === 2 ? '#94a3b8' : scorer.position === 3 ? '#d97706' : c.textTertiary;

          return (
            <TouchableOpacity
              key={`${scorer.playerId}-${i}`}
              style={[gs.row, { borderBottomColor: c.border }]}
              activeOpacity={0.7}
              onPress={() => navigation.push('PlayerDetail', {
                playerId: scorer.playerId,
                playerName: scorer.playerName,
                playerImage: scorer.playerImage,
                teamName: scorer.teamName,
                teamLogo: scorer.teamLogo,
              })}
            >
              <Text style={[gs.pos, { color: posColor, fontWeight: isTop3 ? '900' : '700' }]}>
                {scorer.position}
              </Text>
              <View style={gs.avatarWrap}>
                {scorer.playerImage?.startsWith('http') ? (
                  <Image source={{ uri: scorer.playerImage }} style={gs.avatar} resizeMode="cover" />
                ) : (
                  <View style={[gs.avatar, { backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 14 }}>👤</Text>
                  </View>
                )}
              </View>
              <View style={gs.nameWrap}>
                <Text style={[gs.name, { color: c.textPrimary }]} numberOfLines={1}>{scorer.playerName}</Text>
                {scorer.teamName ? (
                  <View style={gs.teamRow}>
                    {scorer.teamLogo?.startsWith('http') && (
                      <Image source={{ uri: scorer.teamLogo }} style={gs.teamMiniLogo} resizeMode="contain" />
                    )}
                    <Text style={[gs.teamName, { color: c.textTertiary }]} numberOfLines={1}>{scorer.teamName}</Text>
                  </View>
                ) : null}
              </View>
              <View style={[gs.goalsBadge, { backgroundColor: isTop3 ? c.accent + '20' : c.surface }]}>
                <Text style={[gs.goalsValue, { color: isTop3 ? c.accent : c.textPrimary }]}>{scorer.goals}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ height: 16 }} />
    </View>
  );
};

const gs = StyleSheet.create({
  outer: { paddingHorizontal: 16, gap: 12 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  empty: { fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  title: { fontSize: 17, fontWeight: '800' },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingBottom: 8, borderBottomWidth: 1,
  },
  hPos: { width: 28, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  hText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  hNameWrap: { flex: 1 },
  hGoals: { width: 52, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1,
  },
  pos: { width: 28, fontSize: 14, textAlign: 'center' },
  avatarWrap: { marginRight: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  nameWrap: { flex: 1 },
  name: { fontSize: 14, fontWeight: '700' },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  teamMiniLogo: { width: 14, height: 14 },
  teamName: { fontSize: 11, fontWeight: '500' },
  goalsBadge: {
    width: 44, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  goalsValue: { fontSize: 16, fontWeight: '900' },
});

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Asistencias / Tarjetas (generic stat list — reuses GoleadoresTab layout)
// ══════════════════════════════════════════════════════════════════════════════

const StatListTab: React.FC<{ data: LeagueDetailData; type: 'assists' | 'cards' }> = ({ data, type }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();

  const rows    = type === 'assists' ? data.topAssists : data.topCards;
  const title   = type === 'assists' ? t('league.assistsTitle')  : t('league.cardsTitle');
  const hStat   = type === 'assists' ? t('league.assistsHeader') : t('league.cardsHeader');
  const emptyTx = type === 'assists' ? t('league.noAssists')     : t('league.noCards');
  const badgeColor = type === 'assists' ? '#10b981' : '#f59e0b'; // emerald / amber

  if (rows.length === 0) {
    return <PreSeasonStatSkeleton title={title} statLabel={hStat} />;
  }

  return (
    <View style={gs.outer}>
      <View style={[gs.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[gs.title, { color: c.textPrimary }]}>{title}</Text>

        {/* Header */}
        <View style={[gs.headerRow, { borderBottomColor: c.border }]}>
          <Text style={[gs.hPos, { color: c.textTertiary }]}>#</Text>
          <View style={{ width: 32 }} />
          <View style={gs.hNameWrap}>
            <Text style={[gs.hText, { color: c.textTertiary }]}>{t('league.playerHeader')}</Text>
          </View>
          <Text style={[gs.hGoals, { color: c.textTertiary }]}>{hStat}</Text>
        </View>

        {rows.map((row, i) => {
          const isTop3 = row.position <= 3;
          const posColor = row.position === 1 ? '#fbbf24' : row.position === 2 ? '#94a3b8' : row.position === 3 ? '#d97706' : c.textTertiary;

          return (
            <TouchableOpacity
              key={`${row.playerId}-${i}`}
              style={[gs.row, { borderBottomColor: c.border }]}
              activeOpacity={0.7}
              onPress={() => navigation.push('PlayerDetail', {
                playerId: row.playerId,
                playerName: row.playerName,
                playerImage: row.playerImage,
                teamName: row.teamName,
                teamLogo: row.teamLogo,
              })}
            >
              <Text style={[gs.pos, { color: posColor, fontWeight: isTop3 ? '900' : '700' }]}>
                {row.position}
              </Text>
              <View style={gs.avatarWrap}>
                {row.playerImage?.startsWith('http') ? (
                  <Image source={{ uri: row.playerImage }} style={gs.avatar} resizeMode="cover" />
                ) : (
                  <View style={[gs.avatar, { backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 14 }}>👤</Text>
                  </View>
                )}
              </View>
              <View style={gs.nameWrap}>
                <Text style={[gs.name, { color: c.textPrimary }]} numberOfLines={1}>{row.playerName}</Text>
                {row.teamName ? (
                  <View style={gs.teamRow}>
                    {row.teamLogo?.startsWith('http') && (
                      <Image source={{ uri: row.teamLogo }} style={gs.teamMiniLogo} resizeMode="contain" />
                    )}
                    <Text style={[gs.teamName, { color: c.textTertiary }]} numberOfLines={1}>{row.teamName}</Text>
                  </View>
                ) : null}
              </View>
              <View style={[gs.goalsBadge, { backgroundColor: isTop3 ? badgeColor + '22' : c.surface }]}>
                <Text style={[gs.goalsValue, { color: isTop3 ? badgeColor : c.textPrimary }]}>{row.goals}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={{ height: 16 }} />
    </View>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Equipos
// ══════════════════════════════════════════════════════════════════════════════

const EquiposTab: React.FC<{ data: LeagueDetailData }> = ({ data }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();
  const { isFollowingTeam, toggleFollowTeam } = useFavorites();
  const { teams } = data;

  if (teams.length === 0) {
    return (
      <View style={eq.outer}>
        <View style={[eq.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[eq.empty, { color: c.textTertiary }]}>{t('league.noTeams')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={eq.outer}>
      <View style={[eq.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[eq.title, { color: c.textPrimary }]}>{t('league.teamsTitle', { count: teams.length })}</Text>

        <View style={eq.grid}>
          {teams.map(team => {
            const following = isFollowingTeam(String(team.id));
            return (
              <TouchableOpacity
                key={team.id}
                style={[eq.teamCell, { backgroundColor: c.surface, borderColor: c.border }]}
                activeOpacity={0.7}
                onPress={() => navigation.push('TeamDetail', {
                  teamId: team.id,
                  teamName: team.name,
                  teamLogo: team.logo,
                  seasonId: data.seasonId,
                })}
              >
                <View style={eq.logoWrap}>
                  {team.logo?.startsWith('http') ? (
                    <Image source={{ uri: team.logo }} style={eq.logo} resizeMode="contain" />
                  ) : (
                    <Text style={{ fontSize: 28 }}>⚽</Text>
                  )}
                </View>
                <Text style={[eq.teamName, { color: c.textPrimary }]} numberOfLines={2}>{translateNationalTeam(team.name)}</Text>
                <TouchableOpacity
                  style={[
                    eq.followBtn,
                    following
                      ? { backgroundColor: c.accent }
                      : { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.textTertiary },
                  ]}
                  onPress={(e) => {
                    e.stopPropagation();
                    toggleFollowTeam(String(team.id));
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[
                    eq.followText,
                    { color: following ? '#fff' : c.textSecondary },
                  ]}>
                    {following ? '✓' : '+'}
                  </Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={{ height: 16 }} />
    </View>
  );
};

const eq = StyleSheet.create({
  outer: { paddingHorizontal: 16, gap: 12 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 14 },
  empty: { fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  title: { fontSize: 17, fontWeight: '800' },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  teamCell: {
    width: '30%', flexGrow: 1,
    borderRadius: 14, borderWidth: 1, padding: 14,
    alignItems: 'center', gap: 8,
  },
  logoWrap: {
    width: 48, height: 48,
    alignItems: 'center', justifyContent: 'center',
  },
  logo: { width: 44, height: 44 },
  teamName: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  followBtn: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  followText: { fontSize: 16, fontWeight: '800' },
});

// ══════════════════════════════════════════════════════════════════════════════
// MUNDIAL 2026 — Premium hero header (leagueId === 732 only)
// ══════════════════════════════════════════════════════════════════════════════

const WC_KICKOFF_UTC = new Date('2026-06-11T16:00:00Z').getTime();
const WC_FINAL_UTC   = new Date('2026-07-19T22:00:00Z').getTime();

type WCPhase =
  | { phase: 'pre'; days: number; hours: number; minutes: number; seconds: number }
  | { phase: 'live'; daysElapsed: number }
  | { phase: 'done' };

function computeWCPhase(now = Date.now()): WCPhase {
  if (now < WC_KICKOFF_UTC) {
    const diff = Math.max(0, WC_KICKOFF_UTC - now);
    return {
      phase: 'pre',
      days:    Math.floor(diff / (24 * 3600 * 1000)),
      hours:   Math.floor((diff % (24 * 3600 * 1000)) / (3600 * 1000)),
      minutes: Math.floor((diff % (3600 * 1000)) / (60 * 1000)),
      seconds: Math.floor((diff % (60 * 1000)) / 1000),
    };
  }
  if (now <= WC_FINAL_UTC) {
    return { phase: 'live', daysElapsed: Math.floor((now - WC_KICKOFF_UTC) / (24 * 3600 * 1000)) };
  }
  return { phase: 'done' };
}

const padTwo = (n: number) => n.toString().padStart(2, '0');

const WCTimerBlock: React.FC<{
  value: string; label: string;
  isDark: boolean;
}> = ({ value, label, isDark }) => (
  <View style={[
    wch.timerBlock,
    !isDark && {
      backgroundColor: 'rgba(13,31,56,0.06)',
      borderColor: 'rgba(13,31,56,0.08)',
    },
  ]}>
    <Text style={[wch.timerValue, !isDark && { color: '#0D1F38' }]}>{value}</Text>
    <Text style={[wch.timerLabel, !isDark && { color: 'rgba(13,31,56,0.55)' }]}>{label}</Text>
  </View>
);

interface WorldCupHeroProps {
  isFollowing: boolean;
  onToggleFollow: () => void;
  t: (key: string, opts?: any) => string;
  /** Available WC editions (length > 1 → renders the season pill) */
  seasons: AvailableSeason[];
  selectedSeasonId: number | null;
  onSelectSeason: (seasonId: number) => void;
  /** Whether the currently selected season is the live 2026 edition.
   *  Past editions hide the host flags / accent strip / countdown. */
  isCurrentSeason: boolean;
}

const WorldCupHeroHeader: React.FC<WorldCupHeroProps> = ({
  isFollowing, onToggleFollow, t,
  seasons, selectedSeasonId, onSelectSeason, isCurrentSeason,
}) => {
  const { isDark } = useDarkMode();
  const [wc, setWc] = useState<WCPhase>(() => computeWCPhase());

  useEffect(() => {
    const ms = wc.phase === 'pre' ? 1000 : 60_000;
    const id = setInterval(() => setWc(computeWCPhase()), ms);
    return () => clearInterval(id);
  }, [wc.phase]);

  // Derive the year shown in the pill from the currently selected season
  const selectedSeason = seasons.find(s => s.id === selectedSeasonId);
  const yearLabel = selectedSeason
    ? (selectedSeason.name?.match(/\d{4}/)?.[0] ?? String(selectedSeason.year))
    : '2026';

  // Theme-aware palette. Dark mode keeps the original FIFA navy + gold look.
  // Light mode switches to a warm cream gradient with navy text so the hero
  // blends into the white app surface instead of looking like a floating
  // dark island, while still keeping the brand cues (gold trophy, gold
  // separator, host accent strip).
  const gradientColors = isDark
    ? (['#05101E', '#0D1F38', '#152C4E'] as const)
    : (['#FFFFFF', '#FAF5E8', '#F0E6CC'] as const);
  const titleColor       = isDark ? '#FFFFFF' : '#0D1F38';
  const titleShadowColor = isDark ? 'rgba(0,0,0,0.4)' : 'rgba(13,31,56,0.12)';
  const hostsColor       = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(13,31,56,0.55)';
  const followBorderCol  = isDark ? 'rgba(255,255,255,0.28)' : 'rgba(13,31,56,0.25)';
  const followBgIdle     = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(13,31,56,0.04)';
  const followTextIdle   = isDark ? '#FFFFFF' : '#0D1F38';

  return (
    <View>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={wch.gradient}
      >
        {/* Host-nation accent strip — only for the current (2026) edition */}
        {isCurrentSeason && (
          <View style={wch.accentStrip} pointerEvents="none">
            {/* MX */}
            <View style={[wch.accentSeg, { backgroundColor: '#006847' }]} />
            <View style={[wch.accentSeg, { backgroundColor: '#FFFFFF', opacity: 0.55 }]} />
            <View style={[wch.accentSeg, { backgroundColor: '#CE1126' }]} />
            {/* divider */}
            <View style={[wch.accentSeg, { backgroundColor: 'transparent' }]} />
            {/* USA */}
            <View style={[wch.accentSeg, { backgroundColor: '#B22234' }]} />
            <View style={[wch.accentSeg, { backgroundColor: '#FFFFFF', opacity: 0.55 }]} />
            <View style={[wch.accentSeg, { backgroundColor: '#3C3B6E' }]} />
            {/* divider */}
            <View style={[wch.accentSeg, { backgroundColor: 'transparent' }]} />
            {/* CAN */}
            <View style={[wch.accentSeg, { backgroundColor: '#FF0000', opacity: 0.85 }]} />
            <View style={[wch.accentSeg, { backgroundColor: '#FFFFFF', opacity: 0.55 }]} />
            <View style={[wch.accentSeg, { backgroundColor: '#FF0000', opacity: 0.85 }]} />
          </View>
        )}

        {/* Trophy */}
        <Text style={wch.trophy}>🏆</Text>

        {/* Title — year comes from the selected season, so picking a past
            edition switches the entire branding to that year. */}
        <Text style={[wch.title, { color: titleColor, textShadowColor: titleShadowColor }]}>
          {t('worldcup.heroTitle', { year: yearLabel })}
        </Text>
        <View style={{ marginTop: 4 }}>
          <SeasonSelector
            seasons={seasons}
            selectedSeasonId={selectedSeasonId}
            onSelect={onSelectSeason}
            pillLabel={yearLabel}
            mode={isDark ? 'dark' : 'auto'}
          />
        </View>

        {/* Host flags — only for current edition (2026 → MX/USA/CAN) */}
        {isCurrentSeason && (
          <Text style={[wch.hosts, { color: hostsColor }]}>🇲🇽 · 🇺🇸 · 🇨🇦</Text>
        )}

        {/* Countdown — only for the current edition (past WCs already ended) */}
        {isCurrentSeason && wc.phase === 'pre' && (
          <View style={wch.countdownRow}>
            <WCTimerBlock isDark={isDark} value={padTwo(wc.days)}    label={t('preview.days').toUpperCase()} />
            <Text style={[wch.colon, !isDark && { color: 'rgba(13,31,56,0.25)' }]}>:</Text>
            <WCTimerBlock isDark={isDark} value={padTwo(wc.hours)}   label={t('preview.hours').toUpperCase()} />
            <Text style={[wch.colon, !isDark && { color: 'rgba(13,31,56,0.25)' }]}>:</Text>
            <WCTimerBlock isDark={isDark} value={padTwo(wc.minutes)} label={t('preview.minutes').toUpperCase()} />
            <Text style={[wch.colon, !isDark && { color: 'rgba(13,31,56,0.25)' }]}>:</Text>
            <WCTimerBlock isDark={isDark} value={padTwo(wc.seconds)} label={t('preview.seconds').toUpperCase()} />
          </View>
        )}

        {isCurrentSeason && wc.phase === 'live' && (
          <View style={wch.liveRow}>
            <View style={wch.liveDot} />
            <Text style={[wch.liveText, !isDark && { color: '#0D1F38' }]}>
              {t('worldcup.liveLabel')} · {t('worldcup.dayLabel', { n: wc.daysElapsed + 1 })}
            </Text>
          </View>
        )}

        {/* Follow button */}
        <TouchableOpacity
          style={[
            wch.followBtn,
            isFollowing
              ? { backgroundColor: '#00E096' }
              : { backgroundColor: followBgIdle, borderWidth: 1.5, borderColor: followBorderCol },
          ]}
          onPress={onToggleFollow}
          activeOpacity={0.8}
        >
          <Text style={[wch.followText, { color: isFollowing ? '#001A0D' : followTextIdle }]}>
            {isFollowing ? t('league.followingLeague') : t('league.followLeague')}
          </Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* Gold separator */}
      <LinearGradient
        colors={['transparent', '#C9A227', '#C9A227', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={wch.goldSep}
        pointerEvents="none"
      />
    </View>
  );
};

const wch = StyleSheet.create({
  gradient: {
    alignItems: 'center',
    paddingBottom: 22,
    gap: 8,
    overflow: 'hidden',
  },
  accentStrip: {
    flexDirection: 'row',
    width: '100%',
    height: 3,
  },
  accentSeg: { flex: 1 },
  trophy: { fontSize: 58, marginTop: 18, lineHeight: 68 },
  title: {
    fontSize: 26, fontWeight: '900', color: '#FFFFFF',
    letterSpacing: 4, textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  hosts: {
    fontSize: 16, color: 'rgba(255,255,255,0.6)',
    letterSpacing: 2, fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row', gap: 10, marginTop: 2,
  },
  statPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 14,
    minWidth: 76,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statPillValue: {
    fontSize: 22, fontWeight: '900', color: '#C9A227',
    lineHeight: 24,
  },
  statPillLabel: {
    fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.8, marginTop: 2,
  },
  countdownRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2,
  },
  timerBlock: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 8, paddingVertical: 6,
    borderRadius: 8,
    minWidth: 44,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  timerValue: {
    fontSize: 17, fontWeight: '900', color: '#FFFFFF',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
    lineHeight: 20,
  },
  timerLabel: {
    fontSize: 8, fontWeight: '800', color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.8, marginTop: 2,
  },
  colon: {
    fontSize: 17, fontWeight: '900', color: 'rgba(255,255,255,0.25)',
    lineHeight: 22,
  },
  liveRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2,
  },
  liveDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#FF453A',
  },
  liveText: {
    fontSize: 14, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5,
  },
  followBtn: {
    paddingHorizontal: 32, paddingVertical: 11,
    borderRadius: 22, marginTop: 6,
  },
  followText: { fontSize: 14, fontWeight: '800' },
  goldSep: {
    height: 2, width: '100%',
  },
});

// ── Converter: LeagueFixture → Match (for MatchDetail navigation) ────────────
function fixtureToMatch(f: LeagueFixture, leagueName: string, leagueLogo: string): Match {
  const s = f.stateShort;
  const status: MatchStatus =
    ['FT', 'AET', 'FT_PEN'].includes(s) ? 'finished' :
    ['1H', '2H', 'HT', 'ET', 'PEN'].includes(s) ? 'live' :
    'scheduled';

  // Display time: "HH:MM" for upcoming, state label for live, "FT" for finished
  const d = new Date(f.date);
  const timeStr = status === 'finished' ? 'FT'
    : status === 'live' ? s
    : `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;

  return {
    id: String(f.id),
    homeTeam: {
      id: String(f.homeTeamId),
      name: f.homeTeamName,
      shortName: f.homeTeamName.slice(0, 3).toUpperCase(),
      logo: f.homeTeamLogo,
    },
    awayTeam: {
      id: String(f.awayTeamId),
      name: f.awayTeamName,
      shortName: f.awayTeamName.slice(0, 3).toUpperCase(),
      logo: f.awayTeamLogo,
    },
    homeScore: f.homeScore ?? 0,
    awayScore: f.awayScore ?? 0,
    status,
    time: timeStr,
    league: leagueName,
    leagueLogo,
    leagueId: String(f.leagueId),
    date: f.date.slice(0, 10),
    seasonId: f.seasonId,
    startingAtUtc: f.date,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Calendario
// ══════════════════════════════════════════════════════════════════════════════

// ── Stage name → i18n key ─────────────────────────────────────────────────────
// SportMonks returns stage names in English. We map common ones to translation
// keys (defined under `league.stages.*` in es.ts / en.ts). Unknown stages fall
// through unchanged so the user still sees a label, just untranslated.
const STAGE_KEY: Record<string, string> = {
  'regular season':   'regularSeason',
  'group stage':      'groupStage',
  'play-offs':        'playoffs',
  'playoffs':         'playoffs',
  'play offs':        'playoffs',
  'relegation':       'relegation',
  'championship round': 'championshipRound',
  'round of 32':      'roundOf32',
  'round of 16':      'roundOf16',
  'quarter-finals':   'quarterFinals',
  'quarter finals':   'quarterFinals',
  'semi-finals':      'semiFinals',
  'semi finals':      'semiFinals',
  'final':            'final',
  '3rd place final':  'thirdPlace',
  'third place':      'thirdPlace',
};
function useTranslateStage() {
  const { t } = useTranslation();
  return (name: string): string => {
    const key = STAGE_KEY[name.toLowerCase()];
    return key ? t(`league.stages.${key}`) : name;
  };
}

const CalendarioTab: React.FC<{
  data: LeagueDetailData;
  scrollHostRef?: React.RefObject<any>;
}> = ({ data, scrollHostRef }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const translateStage = useTranslateStage();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();
  const { fixtures, leagueName, leagueLogo } = data;

  const handleFixturePress = (fix: LeagueFixture) => {
    navigation.push('MatchDetail', { match: fixtureToMatch(fix, leagueName, leagueLogo) });
  };

  // ── Auto-scroll to current matchday ─────────────────────────────────────────
  // Strategy: when the tab mounts (or fixtures change), find the most recent
  // date that's ≤ today (i.e. last finished or in-progress matchday). If we
  // haven't started yet (preseason), snap to the first upcoming date instead.
  // The user can scroll up for past matches, down for future matches.
  const dateNodeRefs = useRef<Map<string, View | null>>(new Map());
  const didAutoScrollRef = useRef(false);

  // Identify the target date once per fixtures-change.
  const targetDateKey = React.useMemo(() => {
    if (fixtures.length === 0) return null;
    const todayStr = new Date().toISOString().slice(0, 10);
    const allDates = Array.from(new Set(fixtures.map(f => f.date.slice(0, 10)))).sort();
    // Largest dateKey ≤ today
    let target: string | null = null;
    for (const d of allDates) {
      if (d <= todayStr) target = d;
      else break;
    }
    // If preseason (nothing past), snap to the first upcoming date
    return target ?? allDates[0] ?? null;
  }, [fixtures]);

  // Re-arm when fixtures change (season switch) so we re-scroll once.
  useEffect(() => { didAutoScrollRef.current = false; }, [fixtures]);

  const tryAutoScroll = () => {
    if (didAutoScrollRef.current || !targetDateKey || !scrollHostRef?.current) return;
    const node = dateNodeRefs.current.get(targetDateKey);
    if (!node) return;
    const scrollNode = findNodeHandle(scrollHostRef.current);
    if (!scrollNode) return;
    didAutoScrollRef.current = true;
    // Defer slightly so all sibling sections have a chance to lay out.
    requestAnimationFrame(() => {
      try {
        node.measureLayout(
          scrollNode,
          (_x, y) => {
            // Subtract a tiny offset so the date label peeks just under the sticky tab bar.
            scrollHostRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: false });
          },
          () => { /* measureLayout failed silently — best-effort */ },
        );
      } catch { /* noop */ }
    });
  };

  if (fixtures.length === 0) {
    return (
      <View style={ca.outer}>
        <View style={[ca.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[ca.empty, { color: c.textTertiary }]}>{t('league.noFixtures')}</Text>
        </View>
      </View>
    );
  }

  // Group by stage → within each stage, group by date
  const stageMap = new Map<string, { sortOrder: number; byDate: Map<string, LeagueFixture[]> }>();
  for (const fix of fixtures) {
    const stageKey = fix.stageName || 'Partidos';
    if (!stageMap.has(stageKey)) {
      stageMap.set(stageKey, { sortOrder: fix.stageSortOrder, byDate: new Map() });
    }
    const stage = stageMap.get(stageKey)!;
    const dateKey = fix.date.slice(0, 10); // "YYYY-MM-DD"
    if (!stage.byDate.has(dateKey)) stage.byDate.set(dateKey, []);
    stage.byDate.get(dateKey)!.push(fix);
  }

  // Sort stages by sort_order, then dates within each stage ascending
  const sortedStages = Array.from(stageMap.entries())
    .sort(([, a], [, b]) => a.sortOrder - b.sortOrder);

  return (
    <View style={ca.outer}>
      {sortedStages.map(([stageName, { byDate }]) => {
        const stageLabel = translateStage(stageName);
        const sortedDates = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
        const totalInStage = sortedDates.reduce((sum, [, fs]) => sum + fs.length, 0);
        return (
          <View key={stageName} style={[ca.card, { backgroundColor: c.card, borderColor: c.border }]}>
            {/* Stage header */}
            <View style={ca.stageHeader}>
              <Text style={[ca.sectionTitle, { color: c.textPrimary }]}>{stageLabel}</Text>
              <View style={[ca.stagePill, { backgroundColor: c.surface }]}>
                <Text style={[ca.stagePillText, { color: c.textTertiary }]}>
                  {t('league.matchesCount', { count: totalInStage })}
                </Text>
              </View>
            </View>

            {/* Fixtures grouped by date */}
            {sortedDates.map(([dateKey, dayFixtures]) => {
              // Parse date for display: "Jun 11"
              const [, mm, dd] = dateKey.split('-');
              const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
              const dateLabel = `${parseInt(dd, 10)} ${months[parseInt(mm, 10) - 1]}`;
              const isTarget = dateKey === targetDateKey;
              return (
                <View
                  key={dateKey}
                  ref={(n) => {
                    // Track the section we want to scroll to; once it's mounted,
                    // attempt the auto-scroll (best-effort, runs at most once).
                    if (isTarget) {
                      dateNodeRefs.current.set(dateKey, n);
                      if (n) tryAutoScroll();
                    }
                  }}
                  onLayout={isTarget ? tryAutoScroll : undefined}
                >
                  {/* Date divider */}
                  <View style={[ca.dateDivider, { borderTopColor: c.border }]}>
                    <Text style={[ca.dateDividerText, { color: c.accent }]}>{dateLabel}</Text>
                  </View>
                  {dayFixtures
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((fix, i) => (
                      <FixtureRow key={fix.id} fixture={fix} onPress={() => handleFixturePress(fix)} showDate={false} />
                    ))
                  }
                </View>
              );
            })}
          </View>
        );
      })}
      <View style={{ height: 16 }} />
    </View>
  );
};

const FixtureRow: React.FC<{ fixture: LeagueFixture; onPress?: () => void; showDate?: boolean }> = ({ fixture: f, onPress, showDate = true }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const { timeFormat } = useTimeFormat();
  const isFinished = f.stateShort === 'FT';
  const isLive = ['1H', '2H', 'HT', 'ET', 'PEN'].includes(f.stateShort);

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[ca.fixtureRow, { borderTopColor: c.border }]}
    >
      {/* Time column */}
      <View style={ca.dateCol}>
        {showDate && <Text style={[ca.dateText, { color: c.textTertiary }]}>{formatDate(f.date, t)}</Text>}
        <Text style={[ca.timeText, { color: isLive ? '#ef4444' : c.textTertiary }]}>
          {isLive ? t('league.live') : isFinished ? 'FT' : formatUtcTime(f.date, timeFormat)}
        </Text>
      </View>

      {/* Teams — translated to Spanish */}
      <View style={ca.teamsCol}>
        <View style={ca.teamLine}>
          <TeamLogo logo={f.homeTeamLogo} size={18} />
          <Text style={[ca.teamText, { color: c.textPrimary }]} numberOfLines={1}>
            {translateNationalTeam(f.homeTeamName)}
          </Text>
        </View>
        <View style={ca.teamLine}>
          <TeamLogo logo={f.awayTeamLogo} size={18} />
          <Text style={[ca.teamText, { color: c.textPrimary }]} numberOfLines={1}>
            {translateNationalTeam(f.awayTeamName)}
          </Text>
        </View>
      </View>

      {/* Score */}
      {(isFinished || isLive) && f.homeScore !== null && f.awayScore !== null ? (
        <View style={ca.scoreCol}>
          <Text style={[ca.scoreText, { color: isLive ? '#ef4444' : c.textPrimary }]}>{f.homeScore}</Text>
          <Text style={[ca.scoreText, { color: isLive ? '#ef4444' : c.textPrimary }]}>{f.awayScore}</Text>
        </View>
      ) : (
        <View style={ca.scoreCol}>
          <Text style={[ca.scorePlaceholder, { color: c.textTertiary }]}>-</Text>
          <Text style={[ca.scorePlaceholder, { color: c.textTertiary }]}>-</Text>
        </View>
      )}

      {/* Chevron */}
      <ChevronRight color={c.textTertiary} size={12} />
    </TouchableOpacity>
  );
};

const ca = StyleSheet.create({
  outer: { paddingHorizontal: 16, gap: 12 },
  card: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  empty: { fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  stageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '800' },
  stagePill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  stagePillText: { fontSize: 10, fontWeight: '600' },
  dateDivider: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4,
  },
  dateDividerText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  fixtureRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, gap: 10,
  },
  dateCol: { width: 44, alignItems: 'center' },
  dateText: { fontSize: 10, fontWeight: '700' },
  timeText: { fontSize: 10, fontWeight: '600', marginTop: 1 },
  teamsCol: { flex: 1, gap: 5 },
  teamLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamText: { fontSize: 13, fontWeight: '500', flexShrink: 1 },
  scoreCol: { width: 26, alignItems: 'center', gap: 5 },
  scoreText: { fontSize: 14, fontWeight: '900' },
  scorePlaceholder: { fontSize: 12, fontWeight: '600' },
});

// ══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════════════════════════════

export const LeagueDetailScreen: React.FC<Props> = ({ route }) => {
  const { leagueId, leagueName, leagueLogo, seasonId } = route.params;
  const c = useThemeColors();
  const { t } = useTranslation();
  const { isDark } = useDarkMode();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();
  const { isFollowingLeague, toggleFollowLeague } = useFavorites();

  // ── Season picker state ────────────────────────────────────────────────────
  // Lets the user navigate to past editions of the competition (WC 2014,
  // Premier League 2019/2020, etc.). Defaults to whatever season was passed
  // in route.params (the current season for normal navigation).
  const availableSeasons: AvailableSeason[] = useAvailableSeasons(leagueId);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(seasonId ?? null);

  const { data, loading } = useLeagueDetail(leagueId, leagueName, leagueLogo, selectedSeasonId ?? seasonId);

  const leagueConfig = getLeagueConfig(leagueId);
  const isCup = leagueConfig?.isCup ?? false;

  // Cup bracket — only fetched when the league is a cup competition
  const cupSeasonId = isCup
    ? (selectedSeasonId ?? data?.seasonId ?? leagueConfig?.currentSeasonId ?? null)
    : null;
  const { rounds: cupRoundsAll, loading: bracketLoading } = useCupBracket(cupSeasonId);

  // Is the user currently viewing the live/current season of this competition?
  const isCurrentSeason = (() => {
    if (!selectedSeasonId) return true; // default state before user picks
    const sel = availableSeasons.find(s => s.id === selectedSeasonId);
    return sel ? sel.current : (selectedSeasonId === leagueConfig?.currentSeasonId);
  })();
  // Only show knockout rounds in the Bracket tab (Group Stage is in Partidos)
  const cupRounds = cupRoundsAll.filter(r => {
    const n = r.name.toLowerCase();
    return !n.includes('group') && !n.includes('grupo') && !n.includes('fase de grupos');
  });

  const isFollowing = isFollowingLeague(String(leagueId));

  // ── Tabs — for cups: Partidos first, then Bracket; for leagues: Tabla first ──
  const TABS: { key: Tab; label: string }[] = isCup
    ? [
        { key: 'partidos',      label: t('league.matchesTab') },
        { key: 'grupos',        label: t('cup.groupsTab') },
        { key: 'clasificacion', label: t('cup.bracket') },
        { key: 'goleadores',    label: t('league.scorersTab') },
        { key: 'asistencias',   label: t('league.assistsTab') },
        { key: 'equipos',       label: t('league.teamsTab') },
      ]
    : [
        { key: 'clasificacion', label: t('league.standingsTab') },
        { key: 'partidos',      label: t('league.matchesTab') },
        { key: 'goleadores',    label: t('league.scorersTab') },
        { key: 'asistencias',   label: t('league.assistsTab') },
        { key: 'equipos',       label: t('league.teamsTab') },
      ];
  const [activeTab, setActiveTab] = useState<Tab>(isCup ? 'partidos' : 'clasificacion');

  // ── Scroll animation ──
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollHostRef = useRef<any>(null);
  const [showCompact, setShowCompact] = useState(false);

  // ── Header theme colors ──
  const headerBg   = c.bg;
  const hText      = isDark ? '#fff' : '#111827';
  const hTextSoft  = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(17,24,39,0.5)';
  const hBtnBg     = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)';
  const hBorderCol = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.2)';

  // ── Display values ──
  // Trademark-sensitive overrides (e.g. FIFA World Cup) come from the shared
  // helpers in src/config/leagues.ts — see COPYRIGHT_SENSITIVE_LEAGUE_IDS.
  // For these leagues we replace the SportMonks-supplied name and remote
  // logo with curated values from our own config.
  const leagueCfg = leagueId ? getLeagueConfig(leagueId) : undefined;
  const suppressRemoteLogo = leagueId ? isCopyrightSensitiveLeague(leagueId) : false;
  const apiOrParamName = data?.leagueName || leagueName;
  const displayName = leagueId ? getLeagueDisplayName(leagueId, apiOrParamName) : apiOrParamName;
  // Use ONLY the real image_path from API or nav params — never construct
  // URLs because SportMonks uses sharded folder paths (e.g. /leagues/2/1122.png)
  // that we cannot predict from the league id alone.
  const displayLogo = suppressRemoteLogo
    ? '' // force fallback to emoji
    : (data?.leagueLogo || leagueLogo || '');
  const fallbackEmoji = suppressRemoteLogo ? (leagueCfg?.flag || '🌍') : '🏆';
  const displayFlag = data?.countryFlag || '';
  const displayCountry = translateLeagueCountry(data?.country || '');
  const displaySeason = data?.seasonName || '';
  const teamsCount = data?.standings.length || data?.teams.length || 0;

  // ── Share ──
  let Sharing: any = null;
  try { Sharing = require('expo-sharing'); } catch {}
  const handleShare = async () => {
    if (!Sharing) return;
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(`https://www.sportmonks.com`, {
          dialogTitle: `${displayName} — Analistas`,
        });
      }
    } catch {}
  };

  // ── Bracket tap → navigate to MatchDetail ──
  const handlePressTie = (tie: CupTie) => {
    const leg = tie.legs[0];
    if (!leg) return;
    const match: Match = {
      id: leg.fixtureId,
      homeTeam: {
        id: tie.homeTeam.id,
        name: tie.homeTeam.name,
        shortName: tie.homeTeam.name.slice(0, 3).toUpperCase(),
        logo: tie.homeTeam.logo,
      },
      awayTeam: {
        id: tie.awayTeam.id,
        name: tie.awayTeam.name,
        shortName: tie.awayTeam.name.slice(0, 3).toUpperCase(),
        logo: tie.awayTeam.logo,
      },
      homeScore: leg.homeScore ?? 0,
      awayScore: leg.awayScore ?? 0,
      status: tie.isFinished ? 'finished' : 'scheduled',
      time: tie.isFinished ? 'FT' : '',
      league: displayName,
      leagueId: String(leagueId),
      date: leg.date,
    };
    navigation.push('MatchDetail', { match });
  };

  // ── Loading ──
  if (loading && !data) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: c.bg }]} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <SkeletonLeagueDetail />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: c.bg }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── Back + Actions bar (with compact league name on scroll) ── */}
      <View style={[s.topBar, { backgroundColor: headerBg }]}>
        <TouchableOpacity style={[s.backBtn, { backgroundColor: hBtnBg }]} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <BackArrow color={hText} />
        </TouchableOpacity>

        {/* Compact center — always rendered as spacer; content appears on scroll */}
        <View style={s.compactCenter}>
          {showCompact
            ? <Text style={{ fontSize: 15 }}>{leagueId === 732 ? '🏆' : (displayFlag || null)}</Text>
            : null}
          {showCompact
            ? <Text style={[s.compactName, { color: hText }]} numberOfLines={1}>{displayName}</Text>
            : null}
        </View>

        <TouchableOpacity style={[s.actionBtn, { backgroundColor: hBtnBg }]} onPress={handleShare} activeOpacity={0.7}>
          <ShareIcon color={hText} size={16} />
        </TouchableOpacity>
      </View>

      <Animated.ScrollView
        ref={scrollHostRef}
        showsVerticalScrollIndicator={false}
        onScroll={(e: any) => {
          const y = e.nativeEvent.contentOffset.y;
          scrollY.setValue(y);
          setShowCompact(y > 80);
        }}
        scrollEventThrottle={16}
        stickyHeaderIndices={[1]}
      >
        {/* ── Hero Header ── */}
        {leagueId === 732 ? (
          <WorldCupHeroHeader
            isFollowing={isFollowing}
            onToggleFollow={() => toggleFollowLeague(String(leagueId))}
            t={t}
            seasons={availableSeasons}
            selectedSeasonId={selectedSeasonId ?? seasonId ?? null}
            onSelectSeason={setSelectedSeasonId}
            isCurrentSeason={isCurrentSeason}
          />
        ) : (
          <View style={[s.hero, { backgroundColor: headerBg }]}>
            {/* League logo */}
            <View style={[s.leagueLogoWrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' }]}>
              {displayLogo?.startsWith('http') ? (
                <Image source={{ uri: displayLogo }} style={s.leagueLogo} resizeMode="contain" />
              ) : (
                <Text style={{ fontSize: 56 }}>{fallbackEmoji}</Text>
              )}
            </View>

            {/* League name */}
            <Text style={[s.heroName, { color: hText }]}>{displayName}</Text>

            {/* Country + Season */}
            <View style={s.heroSubRow}>
              {displayFlag ? <Text style={{ fontSize: 14 }}>{displayFlag}</Text> : null}
              {displayCountry ? (
                <Text style={[s.heroCountry, { color: hTextSoft }]}>{displayCountry}</Text>
              ) : null}
              {/* When multiple seasons are available, replace the static
                  season label with a tappable picker. Falls back to the
                  plain text label for leagues with only one known season. */}
              {availableSeasons.length > 1 ? (
                <>
                  <Text style={[s.heroDot, { color: hTextSoft }]}>·</Text>
                  <SeasonSelector
                    seasons={availableSeasons}
                    selectedSeasonId={selectedSeasonId ?? seasonId ?? null}
                    onSelect={setSelectedSeasonId}
                    mode="auto"
                  />
                </>
              ) : displaySeason ? (
                <>
                  <Text style={[s.heroDot, { color: hTextSoft }]}>·</Text>
                  <Text style={[s.heroSeason, { color: hTextSoft }]}>{displaySeason}</Text>
                </>
              ) : null}
            </View>

            {/* Stats strip */}
            <View style={s.statsStrip}>
              {[
                { label: t('league.teamsLabel'), value: teamsCount },
                { label: t('league.matchdaysLabel'), value: data?.standings[0]?.played || '-' },
              ].map((st, i) => (
                <View key={i} style={s.statItem}>
                  <Text style={[s.statValue, { color: hText }]}>{st.value}</Text>
                  <Text style={[s.statLabel, { color: hTextSoft }]}>{st.label}</Text>
                </View>
              ))}
            </View>

            {/* Follow button */}
            <TouchableOpacity
              style={[
                s.followBtn,
                isFollowing
                  ? { backgroundColor: c.accent }
                  : { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: hBorderCol },
              ]}
              onPress={() => toggleFollowLeague(String(leagueId))}
              activeOpacity={0.8}
            >
              <Text style={[
                s.followText,
                { color: isFollowing ? '#fff' : hText },
              ]}>
                {isFollowing ? t('league.followingLeague') : t('league.followLeague')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Tab bar (sticky, scrollable) ── */}
        <View style={[s.tabBar, { backgroundColor: c.bg, borderBottomColor: c.border }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.tabBarContent}
          >
            {TABS.map(tab => {
              const active = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[s.tab, active && { borderBottomColor: c.accent, borderBottomWidth: 2 }]}
                  onPress={() => setActiveTab(tab.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.tabText, { color: active ? c.accent : c.textTertiary }]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Tab content ── */}
        <View style={s.tabContent}>
          {data ? (
            activeTab === 'clasificacion' ? (
              isCup ? (
                bracketLoading
                  ? <ActivityIndicator style={{ marginTop: 48 }} color={c.accent} />
                  : cupRounds.length > 0
                    ? <CupBracketView
                        rounds={cupRounds}
                        leagueName={displayName}
                        seasonStr={data.seasonName}
                        onPressTie={handlePressTie}
                      />
                    : <View style={s.loadingWrap}>
                        <Text style={[s.loadingText, { color: c.textTertiary }]}>{t('cup.bracketUnavailable')}</Text>
                      </View>
              ) : <ClasificacionTab data={data} />
            ) :
            activeTab === 'partidos'      ? <CalendarioTab data={data} scrollHostRef={scrollHostRef} /> :
            activeTab === 'grupos'        ? <ClasificacionTab data={data} /> :
            activeTab === 'goleadores'    ? <GoleadoresTab data={data} /> :
            activeTab === 'asistencias'   ? <StatListTab data={data} type="assists" /> :
            activeTab === 'equipos'       ? <EquiposTab data={data} /> :
            null
          ) : (
            <View style={s.loadingWrap}>
              <Text style={[s.loadingText, { color: c.textTertiary }]}>{t('league.noData')}</Text>
            </View>
          )}
        </View>
      </Animated.ScrollView>
    </SafeAreaView>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 13, fontWeight: '500' },

  // Compact center (inside topBar)
  compactCenter: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6,
  },
  compactName: { fontSize: 15, fontWeight: '800' },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8, zIndex: 20,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  actionBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },

  // Hero
  hero: {
    alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20, gap: 10,
  },
  leagueLogoWrap: {
    width: 80, height: 80, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  leagueLogo: { width: 56, height: 56 },
  heroName: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  heroSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroCountry: { fontSize: 14, fontWeight: '600' },
  heroDot: { fontSize: 14 },
  heroSeason: { fontSize: 14, fontWeight: '600' },

  statsStrip: {
    flexDirection: 'row', gap: 30, marginTop: 4,
  },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '900' },
  statLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },

  followBtn: {
    paddingHorizontal: 28, paddingVertical: 10, borderRadius: 20, marginTop: 4,
  },
  followText: { fontSize: 14, fontWeight: '700' },

  // Tab bar (scrollable)
  tabBar: {
    borderBottomWidth: 1,
  },
  tabBarContent: {
    flexDirection: 'row',
    paddingHorizontal: 8,
  },
  tab: {
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 18,
    paddingBottom: 9,
  },
  tabText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.1 },

  tabContent: { paddingTop: 14 },
});
