// ── League Detail Screen ──────────────────────────────────────────────────────
// Full league profile: collapsible header, 4 tabs (Clasificación, Goleadores,
// Equipos, Calendario). Dark/Light mode responsive. Uses SportMonks data.
import React, { useState, useRef } from 'react';
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
import { SkeletonLeagueDetail } from '../components/Skeleton';
import { useDarkMode } from '../contexts/DarkModeContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { useLeagueDetail } from '../hooks/useLeagueDetail';
import { useCupBracket } from '../hooks/useCupBracket';
import { CupBracketView } from '../components/CupBracketView';
import type {
  LeagueDetailData,
  LeagueStandingRow,
  TopScorerRow,
  LeagueTeam,
  LeagueFixture,
} from '../hooks/useLeagueDetail';
import type { PartidosStackParamList } from '../navigation/AppNavigator';
import { getLeagueConfig } from '../config/leagues';
import type { LeagueZone } from '../config/leagues';
import type { Match, MatchStatus } from '../data/types';
import { BackArrow, ShareIcon } from '../components/NavIcons';
import { useTimeFormat } from '../contexts/TimeFormatContext';
import { formatUtcTime } from '../utils/formatMatchTime';

type Props = NativeStackScreenProps<PartidosStackParamList, 'LeagueDetail'>;
type Tab = 'clasificacion' | 'goleadores' | 'asistencias' | 'tarjetas' | 'equipos' | 'calendario';


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

