// ── Alineación Tab ────────────────────────────────────────────────────────────
// Both teams on the same pitch simultaneously.
// Home = top half (GK at top), Away = bottom half (GK at bottom).
// Pitch color adapts to dark / light mode.
// COMPARTIR button captures and shares via ViewShot + expo-sharing.
import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useThemeColors } from '../../theme/useTheme';
import { useDarkMode } from '../../contexts/DarkModeContext';
import type { Match, MatchDetail, LineupPlayer } from '../../data/types';

// ── Optional packages (graceful degradation if missing) ──────────────────────
let ViewShot: any = null;
let Sharing: any   = null;
try { ViewShot = require('react-native-view-shot').default; } catch {}
try { Sharing   = require('expo-sharing'); } catch {}

// ── Constants ─────────────────────────────────────────────────────────────────
const HOME_COLOR  = '#3b82f6';   // blue  — local
const AWAY_COLOR  = '#f97316';   // orange — visitante
const PITCH_HEIGHT = 360;
const DOT_SIZE     = 28;

// ── Group starters into formation rows ────────────────────────────────────────
function groupIntoRows(starters: LineupPlayer[]): LineupPlayer[][] {
  // If SM formation_field data is present, use formationRow
  const hasRows = starters.some(p => p.formationRow != null);

  if (hasRows) {
    const rowMap = new Map<number, LineupPlayer[]>();
    for (const p of starters) {
      const r = p.formationRow ?? 99;
      if (!rowMap.has(r)) rowMap.set(r, []);
      rowMap.get(r)!.push(p);
    }
    return Array.from(rowMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([, ps]) => [...ps].sort((a, b) => (a.formationCol ?? 0) - (b.formationCol ?? 0)));
  }

  // Fallback: bucket by y coordinate bands (mock data)
  const sorted = [...starters].sort((a, b) => a.y - b.y);
  const rows: LineupPlayer[][] = [];
  let bucket: LineupPlayer[] = [];
  let lastY = -999;
  for (const p of sorted) {
    if (Math.abs(p.y - lastY) > 14 && bucket.length > 0) {
      rows.push([...bucket].sort((a, b) => a.x - b.x));
      bucket = [];
    }
    bucket.push(p);
    lastY = p.y;
  }
  if (bucket.length > 0) rows.push([...bucket].sort((a, b) => a.x - b.x));
  return rows;
}

// ── Player dot ────────────────────────────────────────────────────────────────
const PlayerDot: React.FC<{ player: LineupPlayer; color: string }> = ({ player, color }) => {
  // Visual state
  let bgColor = color;
  let borderStyle = {};
  if (player.redCard)    { bgColor = '#dc2626'; }
  else if (player.yellowCard) { bgColor = mixColor(color, '#ca8a04', 0.5); }
  if (player.isCaptain)  { borderStyle = { borderWidth: 2, borderColor: '#fbbf24' }; }

  const subBadge = player.isSubstituted;
  const goalBadge = (player.goals ?? 0) > 0;

  return (
    <View style={st.dotWrap}>
      <View style={st.dotOuter}>
        {/* Goal badge (top-left) */}
        {goalBadge && (
          <View style={st.goalBadge}>
            <Text style={st.goalBadgeText}>⚽</Text>
          </View>
        )}
        {/* Sub badge (top-right) */}
        {subBadge && (
          <View style={st.subBadge}>
            <Text style={st.subBadgeText}>↓</Text>
          </View>
        )}
        <View style={[st.dot, { backgroundColor: bgColor }, borderStyle]}>
          <Text style={st.dotNum}>{player.number}</Text>
        </View>
      </View>
      <Text style={st.dotName} numberOfLines={1}>{player.shortName}</Text>
    </View>
  );
};

/** Blend two hex colours. ratio 0→colorA, 1→colorB */
function mixColor(hexA: string, hexB: string, ratio: number): string {
  const parse = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const [ar, ag, ab] = parse(hexA);
  const [br, bg, bb] = parse(hexB);
  const r = Math.round(ar + (br - ar) * ratio);
  const g = Math.round(ag + (bg - ag) * ratio);
  const b = Math.round(ab + (bb - ab) * ratio);
  return `rgb(${r},${g},${b})`;
}

