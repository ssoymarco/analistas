// ── Alineación Tab ────────────────────────────────────────────────────────────
// Premium pitch design with grass stripes, corner arcs, penalty arcs,
// goal frame markings, and polished player dots.
// Fully responsive to Dark / Light mode.
import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
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
const HOME_COLOR   = '#3b82f6';
const AWAY_COLOR   = '#f97316';
const SCREEN_WIDTH = Dimensions.get('window').width;
const PITCH_MARGIN = 16;
const PITCH_WIDTH  = SCREEN_WIDTH - PITCH_MARGIN * 2;
const PITCH_HEIGHT = 520;
const DOT_SIZE     = 32;
const STRIPE_COUNT = 14; // number of grass stripes across pitch

// ── Pitch theme palettes ─────────────────────────────────────────────────────
interface PitchTheme {
  grassA: string;     // main stripe
  grassB: string;     // alternate stripe
  lineColor: string;  // markings
  lineWidth: number;
  goalFrame: string;  // goal post colour
  shadow: string;     // inner shadow / vignette
  dotGlow: string;    // glow behind player dots
}

const DARK_PITCH: PitchTheme = {
  grassA: '#14532d',
  grassB: '#166534',
  lineColor: 'rgba(255,255,255,0.25)',
  lineWidth: 1.5,
  goalFrame: 'rgba(255,255,255,0.35)',
  shadow: 'rgba(0,0,0,0.4)',
  dotGlow: 'rgba(0,0,0,0.5)',
};

const LIGHT_PITCH: PitchTheme = {
  grassA: '#22c55e',
  grassB: '#16a34a',
  lineColor: 'rgba(255,255,255,0.75)',
  lineWidth: 1.5,
  goalFrame: 'rgba(255,255,255,0.85)',
  shadow: 'rgba(0,0,0,0.08)',
  dotGlow: 'rgba(0,0,0,0.15)',
};

// ── Group starters into formation rows ────────────────────────────────────────
function groupIntoRows(starters: LineupPlayer[]): LineupPlayer[][] {
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

  // Fallback: bucket by y coordinate bands
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

// ── Color utility ────────────────────────────────────────────────────────────
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

// ── Player dot ────────────────────────────────────────────────────────────────
const PlayerDot: React.FC<{
  player: LineupPlayer;
  color: string;
  theme: PitchTheme;
  hasImage?: boolean;
}> = ({ player, color, theme, hasImage }) => {
  let bgColor = color;
  let borderStyle: any = { borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' };

  if (player.redCard) {
    bgColor = '#dc2626';
    borderStyle = { borderWidth: 2.5, borderColor: '#fca5a5' };
  } else if (player.yellowCard) {
    bgColor = mixColor(color, '#ca8a04', 0.45);
    borderStyle = { borderWidth: 2.5, borderColor: '#fde047' };
  }
  if (player.isCaptain) {
    borderStyle = { borderWidth: 2.5, borderColor: '#fbbf24' };
  }

  const goalCount = player.goals ?? 0;
  const subbed    = player.isSubstituted;
  const imageUri  = player.imageUrl;

  return (
    <View style={dot.wrap}>
      {/* Glow behind dot */}
      <View style={[dot.glow, { backgroundColor: theme.dotGlow }]} />

      <View style={dot.outer}>
        {/* Goal badge */}
        {goalCount > 0 && (
          <View style={dot.goalBadge}>
            <Text style={dot.goalEmoji}>⚽</Text>
            {goalCount > 1 && <Text style={dot.goalCount}>×{goalCount}</Text>}
          </View>
        )}
        {/* Sub badge */}
        {subbed && (
          <View style={dot.subBadge}>
            <Text style={dot.subArrow}>↓</Text>
          </View>
        )}
        {/* Yellow card indicator */}
        {player.yellowCard && !player.redCard && (
          <View style={dot.cardBadge}>
            <View style={[dot.cardRect, { backgroundColor: '#facc15' }]} />
          </View>
        )}
        {/* Red card indicator */}
        {player.redCard && (
          <View style={dot.cardBadge}>
            <View style={[dot.cardRect, { backgroundColor: '#ef4444' }]} />
          </View>
        )}

        {/* The dot itself */}
        <View style={[dot.circle, { backgroundColor: bgColor }, borderStyle]}>
          {imageUri && typeof imageUri === 'string' && imageUri.startsWith('http') ? (
            <Image source={{ uri: imageUri }} style={dot.image} />
          ) : (
            <Text style={dot.number}>{player.number}</Text>
          )}
        </View>
      </View>

      <Text style={dot.name} numberOfLines={1}>{player.shortName}</Text>
    </View>
  );
};

// ── Grass Stripes ────────────────────────────────────────────────────────────
const GrassStripes: React.FC<{ theme: PitchTheme }> = ({ theme }) => {
  const stripeH = PITCH_HEIGHT / STRIPE_COUNT;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: STRIPE_COUNT }).map((_, i) => (
        <View
          key={i}
          style={{
            height: stripeH,
            backgroundColor: i % 2 === 0 ? theme.grassA : theme.grassB,
          }}
        />
      ))}
    </View>
  );
};

