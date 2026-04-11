// ── Alineación Tab ────────────────────────────────────────────────────────────
// Premium pitch design with grass stripes, corner arcs, penalty arcs,
// goal frame markings, and polished player dots.
// NEW: confirmation banner, coaches cards, bench with segmented toggle.
// PITCH IS UNCHANGED — kept exactly as before.
import React, { useState, useRef } from 'react';
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
const STRIPE_COUNT = 14;

// ── Pitch theme palettes ─────────────────────────────────────────────────────
interface PitchTheme {
  grassA: string;
  grassB: string;
  lineColor: string;
  lineWidth: number;
  goalFrame: string;
  shadow: string;
  dotGlow: string;
}

const DARK_PITCH: PitchTheme = {
  grassA: '#14532d', grassB: '#166534',
  lineColor: 'rgba(255,255,255,0.25)', lineWidth: 1.5,
  goalFrame: 'rgba(255,255,255,0.35)', shadow: 'rgba(0,0,0,0.4)',
  dotGlow: 'rgba(0,0,0,0.5)',
};

const LIGHT_PITCH: PitchTheme = {
  grassA: '#22c55e', grassB: '#16a34a',
  lineColor: 'rgba(255,255,255,0.75)', lineWidth: 1.5,
  goalFrame: 'rgba(255,255,255,0.85)', shadow: 'rgba(0,0,0,0.08)',
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
    parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16),
  ];
  const [ar, ag, ab] = parse(hexA);
  const [br, bg, bb] = parse(hexB);
  return `rgb(${Math.round(ar + (br - ar) * ratio)},${Math.round(ag + (bg - ag) * ratio)},${Math.round(ab + (bb - ab) * ratio)})`;
}

// ── Player dot ───────────────────────────────────────────────────────────────
const PlayerDot: React.FC<{ player: LineupPlayer; color: string; theme: PitchTheme }> = ({ player, color, theme }) => {
  let bgColor = color;
  let borderStyle: any = { borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' };
  if (player.redCard) { bgColor = '#dc2626'; borderStyle = { borderWidth: 2.5, borderColor: '#fca5a5' }; }
  else if (player.yellowCard) { bgColor = mixColor(color, '#ca8a04', 0.45); borderStyle = { borderWidth: 2.5, borderColor: '#fde047' }; }
  if (player.isCaptain) { borderStyle = { borderWidth: 2.5, borderColor: '#fbbf24' }; }
  const goalCount = player.goals ?? 0;
  const subbed = player.isSubstituted;

  return (
    <View style={dot.wrap}>
      <View style={[dot.glow, { backgroundColor: theme.dotGlow }]} />
      <View style={dot.outer}>
        {goalCount > 0 && (
          <View style={dot.goalBadge}>
            <Text style={dot.goalEmoji}>⚽</Text>
            {goalCount > 1 && <Text style={dot.goalCount}>×{goalCount}</Text>}
          </View>
        )}
        {subbed && (
          <View style={dot.subBadge}><Text style={dot.subArrow}>↓</Text></View>
        )}
        {player.yellowCard && !player.redCard && (
          <View style={dot.cardBadge}><View style={[dot.cardRect, { backgroundColor: '#facc15' }]} /></View>
        )}
        {player.redCard && (
          <View style={dot.cardBadge}><View style={[dot.cardRect, { backgroundColor: '#ef4444' }]} /></View>
        )}
        <View style={[dot.circle, { backgroundColor: bgColor }, borderStyle]}>
          {player.imageUrl && player.imageUrl.startsWith('http') ? (
            <Image source={{ uri: player.imageUrl }} style={dot.image} />
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
        <View key={i} style={{ height: stripeH, backgroundColor: i % 2 === 0 ? theme.grassA : theme.grassB }} />
      ))}
    </View>
  );
};