const ClasificacionTab: React.FC<{ data: LeagueDetailData }> = ({ data }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();
  const { standings } = data;

  // Zones: use per-league config if available, else generic fallback legend
  const leagueZones = getLeagueConfig(data.leagueId)?.zones;

  // Build legend from only the zones that actually appear in the current standings
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

  if (standings.length === 0) {
    return (
      <View style={cl.outer}>
        <View style={[cl.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[cl.empty, { color: c.textTertiary }]}>{t('league.standingsUnavailable')}</Text>
        </View>
      </View>
    );
  }

  const totalTeams = standings.length;

  return (
    <View style={cl.outer}>
      <View style={[cl.card, { backgroundColor: c.card, borderColor: c.border }]}>
        {/* Header */}
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

        {standings.map((row, idx) => {
          const zoneColor = getZoneColor(row.position, totalTeams, leagueZones);
          const gd = row.goalDifference > 0 ? `+${row.goalDifference}` : `${row.goalDifference}`;
          const gdColor = row.goalDifference > 0 ? '#10b981' : row.goalDifference < 0 ? '#ef4444' : c.textTertiary;
          const showGroupDivider = idx > 0 && row.groupId != null && standings[idx - 1].groupId != null && row.groupId !== standings[idx - 1].groupId;

          return (
            <React.Fragment key={row.teamId}>
            {showGroupDivider && <View style={{ height: 2, backgroundColor: c.border, marginVertical: 2 }} />}
            <TouchableOpacity
              style={[cl.row, { borderBottomColor: c.border }]}
              activeOpacity={0.7}
              onPress={() => navigation.push('TeamDetail', {
                teamId: row.teamId,
                teamName: row.teamName,
                teamLogo: row.teamLogo,
                seasonId: data.seasonId,
              })}
            >
              <View style={[cl.zoneBar, { backgroundColor: zoneColor || 'transparent' }]} />
              <Text style={[cl.pos, { color: zoneColor || c.textTertiary }]}>{row.position}</Text>
              <View style={cl.logoCell}>
                <TeamLogo logo={row.teamLogo} size={22} />
              </View>
              <View style={cl.nameWrap}>
                <Text style={[cl.name, { color: c.textPrimary }]} numberOfLines={1}>{row.teamName}</Text>
              </View>
              <Text style={[cl.num, { color: c.textSecondary }]}>{row.played}</Text>
              <Text style={[cl.num, { color: c.textSecondary }]}>{row.won}</Text>
              <Text style={[cl.num, { color: c.textSecondary }]}>{row.drawn}</Text>
              <Text style={[cl.num, { color: c.textSecondary }]}>{row.lost}</Text>
              <Text style={[cl.gfga, { color: c.textTertiary }]}>{row.goalsFor}-{row.goalsAgainst}</Text>
              <Text style={[cl.gd, { color: gdColor }]}>{gd}</Text>
              <Text style={[cl.pts, { color: c.textPrimary }]}>{row.points}</Text>
            </TouchableOpacity>
            </React.Fragment>
          );
        })}
      </View>

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

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Goleadores
// ══════════════════════════════════════════════════════════════════════════════

const GoleadoresTab: React.FC<{ data: LeagueDetailData }> = ({ data }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();
  const { topScorers } = data;

  if (topScorers.length === 0) {
    return (
      <View style={gs.outer}>
        <View style={[gs.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[gs.empty, { color: c.textTertiary }]}>{t('league.noScorers')}</Text>
        </View>
      </View>
    );
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
    return (
      <View style={gs.outer}>
        <View style={[gs.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[gs.empty, { color: c.textTertiary }]}>{emptyTx}</Text>
        </View>
      </View>
    );
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
                <Text style={[eq.teamName, { color: c.textPrimary }]} numberOfLines={2}>{team.name}</Text>
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

const CalendarioTab: React.FC<{ data: LeagueDetailData }> = ({ data }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const { timeFormat } = useTimeFormat();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();
  const { fixtures, leagueName, leagueLogo } = data;

  const handleFixturePress = (fix: LeagueFixture) => {
    navigation.push('MatchDetail', { match: fixtureToMatch(fix, leagueName, leagueLogo) });
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

  // Separate into past and upcoming
  const now = new Date();
  const past = fixtures.filter(f => new Date(f.date) < now && f.stateShort === 'FT').reverse();
  const upcoming = fixtures.filter(f => new Date(f.date) >= now || (f.stateShort !== 'FT' && f.stateShort !== 'NS'));
  const notStarted = fixtures.filter(f => f.stateShort === 'NS' && new Date(f.date) >= now);

  return (
    <View style={ca.outer}>
      {/* Upcoming / Live */}
      {(upcoming.length > 0 || notStarted.length > 0) && (
        <View style={[ca.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[ca.sectionTitle, { color: c.textPrimary }]}>{t('league.upcomingFixtures')}</Text>
          {[...upcoming, ...notStarted.filter(f => !upcoming.includes(f))].slice(0, 10).map((fix, i) => (
            <FixtureRow key={`${fix.id}-${i}`} fixture={fix} onPress={() => handleFixturePress(fix)} />
          ))}
        </View>
      )}

      {/* Recent results */}
      {past.length > 0 && (
        <View style={[ca.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[ca.sectionTitle, { color: c.textPrimary }]}>{t('league.recentResults')}</Text>
          {past.slice(0, 10).map((fix, i) => (
            <FixtureRow key={`${fix.id}-${i}`} fixture={fix} onPress={() => handleFixturePress(fix)} />
          ))}
        </View>
      )}

      <View style={{ height: 16 }} />
    </View>
  );
};

const FixtureRow: React.FC<{ fixture: LeagueFixture; onPress?: () => void }> = ({ fixture: f, onPress }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const isFinished = f.stateShort === 'FT';
  const isLive = ['1H', '2H', 'HT', 'ET', 'PEN'].includes(f.stateShort);

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[ca.fixtureRow, { borderTopColor: c.border }]}
    >
      {/* Date/Time */}
      <View style={ca.dateCol}>
        <Text style={[ca.dateText, { color: c.textTertiary }]}>{formatDate(f.date, t)}</Text>
        <Text style={[ca.timeText, { color: isLive ? '#ef4444' : c.textTertiary }]}>
          {isLive ? t('league.live') : isFinished ? 'FT' : formatUtcTime(f.date, timeFormat)}
        </Text>
      </View>

      {/* Teams */}
      <View style={ca.teamsCol}>
        <View style={ca.teamLine}>
          <TeamLogo logo={f.homeTeamLogo} size={18} />
          <Text style={[ca.teamText, { color: c.textPrimary }]} numberOfLines={1}>{f.homeTeamName}</Text>
        </View>
        <View style={ca.teamLine}>
          <TeamLogo logo={f.awayTeamLogo} size={18} />
          <Text style={[ca.teamText, { color: c.textPrimary }]} numberOfLines={1}>{f.awayTeamName}</Text>
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

      {/* Chevron — indicates row is tappable */}
      <ChevronRight color={c.textTertiary} size={12} />
    </TouchableOpacity>
  );
};

const ca = StyleSheet.create({
  outer: { paddingHorizontal: 16, gap: 12 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  empty: { fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  fixtureRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderTopWidth: 1, gap: 10,
  },
  dateCol: { width: 52, alignItems: 'center' },
  dateText: { fontSize: 11, fontWeight: '700' },
  timeText: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  teamsCol: { flex: 1, gap: 6 },
  teamLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamText: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  scoreCol: { width: 28, alignItems: 'center', gap: 6 },
  scoreText: { fontSize: 15, fontWeight: '900' },
  scorePlaceholder: { fontSize: 13, fontWeight: '600' },
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

  const { data, loading } = useLeagueDetail(leagueId, leagueName, leagueLogo, seasonId);

  const leagueConfig = getLeagueConfig(leagueId);
  const isCup = leagueConfig?.isCup ?? false;

  // Cup bracket — only fetched when the league is a cup competition
  const cupSeasonId = isCup ? (data?.seasonId ?? leagueConfig?.currentSeasonId ?? null) : null;
  const { rounds: cupRounds, loading: bracketLoading } = useCupBracket(cupSeasonId);

  const isFollowing = isFollowingLeague(String(leagueId));

  // ── Tabs ──
  const TABS: { key: Tab; label: string }[] = [
    { key: 'clasificacion', label: isCup ? t('cup.bracket') : t('league.standingsTab') },
    { key: 'goleadores',    label: t('league.scorersTab') },
    { key: 'asistencias',  label: t('league.assistsTab') },
    { key: 'tarjetas',     label: t('league.cardsTab') },
    { key: 'equipos',      label: t('league.teamsTab') },
    { key: 'calendario',   label: t('league.calendarTab') },
  ];
  const [activeTab, setActiveTab] = useState<Tab>('clasificacion');

  // ── Scroll animation ──
  const scrollY = useRef(new Animated.Value(0)).current;
  const [showCompact, setShowCompact] = useState(false);

  // ── Header theme colors ──
  const headerBg   = c.bg;
  const hText      = isDark ? '#fff' : '#111827';
  const hTextSoft  = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(17,24,39,0.5)';
  const hBtnBg     = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)';
  const hBorderCol = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.2)';

  // ── Display values ──
  const displayName = data?.leagueName || leagueName;
  const displayLogo = data?.leagueLogo
    || leagueLogo
    || (leagueId ? `https://cdn.sportmonks.com/images/soccer/leagues/${leagueId}.png` : '');
  const displayFlag = data?.countryFlag || '';
  const displayCountry = data?.country || '';
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
          {showCompact && displayFlag ? <Text style={{ fontSize: 15 }}>{displayFlag}</Text> : null}
          {showCompact ? <Text style={[s.compactName, { color: hText }]} numberOfLines={1}>{displayName}</Text> : null}
        </View>

        <TouchableOpacity style={[s.actionBtn, { backgroundColor: hBtnBg }]} onPress={handleShare} activeOpacity={0.7}>
          <ShareIcon color={hText} size={16} />
        </TouchableOpacity>
      </View>

      <Animated.ScrollView
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
        <View style={[s.hero, { backgroundColor: headerBg }]}>
          {/* League logo */}
          <View style={[s.leagueLogoWrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' }]}>
            {displayLogo?.startsWith('http') ? (
              <Image source={{ uri: displayLogo }} style={s.leagueLogo} resizeMode="contain" />
            ) : (
              <Text style={{ fontSize: 40 }}>🏆</Text>
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
            {displaySeason ? (
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
                      />
                    : <View style={s.loadingWrap}>
                        <Text style={[s.loadingText, { color: c.textTertiary }]}>{t('cup.bracketUnavailable')}</Text>
                      </View>
              ) : <ClasificacionTab data={data} />
            ) :
            activeTab === 'goleadores'    ? <GoleadoresTab data={data} /> :
            activeTab === 'asistencias'   ? <StatListTab data={data} type="assists" /> :
            activeTab === 'tarjetas'      ? <StatListTab data={data} type="cards" /> :
            activeTab === 'equipos'       ? <EquiposTab data={data} /> :
            activeTab === 'calendario'    ? <CalendarioTab data={data} /> :
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