// ── Pitch Markings ───────────────────────────────────────────────────────────
const PitchMarkings: React.FC<{ theme: PitchTheme }> = ({ theme }) => {
  const lc = theme.lineColor;
  const lw = theme.lineWidth;
  const gf = theme.goalFrame;

  // Proportional sizing
  const PAD = 10;          // edge padding
  const PEN_W = 50;        // penalty box width (% of pitch)
  const PEN_H = 70;        // penalty box height
  const GOAL_W = 24;       // goal box width (%)
  const GOAL_H = 30;       // goal box height
  const CIRCLE = 54;       // centre circle diameter
  const ARC_SIZE = 14;     // corner arc size
  const GOAL_FRAME_W = 18; // goal frame width (%)
  const GOAL_FRAME_H = 8;  // goal frame height

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Outer border */}
      <View style={{
        position: 'absolute',
        top: PAD, left: PAD, right: PAD, bottom: PAD,
        borderWidth: lw, borderColor: lc, borderRadius: 2,
      }} />

      {/* Half-way line */}
      <View style={{
        position: 'absolute',
        top: '50%', left: PAD, right: PAD,
        height: lw, backgroundColor: lc,
      }} />

      {/* Centre circle */}
      <View style={{
        position: 'absolute',
        width: CIRCLE, height: CIRCLE,
        borderRadius: CIRCLE / 2,
        borderWidth: lw, borderColor: lc,
        left: '50%', top: '50%',
        marginLeft: -CIRCLE / 2,
        marginTop: -CIRCLE / 2,
      }} />

      {/* Centre dot */}
      <View style={{
        position: 'absolute',
        width: 6, height: 6, borderRadius: 3,
        backgroundColor: lc,
        left: '50%', top: '50%',
        marginLeft: -3, marginTop: -3,
      }} />

      {/* ── Top penalty area ── */}
      <View style={{
        position: 'absolute',
        top: PAD,
        left: `${(100 - PEN_W) / 2}%`,
        right: `${(100 - PEN_W) / 2}%`,
        height: PEN_H,
        borderWidth: lw, borderColor: lc,
        borderTopWidth: 0,
      }} />

      {/* Top goal area */}
      <View style={{
        position: 'absolute',
        top: PAD,
        left: `${(100 - GOAL_W) / 2}%`,
        right: `${(100 - GOAL_W) / 2}%`,
        height: GOAL_H,
        borderWidth: lw, borderColor: lc,
        borderTopWidth: 0,
      }} />

      {/* Top penalty spot */}
      <View style={{
        position: 'absolute',
        top: PAD + PEN_H - 18,
        left: '50%', marginLeft: -2.5,
        width: 5, height: 5, borderRadius: 2.5,
        backgroundColor: lc,
      }} />

      {/* Top goal frame */}
      <View style={{
        position: 'absolute',
        top: PAD - GOAL_FRAME_H + 1,
        left: `${(100 - GOAL_FRAME_W) / 2}%`,
        right: `${(100 - GOAL_FRAME_W) / 2}%`,
        height: GOAL_FRAME_H,
        borderWidth: lw + 0.5,
        borderColor: gf,
        borderTopLeftRadius: 3,
        borderTopRightRadius: 3,
        borderBottomWidth: 0,
      }} />

      {/* ── Bottom penalty area ── */}
      <View style={{
        position: 'absolute',
        bottom: PAD,
        left: `${(100 - PEN_W) / 2}%`,
        right: `${(100 - PEN_W) / 2}%`,
        height: PEN_H,
        borderWidth: lw, borderColor: lc,
        borderBottomWidth: 0,
      }} />

      {/* Bottom goal area */}
      <View style={{
        position: 'absolute',
        bottom: PAD,
        left: `${(100 - GOAL_W) / 2}%`,
        right: `${(100 - GOAL_W) / 2}%`,
        height: GOAL_H,
        borderWidth: lw, borderColor: lc,
        borderBottomWidth: 0,
      }} />

      {/* Bottom penalty spot */}
      <View style={{
        position: 'absolute',
        bottom: PAD + PEN_H - 18,
        left: '50%', marginLeft: -2.5,
        width: 5, height: 5, borderRadius: 2.5,
        backgroundColor: lc,
      }} />

      {/* Bottom goal frame */}
      <View style={{
        position: 'absolute',
        bottom: PAD - GOAL_FRAME_H + 1,
        left: `${(100 - GOAL_FRAME_W) / 2}%`,
        right: `${(100 - GOAL_FRAME_W) / 2}%`,
        height: GOAL_FRAME_H,
        borderWidth: lw + 0.5,
        borderColor: gf,
        borderBottomLeftRadius: 3,
        borderBottomRightRadius: 3,
        borderTopWidth: 0,
      }} />

      {/* ── Corner arcs ── */}
      {/* Top-left */}
      <View style={{
        position: 'absolute', top: PAD - ARC_SIZE / 2, left: PAD - ARC_SIZE / 2,
        width: ARC_SIZE, height: ARC_SIZE, borderRadius: ARC_SIZE / 2,
        borderWidth: lw, borderColor: lc,
      }} />
      {/* Top-right */}
      <View style={{
        position: 'absolute', top: PAD - ARC_SIZE / 2, right: PAD - ARC_SIZE / 2,
        width: ARC_SIZE, height: ARC_SIZE, borderRadius: ARC_SIZE / 2,
        borderWidth: lw, borderColor: lc,
      }} />
      {/* Bottom-left */}
      <View style={{
        position: 'absolute', bottom: PAD - ARC_SIZE / 2, left: PAD - ARC_SIZE / 2,
        width: ARC_SIZE, height: ARC_SIZE, borderRadius: ARC_SIZE / 2,
        borderWidth: lw, borderColor: lc,
      }} />
      {/* Bottom-right */}
      <View style={{
        position: 'absolute', bottom: PAD - ARC_SIZE / 2, right: PAD - ARC_SIZE / 2,
        width: ARC_SIZE, height: ARC_SIZE, borderRadius: ARC_SIZE / 2,
        borderWidth: lw, borderColor: lc,
      }} />
    </View>
  );
};