// ── Pitch Markings ───────────────────────────────────────────────────────────
const PitchMarkings: React.FC<{ theme: PitchTheme }> = ({ theme }) => {
  const lc = theme.lineColor;
  const lw = theme.lineWidth;
  const gf = theme.goalFrame;
  const PAD = 10; const PEN_W = 50; const PEN_H = 70; const GOAL_W = 24;
  const GOAL_H = 30; const CIRCLE = 54; const ARC_SIZE = 14;
  const GOAL_FRAME_W = 18; const GOAL_FRAME_H = 8;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={{ position: 'absolute', top: PAD, left: PAD, right: PAD, bottom: PAD, borderWidth: lw, borderColor: lc, borderRadius: 2 }} />
      <View style={{ position: 'absolute', top: '50%', left: PAD, right: PAD, height: lw, backgroundColor: lc }} />
      <View style={{ position: 'absolute', width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, borderWidth: lw, borderColor: lc, left: '50%', top: '50%', marginLeft: -CIRCLE / 2, marginTop: -CIRCLE / 2 }} />
      <View style={{ position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: lc, left: '50%', top: '50%', marginLeft: -3, marginTop: -3 }} />
      {/* Top penalty */}
      <View style={{ position: 'absolute', top: PAD, left: `${(100 - PEN_W) / 2}%`, right: `${(100 - PEN_W) / 2}%`, height: PEN_H, borderWidth: lw, borderColor: lc, borderTopWidth: 0 }} />
      <View style={{ position: 'absolute', top: PAD, left: `${(100 - GOAL_W) / 2}%`, right: `${(100 - GOAL_W) / 2}%`, height: GOAL_H, borderWidth: lw, borderColor: lc, borderTopWidth: 0 }} />
      <View style={{ position: 'absolute', top: PAD + PEN_H - 18, left: '50%', marginLeft: -2.5, width: 5, height: 5, borderRadius: 2.5, backgroundColor: lc }} />
      <View style={{ position: 'absolute', top: PAD - GOAL_FRAME_H + 1, left: `${(100 - GOAL_FRAME_W) / 2}%`, right: `${(100 - GOAL_FRAME_W) / 2}%`, height: GOAL_FRAME_H, borderWidth: lw + 0.5, borderColor: gf, borderTopLeftRadius: 3, borderTopRightRadius: 3, borderBottomWidth: 0 }} />
      {/* Bottom penalty */}
      <View style={{ position: 'absolute', bottom: PAD, left: `${(100 - PEN_W) / 2}%`, right: `${(100 - PEN_W) / 2}%`, height: PEN_H, borderWidth: lw, borderColor: lc, borderBottomWidth: 0 }} />
      <View style={{ position: 'absolute', bottom: PAD, left: `${(100 - GOAL_W) / 2}%`, right: `${(100 - GOAL_W) / 2}%`, height: GOAL_H, borderWidth: lw, borderColor: lc, borderBottomWidth: 0 }} />
      <View style={{ position: 'absolute', bottom: PAD + PEN_H - 18, left: '50%', marginLeft: -2.5, width: 5, height: 5, borderRadius: 2.5, backgroundColor: lc }} />
      <View style={{ position: 'absolute', bottom: PAD - GOAL_FRAME_H + 1, left: `${(100 - GOAL_FRAME_W) / 2}%`, right: `${(100 - GOAL_FRAME_W) / 2}%`, height: GOAL_FRAME_H, borderWidth: lw + 0.5, borderColor: gf, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, borderTopWidth: 0 }} />
      {/* Corners */}
      <View style={{ position: 'absolute', top: PAD - ARC_SIZE / 2, left: PAD - ARC_SIZE / 2, width: ARC_SIZE, height: ARC_SIZE, borderRadius: ARC_SIZE / 2, borderWidth: lw, borderColor: lc }} />
      <View style={{ position: 'absolute', top: PAD - ARC_SIZE / 2, right: PAD - ARC_SIZE / 2, width: ARC_SIZE, height: ARC_SIZE, borderRadius: ARC_SIZE / 2, borderWidth: lw, borderColor: lc }} />
      <View style={{ position: 'absolute', bottom: PAD - ARC_SIZE / 2, left: PAD - ARC_SIZE / 2, width: ARC_SIZE, height: ARC_SIZE, borderRadius: ARC_SIZE / 2, borderWidth: lw, borderColor: lc }} />
      <View style={{ position: 'absolute', bottom: PAD - ARC_SIZE / 2, right: PAD - ARC_SIZE / 2, width: ARC_SIZE, height: ARC_SIZE, borderRadius: ARC_SIZE / 2, borderWidth: lw, borderColor: lc }} />
    </View>
  );
};