// ── Pitch markings (absolute layer) ──────────────────────────────────────────
const PitchMarkings: React.FC<{ lineColor: string }> = ({ lineColor }) => (
  <>
    {/* Outer border */}
    <View style={[pm.border, { borderColor: lineColor }]} pointerEvents="none" />
    {/* Half-way line */}
    <View style={[pm.halfway, { backgroundColor: lineColor }]} pointerEvents="none" />
    {/* Centre circle */}
    <View style={[pm.centreCircle, { borderColor: lineColor }]} pointerEvents="none" />
    {/* Centre dot */}
    <View style={[pm.centreDot, { backgroundColor: lineColor }]} pointerEvents="none" />
    {/* Top penalty box */}
    <View style={[pm.penTop, { borderColor: lineColor }]} pointerEvents="none" />
    {/* Top goal box */}
    <View style={[pm.goalTop, { borderColor: lineColor }]} pointerEvents="none" />
    {/* Bottom penalty box */}
    <View style={[pm.penBot, { borderColor: lineColor }]} pointerEvents="none" />
    {/* Bottom goal box */}
    <View style={[pm.goalBot, { borderColor: lineColor }]} pointerEvents="none" />
  </>
);

// ── Bench table ───────────────────────────────────────────────────────────────
const BenchTable: React.FC<{
  match: Match;
  homeBench: LineupPlayer[];
  awayBench: LineupPlayer[];
}> = ({ match, homeBench, awayBench }) => {
  const c = useThemeColors();
  const count = Math.max(homeBench.length, awayBench.length);
  if (count === 0) return null;

  return (
    <View style={[bch.table, { backgroundColor: c.surface, borderColor: c.border }]}>
      {/* Header */}
      <View style={[bch.headerRow, { borderBottomColor: c.border, backgroundColor: c.card }]}>
        <Text style={[bch.headerTeam, { color: HOME_COLOR }]}>{match.homeTeam.shortName}</Text>
        <View style={bch.headerCenter}>
          <Text style={[bch.headerLabel, { color: c.textTertiary }]}>SUPLENTES</Text>
        </View>
        <Text style={[bch.headerTeam, bch.headerTeamRight, { color: AWAY_COLOR }]}>{match.awayTeam.shortName}</Text>
      </View>

      {Array.from({ length: count }).map((_, i) => {
        const hp = homeBench[i];
        const ap = awayBench[i];
        const odd = i % 2 === 1;
        return (
          <View
            key={i}
            style={[bch.row, { borderBottomColor: c.border }, odd && { backgroundColor: c.card }]}
          >
            {/* Home player */}
            <View style={bch.cell}>
              {hp ? (
                <>
                  <View style={[bch.num, { backgroundColor: HOME_COLOR }]}>
                    <Text style={bch.numText}>{hp.number}</Text>
                  </View>
                  <Text style={[bch.name, { color: c.textPrimary }]} numberOfLines={1}>{hp.shortName}</Text>
                  <Text style={[bch.pos, { color: c.textTertiary }]}>{hp.positionShort}</Text>
                </>
              ) : <View style={{ flex: 1 }} />}
            </View>

            {/* Divider */}
            <View style={[bch.divider, { backgroundColor: c.border }]} />

            {/* Away player */}
            <View style={[bch.cell, bch.cellRight]}>
              {ap ? (
                <>
                  <Text style={[bch.pos, { color: c.textTertiary }]}>{ap.positionShort}</Text>
                  <Text style={[bch.name, bch.nameRight, { color: c.textPrimary }]} numberOfLines={1}>{ap.shortName}</Text>
                  <View style={[bch.num, { backgroundColor: AWAY_COLOR }]}>
                    <Text style={bch.numText}>{ap.number}</Text>
                  </View>
                </>
              ) : <View style={{ flex: 1 }} />}
            </View>
          </View>
        );
      })}
    </View>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
export const AlineacionTab: React.FC<{ match: Match; detail: MatchDetail }> = ({ match, detail }) => {
  const c = useThemeColors();
  const { isDark } = useDarkMode();
  const captureRef = useRef<any>(null);

  const homeStarters = detail.homeLineup.starters ?? [];
  const awayStarters = detail.awayLineup.starters ?? [];
  const homeBench    = (detail.homeLineup.bench ?? []).slice(0, 9);
  const awayBench    = (detail.awayLineup.bench ?? []).slice(0, 9);
  const hasLineups   = homeStarters.length > 0 || awayStarters.length > 0;

  // Theme-responsive pitch colours
  const pitchBg    = isDark ? '#0d3320' : '#2e7d45';
  const pitchLine  = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.55)';

  // Formation rows
  const homeRows = groupIntoRows(homeStarters);
  const awayRows = groupIntoRows(awayStarters);

  const handleShare = async () => {
    if (!ViewShot || !captureRef.current) return;
    try {
      const uri: string = await captureRef.current.capture();
      if (!Sharing) return;
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartir alineación' });
      }
    } catch {}
  };

  if (!hasLineups) {
    return (
      <View style={ms.empty}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>🏟️</Text>
        <Text style={[ms.emptyText, { color: c.textSecondary }]}>Sin alineaciones disponibles</Text>
        <Text style={[ms.emptySubText, { color: c.textTertiary }]}>
          Las alineaciones se publicarán 1 hora antes del partido
        </Text>
      </View>
    );
  }

  const PitchBlock = (
    <View style={[ms.pitch, { backgroundColor: pitchBg }]}>
      <PitchMarkings lineColor={pitchLine} />

      {/* ── Home team — top half ── */}
      <View style={ms.topHalf}>
        {homeRows.map((row, ri) => (
          <View key={ri} style={ms.playerRow}>
            {row.map(p => <PlayerDot key={p.id} player={p} color={HOME_COLOR} />)}
          </View>
        ))}
      </View>

      {/* ── Team labels at half-way line ── */}
      <View style={ms.halfLabels} pointerEvents="none">
        <Text style={[ms.halfLabel, { color: HOME_COLOR }]}>{match.homeTeam.shortName}</Text>
        <Text style={[ms.halfSep, { color: 'rgba(255,255,255,0.3)' }]}>·</Text>
        <Text style={[ms.halfLabel, { color: AWAY_COLOR }]}>{match.awayTeam.shortName}</Text>
      </View>

      {/* ── Away team — bottom half (column-reverse → GK at bottom) ── */}
      <View style={ms.bottomHalf}>
        {awayRows.map((row, ri) => (
          <View key={ri} style={ms.playerRow}>
            {row.map(p => <PlayerDot key={p.id} player={p} color={AWAY_COLOR} />)}
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <View style={ms.outer}>
      {/* ── Pitch + ViewShot ── */}
      {ViewShot ? (
        <ViewShot ref={captureRef} options={{ format: 'png', quality: 1.0 }}>
          {PitchBlock}
        </ViewShot>
      ) : PitchBlock}

      {/* ── Formation + Coach strip ── */}
      <View style={[ms.formationStrip, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={ms.formationSide}>
          <Text style={[ms.formationNum, { color: HOME_COLOR }]}>{detail.homeLineup.formation}</Text>
          {!!detail.homeLineup.coach && (
            <Text style={[ms.coachName, { color: c.textTertiary }]} numberOfLines={1}>
              🧑‍💼 {detail.homeLineup.coach}
            </Text>
          )}
        </View>
        <View style={[ms.formationDivider, { backgroundColor: c.border }]} />
        <View style={[ms.formationSide, ms.formationSideRight]}>
          <Text style={[ms.formationNum, { color: AWAY_COLOR }]}>{detail.awayLineup.formation}</Text>
          {!!detail.awayLineup.coach && (
            <Text style={[ms.coachName, { color: c.textTertiary }]} numberOfLines={1}>
              🧑‍💼 {detail.awayLineup.coach}
            </Text>
          )}
        </View>
      </View>

      {/* ── Legend ── */}
      <View style={ms.legend}>
        {[
          { color: '#fbbf24', label: 'Capitán' },
          { color: '#ca8a04', label: 'Tarjeta amarilla' },
          { color: '#dc2626', label: 'Tarjeta roja' },
        ].map(({ color, label }) => (
          <View key={label} style={ms.legendItem}>
            <View style={[ms.legendDot, { backgroundColor: color }]} />
            <Text style={[ms.legendText, { color: c.textTertiary }]}>{label}</Text>
          </View>
        ))}
      </View>

      {/* ── Bench ── */}
      <BenchTable match={match} homeBench={homeBench} awayBench={awayBench} />

      {/* ── Share button ── */}
      {!!(ViewShot && Sharing) && (
        <TouchableOpacity
          style={[ms.shareBtn, { backgroundColor: c.accent }]}
          onPress={handleShare}
          activeOpacity={0.82}
        >
          <Text style={ms.shareBtnText}>COMPARTIR</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 16 }} />
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const ms = StyleSheet.create({
  outer: { paddingHorizontal: 16, paddingTop: 8 },

  // Empty state
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  emptySubText: { fontSize: 12, textAlign: 'center', lineHeight: 18 },

  // Pitch
  pitch: {
    height: PITCH_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 0,
  },
  topHalf: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'space-evenly',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  bottomHalf: {
    flex: 1,
    flexDirection: 'column-reverse',  // GK row renders at bottom
    justifyContent: 'space-evenly',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  playerRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },

  // Half-way team labels
  halfLabels: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    transform: [{ translateY: -8 }],
  },
  halfLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  halfSep:   { fontSize: 10 },

  // Formation strip
  formationStrip: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 8,
    overflow: 'hidden',
  },
  formationSide: {
    flex: 1,
    padding: 10,
    alignItems: 'flex-start',
    gap: 2,
  },
  formationSideRight: { alignItems: 'flex-end' },
  formationNum: { fontSize: 16, fontWeight: '800' },
  coachName: { fontSize: 11, fontWeight: '500' },
  formationDivider: { width: 1 },

  // Legend
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 2,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, fontWeight: '500' },

  // Share button
  shareBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  shareBtnText: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 1 },
});

// Player dot styles
const st = StyleSheet.create({
  dotWrap: {
    alignItems: 'center',
    width: DOT_SIZE + 14,
    gap: 3,
  },
  dotOuter: {
    position: 'relative',
    width: DOT_SIZE,
    height: DOT_SIZE,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    // Subtle shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 2,
    elevation: 3,
  },
  dotNum: {
    fontSize: 9,
    fontWeight: '900',
    color: '#fff',
    includeFontPadding: false,
  },
  dotName: {
    fontSize: 7,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    maxWidth: DOT_SIZE + 14,
    // Text shadow for readability on any pitch colour
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // Goal badge — top-left corner of dot
  goalBadge: {
    position: 'absolute',
    top: -5,
    left: -5,
    zIndex: 2,
  },
  goalBadgeText: { fontSize: 9 },
  // Sub badge — top-right corner
  subBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#10b981',
    borderRadius: 5,
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  subBadgeText: { fontSize: 7, color: '#fff', fontWeight: '800' },
});

// Pitch marking styles (absolute positioned overlay)
const pm = StyleSheet.create({
  border: {
    position: 'absolute',
    top: 4, left: 8, right: 8, bottom: 4,
    borderWidth: 1.5,
    borderRadius: 4,
  },
  halfway: {
    position: 'absolute',
    top: '50%',
    left: 8,
    right: 8,
    height: 1.5,
  },
  centreCircle: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    left: '50%',
    top: '50%',
    marginLeft: -32,
    marginTop: -32,
  },
  centreDot: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 3,
    left: '50%',
    top: '50%',
    marginLeft: -2.5,
    marginTop: -2.5,
  },
  // Top penalty area
  penTop: {
    position: 'absolute',
    top: 4,
    left: '25%',
    right: '25%',
    height: 58,
    borderWidth: 1.5,
    borderTopWidth: 0,
  },
  // Top goal area (6-yard box)
  goalTop: {
    position: 'absolute',
    top: 4,
    left: '38%',
    right: '38%',
    height: 24,
    borderWidth: 1.5,
    borderTopWidth: 0,
  },
  // Bottom penalty area
  penBot: {
    position: 'absolute',
    bottom: 4,
    left: '25%',
    right: '25%',
    height: 58,
    borderWidth: 1.5,
    borderBottomWidth: 0,
  },
  // Bottom goal area
  goalBot: {
    position: 'absolute',
    bottom: 4,
    left: '38%',
    right: '38%',
    height: 24,
    borderWidth: 1.5,
    borderBottomWidth: 0,
  },
});

// Bench styles
const bch = StyleSheet.create({
  table: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  headerTeam: {
    fontSize: 12,
    fontWeight: '800',
    width: 60,
  },
  headerTeamRight: { textAlign: 'right' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    minHeight: 34,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cellRight: { justifyContent: 'flex-end' },
  num: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  numText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  name: { flex: 1, fontSize: 12, fontWeight: '500' },
  nameRight: { textAlign: 'right' },
  pos: { fontSize: 9, fontWeight: '600', flexShrink: 0 },
  divider: { width: 1, height: 22, marginHorizontal: 6 },
});