// ── Bench table ──────────────────────────────────────────────────────────────
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
  const theme = isDark ? DARK_PITCH : LIGHT_PITCH;

  const homeStarters = detail.homeLineup.starters ?? [];
  const awayStarters = detail.awayLineup.starters ?? [];
  const homeBench    = (detail.homeLineup.bench ?? []).slice(0, 9);
  const awayBench    = (detail.awayLineup.bench ?? []).slice(0, 9);
  const hasLineups   = homeStarters.length > 0 || awayStarters.length > 0;

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
    <View style={[ms.pitchContainer, { backgroundColor: isDark ? '#0a1f15' : '#15803d' }]}>
      {/* Outer decorative border / shadow */}
      <View style={[ms.pitchShadow, { borderColor: theme.shadow }]} />

      <View style={[ms.pitch]}>
        {/* Grass stripes */}
        <GrassStripes theme={theme} />

        {/* Pitch markings */}
        <PitchMarkings theme={theme} />

        {/* ── Home team — top half ── */}
        <View style={ms.topHalf}>
          {homeRows.map((row, ri) => (
            <View key={ri} style={ms.playerRow}>
              {row.map(p => <PlayerDot key={p.id} player={p} color={HOME_COLOR} theme={theme} />)}
            </View>
          ))}
        </View>

        {/* ── Half-way team labels ── */}
        <View style={ms.halfLabels} pointerEvents="none">
          <View style={[ms.halfBadge, { backgroundColor: 'rgba(59,130,246,0.85)' }]}>
            <Text style={ms.halfBadgeText}>{match.homeTeam.shortName}</Text>
          </View>
          <View style={[ms.halfDot, { backgroundColor: 'rgba(255,255,255,0.3)' }]} />
          <View style={[ms.halfBadge, { backgroundColor: 'rgba(249,115,22,0.85)' }]}>
            <Text style={ms.halfBadgeText}>{match.awayTeam.shortName}</Text>
          </View>
        </View>

        {/* ── Away team — bottom half ── */}
        <View style={ms.bottomHalf}>
          {awayRows.map((row, ri) => (
            <View key={ri} style={ms.playerRow}>
              {row.map(p => <PlayerDot key={p.id} player={p} color={AWAY_COLOR} theme={theme} />)}
            </View>
          ))}
        </View>
      </View>
    </View>
  );

  return (
    <View style={ms.outer}>
      {/* ── Pitch ── */}
      {ViewShot ? (
        <ViewShot ref={captureRef} options={{ format: 'png', quality: 1.0 }}>
          {PitchBlock}
        </ViewShot>
      ) : PitchBlock}

      {/* ── Formation strip ── */}
      <View style={[ms.formationStrip, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={ms.formationSide}>
          <View style={[ms.formationBadge, { backgroundColor: 'rgba(59,130,246,0.12)' }]}>
            <Text style={[ms.formationNum, { color: HOME_COLOR }]}>{detail.homeLineup.formation}</Text>
          </View>
          {!!detail.homeLineup.coach && (
            <Text style={[ms.coachName, { color: c.textSecondary }]} numberOfLines={1}>
              {detail.homeLineup.coach}
            </Text>
          )}
        </View>
        <View style={[ms.formationDivider, { backgroundColor: c.border }]} />
        <View style={[ms.formationSide, ms.formationSideRight]}>
          <View style={[ms.formationBadge, { backgroundColor: 'rgba(249,115,22,0.12)' }]}>
            <Text style={[ms.formationNum, { color: AWAY_COLOR }]}>{detail.awayLineup.formation}</Text>
          </View>
          {!!detail.awayLineup.coach && (
            <Text style={[ms.coachName, { color: c.textSecondary }]} numberOfLines={1}>
              {detail.awayLineup.coach}
            </Text>
          )}
        </View>
      </View>

      {/* ── Legend ── */}
      <View style={ms.legend}>
        <View style={ms.legendItem}>
          <View style={[ms.legendDotBorder, { borderColor: '#fbbf24' }]}>
            <View style={[ms.legendDotInner, { backgroundColor: HOME_COLOR }]} />
          </View>
          <Text style={[ms.legendText, { color: c.textTertiary }]}>Capitán</Text>
        </View>
        <View style={ms.legendItem}>
          <View style={[ms.legendRect, { backgroundColor: '#facc15' }]} />
          <Text style={[ms.legendText, { color: c.textTertiary }]}>Amarilla</Text>
        </View>
        <View style={ms.legendItem}>
          <View style={[ms.legendRect, { backgroundColor: '#ef4444' }]} />
          <Text style={[ms.legendText, { color: c.textTertiary }]}>Roja</Text>
        </View>
        <View style={ms.legendItem}>
          <View style={[ms.legendSubIcon, { backgroundColor: '#10b981' }]}>
            <Text style={{ fontSize: 7, color: '#fff', fontWeight: '800' }}>↓</Text>
          </View>
          <Text style={[ms.legendText, { color: c.textTertiary }]}>Sustituido</Text>
        </View>
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
          <Text style={ms.shareBtnText}>📤  COMPARTIR</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 16 }} />
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const ms = StyleSheet.create({
  outer: { paddingHorizontal: PITCH_MARGIN, paddingTop: 8 },

  // Empty state
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  emptySubText: { fontSize: 12, textAlign: 'center', lineHeight: 18 },

  // Pitch container (outer glow / padding)
  pitchContainer: {
    borderRadius: 18,
    padding: 3,
    overflow: 'hidden',
  },
  pitchShadow: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3,
    borderRadius: 18,
    opacity: 0.5,
  },

  // Pitch
  pitch: {
    height: PITCH_HEIGHT,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },

  topHalf: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'space-evenly',
    paddingVertical: 16,
    paddingHorizontal: 10,
    zIndex: 2,
  },
  bottomHalf: {
    flex: 1,
    flexDirection: 'column-reverse',
    justifyContent: 'space-evenly',
    paddingVertical: 16,
    paddingHorizontal: 10,
    zIndex: 2,
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
    gap: 8,
    transform: [{ translateY: -11 }],
    zIndex: 3,
  },
  halfBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  halfBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  halfDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },

  // Formation strip
  formationStrip: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 14,
    marginTop: 10,
    overflow: 'hidden',
  },
  formationSide: {
    flex: 1,
    padding: 12,
    alignItems: 'flex-start',
    gap: 4,
  },
  formationSideRight: { alignItems: 'flex-end' },
  formationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  formationNum: { fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  coachName: { fontSize: 11, fontWeight: '500' },
  formationDivider: { width: 1 },

  // Legend
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 2,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDotBorder: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  legendDotInner: { width: 8, height: 8, borderRadius: 4 },
  legendRect: { width: 10, height: 14, borderRadius: 2 },
  legendSubIcon: {
    width: 12, height: 12, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  legendText: { fontSize: 10, fontWeight: '500' },

  // Share button
  shareBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  shareBtnText: { fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: 0.8 },
});