// ── Position label colors ────────────────────────────────────────────────────
function positionColor(pos: string): string {
  switch (pos) {
    case 'POR': case 'GK': return '#ca8a04';
    case 'DFC': case 'DFI': case 'DFD': case 'DF': case 'CB': case 'LB': case 'RB': return '#10b981';
    case 'MC': case 'MCD': case 'MCO': case 'MD': case 'MI': case 'MF': return '#10b981';
    case 'EI': case 'ED': case 'DC': case 'FW': case 'ST': case 'LW': case 'RW': return '#ef4444';
    default: return '#6b7280';
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

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

  // Bench toggle
  const [benchTeam, setBenchTeam] = useState<'home' | 'away'>('home');
  const activeBench = benchTeam === 'home' ? homeBench : awayBench;

  // Is lineup confirmed? (if match is live or finished, it's confirmed)
  const isConfirmed = match.status !== 'scheduled';

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

  // ── Pitch block (UNCHANGED) ────────────────────────────────────────────────
  const PitchBlock = (
    <View style={[ms.pitchContainer, { backgroundColor: isDark ? '#0a1f15' : '#15803d' }]}>
      <View style={[ms.pitchShadow, { borderColor: theme.shadow }]} />
      <View style={ms.pitch}>
        <GrassStripes theme={theme} />
        <PitchMarkings theme={theme} />
        <View style={ms.topHalf}>
          {homeRows.map((row, ri) => (
            <View key={ri} style={ms.playerRow}>
              {row.map(p => <PlayerDot key={p.id} player={p} color={HOME_COLOR} theme={theme} />)}
            </View>
          ))}
        </View>
        <View style={ms.halfLabels} pointerEvents="none">
          <View style={[ms.halfBadge, { backgroundColor: 'rgba(59,130,246,0.85)' }]}>
            <Text style={ms.halfBadgeText}>{match.homeTeam.shortName}</Text>
          </View>
          <View style={[ms.halfDot, { backgroundColor: 'rgba(255,255,255,0.3)' }]} />
          <View style={[ms.halfBadge, { backgroundColor: 'rgba(249,115,22,0.85)' }]}>
            <Text style={ms.halfBadgeText}>{match.awayTeam.shortName}</Text>
          </View>
        </View>
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

      {/* ── Confirmation banner ── */}
      <View style={[
        ms.banner,
        isConfirmed
          ? { backgroundColor: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.3)' }
          : { backgroundColor: 'rgba(202,138,4,0.12)', borderColor: 'rgba(202,138,4,0.3)' },
      ]}>
        <Text style={{ fontSize: 14 }}>{isConfirmed ? '✅' : 'ℹ️'}</Text>
        <Text style={[
          ms.bannerText,
          { color: isConfirmed ? '#10b981' : '#ca8a04' },
        ]}>
          {isConfirmed ? 'Alineación confirmada' : 'Alineación probable — pendiente de confirmación'}
        </Text>
      </View>

      {/* ── Formation header ── */}
      <View style={[ms.formationHeader, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={ms.formationSide}>
          {match.homeTeam.logo.startsWith('http') ? (
            <Image source={{ uri: match.homeTeam.logo }} style={ms.formationLogo} />
          ) : null}
          <Text style={[ms.formationTeam, { color: c.textPrimary }]}>{match.homeTeam.shortName}</Text>
          <View style={[ms.formationDot, { backgroundColor: HOME_COLOR }]} />
        </View>
        <Text style={[ms.formationVs, { color: c.textTertiary }]}>vs</Text>
        <View style={[ms.formationSide, { justifyContent: 'flex-end' }]}>
          <View style={[ms.formationDot, { backgroundColor: AWAY_COLOR }]} />
          <Text style={[ms.formationTeam, { color: c.textPrimary }]}>{match.awayTeam.shortName}</Text>
          {match.awayTeam.logo.startsWith('http') ? (
            <Image source={{ uri: match.awayTeam.logo }} style={ms.formationLogo} />
          ) : null}
        </View>
      </View>
      <View style={ms.formationSubRow}>
        <Text style={[ms.formationSub, { color: c.textTertiary }]}>Local · {detail.homeLineup.formation}</Text>
        <Text style={[ms.formationSub, { color: c.textTertiary }]}>Visitante · {detail.awayLineup.formation}</Text>
      </View>

      {/* ── Pitch ── */}
      {ViewShot ? (
        <ViewShot ref={captureRef} options={{ format: 'png', quality: 1.0 }}>
          {PitchBlock}
        </ViewShot>
      ) : PitchBlock}

      {/* ── Share section ── */}
      <Text style={[ms.shareHint, { color: c.textTertiary }]}>
        Comparte la alineación o envíasela a un amigo
      </Text>
      {!!(ViewShot && Sharing) && (
        <TouchableOpacity
          style={[ms.shareBtn, { backgroundColor: c.accent }]}
          onPress={handleShare}
          activeOpacity={0.82}
        >
          <ShareIcon color="#fff" size={16} />
          <Text style={ms.shareBtnText}>COMPARTIR</Text>
        </TouchableOpacity>
      )}

      {/* ── Coaches section ── */}
      <Text style={[ms.sectionTitle, { color: c.textTertiary }]}>ENTRENADORES</Text>
      <View style={ms.coachesRow}>
        {/* Home coach */}
        <View style={[ms.coachCard, { backgroundColor: c.card, borderColor: HOME_COLOR + '40' }]}>
          <View style={[ms.coachAvatarWrap, { borderColor: HOME_COLOR + '60' }]}>
            <Text style={{ fontSize: 28 }}>👨‍💼</Text>
          </View>
          <Text style={[ms.coachName, { color: c.textPrimary }]} numberOfLines={1}>
            {detail.homeLineup.coach || 'DT'}
          </Text>
          {detail.homeLineup.coachNationality ? (
            <View style={ms.coachMeta}>
              <Text style={{ fontSize: 12 }}>🏳️</Text>
              <View style={[ms.coachBadge, { backgroundColor: HOME_COLOR }]}>
                <Text style={ms.coachBadgeText}>Local</Text>
              </View>
            </View>
          ) : (
            <View style={[ms.coachBadge, { backgroundColor: HOME_COLOR }]}>
              <Text style={ms.coachBadgeText}>Local</Text>
            </View>
          )}
          <Text style={[ms.coachTeam, { color: c.textTertiary }]}>{match.homeTeam.name}</Text>
        </View>

        {/* Away coach */}
        <View style={[ms.coachCard, { backgroundColor: c.card, borderColor: AWAY_COLOR + '40' }]}>
          <View style={[ms.coachAvatarWrap, { borderColor: AWAY_COLOR + '60' }]}>
            <Text style={{ fontSize: 28 }}>👨‍💼</Text>
          </View>
          <Text style={[ms.coachName, { color: c.textPrimary }]} numberOfLines={1}>
            {detail.awayLineup.coach || 'DT'}
          </Text>
          {detail.awayLineup.coachNationality ? (
            <View style={ms.coachMeta}>
              <Text style={{ fontSize: 12 }}>🏳️</Text>
              <View style={[ms.coachBadge, { backgroundColor: AWAY_COLOR }]}>
                <Text style={ms.coachBadgeText}>Visitante</Text>
              </View>
            </View>
          ) : (
            <View style={[ms.coachBadge, { backgroundColor: AWAY_COLOR }]}>
              <Text style={ms.coachBadgeText}>Visitante</Text>
            </View>
          )}
          <Text style={[ms.coachTeam, { color: c.textTertiary }]}>{match.awayTeam.name}</Text>
        </View>
      </View>

      {/* ── Bench / Suplentes ── */}
      <Text style={[ms.sectionTitle, { color: c.textTertiary }]}>BANCA / SUPLENTES</Text>

      {/* Segmented toggle */}
      <View style={[ms.segmented, { backgroundColor: c.surface, borderColor: c.border }]}>
        <TouchableOpacity
          style={[ms.segBtn, benchTeam === 'home' && { backgroundColor: c.accent }]}
          onPress={() => setBenchTeam('home')}
          activeOpacity={0.7}
        >
          <View style={[ms.segDot, { backgroundColor: HOME_COLOR }]} />
          <Text style={[ms.segText, { color: benchTeam === 'home' ? '#fff' : c.textTertiary }]}>
            {match.homeTeam.shortName}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[ms.segBtn, benchTeam === 'away' && { backgroundColor: c.accent }]}
          onPress={() => setBenchTeam('away')}
          activeOpacity={0.7}
        >
          <View style={[ms.segDot, { backgroundColor: AWAY_COLOR }]} />
          <Text style={[ms.segText, { color: benchTeam === 'away' ? '#fff' : c.textTertiary }]}>
            {match.awayTeam.shortName}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Bench list */}
      <View style={[ms.benchList, { backgroundColor: c.card, borderColor: c.border }]}>
        {activeBench.length === 0 ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: c.textTertiary, fontSize: 13 }}>Sin suplentes disponibles</Text>
          </View>
        ) : activeBench.map((p, i) => (
          <View key={p.id} style={[ms.benchRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
            <View style={[ms.benchNum, { backgroundColor: benchTeam === 'home' ? HOME_COLOR : AWAY_COLOR }]}>
              <Text style={ms.benchNumText}>{p.number}</Text>
            </View>
            <Text style={[ms.benchName, { color: c.textPrimary }]} numberOfLines={1}>{p.name || p.shortName}</Text>
            <View style={[ms.benchPosBadge, { backgroundColor: positionColor(p.positionShort) + '20' }]}>
              <Text style={[ms.benchPosText, { color: positionColor(p.positionShort) }]}>{p.positionShort}</Text>
            </View>
            {p.nationalityFlag ? (
              <Text style={{ fontSize: 16 }}>{p.nationalityFlag}</Text>
            ) : null}
          </View>
        ))}
      </View>

      <View style={{ height: 20 }} />
    </View>
  );
};

