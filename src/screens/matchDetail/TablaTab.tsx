// ── Tabla (Standings) Tab ─────────────────────────────────────────────────────
// Shows league standings with team highlights + share via ViewShot
import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useThemeColors } from '../../theme/useTheme';
import { useStandings } from '../../hooks/useStandings';
import type { Match, MatchDetail, LeagueStanding } from '../../data/types';

// ── Dynamic require for optional packages ─────────────────────────────────────
let ViewShot: any = null;
let Sharing: any = null;
try { ViewShot = require('react-native-view-shot').default; } catch {}
try { Sharing   = require('expo-sharing'); } catch {}

// ── Team logo (smart: URL vs emoji) ──────────────────────────────────────────
const TeamLogo: React.FC<{ logo: string; size?: number }> = ({ logo, size = 20 }) => {
  const isUrl = logo.startsWith('http');
  if (isUrl) {
    return <Image source={{ uri: logo }} style={{ width: size, height: size, borderRadius: 2 }} resizeMode="contain" />;
  }
  return <Text style={{ fontSize: size - 4 }}>{logo}</Text>;
};

// ── Standing row ──────────────────────────────────────────────────────────────
const StandingRow: React.FC<{
  row: LeagueStanding;
  isHome: boolean;
  isAway: boolean;
  isHeader?: boolean;
}> = ({ row, isHome, isAway }) => {
  const c = useThemeColors();

  const highlight = isHome
    ? { backgroundColor: 'rgba(59,130,246,0.12)', borderLeftWidth: 3, borderLeftColor: '#3b82f6' }
    : isAway
    ? { backgroundColor: 'rgba(249,115,22,0.12)', borderLeftWidth: 3, borderLeftColor: '#f97316' }
    : {};

  const textColor = isHome ? '#3b82f6' : isAway ? '#f97316' : c.textPrimary;

  const gd = row.goalDifference > 0 ? `+${row.goalDifference}` : `${row.goalDifference}`;

  return (
    <View style={[st.row, { borderBottomColor: c.border }, highlight]}>
      <Text style={[st.pos, { color: c.textTertiary }]}>{row.position}</Text>
      <View style={st.logoCell}>
        <TeamLogo logo={row.team.logo} size={20} />
      </View>
      <Text style={[st.name, { color: textColor }]} numberOfLines={1}>{row.team.shortName}</Text>
      <Text style={[st.num, { color: c.textSecondary }]}>{row.played}</Text>
      <Text style={[st.num, { color: c.textSecondary }]}>{row.won}</Text>
      <Text style={[st.num, { color: c.textSecondary }]}>{row.drawn}</Text>
      <Text style={[st.num, { color: c.textSecondary }]}>{row.lost}</Text>
      <Text style={[st.num, { color: c.textTertiary }]}>{gd}</Text>
      <Text style={[st.pts, { color: textColor }]}>{row.points}</Text>
    </View>
  );
};