// ── Player dot styles ────────────────────────────────────────────────────────
const dot = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    width: DOT_SIZE + 18,
    gap: 3,
  },
  glow: {
    position: 'absolute',
    width: DOT_SIZE + 8,
    height: DOT_SIZE + 8,
    borderRadius: (DOT_SIZE + 8) / 2,
    top: -4,
    left: (DOT_SIZE + 18 - DOT_SIZE - 8) / 2,
    opacity: 0.4,
  },
  outer: {
    position: 'relative',
    width: DOT_SIZE,
    height: DOT_SIZE,
  },
  circle: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 4,
    elevation: 5,
  },
  image: {
    width: DOT_SIZE - 4,
    height: DOT_SIZE - 4,
    borderRadius: (DOT_SIZE - 4) / 2,
  },
  number: {
    fontSize: 11,
    fontWeight: '900',
    color: '#fff',
    includeFontPadding: false,
  },
  name: {
    fontSize: 8,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    maxWidth: DOT_SIZE + 18,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // Goal badge — top-left
  goalBadge: {
    position: 'absolute',
    top: -6,
    left: -6,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  goalEmoji: { fontSize: 10 },
  goalCount: { fontSize: 7, fontWeight: '900', color: '#fff', marginLeft: -1, textShadowColor: '#000', textShadowRadius: 2, textShadowOffset: { width: 0, height: 1 } },
  // Sub badge — top-right
  subBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#10b981',
    borderRadius: 7,
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.2)',
  },
  subArrow: { fontSize: 8, color: '#fff', fontWeight: '800' },
  // Card badge — bottom-right
  cardBadge: {
    position: 'absolute',
    bottom: -2,
    right: -3,
    zIndex: 2,
  },
  cardRect: {
    width: 7,
    height: 10,
    borderRadius: 1.5,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.2)',
  },
});

// ── Bench styles ─────────────────────────────────────────────────────────────
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
    width: 22,
    height: 22,
    borderRadius: 11,
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