// ── Share icon mini ──────────────────────────────────────────────────────────
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

// ── Styles ────────────────────────────────────────────────────────────────────

const ms = StyleSheet.create({
  outer: { paddingHorizontal: PITCH_MARGIN, paddingTop: 8 },

  // Empty state
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  emptySubText: { fontSize: 12, textAlign: 'center', lineHeight: 18 },

  // Confirmation banner
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10,
  },
  bannerText: { fontSize: 14, fontWeight: '700', flex: 1 },

  // Formation header
  formationHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderRadius: 12, borderWidth: 1,
    gap: 8,
  },
  formationSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  formationLogo: { width: 24, height: 24, borderRadius: 12 },
  formationTeam: { fontSize: 14, fontWeight: '800' },
  formationDot: { width: 8, height: 8, borderRadius: 4 },
  formationVs: { fontSize: 12, fontWeight: '500' },
  formationSubRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 4, marginTop: 4, marginBottom: 8,
  },
  formationSub: { fontSize: 11, fontWeight: '500' },

  // Pitch container (UNCHANGED)
  pitchContainer: { borderRadius: 18, padding: 3, overflow: 'hidden' },
  pitchShadow: { ...StyleSheet.absoluteFillObject, borderWidth: 3, borderRadius: 18, opacity: 0.5 },
  pitch: { height: PITCH_HEIGHT, borderRadius: 14, overflow: 'hidden', position: 'relative' },
  topHalf: { flex: 1, flexDirection: 'column', justifyContent: 'space-evenly', paddingVertical: 16, paddingHorizontal: 10, zIndex: 2 },
  bottomHalf: { flex: 1, flexDirection: 'column-reverse', justifyContent: 'space-evenly', paddingVertical: 16, paddingHorizontal: 10, zIndex: 2 },
  playerRow: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' },
  halfLabels: { position: 'absolute', top: '50%', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, transform: [{ translateY: -11 }], zIndex: 3 },
  halfBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  halfBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  halfDot: { width: 4, height: 4, borderRadius: 2 },

  // Share
  shareHint: { fontSize: 13, textAlign: 'center', marginTop: 14, marginBottom: 8 },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 16, marginBottom: 4,
  },
  shareBtnText: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.8 },

  // Section title
  sectionTitle: {
    fontSize: 12, fontWeight: '700', letterSpacing: 1,
    marginTop: 20, marginBottom: 10,
  },

  // Coaches
  coachesRow: { flexDirection: 'row', gap: 10 },
  coachCard: {
    flex: 1, alignItems: 'center', padding: 16,
    borderRadius: 14, borderWidth: 1.5, gap: 8,
  },
  coachAvatarWrap: {
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  coachName: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  coachMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coachBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  coachBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  coachTeam: { fontSize: 12, fontWeight: '500', textAlign: 'center' },

  // Segmented toggle
  segmented: {
    flexDirection: 'row', borderRadius: 12, borderWidth: 1,
    overflow: 'hidden', marginBottom: 10,
  },
  segBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, gap: 6, borderRadius: 10,
  },
  segDot: { width: 8, height: 8, borderRadius: 4 },
  segText: { fontSize: 14, fontWeight: '700' },

  // Bench list
  benchList: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  benchRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12, gap: 10,
  },
  benchNum: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  benchNumText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  benchName: { flex: 1, fontSize: 14, fontWeight: '600' },
  benchPosBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  benchPosText: { fontSize: 10, fontWeight: '700' },
});

