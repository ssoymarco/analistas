// ── Tabla (Standings) Tab ─────────────────────────────────────────────────────
// Auto-detects competition type:
//   • League (round-robin)  → standings table with zone bars
//   • Cup (knockout only)   → bracket view with ties/legs/aggregate
//   • Cup (group + knockout) → toggle between "Grupos" and "Bracket" views
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useThemeColors } from '../../theme/useTheme';
import { useStandings } from '../../hooks/useStandings';
import { useCupBracket } from '../../hooks/useCupBracket';
import { useCupGroupStandings } from '../../hooks/useCupGroupStandings';
import { CupBracketView } from '../../components/CupBracketView';
import type { Match, MatchDetail, LeagueStanding, CupGroup } from '../../data/types';
import type { CupRound, CupTie } from '../../services/sportsApi';
import { SkeletonLeagueDetail } from '../../components/Skeleton';
import type { PartidosStackParamList } from '../../navigation/AppNavigator';
import { getLeagueConfig, getLeagueConfigByName, type LeagueZone } from '../../config/leagues';

// ── Dynamic imports ──────────────────────────────────────────────────────────
let ViewShot: any = null;
let Sharing: any  = null;
try { ViewShot = require('react-native-view-shot').default; } catch {}
try { Sharing   = require('expo-sharing'); } catch {}

// ── Zone colors ──────────────────────────────────────────────────────────────
/**
 * Returns the zone color for a given position.
 * When league-specific `zones` are provided they take precedence over the
 * generic European fallback (CL/EL/Relegation).
 */
function getZoneColor(position: number, totalTeams: number, zones?: LeagueZone[]): string | null {
  if (zones && zones.length > 0) {
    const z = zones.find(z => position >= z.from && position <= z.to);
    return z?.color ?? null;
  }
  // Generic European fallback
  if (position === 1) return '#fbbf24'; // Campeón (gold)
  if (position <= 4)  return '#3b82f6'; // Champions League
  if (position <= 6)  return '#f97316'; // Europa League
  if (position > totalTeams - 3) return '#ef4444'; // Descenso
  return null;
}

// ── Team logo ────────────────────────────────────────────────────────────────
const TeamLogo: React.FC<{ logo: string; size?: number }> = ({ logo, size = 22 }) => {
  if (logo.startsWith('http')) {
    return <Image source={{ uri: logo }} style={{ width: size, height: size, borderRadius: 2 }} resizeMode="contain" />;
  }
  return <Text style={{ fontSize: size - 4 }}>{logo}</Text>;
};

// ── Upload / Export icon ──────────────────────────────────────────────────────
// Draws the universal "share/export" symbol:  ↑  (arrow + base tray line)
function UploadIcon({ color, size = 18 }: { color: string; size?: number }) {
  const s = size;
  const t = Math.max(1.8, s * 0.1);  // stroke thickness
  const aw = s * 0.28;               // arrowhead arm width
  return (
    <View style={{ width: s, height: s }}>
      {/* Vertical shaft */}
      <View style={{
        position: 'absolute', top: s * 0.06, left: s / 2 - t / 2,
        width: t, height: s * 0.58, backgroundColor: color, borderRadius: t,
      }} />
      {/* Arrowhead — left arm */}
      <View style={{
        position: 'absolute', top: s * 0.06 + aw * 0.28, left: s / 2 - aw - t * 0.2,
        width: aw, height: t, backgroundColor: color, borderRadius: t,
        transform: [{ rotate: '-45deg' }],
      }} />
      {/* Arrowhead — right arm */}
      <View style={{
        position: 'absolute', top: s * 0.06 + aw * 0.28, right: s / 2 - aw - t * 0.2,
        width: aw, height: t, backgroundColor: color, borderRadius: t,
        transform: [{ rotate: '45deg' }],
      }} />
      {/* Base tray — horizontal line at bottom */}
      <View style={{
        position: 'absolute', bottom: s * 0.07, left: s * 0.1, right: s * 0.1,
        height: t, backgroundColor: color, borderRadius: t,
      }} />
    </View>
  );
}

// Keep ShareIcon as alias for backwards compat (used outside this file if ever)
const ShareIcon = UploadIcon;

