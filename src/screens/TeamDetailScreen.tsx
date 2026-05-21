// ── Team Detail Screen ────────────────────────────────────────────────────────
// Premium national-team page inspired by FotMob + BeSoccer.
// Tabs: Resumen → Partidos → Plantilla → Tabla
// Dark/Light mode. All strings via i18n. Real SportMonks data.
import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../theme/useTheme';
import { useDarkMode } from '../contexts/DarkModeContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { useTeamDetail } from '../hooks/useTeamDetail';
import type { PartidosStackParamList } from '../navigation/AppNavigator';
import type { TeamDetailData, SquadPlayer, RecentMatch, FormEntry } from '../hooks/useTeamDetail';
import type { LeagueStanding, Match } from '../data/types';
import { SkeletonTeamDetail } from '../components/Skeleton';
import { BackArrow, ShareIcon } from '../components/NavIcons';
import { translateNationalTeam } from '../utils/nationalTeams';
import { CupBracketView } from '../components/CupBracketView';
import { useCupBracket } from '../hooks/useCupBracket';
import type { CupTie } from '../services/sportsApi';

type Props = NativeStackScreenProps<PartidosStackParamList, 'TeamDetail'>;
type Tab = 'resumen' | 'partidos' | 'plantilla' | 'tabla' | 'bracket';
type MatchFilter = 'all' | 'wc' | 'friendly';

// ── Competition classifier ───────────────────────────────────────────────────
type CompType = 'wc' | 'friendly' | 'other';
interface CompInfo { type: CompType; badge: string; color: string; short: string }

function getCompetitionInfo(leagueName: string): CompInfo {
  const n = leagueName.toLowerCase();
  if (n.includes('world cup') || n.includes('copa del mundo') || n.includes('mundial') || n.includes('fifa wc')) {
    return { type: 'wc', badge: '🏆', color: '#C9A227', short: 'Copa' };
  }
  if (n.includes('friendly') || n.includes('amistoso') || n.includes('nations') || n.includes('naciones')) {
    return { type: 'friendly', badge: '🤝', color: '#8E8E93', short: 'Amistoso' };
  }
  return { type: 'other', badge: '🏟️', color: '#60a5fa', short: leagueName.slice(0, 12) };
}

// ── Date formatter ───────────────────────────────────────────────────────────
function formatMatchDate(dateStr: string, monthsAbbr: string[]): string {
  const [, mm, dd] = dateStr.split('-');
  const month = monthsAbbr[parseInt(mm, 10) - 1] ?? '';
  return `${parseInt(dd, 10)} ${month.toLowerCase()}`;
}

// ── Logo component — graceful fallback ───────────────────────────────────────
const TeamLogo: React.FC<{ uri: string; size: number; radius?: number }> = ({ uri, size, radius }) => {
  const r = radius ?? size / 2;
  if (uri?.startsWith('http')) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: r }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.4 }}>⚽</Text>
    </View>
  );
};