// ── Player dot styles (UNCHANGED) ────────────────────────────────────────────
const dot = StyleSheet.create({
  wrap: { alignItems: 'center', width: DOT_SIZE + 18, gap: 3 },
  glow: { position: 'absolute', width: DOT_SIZE + 8, height: DOT_SIZE + 8, borderRadius: (DOT_SIZE + 8) / 2, top: -4, left: (DOT_SIZE + 18 - DOT_SIZE - 8) / 2, opacity: 0.4 },
  outer: { position: 'relative', width: DOT_SIZE, height: DOT_SIZE },
  circle: { width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.45, shadowRadius: 4, elevation: 5 },
  image: { width: DOT_SIZE - 4, height: DOT_SIZE - 4, borderRadius: (DOT_SIZE - 4) / 2 },
  number: { fontSize: 11, fontWeight: '900', color: '#fff', includeFontPadding: false },
  name: { fontSize: 8, fontWeight: '700', color: '#fff', textAlign: 'center', maxWidth: DOT_SIZE + 18, textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  goalBadge: { position: 'absolute', top: -6, left: -6, zIndex: 2, flexDirection: 'row', alignItems: 'center' },
  goalEmoji: { fontSize: 10 },
  goalCount: { fontSize: 7, fontWeight: '900', color: '#fff', marginLeft: -1, textShadowColor: '#000', textShadowRadius: 2, textShadowOffset: { width: 0, height: 1 } },
  subBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#10b981', borderRadius: 7, width: 14, height: 14, alignItems: 'center', justifyContent: 'center', zIndex: 2, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.2)' },
  subArrow: { fontSize: 8, color: '#fff', fontWeight: '800' },
  cardBadge: { position: 'absolute', bottom: -2, right: -3, zIndex: 2 },
  cardRect: { width: 7, height: 10, borderRadius: 1.5, borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.2)' },
});