// ── Standing row ─────────────────────────────────────────────────────────────
const StandingRow: React.FC<{
  row: LeagueStanding;
  isHome: boolean;
  isAway: boolean;
  totalTeams: number;
  zones?: LeagueZone[];
  isProjected?: boolean;
}> = ({ row, isHome, isAway, totalTeams, zones, isProjected }) => {
  const c = useThemeColors();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();

  const zoneColor = getZoneColor(row.position, totalTeams, zones);
  const isHighlighted = isHome || isAway;

  const rowBg = isHome
    ? 'rgba(59,130,246,0.08)'
    : isAway
    ? 'rgba(249,115,22,0.08)'
    : 'transparent';

  const textColor = isHome ? '#3b82f6' : isAway ? '#f97316' : c.textPrimary;
  const gd = row.goalDifference > 0 ? `+${row.goalDifference}` : `${row.goalDifference}`;
  const gdColor = row.goalDifference > 0 ? '#10b981' : row.goalDifference < 0 ? '#ef4444' : c.textTertiary;

  return (
    <TouchableOpacity
      style={[st.row, { borderBottomColor: c.border, backgroundColor: rowBg }]}
      onPress={() => navigation.push('TeamDetail', {
        teamId: parseInt(row.team.id, 10),
        teamName: row.team.name,
        teamLogo: row.team.logo,
      })}
      activeOpacity={0.7}
    >
      {/* Zone bar */}
      <View style={[st.zoneBar, { backgroundColor: zoneColor || 'transparent' }]} />

      {/* Position */}
      <Text style={[st.pos, { color: zoneColor || c.textTertiary }]}>{row.position}</Text>

      {/* Logo */}
      <View style={st.logoCell}>
        <TeamLogo logo={row.team.logo} size={22} />
      </View>

      {/* Name + badge */}
      <View style={st.nameWrap}>
        <Text style={[st.name, { color: textColor }]} numberOfLines={1}>{row.team.name}</Text>
        {isHome && (
          <View style={[st.matchBadge, { backgroundColor: '#f97316' }]}>
            <Text style={st.matchBadgeText}>LOCAL</Text>
          </View>
        )}
        {isAway && (
          <View style={[st.matchBadge, { backgroundColor: '#ef4444' }]}>
            <Text style={st.matchBadgeText}>VISITA</Text>
          </View>
        )}
        {isProjected && (
          <Text style={st.liveProjectedDot}>⚡</Text>
        )}
      </View>

      {/* Stats */}
      <Text style={[st.num, { color: c.textSecondary }]}>{row.played}</Text>
      <Text style={[st.num, { color: c.textSecondary }]}>{row.won}</Text>
      <Text style={[st.num, { color: c.textSecondary }]}>{row.drawn}</Text>
      <Text style={[st.num, { color: c.textSecondary }]}>{row.lost}</Text>
      <Text style={[st.gfga, { color: c.textTertiary }]}>{row.goalsFor}-{row.goalsAgainst}</Text>
      <Text style={[st.gd, { color: gdColor }]}>{gd}</Text>
      <Text style={[st.pts, { color: isHighlighted ? textColor : c.textPrimary }]}>{row.points}</Text>
    </TouchableOpacity>
  );
};

