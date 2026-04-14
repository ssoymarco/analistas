// ── Tabla (Standings) Tab ─────────────────────────────────────────────────────
// League standings with zone color bars, LOCAL/VISITA badges, trophy header,
// zone legend, and share button. Redesigned per Figma.
import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useThemeColors } from '../../theme/useTheme';
import { useStandings } from '../../hooks/useStandings';
import type { Match, MatchDetail, LeagueStanding } from '../../data/types';
import { SkeletonLeagueDetail } from '../../components/Skeleton';
import type { PartidosStackParamList } from '../../navigation/AppNavigator';

// ── Dynamic imports ──────────────────────────────────────────────────────────
let ViewShot: any = null;
let Sharing: any  = null;
try { ViewShot = require('react-native-view-shot').default; } catch {}
try { Sharing   = require('expo-sharing'); } catch {}

// ── Zone colors ──────────────────────────────────────────────────────────────
function getZoneColor(position: number, totalTeams: number): string | null {
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

// ── Share icon ───────────────────────────────────────────────────────────────
function ShareIcon({ color, size = 16 }: { color: string; size?: number }) {
  const s = size;
  const dotR = s * 0.15;
  return (
    <View style={{ width: s, height: s }}>
      <View style={{ position: 'absolute', top: 0, right: 0, width: dotR * 2, height: dotR * 2, borderRadius: dotR, backgroundColor: color }} />
      <View style={{ position: 'absolute', top: s * 0.36, left: 0, width: dotR * 2, height: dotR * 2, borderRadius: dotR, backgroundColor: color }} />
      <View style={{ position: 'absolute', bottom: 0, right: 0, width: dotR * 2, height: dotR * 2, borderRadius: dotR, backgroundColor: color }} />
      <View style={{ position: 'absolute', top: s * 0.18, left: s * 0.18, width: s * 0.52, height: 1.5, backgroundColor: color, transform: [{ rotate: '-25deg' }] }} />
      <View style={{ position: 'absolute', top: s * 0.62, left: s * 0.18, width: s * 0.52, height: 1.5, backgroundColor: color, transform: [{ rotate: '25deg' }] }} />
    </View>
  );
}

// ── Standing row ─────────────────────────────────────────────────────────────
const StandingRow: React.FC<{
  row: LeagueStanding;
  isHome: boolean;
  isAway: boolean;
  totalTeams: number;
}> = ({ row, isHome, isAway, totalTeams }) => {
  const c = useThemeColors();

  const zoneColor = getZoneColor(row.position, totalTeams);
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
    <View style={[st.row, { borderBottomColor: c.border, backgroundColor: rowBg }]}>
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
      </View>

      {/* Stats */}
      <Text style={[st.num, { color: c.textSecondary }]}>{row.played}</Text>
      <Text style={[st.num, { color: c.textSecondary }]}>{row.won}</Text>
      <Text style={[st.num, { color: c.textSecondary }]}>{row.drawn}</Text>
      <Text style={[st.num, { color: c.textSecondary }]}>{row.lost}</Text>
      <Text style={[st.gfga, { color: c.textTertiary }]}>{row.goalsFor}-{row.goalsAgainst}</Text>
      <Text style={[st.gd, { color: gdColor }]}>{gd}</Text>
      <Text style={[st.pts, { color: isHighlighted ? textColor : c.textPrimary }]}>{row.points}</Text>
    </View>
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

// ── Main component ───────────────────────────────────────────────────────────
export const TablaTab: React.FC<{ match: Match; detail: MatchDetail }> = ({ match }) => {
  const c = useThemeColors();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();
  const tableRef = useRef<any>(null);

  // Use match.seasonId first, fallback to league config
  const leagueConfig = (() => {
    try {
      const { getLeagueConfig: getLc } = require('../../config/leagues');
      return getLc(Number(match.leagueId));
    } catch { return null; }
  })();
  const seasonId = match.seasonId ?? leagueConfig?.currentSeasonId ?? null;
  const { standings, loading, error } = useStandings(seasonId);

  const homeId = match.homeTeam.id;
  const awayId = match.awayTeam.id;

  const handleShare = async () => {
    if (!ViewShot || !Sharing || !tableRef.current) return;
    try {
      const uri = await tableRef.current.capture();
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartir tabla' });
      }
    } catch (e) {
      console.warn('Share failed', e);
    }
  };

  if (loading) {
    return <SkeletonLeagueDetail />;
  }

  if (error || standings.length === 0) {
    return (
      <View style={[tb.center, { paddingTop: 60 }]}>
        <Text style={{ fontSize: 40 }}>📋</Text>
        <Text style={[tb.emptyTitle, { color: c.textSecondary }]}>
          {error ? 'Error al cargar la tabla' : 'Tabla no disponible'}
        </Text>
      </View>
    );
  }

  const seasonStr = `Temporada ${new Date().getFullYear() - 1}/${String(new Date().getFullYear()).slice(2)}`;

  const TableContent = (
    <>
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

      {/* Table */}
      <View style={[tb.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <HeaderRow />
        {standings.map((row, idx) => (
          <React.Fragment key={row.team.id}>
            {/* Group divider for multi-group leagues (e.g. championship/relegation split) */}
            {idx > 0 && row.groupId != null && standings[idx - 1].groupId != null && row.groupId !== standings[idx - 1].groupId && (
              <View style={{ height: 2, backgroundColor: c.border, marginVertical: 2 }} />
            )}
            <StandingRow
              row={row}
              isHome={row.team.id === homeId}
              isAway={row.team.id === awayId}
              totalTeams={standings.length}
            />
          </React.Fragment>
        ))}
      </View>

      {/* Zone legend */}
      <View style={tb.legend}>
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

      {/* Share button */}
      {ViewShot && Sharing && (
        <TouchableOpacity
          style={[tb.shareBtn, { backgroundColor: c.accent }]}
          onPress={handleShare}
          activeOpacity={0.85}
        >
          <ShareIcon color="#fff" size={16} />
          <Text style={tb.shareBtnText}>COMPARTIR</Text>
        </TouchableOpacity>
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