// ── Header row ────────────────────────────────────────────────────────────────
const HeaderRow: React.FC = () => {
  const c = useThemeColors();
  return (
    <View style={[st.row, st.headerRow, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
      <Text style={[st.headerCell, { width: 24, color: c.textTertiary }]}>#</Text>
      <View style={{ width: 24 }} />
      <Text style={[st.headerName, { color: c.textTertiary }]}>Equipo</Text>
      <Text style={[st.headerNum, { color: c.textTertiary }]}>PJ</Text>
      <Text style={[st.headerNum, { color: c.textTertiary }]}>G</Text>
      <Text style={[st.headerNum, { color: c.textTertiary }]}>E</Text>
      <Text style={[st.headerNum, { color: c.textTertiary }]}>P</Text>
      <Text style={[st.headerNum, { color: c.textTertiary }]}>DG</Text>
      <Text style={[st.headerPts, { color: c.textTertiary }]}>Pts</Text>
    </View>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
export const TablaTab: React.FC<{ match: Match; detail: MatchDetail }> = ({ match }) => {
  const c = useThemeColors();
  const tableRef = useRef<any>(null);

  // Use the season from the match, fall back to null (no standings)
  const seasonId = match.seasonId ?? null;
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

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[tb.center, { paddingTop: 60 }]}>
        <ActivityIndicator size="large" color={c.accent} />
        <Text style={[tb.loadingText, { color: c.textTertiary }]}>Cargando tabla…</Text>
      </View>
    );
  }

  // ── Empty / error state ────────────────────────────────────────────────────
  if (error || standings.length === 0) {
    return (
      <View style={[tb.center, { paddingTop: 60 }]}>
        <Text style={{ fontSize: 40 }}>📋</Text>
        <Text style={[tb.emptyTitle, { color: c.textSecondary }]}>
          {error ? 'Error al cargar la tabla' : 'Tabla no disponible'}
        </Text>
        {!seasonId && (
          <Text style={[tb.emptySubtitle, { color: c.textTertiary }]}>
            Esta liga no tiene información de temporada
          </Text>
        )}
      </View>
    );
  }

  // ── Legend ─────────────────────────────────────────────────────────────────
  const Legend: React.FC = () => (
    <View style={tb.legend}>
      <View style={tb.legendItem}>
        <View style={[tb.legendDot, { backgroundColor: '#3b82f6' }]} />
        <Text style={[tb.legendText, { color: c.textTertiary }]}>{match.homeTeam.shortName}</Text>
      </View>
      <View style={tb.legendItem}>
        <View style={[tb.legendDot, { backgroundColor: '#f97316' }]} />
        <Text style={[tb.legendText, { color: c.textTertiary }]}>{match.awayTeam.shortName}</Text>
      </View>
    </View>
  );

  return (
    <View style={tb.outer}>
      {/* Capturable area */}
      {ViewShot ? (
        <ViewShot ref={tableRef} options={{ format: 'png', quality: 0.95 }}>
          <View style={[tb.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[tb.title, { color: c.textTertiary }]}>{match.league.toUpperCase()}</Text>
            <HeaderRow />
            {standings.map((row) => (
              <StandingRow
                key={row.team.id}
                row={row}
                isHome={row.team.id === homeId}
                isAway={row.team.id === awayId}
              />
            ))}
          </View>
          <Legend />
        </ViewShot>
      ) : (
        <>
          <View style={[tb.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[tb.title, { color: c.textTertiary }]}>{match.league.toUpperCase()}</Text>
            <HeaderRow />
            {standings.map((row) => (
              <StandingRow
                key={row.team.id}
                row={row}
                isHome={row.team.id === homeId}
                isAway={row.team.id === awayId}
              />
            ))}
          </View>
          <Legend />
        </>
      )}

      {/* Share button */}
      {ViewShot && Sharing && (
        <TouchableOpacity
          style={[tb.shareBtn, { backgroundColor: c.accent }]}
          onPress={handleShare}
          activeOpacity={0.85}
        >
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
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  headerRow: { paddingVertical: 7 },
  pos: { width: 24, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  logoCell: { width: 24, alignItems: 'center' },
  name: { flex: 1, fontSize: 13, fontWeight: '600', marginLeft: 6 },
  num: { width: 26, fontSize: 12, textAlign: 'center' },
  pts: { width: 30, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  headerCell: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textAlign: 'center' },
  headerName: { flex: 1, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginLeft: 6 },
  headerNum:  { width: 26, fontSize: 10, fontWeight: '700', textAlign: 'center', letterSpacing: 0.3 },
  headerPts:  { width: 30, fontSize: 10, fontWeight: '700', textAlign: 'center', letterSpacing: 0.3 },
});

const tb = StyleSheet.create({
  outer: { paddingHorizontal: 16, paddingTop: 8 },
  center: { alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 13, marginTop: 12 },
  emptyTitle: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  emptySubtitle: { fontSize: 12, textAlign: 'center', marginTop: 4 },
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 8 },
  title: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  legend: { flexDirection: 'row', gap: 16, paddingHorizontal: 4, marginBottom: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, fontWeight: '600' },
  shareBtn: {
    borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  shareBtnText: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 1 },
});