// ── Form badges — score bubbles (new design) ─────────────────────────────────
const FormBadges: React.FC<{ form: FormEntry[]; recentMatches: RecentMatch[] }> = ({ form, recentMatches }) => {
  const colors = { W: '#10b981', D: '#f59e0b', L: '#ef4444' };
  // Build score label from matching finished matches
  const finished = recentMatches.filter(m => m.result !== null).slice(0, 5);
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {form.map((f, i) => {
        const m = finished[i];
        const label = m ? `${m.homeScore}-${m.awayScore}` : f.result;
        return (
          <View key={i} style={{
            minWidth: 32, height: 26, borderRadius: 7,
            backgroundColor: colors[f.result],
            alignItems: 'center', justifyContent: 'center',
            paddingHorizontal: 5,
          }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// RESUMEN TAB
// ════════════════════════════════════════════════════════════════════════════

const ResumenTab: React.FC<{ data: TeamDetailData; teamId: number }> = ({ data, teamId }) => {
  const { t } = useTranslation();
  const c = useThemeColors();
  const { isDark } = useDarkMode();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();
  const monthsAbbr = t('dates.monthsAbbr', { returnObjects: true }) as string[];

  const textSec = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
  const cardBg  = c.surface;
  const border  = c.border;

  // Split matches into past / future
  const today = new Date().toISOString().split('T')[0];
  const pastMatches   = data.recentMatches.filter(m => m.isFinished || m.date <= today);
  const futureMatches = data.recentMatches.filter(m => !m.isFinished && m.date > today);
  const lastMatch  = pastMatches[0] ?? null;
  const nextMatch  = futureMatches[futureMatches.length - 1] ?? null; // furthest future is last element after sort

  // Actually futureMatches come from sortedRecent (desc), so the nearest next match is the last one
  // Let's get the actual nearest upcoming: filter raw recentMatches for upcoming, sort asc
  const upcomingSorted = data.recentMatches
    .filter(m => !m.isFinished && m.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const nextUp = upcomingSorted[0] ?? null;

  // Group standing
  const teamStanding = data.teamStanding;
  const groupStandings = useMemo(() => {
    if (!teamStanding?.groupId) return data.standings.slice(0, 4);
    return data.standings.filter(s => s.groupId === teamStanding.groupId);
  }, [data.standings, teamStanding]);

  // Coach
  const { coach, coachImage, coachAge } = data.info;

  // Navigate to match detail
  const goToMatch = useCallback((m: RecentMatch) => {
    const match: Match = {
      id: String(m.id),
      homeTeam: { id: String(m.homeId), name: m.homeName, shortName: m.homeShort, logo: m.homeLogo },
      awayTeam: { id: String(m.awayId), name: m.awayName, shortName: m.awayShort, logo: m.awayLogo },
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      status: m.isFinished ? 'finished' : 'scheduled',
      time: m.isFinished ? 'FT' : '',
      league: m.league || data.info.leagueName,
      leagueId: String(data.info.leagueId),
      date: m.date,
    };
    navigation.navigate('MatchDetail', { match });
  }, [navigation, data.info]);

  // ── Match card (last or next) ────────────────────────────────────────────
  const MatchCard: React.FC<{ match: RecentMatch; isNext?: boolean }> = ({ match, isNext }) => {
    const comp = getCompetitionInfo(match.league);
    const dateStr = formatMatchDate(match.date, monthsAbbr);
    const isHome = match.isHome;
    const result = match.result;
    const resultColor = result === 'W' ? '#10b981' : result === 'L' ? '#ef4444' : '#f59e0b';

    return (
      <TouchableOpacity
        onPress={() => goToMatch(match)}
        activeOpacity={0.75}
        style={[rs.matchCard, { backgroundColor: cardBg, borderColor: border }]}
      >
        {/* Competition badge */}
        <View style={rs.matchCardTop}>
          <View style={[rs.compBadge, { backgroundColor: comp.color + '22' }]}>
            <Text style={[rs.compBadgeText, { color: comp.color }]}>{comp.badge} {comp.short}</Text>
          </View>
          <Text style={[rs.matchDateText, { color: textSec }]}>{dateStr}</Text>
        </View>

        {/* Teams + score */}
        <View style={rs.matchTeamsRow}>
          {/* Home */}
          <View style={[rs.matchTeamBlock, { alignItems: 'flex-end' }]}>
            <Text style={[rs.matchTeamName, { color: c.textPrimary }]} numberOfLines={1}>{translateNationalTeam(match.homeName)}</Text>
            <TeamLogo uri={match.homeLogo} size={40} radius={6} />
          </View>

          {/* Score or VS */}
          <View style={rs.scoreBlock}>
            {match.isFinished ? (
              <>
                <Text style={[rs.scoreBig, { color: c.textPrimary }]}>{match.homeScore}</Text>
                <Text style={[rs.scoreSep, { color: textSec }]}>–</Text>
                <Text style={[rs.scoreBig, { color: c.textPrimary }]}>{match.awayScore}</Text>
              </>
            ) : (
              <Text style={[rs.scoreVS, { color: textSec }]}>VS</Text>
            )}
            {result && (
              <View style={[rs.resultPill, { backgroundColor: resultColor }]}>
                <Text style={rs.resultPillText}>{t(`team.formLabels.${result}`)}</Text>
              </View>
            )}
          </View>

          {/* Away */}
          <View style={[rs.matchTeamBlock, { alignItems: 'flex-start' }]}>
            <Text style={[rs.matchTeamName, { color: c.textPrimary }]} numberOfLines={1}>{translateNationalTeam(match.awayName)}</Text>
            <TeamLogo uri={match.awayLogo} size={40} radius={6} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ── Mini group table ─────────────────────────────────────────────────────
  const MiniGroupTable: React.FC = () => {
    if (groupStandings.length === 0) return null;
    // Detect group letter from first standing
    const firstStanding = groupStandings[0];
    const groupName = (firstStanding as any).group_name ?? (firstStanding as any).groupName ?? '';
    const letter = groupName.replace(/[^A-Z]/gi, '').toUpperCase().slice(-1) || '';

    return (
      <View style={[rs.sectionCard, { backgroundColor: cardBg, borderColor: border }]}>
        <View style={rs.sectionHeader}>
          <Text style={[rs.sectionTitle, { color: c.textPrimary }]}>{t('team.groupIn')}</Text>
          {letter ? <Text style={[rs.sectionBadge, { color: c.accent }]}>GRUPO {letter}</Text> : null}
        </View>
        {/* Header row */}
        <View style={[rs.tableHeaderRow, { borderBottomColor: border }]}>
          <Text style={[rs.thPos, { color: textSec }]}>#</Text>
          <Text style={[rs.thTeam, { color: textSec }]}>{t('team.squadTab')}</Text>
          <Text style={[rs.thStat, { color: textSec }]}>J</Text>
          <Text style={[rs.thStat, { color: textSec }]}>G</Text>
          <Text style={[rs.thStat, { color: textSec }]}>E</Text>
          <Text style={[rs.thStat, { color: textSec }]}>P</Text>
          <Text style={[rs.thPts, { color: textSec }]}>PTS</Text>
        </View>
        {groupStandings.slice(0, 4).map((s, idx) => {
          const isCurrentTeam = s.team.id === String(teamId);
          const rowBg = isCurrentTeam ? (c.accent + '18') : 'transparent';
          // Zone: top 2 advance, 3rd=best 3rd (lighter), 4th=out
          const zoneColor = idx < 2 ? c.accent : idx === 2 ? '#f59e0b' : '#ef4444';
          return (
            <View key={s.team.id} style={[rs.tableRow, { backgroundColor: rowBg, borderTopColor: border }]}>
              <View style={[rs.zoneBar, { backgroundColor: zoneColor }]} />
              <Text style={[rs.tdPos, { color: c.textPrimary, fontWeight: isCurrentTeam ? '800' : '500' }]}>{s.position}</Text>
              <View style={rs.tdTeamCell}>
                {s.team.logo?.startsWith('http')
                  ? <Image source={{ uri: s.team.logo }} style={rs.miniLogo} />
                  : <View style={[rs.miniLogo, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
                }
                <Text style={[rs.tdTeamName, { color: c.textPrimary, fontWeight: isCurrentTeam ? '700' : '400' }]} numberOfLines={1}>
                  {translateNationalTeam(s.team.name)}
                </Text>
              </View>
              <Text style={[rs.tdStat, { color: textSec }]}>{s.played}</Text>
              <Text style={[rs.tdStat, { color: textSec }]}>{s.won}</Text>
              <Text style={[rs.tdStat, { color: textSec }]}>{s.drawn}</Text>
              <Text style={[rs.tdStat, { color: textSec }]}>{s.lost}</Text>
              <Text style={[rs.tdPts, { color: c.textPrimary, fontWeight: isCurrentTeam ? '800' : '600' }]}>{s.points}</Text>
            </View>
          );
        })}
        {/* Zone legend */}
        <View style={[rs.zoneLegend, { borderTopColor: border }]}>
          <View style={rs.legendItem}>
            <View style={[rs.legendDot, { backgroundColor: c.accent }]} />
            <Text style={[rs.legendText, { color: textSec }]}>{t('team.advanceZone')}</Text>
          </View>
          <View style={rs.legendItem}>
            <View style={[rs.legendDot, { backgroundColor: '#f59e0b' }]} />
            <Text style={[rs.legendText, { color: textSec }]}>{t('team.bestThirdZone')}</Text>
          </View>
          <View style={rs.legendItem}>
            <View style={[rs.legendDot, { backgroundColor: '#ef4444' }]} />
            <Text style={[rs.legendText, { color: textSec }]}>{t('team.eliminatedZone')}</Text>
          </View>
        </View>
      </View>
    );
  };

  // ── Coach card ──────────────────────────────────────────────────────────
  const CoachCard: React.FC = () => {
    if (!coach) return null;
    return (
      <View style={[rs.sectionCard, { backgroundColor: cardBg, borderColor: border }]}>
        <View style={rs.sectionHeader}>
          <Text style={[rs.sectionTitle, { color: c.textPrimary }]}>{t('team.coachLabel')}</Text>
        </View>
        <View style={rs.coachRow}>
          {coachImage?.startsWith('http') ? (
            <Image source={{ uri: coachImage }} style={rs.coachImg} />
          ) : (
            <View style={[rs.coachImg, { backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: 22 }}>👨‍💼</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[rs.coachName, { color: c.textPrimary }]}>{coach}</Text>
            {coachAge > 0 && (
              <Text style={[rs.coachMeta, { color: textSec }]}>{t('team.coachAge', { age: coachAge })}</Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  // ── Info card ───────────────────────────────────────────────────────────
  const InfoCard: React.FC = () => (
    <View style={[rs.sectionCard, { backgroundColor: cardBg, borderColor: border }]}>
      <View style={rs.sectionHeader}>
        <Text style={[rs.sectionTitle, { color: c.textPrimary }]}>{t('team.info')}</Text>
      </View>
      {data.info.founded > 0 && (
        <View style={[rs.infoRow, { borderTopColor: border }]}>
          <Text style={[rs.infoLabel, { color: textSec }]}>{t('team.founded')}</Text>
          <Text style={[rs.infoValue, { color: c.textPrimary }]}>{data.info.founded}</Text>
        </View>
      )}
      {data.info.venueName ? (
        <View style={[rs.infoRow, { borderTopColor: border }]}>
          <Text style={[rs.infoLabel, { color: textSec }]}>{t('team.stadium')}</Text>
          <Text style={[rs.infoValue, { color: c.textPrimary }]}>{data.info.venueName}</Text>
        </View>
      ) : null}
      {data.info.venueCapacity > 0 ? (
        <View style={[rs.infoRow, { borderTopColor: border }]}>
          <Text style={[rs.infoLabel, { color: textSec }]}>{t('team.capacity')}</Text>
          <Text style={[rs.infoValue, { color: c.textPrimary }]}>{data.info.venueCapacity.toLocaleString()}</Text>
        </View>
      ) : null}
      {data.info.leagueName ? (
        <View style={[rs.infoRow, { borderTopColor: border }]}>
          <Text style={[rs.infoLabel, { color: textSec }]}>{t('team.league')}</Text>
          <Text style={[rs.infoValue, { color: c.textPrimary }]}>{data.info.leagueName}</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={rs.container}>
      {/* Last match */}
      {lastMatch && (
        <>
          <Text style={[rs.sectionLabel, { color: textSec }]}>{t('team.lastMatch')}</Text>
          <MatchCard match={lastMatch} />
        </>
      )}

      {/* Next match */}
      {nextUp && (
        <>
          <Text style={[rs.sectionLabel, { color: textSec }]}>{t('team.nextMatch')}</Text>
          <MatchCard match={nextUp} isNext />
        </>
      )}

      {/* Recent form */}
      {data.form.length > 0 && (
        <View style={[rs.sectionCard, { backgroundColor: cardBg, borderColor: border }]}>
          <View style={rs.sectionHeader}>
            <Text style={[rs.sectionTitle, { color: c.textPrimary }]}>{t('team.recentForm')}</Text>
            <Text style={[rs.sectionHint, { color: textSec }]}>últimos {data.form.length}</Text>
          </View>
          <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
            <FormBadges form={data.form} recentMatches={data.recentMatches} />
          </View>
        </View>
      )}

      {/* Mini group table */}
      <MiniGroupTable />

      {/* Coach */}
      <CoachCard />

      {/* Info */}
      <InfoCard />

      <View style={{ height: 24 }} />
    </View>
  );
};

// Resumen styles
const rs = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1,
    textTransform: 'uppercase', marginBottom: -4,
  },
  sectionCard: {
    borderRadius: 14, borderWidth: 1, overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  sectionBadge: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  sectionHint: { fontSize: 11 },

  // Match card
  matchCard: {
    borderRadius: 14, borderWidth: 1, overflow: 'hidden',
    paddingHorizontal: 12, paddingVertical: 12,
  },
  matchCardTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10,
  },
  compBadge: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  compBadgeText: { fontSize: 10, fontWeight: '700' },
  matchDateText: { fontSize: 11 },
  matchTeamsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  matchTeamBlock: {
    flex: 1, gap: 6, alignItems: 'center',
  },
  matchTeamName: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  scoreBlock: {
    alignItems: 'center', paddingHorizontal: 10, gap: 4, minWidth: 80,
  },
  scoreBig: { fontSize: 28, fontWeight: '800', lineHeight: 32 },
  scoreSep: { fontSize: 22, fontWeight: '300', lineHeight: 32, marginHorizontal: 2 },
  scoreVS: { fontSize: 18, fontWeight: '800' },
  resultPill: {
    paddingHorizontal: 10, paddingVertical: 2, borderRadius: 8, marginTop: 2,
  },
  resultPillText: { fontSize: 10, fontWeight: '800', color: '#fff' },

  // Mini group table
  tableHeaderRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 6,
    borderBottomWidth: 1,
  },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    position: 'relative',
  },
  zoneBar: { width: 3, height: 26, borderRadius: 2, marginRight: 8 },
  thPos:  { width: 20, fontSize: 9, fontWeight: '700', textAlign: 'center' },
  thTeam: { flex: 1, fontSize: 9, fontWeight: '700', paddingLeft: 8 },
  thStat: { width: 22, fontSize: 9, fontWeight: '700', textAlign: 'center' },
  thPts:  { width: 30, fontSize: 9, fontWeight: '700', textAlign: 'center' },
  tdPos:  { width: 20, fontSize: 12, textAlign: 'center' },
  tdTeamCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  miniLogo: { width: 20, height: 20, borderRadius: 10 },
  tdTeamName: { fontSize: 12, flex: 1 },
  tdStat: { width: 22, fontSize: 11, textAlign: 'center' },
  tdPts:  { width: 30, fontSize: 13, textAlign: 'center' },
  zoneLegend: {
    flexDirection: 'row', gap: 14,
    paddingHorizontal: 14, paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 10 },

  // Coach
  coachRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingBottom: 14,
  },
  coachImg: { width: 52, height: 52, borderRadius: 26 },
  coachName: { fontSize: 15, fontWeight: '700' },
  coachMeta: { fontSize: 12, marginTop: 2 },

  // Info rows
  infoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' },
});

// ════════════════════════════════════════════════════════════════════════════
// PARTIDOS TAB
// ════════════════════════════════════════════════════════════════════════════

const PartidosTab: React.FC<{ data: TeamDetailData; teamId: number }> = ({ data, teamId }) => {
  const { t } = useTranslation();
  const c = useThemeColors();
  const { isDark } = useDarkMode();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();
  const [filter, setFilter] = useState<MatchFilter>('all');
  const monthsAbbr = t('dates.monthsAbbr', { returnObjects: true }) as string[];

  const textSec = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
  const cardBg  = c.surface;
  const border  = c.border;
  const today   = new Date().toISOString().split('T')[0];

  const filtered = useMemo(() => {
    if (filter === 'all') return data.recentMatches;
    return data.recentMatches.filter(m => {
      const comp = getCompetitionInfo(m.league);
      return filter === 'wc' ? comp.type === 'wc' : comp.type === 'friendly';
    });
  }, [data.recentMatches, filter]);

  const upcoming = filtered.filter(m => !m.isFinished && m.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const previous = filtered.filter(m => m.isFinished || m.date < today);

  const goToMatch = useCallback((m: RecentMatch) => {
    const match: Match = {
      id: String(m.id),
      homeTeam: { id: String(m.homeId), name: m.homeName, shortName: m.homeShort, logo: m.homeLogo },
      awayTeam: { id: String(m.awayId), name: m.awayName, shortName: m.awayShort, logo: m.awayLogo },
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      status: m.isFinished ? 'finished' : 'scheduled',
      time: m.isFinished ? 'FT' : '',
      league: m.league || data.info.leagueName,
      leagueId: String(data.info.leagueId),
      date: m.date,
    };
    navigation.navigate('MatchDetail', { match });
  }, [navigation, data.info]);

  const FILTERS: { key: MatchFilter; label: string }[] = [
    { key: 'all',      label: t('team.allFilter') },
    { key: 'wc',       label: t('team.wcFilter') },
    { key: 'friendly', label: t('team.friendlyFilter') },
  ];

  // ── Match row ─────────────────────────────────────────────────────────
  const MatchRow: React.FC<{ m: RecentMatch }> = ({ m }) => {
    const comp = getCompetitionInfo(m.league);
    const dateStr = formatMatchDate(m.date, monthsAbbr);
    const result = m.result;
    const resultColor = result === 'W' ? '#10b981' : result === 'L' ? '#ef4444' : '#f59e0b';
    const isCurrentHome = m.homeId === teamId;

    return (
      <TouchableOpacity
        onPress={() => goToMatch(m)}
        activeOpacity={0.7}
        style={[pt.matchRow, { borderTopColor: border }]}
      >
        {/* Date + comp */}
        <View style={pt.matchDateCol}>
          <Text style={[pt.matchDate, { color: textSec }]}>{dateStr}</Text>
          <View style={[pt.compDot, { backgroundColor: comp.color }]} />
        </View>

        {/* Teams */}
        <View style={pt.teamsCol}>
          {/* Home */}
          <View style={pt.teamLine}>
            <TeamLogo uri={m.homeLogo} size={20} />
            <Text
              style={[pt.teamName, { color: c.textPrimary, fontWeight: isCurrentHome ? '700' : '400' }]}
              numberOfLines={1}
            >
              {translateNationalTeam(m.homeName)}
            </Text>
          </View>
          {/* Away */}
          <View style={pt.teamLine}>
            <TeamLogo uri={m.awayLogo} size={20} />
            <Text
              style={[pt.teamName, { color: c.textPrimary, fontWeight: !isCurrentHome ? '700' : '400' }]}
              numberOfLines={1}
            >
              {translateNationalTeam(m.awayName)}
            </Text>
          </View>
        </View>

        {/* Score or time */}
        <View style={pt.scoreCol}>
          {m.isFinished ? (
            <>
              <Text style={[pt.scoreNum, { color: c.textPrimary }]}>{m.homeScore}</Text>
              <Text style={[pt.scoreNum, { color: c.textPrimary }]}>{m.awayScore}</Text>
            </>
          ) : (
            <>
              <Text style={[pt.scoreNum, { color: textSec }]}>–</Text>
              <Text style={[pt.scoreNum, { color: textSec }]}>–</Text>
            </>
          )}
        </View>

        {/* Result badge */}
        <View style={pt.resultCol}>
          {result ? (
            <View style={[pt.resultBadge, { backgroundColor: resultColor }]}>
              <Text style={pt.resultBadgeText}>{t(`team.formLabels.${result}`)}</Text>
            </View>
          ) : (
            <View style={[pt.resultBadge, { backgroundColor: 'transparent' }]} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={pt.container}>
      {/* Filter pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, flexDirection: 'row' }}>
        {FILTERS.map(f => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[pt.filterPill, { borderColor: active ? c.accent : border, backgroundColor: active ? c.accent + '22' : 'transparent' }]}
              activeOpacity={0.7}
            >
              <Text style={[pt.filterText, { color: active ? c.accent : textSec }]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <View style={[pt.section, { backgroundColor: cardBg, borderColor: border }]}>
          <Text style={[pt.sectionLabel, { color: textSec }]}>{t('team.upcomingSection')}</Text>
          {upcoming.map(m => <MatchRow key={m.id} m={m} />)}
        </View>
      )}

      {upcoming.length === 0 && filter === 'all' && (
        <View style={[pt.emptyBox, { borderColor: border }]}>
          <Text style={[pt.emptyText, { color: textSec }]}>{t('team.noUpcoming')}</Text>
        </View>
      )}

      {/* Previous */}
      {previous.length > 0 && (
        <View style={[pt.section, { backgroundColor: cardBg, borderColor: border, marginTop: 10 }]}>
          <Text style={[pt.sectionLabel, { color: textSec }]}>{t('team.previous')}</Text>
          {previous.map(m => <MatchRow key={m.id} m={m} />)}
        </View>
      )}

      {previous.length === 0 && filter === 'all' && (
        <View style={[pt.emptyBox, { borderColor: border }]}>
          <Text style={[pt.emptyText, { color: textSec }]}>{t('team.noRecent')}</Text>
        </View>
      )}

      <View style={{ height: 24 }} />
    </View>
  );
};

const pt = StyleSheet.create({
  container: { paddingTop: 4 },
  filterPill: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1.5,
  },
  filterText: { fontSize: 13, fontWeight: '600' },
  section: {
    borderRadius: 14, borderWidth: 1, overflow: 'hidden',
    marginHorizontal: 16,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1,
    paddingHorizontal: 14, paddingVertical: 10,
    textTransform: 'uppercase',
  },
  emptyBox: {
    marginHorizontal: 16, borderRadius: 14, borderWidth: 1,
    paddingVertical: 28, alignItems: 'center',
  },
  emptyText: { fontSize: 13 },
  matchRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  matchDateCol: { width: 42, alignItems: 'center', gap: 3 },
  matchDate: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
  compDot: { width: 6, height: 6, borderRadius: 3 },
  teamsCol: { flex: 1, gap: 4 },
  teamLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  teamName: { fontSize: 13, flex: 1 },
  scoreCol: { width: 24, alignItems: 'center', gap: 3 },
  scoreNum: { fontSize: 13, fontWeight: '700' },
  resultCol: { width: 26, alignItems: 'center' },
  resultBadge: {
    width: 22, height: 22, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  resultBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
});

// ════════════════════════════════════════════════════════════════════════════
// PLANTILLA TAB
// ════════════════════════════════════════════════════════════════════════════

const PlantillaTab: React.FC<{ data: TeamDetailData }> = ({ data }) => {
  const { t } = useTranslation();
  const c = useThemeColors();
  const { isDark } = useDarkMode();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();

  const textSec = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
  const cardBg  = c.surface;
  const border  = c.border;

  const { squad, info } = data;

  // Average age
  const avgAge = useMemo(() => {
    const ages = squad.filter(p => p.age > 0).map(p => p.age);
    if (ages.length === 0) return 0;
    return Math.round(ages.reduce((a, b) => a + b, 0) / ages.length * 10) / 10;
  }, [squad]);

  // Group by position
  const grouped = useMemo(() => {
    const groups: Record<string, { posId: number; label: string; players: SquadPlayer[] }> = {
      POR: { posId: 24, label: t('team.positions.goalkeepers'), players: [] },
      DEF: { posId: 25, label: t('team.positions.defenders'),   players: [] },
      MED: { posId: 26, label: t('team.positions.midfielders'), players: [] },
      DEL: { posId: 27, label: t('team.positions.forwards'),    players: [] },
      JUG: { posId: 99, label: 'Otros',                          players: [] },
    };
    squad.forEach(p => {
      const key = p.position in groups ? p.position : 'JUG';
      groups[key].players.push(p);
    });
    return Object.entries(groups)
      .filter(([, v]) => v.players.length > 0)
      .sort(([, a], [, b]) => a.posId - b.posId);
  }, [squad, t]);

  const goToPlayer = useCallback((p: SquadPlayer) => {
    navigation.navigate('PlayerDetail', {
      playerId: p.playerId,
      playerName: p.displayName || p.name,
      playerImage: p.image,
    });
  }, [navigation]);

  // ── Player row ──────────────────────────────────────────────────────────
  const PlayerRow: React.FC<{ player: SquadPlayer; borderTop: boolean }> = ({ player, borderTop }) => (
    <TouchableOpacity
      onPress={() => goToPlayer(player)}
      activeOpacity={0.7}
      style={[pl.playerRow, borderTop && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: border }]}
    >
      {/* Jersey number */}
      <View style={[pl.jerseyBadge, { backgroundColor: c.accent + '20' }]}>
        <Text style={[pl.jerseyNum, { color: c.accent }]}>{player.number > 0 ? player.number : '–'}</Text>
      </View>

      {/* Photo */}
      {player.image?.startsWith('http') ? (
        <Image source={{ uri: player.image }} style={pl.playerImg} />
      ) : (
        <View style={[pl.playerImg, { backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ fontSize: 16 }}>👤</Text>
        </View>
      )}

      {/* Name + club */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[pl.playerName, { color: c.textPrimary }]} numberOfLines={1}>
            {player.displayName || player.name}
          </Text>
          {player.isCaptain && (
            <View style={[pl.captainBadge, { backgroundColor: '#C9A227' }]}>
              <Text style={pl.captainText}>C</Text>
            </View>
          )}
        </View>
        {player.clubName ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            {player.clubLogo?.startsWith('http') && (
              <Image source={{ uri: player.clubLogo }} style={pl.clubLogo} />
            )}
            <Text style={[pl.clubName, { color: textSec }]} numberOfLines={1}>{player.clubName}</Text>
          </View>
        ) : null}
      </View>

      {/* Age */}
      {player.age > 0 && (
        <Text style={[pl.ageText, { color: textSec }]}>{player.age}</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={pl.container}>
      {/* Coach card */}
      {info.coach ? (
        <View style={[pl.coachCard, { backgroundColor: cardBg, borderColor: border }]}>
          <View style={pl.coachInner}>
            {info.coachImage?.startsWith('http') ? (
              <Image source={{ uri: info.coachImage }} style={pl.coachImg} />
            ) : (
              <View style={[pl.coachImg, { backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ fontSize: 20 }}>👨‍💼</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[pl.coachRole, { color: textSec }]}>{t('team.coachLabel').toUpperCase()}</Text>
              <Text style={[pl.coachName, { color: c.textPrimary }]}>{info.coach}</Text>
              {info.coachAge > 0 && (
                <Text style={[pl.coachAge, { color: textSec }]}>{t('team.coachAge', { age: info.coachAge })}</Text>
              )}
            </View>
          </View>
        </View>
      ) : null}

      {/* Squad summary */}
      <Text style={[pl.squadSummary, { color: textSec }]}>
        {t('team.playerCount', { count: squad.length })}
        {avgAge > 0 ? `  ·  ${t('team.avgAge')}: ${avgAge}` : ''}
      </Text>

      {/* Groups */}
      {grouped.map(([key, group]) => (
        <View key={key} style={[pl.positionGroup, { backgroundColor: cardBg, borderColor: border }]}>
          <View style={pl.posHeaderRow}>
            <View style={[pl.posAccent, { backgroundColor: c.accent }]} />
            <Text style={[pl.posHeader, { color: c.textPrimary }]}>{group.label}</Text>
            <Text style={[pl.posCount, { color: textSec }]}>{group.players.length}</Text>
          </View>
          {group.players.map((p, idx) => (
            <PlayerRow key={p.id} player={p} borderTop={idx > 0} />
          ))}
        </View>
      ))}

      <View style={{ height: 24 }} />
    </View>
  );
};

const pl = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },
  coachCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  coachInner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14,
  },
  coachImg: { width: 52, height: 52, borderRadius: 26 },
  coachRole: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  coachName: { fontSize: 16, fontWeight: '700', marginTop: 1 },
  coachAge: { fontSize: 12, marginTop: 2 },
  squadSummary: { fontSize: 12, paddingHorizontal: 2 },
  positionGroup: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  posHeaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  posAccent: { width: 3, height: 16, borderRadius: 2 },
  posHeader: { flex: 1, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  posCount: { fontSize: 12 },
  playerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 9,
    gap: 10,
  },
  jerseyBadge: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  jerseyNum: { fontSize: 12, fontWeight: '800' },
  playerImg: { width: 38, height: 38, borderRadius: 19 },
  playerName: { fontSize: 14, fontWeight: '600' },
  captainBadge: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  captainText: { fontSize: 9, fontWeight: '900', color: '#111' },
  clubLogo: { width: 14, height: 14, borderRadius: 7 },
  clubName: { fontSize: 11 },
  ageText: { fontSize: 13, width: 26, textAlign: 'center' },
});

// ════════════════════════════════════════════════════════════════════════════
// TABLA TAB
// ════════════════════════════════════════════════════════════════════════════

// Zone color helper
function getZoneColor(idx: number, accentColor: string): string {
  if (idx < 2) return accentColor;
  if (idx === 2) return '#f59e0b';
  return '#ef4444';
}

// Single group card — reused for team's group and all others
const GroupCard: React.FC<{
  rows: LeagueStanding[];
  letter: string;
  teamId: number;
  isMyGroup: boolean;
  cardBg: string;
  border: string;
  textSec: string;
  accentColor: string;
  textPrimary: string;
  compact?: boolean;
  shareRef?: React.RefObject<any>;
}> = ({ rows, letter, teamId, isMyGroup, cardBg, border, textSec, accentColor, textPrimary, compact, shareRef }) => {
  const { t } = useTranslation();
  const rowH = compact ? 7 : 10;
  return (
    <ViewShot ref={shareRef} options={{ format: 'png', quality: 0.95 }}>
      <View style={[tl.tableCard, { backgroundColor: cardBg, borderColor: isMyGroup ? accentColor + '60' : border }]}>
        {/* Header row with group letter + "TU GRUPO" badge */}
        <View style={[tl.tableCardHeader, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
          <Text style={[tl.tableTitle, { color: textPrimary }]}>
            {letter ? t('team.groupHeader', { letter }) : t('team.standingsTitle')}
          </Text>
          {isMyGroup && (
            <View style={[tl.myGroupBadge, { backgroundColor: accentColor }]}>
              <Text style={tl.myGroupBadgeText}>TU GRUPO</Text>
            </View>
          )}
        </View>

        {/* Column headers */}
        <View style={[tl.headerRow, { borderBottomColor: border }]}>
          <Text style={[tl.thPos,  { color: textSec }]}>#</Text>
          <Text style={[tl.thTeam, { color: textSec }]}> </Text>
          <Text style={[tl.thStat, { color: textSec }]}>J</Text>
          <Text style={[tl.thStat, { color: textSec }]}>G</Text>
          <Text style={[tl.thStat, { color: textSec }]}>E</Text>
          <Text style={[tl.thStat, { color: textSec }]}>P</Text>
          <Text style={[tl.thStat, { color: textSec }]}>DIF</Text>
          <Text style={[tl.thPts,  { color: textSec }]}>PTS</Text>
        </View>

        {rows.map((s, idx) => {
          const isCurrent = s.team.id === String(teamId);
          const zoneColor = getZoneColor(idx, accentColor);
          const gd = s.goalDifference ?? (s.goalsFor - s.goalsAgainst);
          const gdStr = gd > 0 ? `+${gd}` : String(gd);
          return (
            <View
              key={s.team.id}
              style={[
                tl.row,
                { paddingVertical: rowH, borderTopColor: border },
                isCurrent && { backgroundColor: accentColor + '18' },
              ]}
            >
              <View style={[tl.zoneBar, { backgroundColor: zoneColor }]} />
              <Text style={[tl.tdPos, { color: textPrimary, fontWeight: isCurrent ? '800' : '500' }]}>
                {s.position}
              </Text>
              <View style={tl.tdTeamCell}>
                {s.team.logo?.startsWith('http')
                  ? <Image source={{ uri: s.team.logo }} style={compact ? tl.logoSm : tl.logo} />
                  : <View style={[compact ? tl.logoSm : tl.logo, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
                }
                <Text
                  style={[
                    compact ? tl.tdTeamNameSm : tl.tdTeamName,
                    { color: textPrimary, fontWeight: isCurrent ? '700' : '400' },
                  ]}
                  numberOfLines={1}
                >
                  {translateNationalTeam(s.team.name)}
                </Text>
              </View>
              <Text style={[tl.tdStat, { color: textSec, fontSize: compact ? 10 : 11 }]}>{s.played}</Text>
              <Text style={[tl.tdStat, { color: textSec, fontSize: compact ? 10 : 11 }]}>{s.won}</Text>
              <Text style={[tl.tdStat, { color: textSec, fontSize: compact ? 10 : 11 }]}>{s.drawn}</Text>
              <Text style={[tl.tdStat, { color: textSec, fontSize: compact ? 10 : 11 }]}>{s.lost}</Text>
              <Text style={[tl.tdStat, { color: textSec, fontSize: compact ? 10 : 11 }]}>{gdStr}</Text>
              <Text style={[tl.tdPts,  { color: textPrimary, fontWeight: isCurrent ? '800' : '600', fontSize: compact ? 11 : 13 }]}>
                {s.points}
              </Text>
            </View>
          );
        })}

        {/* Zone legend — only on the main group card */}
        {isMyGroup && (
          <View style={[tl.zoneLegend, { borderTopColor: border }]}>
            <View style={tl.legendItem}>
              <View style={[tl.legendDot, { backgroundColor: accentColor }]} />
              <Text style={[tl.legendText, { color: textSec }]}>{t('team.advanceZone')}</Text>
            </View>
            <View style={tl.legendItem}>
              <View style={[tl.legendDot, { backgroundColor: '#f59e0b' }]} />
              <Text style={[tl.legendText, { color: textSec }]}>{t('team.bestThirdZone')}</Text>
            </View>
            <View style={tl.legendItem}>
              <View style={[tl.legendDot, { backgroundColor: '#ef4444' }]} />
              <Text style={[tl.legendText, { color: textSec }]}>{t('team.eliminatedZone')}</Text>
            </View>
          </View>
        )}
      </View>
    </ViewShot>
  );
};

const TablaTab: React.FC<{ data: TeamDetailData; teamId: number }> = ({ data, teamId }) => {
  const { t } = useTranslation();
  const c = useThemeColors();
  const { isDark } = useDarkMode();
  const [sharing, setSharing] = useState(false);
  const shareRef = useRef<any>(null);

  const textSec = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
  const cardBg  = c.surface;
  const border  = c.border;

  const teamStanding = data.teamStanding;

  // Build all distinct groups sorted by groupId (ascending → A, B, C…)
  const allGroups = useMemo(() => {
    if (data.standings.length === 0) return [];
    const map = new Map<string, LeagueStanding[]>();
    for (const s of data.standings) {
      const key = String(s.groupId ?? 'none');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries())
      .map(([key, rows]) => ({
        key,
        groupId: rows[0].groupId ?? null,
        rows: rows.sort((a, b) => a.position - b.position),
      }))
      .sort((a, b) => (a.groupId ?? 0) - (b.groupId ?? 0));
  }, [data.standings]);

  // Assign letters (A, B, C…) by sort order
  const getGroupLetter = (idx: number) => String.fromCharCode(65 + idx);

  const myGroupId = teamStanding?.groupId ?? null;
  const myGroupIdx = allGroups.findIndex(g => g.groupId === myGroupId);
  const myGroup = myGroupIdx >= 0 ? allGroups[myGroupIdx] : (allGroups[0] ?? null);
  const myGroupLetter = myGroup ? getGroupLetter(myGroupIdx >= 0 ? myGroupIdx : 0) : '';
  const otherGroups = allGroups.filter((_, i) => i !== (myGroupIdx >= 0 ? myGroupIdx : 0));

  const handleShare = useCallback(async () => {
    if (!shareRef.current) return;
    try {
      setSharing(true);
      const uri = await captureRef(shareRef, { format: 'png', quality: 0.95 });
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) { Alert.alert(t('team.shareUnavailable')); return; }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: t('team.shareTablePrompt') });
    } catch (_) {
      // Ignore
    } finally {
      setSharing(false);
    }
  }, [t]);

  if (!myGroup) {
    return (
      <View style={{ alignItems: 'center', paddingTop: 60 }}>
        <Text style={{ fontSize: 36 }}>📊</Text>
        <Text style={{ fontSize: 14, color: textSec, marginTop: 10 }}>{t('team.noStandings')}</Text>
      </View>
    );
  }

  return (
    <View style={tl.container}>
      {/* ── Team's own group (full, highlighted) ── */}
      <GroupCard
        rows={myGroup.rows}
        letter={myGroupLetter}
        teamId={teamId}
        isMyGroup
        cardBg={cardBg}
        border={border}
        textSec={textSec}
        accentColor={c.accent}
        textPrimary={c.textPrimary}
        shareRef={shareRef}
      />

      {/* Share button */}
      <TouchableOpacity
        onPress={handleShare}
        disabled={sharing}
        activeOpacity={0.7}
        style={[tl.shareBtn, { backgroundColor: c.accent }]}
      >
        {sharing ? (
          <ActivityIndicator size="small" color="#111" />
        ) : (
          <>
            <ShareIcon color="#111" size={14} />
            <Text style={tl.shareBtnText}>{t('common.share')}</Text>
          </>
        )}
      </TouchableOpacity>

      {/* ── Other groups (compact) ── */}
      {otherGroups.length > 0 && (
        <>
          <Text style={[tl.otherGroupsLabel, { color: textSec }]}>OTROS GRUPOS</Text>
          {otherGroups.map((g, i) => {
            // Find real index of this group in allGroups for correct letter
            const realIdx = allGroups.findIndex(ag => ag.key === g.key);
            return (
              <GroupCard
                key={g.key}
                rows={g.rows}
                letter={getGroupLetter(realIdx)}
                teamId={teamId}
                isMyGroup={false}
                cardBg={cardBg}
                border={border}
                textSec={textSec}
                accentColor={c.accent}
                textPrimary={c.textPrimary}
                compact
              />
            );
          })}
        </>
      )}

      <View style={{ height: 24 }} />
    </View>
  );
};

const tl = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 4, gap: 14 },
  tableCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  tableCardHeader: {
    paddingHorizontal: 14, paddingVertical: 12,
  },
  tableTitle: { fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 6,
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    position: 'relative',
  },
  zoneBar: { width: 3, height: 26, borderRadius: 2, marginRight: 6 },
  thPos:  { width: 20, fontSize: 9, fontWeight: '700', textAlign: 'center' },
  thTeam: { flex: 1, fontSize: 9, fontWeight: '700', paddingLeft: 6 },
  thStat: { width: 24, fontSize: 9, fontWeight: '700', textAlign: 'center' },
  thPts:  { width: 30, fontSize: 9, fontWeight: '700', textAlign: 'center' },
  tdPos:  { width: 20, fontSize: 12, textAlign: 'center' },
  tdTeamCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  logo: { width: 22, height: 22, borderRadius: 11 },
  logoSm: { width: 18, height: 18, borderRadius: 9 },
  tdTeamName: { fontSize: 12, flex: 1 },
  tdTeamNameSm: { fontSize: 11, flex: 1 },
  tdStat: { width: 24, fontSize: 11, textAlign: 'center' },
  tdPts:  { width: 30, fontSize: 13, textAlign: 'center' },
  myGroupBadge: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
  },
  myGroupBadgeText: {
    fontSize: 9, fontWeight: '900', color: '#111', letterSpacing: 0.5,
  },
  otherGroupsLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1,
    textTransform: 'uppercase', paddingHorizontal: 2, marginTop: 4,
  },
  zoneLegend: {
    flexDirection: 'row', gap: 14,
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexWrap: 'wrap',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11 },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 13, paddingHorizontal: 28,
    borderRadius: 24, alignSelf: 'center', minWidth: 160,
  },
  shareBtnText: { fontSize: 14, fontWeight: '700', color: '#111' },
});

// ════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ════════════════════════════════════════════════════════════════════════════

export const TeamDetailScreen: React.FC<Props> = ({ route }) => {
  const { teamId, teamName, teamLogo, seasonId } = route.params;
  const c = useThemeColors();
  const { t } = useTranslation();
  const { isDark } = useDarkMode();
  const navigation = useNavigation();
  const { isFollowingTeam, toggleFollowTeam } = useFavorites();
  const [activeTab, setActiveTab] = useState<Tab>('resumen');
  const scrollY = useRef(new Animated.Value(0)).current;
  const heroHeight = useRef(0);
  const [showFixedTabs, setShowFixedTabs] = useState(false);

  const { data, loading, error } = useTeamDetail(teamId, seasonId);
  const isFollowing = isFollowingTeam(String(teamId));

  // WC bracket — only fetch for WC teams (leagueId 732)
  const isWCTeam = data?.info.leagueId === 732;
  const wcSeasonId = isWCTeam ? (data?.info.currentSeasonId ?? null) : null;
  const { rounds: bracketRoundsAll, loading: bracketLoading } = useCupBracket(wcSeasonId);
  // Filter out Group Stage — already shown in Partidos tab; only knockout in Bracket
  const bracketRounds = bracketRoundsAll.filter(r => {
    const n = r.name.toLowerCase();
    return !n.includes('group') && !n.includes('grupo') && !n.includes('fase de grupos');
  });

  // Navigate to MatchDetail when a bracket tie is tapped
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
      league: data?.info.leagueName ?? '',
      leagueId: String(data?.info.leagueId ?? ''),
      date: leg.date,
    };
    (navigation as any).navigate('MatchDetail', { match });
  };

  // Compact header fades in when hero scrolls past
  const compactOpacity = scrollY.interpolate({
    inputRange: [80, 140],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const headerBg   = c.bg;
  const hText      = isDark ? '#fff' : '#111827';
  const hTextSoft  = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(17,24,39,0.5)';
  const hBtnBg     = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)';
  const hBorderCol = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.2)';
  const hLogoBg    = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';

  // Tab order: Resumen → Partidos → Plantilla → Tabla [→ Bracket for WC teams]
  const TABS: { key: Tab; label: string }[] = [
    { key: 'resumen',   label: t('team.summaryTab') },
    { key: 'partidos',  label: t('team.matchesTab') },
    { key: 'plantilla', label: t('team.squadTab') },
    { key: 'tabla',     label: t('team.standingsTab') },
    ...(isWCTeam ? [{ key: 'bracket' as Tab, label: 'Bracket' }] : []),
  ];

  const TabBar: React.FC<{ style?: any }> = ({ style }) => (
    <View style={[hs.tabBar, { backgroundColor: c.bg, borderBottomColor: c.border }, style]}>
      {TABS.map(tab => {
        const active = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[hs.tab, active && { borderBottomColor: c.accent }]}
            activeOpacity={0.7}
          >
            <Text style={[hs.tabText, { color: active ? c.textPrimary : c.textTertiary }, active && { fontWeight: '700' }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── Sticky compact header ── */}
      <View style={[hs.stickyHeader, { backgroundColor: headerBg }]}>
        <View style={hs.topBar}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={[hs.iconBtn, { backgroundColor: hBtnBg }]}
            activeOpacity={0.7}
          >
            <BackArrow color={hText} />
          </TouchableOpacity>

          <Animated.View style={[hs.compactCenter, { opacity: compactOpacity }]}>
            {teamLogo?.startsWith('http') ? (
              <Image source={{ uri: teamLogo }} style={hs.compactLogo} />
            ) : null}
            <Text style={[hs.compactName, { color: hText }]} numberOfLines={1}>
              {translateNationalTeam(data?.info.name ?? teamName)}
            </Text>
          </Animated.View>

          <View style={[hs.iconBtn, { backgroundColor: 'transparent' }]} />
        </View>

        {/* Fixed tab bar — appears once hero scrolls away */}
        {showFixedTabs && <TabBar />}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        onScroll={(e: any) => {
          const y = e.nativeEvent.contentOffset.y;
          scrollY.setValue(y);
          const threshold = heroHeight.current > 0 ? heroHeight.current - 48 : 200;
          if (y >= threshold && !showFixedTabs) setShowFixedTabs(true);
          else if (y < threshold && showFixedTabs) setShowFixedTabs(false);
        }}
        scrollEventThrottle={16}
      >
        {/* ── Hero (scrolls with content) ── */}
        <View
          style={[hs.hero, { backgroundColor: headerBg }]}
          onLayout={e => { heroHeight.current = e.nativeEvent.layout.height; }}
        >
          <View style={hs.expanded}>
            {/* League label */}
            <Text style={[hs.leagueLabel, { color: hTextSoft }]}>{data?.info.leagueName ?? ''}</Text>

            {/* Logo */}
            <View style={[hs.logoWrap, { backgroundColor: hLogoBg }]}>
              {teamLogo?.startsWith('http') ? (
                <Image source={{ uri: teamLogo }} style={hs.logo} />
              ) : (
                <View style={[hs.logo, { backgroundColor: hLogoBg, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ fontSize: 32 }}>⚽</Text>
                </View>
              )}
            </View>

            {/* Team name */}
            <Text style={[hs.teamName, { color: hText }]}>
              {translateNationalTeam(data?.info.name ?? teamName)}
            </Text>

            {/* City / country */}
            {data?.info.city ? (
              <Text style={[hs.cityText, { color: hTextSoft }]}>{data.info.city}</Text>
            ) : null}

            {/* Follow button */}
            <TouchableOpacity
              style={[hs.followBtn, { borderColor: hBorderCol }, isFollowing && { backgroundColor: hText, borderColor: hText }]}
              onPress={() => toggleFollowTeam(String(teamId))}
              activeOpacity={0.8}
            >
              <Text style={[hs.followText, { color: hText }, isFollowing && { color: isDark ? '#111' : '#fff' }]}>
                {isFollowing ? t('team.following') : t('team.follow')}
              </Text>
            </TouchableOpacity>

            {/* Stats strip: pos, pts, form */}
            {data?.teamStanding && (
              <View style={hs.statsStrip}>
                <View style={hs.statItem}>
                  <Text style={[hs.statValue, { color: hText }]}>#{data.teamStanding.position}</Text>
                  <Text style={[hs.statLabel, { color: hTextSoft }]}>{t('team.positionLabel')}</Text>
                </View>
                <View style={hs.statItem}>
                  <Text style={[hs.statValue, { color: hText }]}>{data.teamStanding.points}</Text>
                  <Text style={[hs.statLabel, { color: hTextSoft }]}>{t('team.pointsLabel')}</Text>
                </View>
                {data.form.length > 0 && (
                  <View style={hs.statItem}>
                    <FormBadges form={data.form} recentMatches={data.recentMatches} />
                    <Text style={[hs.statLabel, { color: hTextSoft }]}>{t('team.formLabel')}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        {/* ── In-flow tab bar (scrolls with content, hidden once fixed bar shows) ── */}
        {!showFixedTabs && <TabBar />}

        {/* ── Tab content ── */}
        {loading ? (
          <SkeletonTeamDetail />
        ) : error && !data ? (
          <View style={{ alignItems: 'center', paddingTop: 80, gap: 10, paddingHorizontal: 20 }}>
            <Text style={{ fontSize: 40 }}>⚠️</Text>
            <Text style={{ fontSize: 15, fontWeight: '600', color: c.textSecondary }}>{t('team.errorLoading')}</Text>
            <Text style={{ fontSize: 12, color: c.textTertiary, textAlign: 'center' }}>{error}</Text>
          </View>
        ) : data ? (
          <View style={{ paddingTop: 12 }}>
            {activeTab === 'resumen'   && <ResumenTab   data={data} teamId={teamId} />}
            {activeTab === 'partidos'  && <PartidosTab  data={data} teamId={teamId} />}
            {activeTab === 'plantilla' && <PlantillaTab data={data} />}
            {activeTab === 'tabla'     && <TablaTab     data={data} teamId={teamId} />}
            {activeTab === 'bracket'   && (
              bracketLoading ? (
                <View style={{ alignItems: 'center', paddingTop: 60 }}>
                  <ActivityIndicator size="large" color={c.accent} />
                </View>
              ) : bracketRounds.length > 0 ? (
                <CupBracketView
                  rounds={bracketRounds}
                  leagueName={data.info.leagueName}
                  seasonStr="2026"
                  onPressTie={handlePressTie}
                />
              ) : (
                <View style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 }}>
                  <Text style={{ fontSize: 36 }}>🏆</Text>
                  <Text style={{ fontSize: 14, color: c.textTertiary, marginTop: 12, textAlign: 'center' }}>
                    El bracket estará disponible cuando comience la fase eliminatoria
                  </Text>
                </View>
              )
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// HEADER + TAB STYLES
// ════════════════════════════════════════════════════════════════════════════

const hs = StyleSheet.create({
  stickyHeader: { position: 'relative', zIndex: 20 },
  hero: { position: 'relative' },
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8, height: 48, zIndex: 2,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  compactCenter: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, paddingHorizontal: 10,
  },
  compactLogo: { width: 24, height: 24, borderRadius: 12 },
  compactName: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  expanded: {
    alignItems: 'center',
    paddingTop: 4, paddingBottom: 16, gap: 6,
  },
  leagueLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  logoWrap: {
    width: 72, height: 72, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  logo: { width: 56, height: 56, borderRadius: 6 },
  teamName: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  cityText: { fontSize: 12, marginTop: -2 },
  followBtn: {
    paddingHorizontal: 20, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1.5, backgroundColor: 'transparent', marginTop: 2,
  },
  followText: { fontSize: 12, fontWeight: '700' },
  statsStrip: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 4 },
  statItem: { alignItems: 'center', gap: 2 },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 9, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: {
    flex: 1, alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2.5, borderBottomColor: 'transparent',
  },
  tabText: { fontSize: 13, fontWeight: '500', letterSpacing: 0.1 },
});