// ── Header row ───────────────────────────────────────────────────────────────
const HeaderRow: React.FC = () => {
  const c = useThemeColors();
  return (
    <View style={[st.row, st.headerRow, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
      <View style={st.zoneBar} />
      <Text style={[st.headerCell, { width: 24, color: c.textTertiary }]}></Text>
      <View style={{ width: 26 }} />
      <View style={st.nameWrap}>
        <Text style={[st.headerName, { color: c.textTertiary }]}>EQUIPO</Text>
      </View>
      <Text style={[st.headerNum, { color: c.textTertiary }]}>J</Text>
      <Text style={[st.headerNum, { color: c.textTertiary }]}>G</Text>
      <Text style={[st.headerNum, { color: c.textTertiary }]}>E</Text>
      <Text style={[st.headerNum, { color: c.textTertiary }]}>P</Text>
      <Text style={[st.headerGfga, { color: c.textTertiary }]}>+/-</Text>
      <Text style={[st.headerGd, { color: c.textTertiary }]}>DG</Text>
      <Text style={[st.headerPts, { color: c.textTertiary }]}>PTS</Text>
    </View>
  );
};

// ── Group Stage View ──────────────────────────────────────────────────────────
const GroupStageView: React.FC<{
  groups: CupGroup[];
  homeTeamId: string;
  awayTeamId: string;
  leagueZones?: LeagueZone[];
}> = ({ groups, homeTeamId, awayTeamId, leagueZones }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();

  if (groups.length === 0) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 40, gap: 10 }}>
        <Text style={{ fontSize: 36 }}>🏆</Text>
        <Text style={{ color: c.textSecondary, fontSize: 14, fontWeight: '600' }}>
          {t('cup.noGroups')}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
    >
      {groups.map((group, gi) => (
        <View key={group.id} style={{ marginBottom: 20 }}>
          {/* Group header */}
          <View style={[gs.groupHeader, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[gs.groupTitle, { color: c.textPrimary }]}>
              {group.name.toUpperCase()}
            </Text>
            <View style={gs.groupHeaderCols}>
              <Text style={[gs.headerNum, { color: c.textTertiary }]}>J</Text>
              <Text style={[gs.headerNum, { color: c.textTertiary }]}>G</Text>
              <Text style={[gs.headerNum, { color: c.textTertiary }]}>E</Text>
              <Text style={[gs.headerNum, { color: c.textTertiary }]}>P</Text>
              <Text style={[gs.headerGfga, { color: c.textTertiary }]}>+/-</Text>
              <Text style={[gs.headerPts, { color: c.textTertiary }]}>PTS</Text>
            </View>
          </View>

          {/* Group rows */}
          <View style={[gs.groupCard, { backgroundColor: c.card, borderColor: c.border }]}>
            {group.standings.map((row, ri) => {
              const zoneColor = getZoneColor(row.position, group.standings.length, leagueZones);
              const isHome = row.team.id === homeTeamId;
              const isAway = row.team.id === awayTeamId;
              const gd = row.goalDifference > 0 ? `+${row.goalDifference}` : `${row.goalDifference}`;
              const gdColor = row.goalDifference > 0 ? '#10b981' : row.goalDifference < 0 ? '#ef4444' : c.textTertiary;
              const textColor = isHome ? '#3b82f6' : isAway ? '#f97316' : c.textPrimary;
              const rowBg = isHome ? 'rgba(59,130,246,0.08)' : isAway ? 'rgba(249,115,22,0.08)' : 'transparent';

              return (
                <TouchableOpacity
                  key={row.team.id}
                  style={[
                    gs.row,
                    { borderBottomColor: c.border, backgroundColor: rowBg },
                    ri === group.standings.length - 1 && { borderBottomWidth: 0 },
                  ]}
                  onPress={() => navigation.push('TeamDetail', {
                    teamId: parseInt(row.team.id, 10),
                    teamName: row.team.name,
                    teamLogo: row.team.logo,
                  })}
                  activeOpacity={0.7}
                >
                  <View style={[gs.zoneBar, { backgroundColor: zoneColor || 'transparent' }]} />
                  <Text style={[gs.pos, { color: zoneColor || c.textTertiary }]}>{row.position}</Text>
                  <View style={gs.logoCell}>
                    {row.team.logo.startsWith('http')
                      ? <Image source={{ uri: row.team.logo }} style={{ width: 20, height: 20, borderRadius: 2 }} resizeMode="contain" />
                      : <Text style={{ fontSize: 16 }}>{row.team.logo}</Text>
                    }
                  </View>
                  <View style={gs.nameWrap}>
                    <Text style={[gs.name, { color: textColor }]} numberOfLines={1}>
                      {row.team.shortName || row.team.name}
                    </Text>
                    {isHome && (
                      <View style={[gs.badge, { backgroundColor: '#3b82f6' }]}>
                        <Text style={gs.badgeText}>LOC</Text>
                      </View>
                    )}
                    {isAway && (
                      <View style={[gs.badge, { backgroundColor: '#f97316' }]}>
                        <Text style={gs.badgeText}>VIS</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[gs.num, { color: c.textSecondary }]}>{row.played}</Text>
                  <Text style={[gs.num, { color: c.textSecondary }]}>{row.won}</Text>
                  <Text style={[gs.num, { color: c.textSecondary }]}>{row.drawn}</Text>
                  <Text style={[gs.num, { color: c.textSecondary }]}>{row.lost}</Text>
                  <Text style={[gs.gfga, { color: c.textTertiary }]}>{row.goalsFor}-{row.goalsAgainst}</Text>
                  <Text style={[gs.pts, { color: isHome || isAway ? textColor : c.textPrimary }]}>
                    {row.points}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
};

// ── Main component ───────────────────────────────────────────────────────────
interface TablaTabProps {
  match: Match;
  detail: MatchDetail;
  /** Called once when the competition is detected as a knockout cup */
  onCupDetected?: () => void;
}

export const TablaTab: React.FC<TablaTabProps> = ({ match, onCupDetected }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();
  const tableRef   = useRef<any>(null);
  const bracketRef = useRef<any>(null);
  const cupNotified = useRef(false);
  // Cup phase toggle: 'table' | 'groups' | 'bracket'
  // 'table'  → league-phase standings (e.g. UCL 2024/25 36-team table)
  // 'groups' → group-stage mini-tables (e.g. Copa Libertadores Groups A-H)
  // 'bracket'→ knockout rounds (all cups)
  const [cupPhase, setCupPhase] = useState<'table' | 'groups' | 'bracket'>('bracket');
  // Playoff toggle: 'table' | 'playoffs' (regular leagues with playoff bracket)
  const [leagueView, setLeagueView] = useState<'table' | 'playoffs'>('table');

  // ── League config + zones ────────────────────────────────────────────────────
  const leagueConfig =
    (match.leagueId ? getLeagueConfig(Number(match.leagueId)) : undefined)
    ?? (match.league ? getLeagueConfigByName(match.league) : undefined);

  const leagueZones = leagueConfig?.zones;

  const seasonId: number | null =
    (match.seasonId && match.seasonId > 0) ? match.seasonId
    : (leagueConfig?.currentSeasonId ?? null);

  // ── Standings (league competitions) ─────────────────────────────────────────
  const { standings, loading: standingsLoading, error: standingsError } = useStandings(seasonId);

  // ── Cup bracket logic ────────────────────────────────────────────────────────
  // A competition is a "cup" if:
  //   (a) explicitly marked isCup in leagues config (UCL, UEL, CONCACAF, etc.), OR
  //   (b) standings return [] after loading (auto-detection fallback)
  // For config-marked cups we fetch bracket immediately (no need to wait for standings).
  const leagueIsCupConfig = leagueConfig?.isCup ?? false;
  const isCupFromStandings = !standingsLoading && !standingsError && standings.length === 0;
  const isCup = leagueIsCupConfig || isCupFromStandings;

  // Leagues with BOTH standings and a playoff bracket (Liga MX, MLS, etc.)
  const hasPlayoffs     = leagueConfig?.hasPlayoffs ?? false;
  const playoffsLabel   = leagueConfig?.playoffsLabel ?? 'Playoffs';

  // Fetch bracket for cups AND for playoff leagues
  // isPlayoffsOnly=true filters out regular-season stages and isolates the current tournament
  const { rounds, loading: bracketLoading } = useCupBracket(
    (isCup || hasPlayoffs) ? seasonId : null,
    match.id,
    hasPlayoffs,
  );

  // Group stage (parallel fetch — only meaningful when isCup)
  const { result: groupsResult, loading: groupsLoading } = useCupGroupStandings(
    isCup ? seasonId : null,
  );

  // Notify parent once when cup is confirmed so it can rename the tab
  useEffect(() => {
    if (isCup && !cupNotified.current) {
      cupNotified.current = true;
      onCupDetected?.();
    }
  }, [isCup, onCupDetected]);

  // Config-marked cups skip the standings wait; auto-detected cups still need it
  const loading = (leagueIsCupConfig ? false : standingsLoading) || (isCup && bracketLoading);

  const homeId = match.homeTeam.id;
  const awayId = match.awayTeam.id;
  const isLive = match.status === 'live';

  // ── Live projected standings ─────────────────────────────────────────────────
  // SportMonks standings update after FT. During a live match we project the
  // result by applying the current score delta to the two playing teams.
  const liveStandings = useMemo<LeagueStanding[]>(() => {
    if (!isLive || standings.length === 0) return standings;

    const hs = match.homeScore ?? 0;
    const as_ = match.awayScore ?? 0;

    const cloned = standings.map(r => ({ ...r }));
    const homeRow = cloned.find(r => r.team.id === homeId);
    const awayRow = cloned.find(r => r.team.id === awayId);
    if (!homeRow || !awayRow) return standings;

    // Points delta
    if (hs > as_) {
      homeRow.points += 3; homeRow.won += 1;
      awayRow.lost += 1;
    } else if (as_ > hs) {
      awayRow.points += 3; awayRow.won += 1;
      homeRow.lost += 1;
    } else {
      homeRow.points += 1; homeRow.drawn += 1;
      awayRow.points += 1; awayRow.drawn += 1;
    }

    // Goals & played
    homeRow.played += 1;
    homeRow.goalsFor += hs;
    homeRow.goalsAgainst += as_;
    homeRow.goalDifference = homeRow.goalsFor - homeRow.goalsAgainst;

    awayRow.played += 1;
    awayRow.goalsFor += as_;
    awayRow.goalsAgainst += hs;
    awayRow.goalDifference = awayRow.goalsFor - awayRow.goalsAgainst;

    // Re-sort by points → goal diff → goals for
    return [...cloned]
      .sort((a, b) =>
        b.points !== a.points ? b.points - a.points :
        b.goalDifference !== a.goalDifference ? b.goalDifference - a.goalDifference :
        b.goalsFor - a.goalsFor,
      )
      .map((r, idx) => ({ ...r, position: idx + 1 }));
  }, [standings, isLive, match.homeScore, match.awayScore, homeId, awayId]);

  const handleShare = async () => {
    if (!ViewShot || !Sharing || !tableRef.current) return;
    try {
      const uri = await tableRef.current.capture();
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t('common.share') });
      }
    } catch (e) {
      console.warn('Share failed', e);
    }
  };

  const handleBracketShare = async () => {
    if (!ViewShot || !Sharing || !bracketRef.current) return;
    try {
      const uri = await bracketRef.current.capture();
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t('common.share') });
      }
    } catch (e) {
      console.warn('Bracket share failed', e);
    }
  };

  // ── Projected Liguilla ───────────────────────────────────────────────────────
  // For leagues with hasPlayoffs (Liga MX, MLS, etc.) we ALWAYS build a projected
  // bracket from the current standings while the season is running:
  //   QF:    1v8 · 2v7 · 3v6 · 4v5  (real teams from standings)
  //   SF:    winner QF1 vs winner QF4 · winner QF2 vs winner QF3  (inferred)
  //   Final: winner SF1 vs winner SF2  (inferred)
  // Lets fans see "si hoy acabara la liga, así serían los cruces" in real-time.
  // The projected view is replaced by the official bracket only when SportMonks
  // returns ties whose teams are ALL real (no placeholder seedings like "TBC").
  const projectedRounds = useMemo<CupRound[]>(() => {
    if (!hasPlayoffs || liveStandings.length < 8) return [];
    const top8 = liveStandings.slice(0, 8);

    // Abbreviate long team names for "Ganador X vs Y" labels
    const abbr = (name: string) => {
      if (name.length <= 12) return name;
      const first = name.split(' ')[0];
      return first.length >= 3 ? first : name.slice(0, 12) + '…';
    };

    // QF tie (real teams from standings)
    const makeQfTie = (homeRow: LeagueStanding, awayRow: LeagueStanding, idx: number): CupTie => ({
      id: `projected-qf-${idx}`,
      homeTeam: homeRow.team,
      awayTeam: awayRow.team,
      legs: [],
      aggregate: null,
      winner: null,
      isCurrentMatch:
        homeRow.team.id === homeId || awayRow.team.id === homeId ||
        homeRow.team.id === awayId || awayRow.team.id === awayId,
      isFinished: false,
    });

    // Inferred tie — "Ganador X vs Y"
    const makeNextTie = (feedA: CupTie, feedB: CupTie, key: string): CupTie => {
      const homeName = t('cup.winner', {
        teams: `${abbr(feedA.homeTeam.name)} vs ${abbr(feedA.awayTeam.name)}`,
      });
      const awayName = t('cup.winner', {
        teams: `${abbr(feedB.homeTeam.name)} vs ${abbr(feedB.awayTeam.name)}`,
      });
      return {
        id: `projected-${key}`,
        homeTeam: { id: `tbd-${key}-h`, name: homeName, shortName: 'TBD', logo: '⚽' },
        awayTeam: { id: `tbd-${key}-a`, name: awayName, shortName: 'TBD', logo: '⚽' },
        legs: [],
        aggregate: null,
        winner: null,
        isCurrentMatch: false,
        isFinished: false,
      };
    };

    const qfTies: CupTie[] = [
      makeQfTie(top8[0], top8[7], 0),  // 1 vs 8
      makeQfTie(top8[1], top8[6], 1),  // 2 vs 7
      makeQfTie(top8[2], top8[5], 2),  // 3 vs 6
      makeQfTie(top8[3], top8[4], 3),  // 4 vs 5
    ];

    // SF: top bracket (QF1 winner vs QF4 winner) · bottom bracket (QF2 vs QF3)
    const sfTies: CupTie[] = [
      makeNextTie(qfTies[0], qfTies[3], 'sf0'),
      makeNextTie(qfTies[1], qfTies[2], 'sf1'),
    ];

    // Final: winner of each SF
    const finalTies: CupTie[] = [
      makeNextTie(sfTies[0], sfTies[1], 'final'),
    ];

    return [
      { id: -99999, name: t('cup.quarterfinals'), sortOrder: 1, isCurrent: false, isFinished: false, ties: qfTies },
      { id: -99998, name: t('cup.semifinals'),    sortOrder: 2, isCurrent: false, isFinished: false, ties: sfTies },
      { id: -99997, name: t('cup.final'),         sortOrder: 3, isCurrent: false, isFinished: false, ties: finalTies },
    ];
  }, [hasPlayoffs, liveStandings, t, homeId, awayId]);

  if (loading) {
    return <SkeletonLeagueDetail />;
  }

  // ── Cup view (bracket ± group stage ± league-phase table) ───────────────────
  if (isCup) {
    const seasonStr = `Temporada ${new Date().getFullYear() - 1}/${String(new Date().getFullYear()).slice(2)}`;
    const hasGroups   = groupsResult.hasGroups && groupsResult.groups.length > 0;
    const hasCupTable = !standingsLoading && standings.length > 0;

    // Show toggle whenever more than one phase is available
    const showToggle = hasGroups || hasCupTable;

    return (
      <View style={{ flex: 1 }}>
        {/* Phase toggle: Tabla | Grupos | Bracket */}
        {showToggle && (
          <View style={[ph.toggleRow, { borderBottomColor: c.border }]}>
            {hasCupTable && (
              <TouchableOpacity
                style={[ph.pill, cupPhase === 'table' && { backgroundColor: c.accent }]}
                onPress={() => setCupPhase('table')}
                activeOpacity={0.8}
              >
                <Text style={[ph.pillText, { color: cupPhase === 'table' ? '#000' : c.textSecondary }]}>
                  {t('matchTabs.standings')}
                </Text>
              </TouchableOpacity>
            )}
            {hasGroups && (
              <TouchableOpacity
                style={[ph.pill, cupPhase === 'groups' && { backgroundColor: c.accent }]}
                onPress={() => setCupPhase('groups')}
                activeOpacity={0.8}
              >
                <Text style={[ph.pillText, { color: cupPhase === 'groups' ? '#000' : c.textSecondary }]}>
                  {t('cup.groups')}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[ph.pill, cupPhase === 'bracket' && { backgroundColor: c.accent }]}
              onPress={() => setCupPhase('bracket')}
              activeOpacity={0.8}
            >
              <Text style={[ph.pillText, { color: cupPhase === 'bracket' ? '#000' : c.textSecondary }]}>
                {t('cup.bracket')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tabla — league-phase standings (UCL, UEL, Copa Libertadores league phase, etc.) */}
        {cupPhase === 'table' && hasCupTable && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }}>
            <HeaderRow />
            {standings.map((row, idx) => {
              // Zone divider when groupId changes (e.g. UCL direct / play-off / eliminated)
              const prevGroupId = idx > 0 ? standings[idx - 1].groupId : row.groupId;
              const showDivider = idx > 0 && row.groupId != null && row.groupId !== prevGroupId;
              return (
                <React.Fragment key={row.team.id}>
                  {showDivider && (
                    <View style={{ height: 6, backgroundColor: c.bg }} />
                  )}
                  <StandingRow
                    row={row}
                    isHome={row.team.id === homeId}
                    isAway={row.team.id === awayId}
                    totalTeams={standings.length}
                    zones={leagueZones}
                  />
                </React.Fragment>
              );
            })}
          </ScrollView>
        )}

        {/* Grupos — mini group-stage tables */}
        {cupPhase === 'groups' && hasGroups && (
          groupsLoading
            ? <SkeletonLeagueDetail />
            : <GroupStageView
                groups={groupsResult.groups}
                homeTeamId={match.homeTeam.id}
                awayTeamId={match.awayTeam.id}
                leagueZones={leagueZones}
              />
        )}

        {/* Bracket — knockout rounds */}
        {cupPhase === 'bracket' && (
          <CupBracketView
            rounds={rounds}
            leagueName={match.league}
            seasonStr={seasonStr}
          />
        )}

        {/* Fallback when no toggle: always show bracket */}
        {!showToggle && cupPhase !== 'bracket' && (
          <CupBracketView
            rounds={rounds}
            leagueName={match.league}
            seasonStr={seasonStr}
          />
        )}
      </View>
    );
  }

  // ── Error / no data ──────────────────────────────────────────────────────────
  if (standingsError) {
    return (
      <View style={[tb.center, { paddingTop: 60 }]}>
        <Text style={{ fontSize: 40 }}>📋</Text>
        <Text style={[tb.emptyTitle, { color: c.textSecondary }]}>Error al cargar la tabla</Text>
      </View>
    );
  }

  const seasonStr = `Temporada ${new Date().getFullYear() - 1}/${String(new Date().getFullYear()).slice(2)}`;

  // Shared toggle for hasPlayoffs leagues (used in both views)
  const PlayoffsToggle = hasPlayoffs ? (
    <View style={[ph.toggleRow, { borderBottomColor: c.border }]}>
      <TouchableOpacity
        style={[ph.pill, leagueView === 'table' && { backgroundColor: c.accent }]}
        onPress={() => setLeagueView('table')}
        activeOpacity={0.8}
      >
        <Text style={[ph.pillText, { color: leagueView === 'table' ? '#000' : c.textSecondary }]}>
          {t('matchTabs.standings')}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[ph.pill, leagueView === 'playoffs' && { backgroundColor: c.accent }]}
        onPress={() => setLeagueView('playoffs')}
        activeOpacity={0.8}
      >
        <Text style={[ph.pillText, { color: leagueView === 'playoffs' ? '#000' : c.textSecondary }]}>
          {playoffsLabel}
        </Text>
      </TouchableOpacity>
    </View>
  ) : null;

  // ── Playoff bracket view (league with hasPlayoffs) ───────────────────────────
  if (hasPlayoffs && leagueView === 'playoffs') {
    // "Official" bracket = SportMonks has ties where ALL teams are real (no placeholders).
    // Placeholder detection: any team name that's an ordinal seeding or "TBC" variant.
    const PLACEHOLDER_RE = /lugar$|place$|sıra$|posto$|Platz\s+\d|^Por definir|^To be|^A definir|^Belirsiz|^Da definire/i;
    const hasOfficialBracket = !bracketLoading && rounds.length > 0 &&
      rounds[0].ties.every(tie =>
        !PLACEHOLDER_RE.test(tie.homeTeam.name) && !PLACEHOLDER_RE.test(tie.awayTeam.name),
      );

    // Default: use standings-based projection (live, always up-to-date)
    // Switch to API rounds only when all teams are confirmed real
    const isProjected = !hasOfficialBracket;
    const displayRounds = hasOfficialBracket ? rounds : projectedRounds;

    // Content to capture (banner + bracket) — extracted so ViewShot wraps both
    const BracketContent = (
      <View style={{ backgroundColor: c.bg }}>
        {/* "Liguilla al momento" banner */}
        {isProjected && (
          <View style={[ph.projectedBanner, { backgroundColor: 'rgba(139,92,246,0.10)', borderColor: 'rgba(139,92,246,0.25)' }]}>
            <Text style={[ph.projectedTitle, { color: '#a78bfa' }]}>
              🔮 {t('cup.projectedBracket')} · {match.league}
            </Text>
            <Text style={[ph.projectedSub, { color: '#7c6fad' }]}>
              {t('cup.basedOnTable')}
            </Text>
          </View>
        )}
        <CupBracketView rounds={displayRounds} leagueName={match.league} seasonStr={seasonStr} />
      </View>
    );

    return (
      <View style={{ flex: 1 }}>
        {PlayoffsToggle}
        {bracketLoading ? (
          <SkeletonLeagueDetail />
        ) : (
          <>
            {/* Wrap in ViewShot for sharing */}
            {ViewShot
              ? <ViewShot ref={bracketRef} options={{ format: 'png', quality: 0.95 }}>{BracketContent}</ViewShot>
              : BracketContent
            }

            {/* Share card */}
            {ViewShot && Sharing && (
              <View style={[ph.shareCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                {/* Header row: icon + title */}
                <View style={ph.shareCardHeader}>
                  <View style={[ph.shareCardIconWrap, { backgroundColor: 'rgba(0,224,150,0.12)' }]}>
                    <ShareIcon color={c.accent} size={18} />
                  </View>
                  <Text style={[ph.shareCardTitle, { color: c.textPrimary }]}>
                    {t('cup.shareCardTitle')}
                  </Text>
                </View>
                {/* Description */}
                <Text style={[ph.shareCardDesc, { color: c.textSecondary }]}>
                  {t('cup.shareCardDesc')}
                </Text>
                {/* CTA button */}
                <TouchableOpacity
                  style={[ph.shareCardBtn, { backgroundColor: c.accent }]}
                  onPress={handleBracketShare}
                  activeOpacity={0.82}
                >
                  <ShareIcon color="#000" size={15} />
                  <Text style={ph.shareCardBtnText}>
                    {t('common.share').toUpperCase()}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </View>
    );
  }

  const TableContent = (
    <>
      {/* Tabla / Liguilla toggle — shown at top of standings when hasPlayoffs */}
      {PlayoffsToggle}

      {/* League header */}
      <TouchableOpacity
        style={tb.leagueHeader}
        activeOpacity={0.7}
        onPress={() => navigation.push('LeagueDetail', {
          leagueId: Number(match.leagueId) || 0,
          leagueName: match.league,
          seasonId: match.seasonId,
        })}
      >
        <Text style={{ fontSize: 28 }}>🏆</Text>
        <View style={{ flex: 1 }}>
          <Text style={[tb.leagueName, { color: c.textPrimary }]}>{match.league}</Text>
          <Text style={[tb.leagueSeason, { color: c.textTertiary }]}>{seasonStr} · Jornada</Text>
        </View>
      </TouchableOpacity>

      {/* Live projection banner */}
      {isLive && (
        <View style={tb.liveBanner}>
          <Text style={tb.liveBannerText}>⚡ Proyección en vivo · si el resultado se mantiene</Text>
        </View>
      )}

      {/* Table */}
      <View style={[tb.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <HeaderRow />
        {liveStandings.map((row, idx) => (
          <React.Fragment key={row.team.id}>
            {idx > 0 && row.groupId != null && liveStandings[idx - 1].groupId != null && row.groupId !== liveStandings[idx - 1].groupId && (
              <View style={{ height: 2, backgroundColor: c.border, marginVertical: 2 }} />
            )}
            <StandingRow
              row={row}
              isHome={row.team.id === homeId}
              isAway={row.team.id === awayId}
              totalTeams={liveStandings.length}
              zones={leagueZones}
              isProjected={isLive && (row.team.id === homeId || row.team.id === awayId)}
            />
          </React.Fragment>
        ))}
      </View>

      {/* Zone legend — dynamic per league, fallback for European generic */}
      <View style={tb.legend}>
        {leagueZones && leagueZones.length > 0
          ? leagueZones.map((z, i) => (
              <View key={i} style={tb.legendItem}>
                <View style={[tb.legendBar, { backgroundColor: z.color }]} />
                <Text style={[tb.legendText, { color: c.textTertiary }]}>{z.label}</Text>
              </View>
            ))
          : (
            <>
              <View style={tb.legendItem}>
                <View style={[tb.legendBar, { backgroundColor: '#fbbf24' }]} />
                <Text style={[tb.legendText, { color: c.textTertiary }]}>Campeón</Text>
              </View>
              <View style={tb.legendItem}>
                <View style={[tb.legendBar, { backgroundColor: '#3b82f6' }]} />
                <Text style={[tb.legendText, { color: c.textTertiary }]}>Champions League</Text>
              </View>
              <View style={tb.legendItem}>
                <View style={[tb.legendBar, { backgroundColor: '#f97316' }]} />
                <Text style={[tb.legendText, { color: c.textTertiary }]}>Europa League</Text>
              </View>
              <View style={tb.legendItem}>
                <View style={[tb.legendBar, { backgroundColor: '#ef4444' }]} />
                <Text style={[tb.legendText, { color: c.textTertiary }]}>Descenso</Text>
              </View>
            </>
          )
        }
      </View>
    </>
  );

  return (
    <View style={tb.outer}>
      {ViewShot ? (
        <ViewShot ref={tableRef} options={{ format: 'png', quality: 0.95 }}>
          {TableContent}
        </ViewShot>
      ) : TableContent}

      {/* Share card */}
      {ViewShot && Sharing && (
        <View style={[ph.shareCard, { backgroundColor: c.surface, borderColor: c.border, marginHorizontal: 0 }]}>
          <View style={ph.shareCardHeader}>
            <View style={[ph.shareCardIconWrap, { backgroundColor: 'rgba(0,224,150,0.12)' }]}>
              <ShareIcon color={c.accent} size={18} />
            </View>
            <Text style={[ph.shareCardTitle, { color: c.textPrimary }]}>
              {t('league.shareTableTitle')}
            </Text>
          </View>
          <Text style={[ph.shareCardDesc, { color: c.textSecondary }]}>
            {t('league.shareTableDesc')}
          </Text>
          <TouchableOpacity
            style={[ph.shareCardBtn, { backgroundColor: c.accent }]}
            onPress={handleShare}
            activeOpacity={0.82}
          >
            <ShareIcon color="#000" size={15} />
            <Text style={ph.shareCardBtnText}>
              {t('common.share').toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ height: 8 }} />
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerRow: { paddingVertical: 8 },
  zoneBar: { width: 3, height: '100%', borderRadius: 1.5, marginRight: 6 },
  pos: { width: 22, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  logoCell: { width: 26, alignItems: 'center', marginRight: 4 },
  nameWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  matchBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  matchBadgeText: { fontSize: 8, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  liveProjectedDot: { fontSize: 11 },
  num: { width: 22, fontSize: 12, textAlign: 'center' },
  gfga: { width: 38, fontSize: 11, textAlign: 'center' },
  gd: { width: 30, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  pts: { width: 30, fontSize: 14, fontWeight: '900', textAlign: 'center' },

  headerCell: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3, textAlign: 'center' },
  headerName: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  headerNum: { width: 22, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  headerGfga: { width: 38, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  headerGd: { width: 30, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  headerPts: { width: 30, fontSize: 10, fontWeight: '700', textAlign: 'center' },
});

// ── Phase toggle styles ───────────────────────────────────────────────────────
const ph = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  pill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // Projected bracket banner
  projectedBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 2,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  projectedTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  projectedSub: {
    fontSize: 11,
    fontWeight: '500',
  },
  // Share card
  shareCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 10,
  },
  shareCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shareCardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    flex: 1,
  },
  shareCardDesc: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '400',
  },
  shareCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 2,
  },
  shareCardBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000',
    letterSpacing: 0.8,
  },
});

// ── Group stage styles ────────────────────────────────────────────────────────
const gs = StyleSheet.create({
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 2,
  },
  groupTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, flex: 1 },
  groupHeaderCols: { flexDirection: 'row', gap: 0 },
  headerNum: { width: 22, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  headerGfga: { width: 38, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  headerPts: { width: 30, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  groupCard: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  zoneBar: { width: 3, height: '100%', borderRadius: 1.5, marginRight: 6 },
  pos: { width: 20, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  logoCell: { width: 24, alignItems: 'center', marginRight: 4 },
  nameWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  badge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  badgeText: { fontSize: 7, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  num: { width: 22, fontSize: 11, textAlign: 'center' },
  gfga: { width: 38, fontSize: 11, textAlign: 'center' },
  pts: { width: 30, fontSize: 13, fontWeight: '900', textAlign: 'center' },
});

const tb = StyleSheet.create({
  outer: { paddingHorizontal: 16, paddingTop: 8 },
  center: { alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 13, marginTop: 12 },
  emptyTitle: { fontSize: 15, fontWeight: '600', textAlign: 'center' },

  leagueHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginBottom: 12, paddingHorizontal: 4,
  },
  leagueName: { fontSize: 18, fontWeight: '800' },
  leagueSeason: { fontSize: 12, fontWeight: '500', marginTop: 2 },

  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 8 },

  liveBanner: {
    backgroundColor: 'rgba(234,179,8,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(234,179,8,0.25)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  liveBannerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#eab308',
    letterSpacing: 0.2,
  },

  legend: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 14,
    paddingHorizontal: 4, paddingVertical: 10,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendBar: { width: 3, height: 14, borderRadius: 1.5 },
  legendText: { fontSize: 11, fontWeight: '600' },

  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 16, marginTop: 4,
  },
  shareBtnText: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 1 },
});
