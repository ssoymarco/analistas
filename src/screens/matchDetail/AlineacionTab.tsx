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
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../theme/useTheme';
import { useDarkMode } from '../../contexts/DarkModeContext';
import type { Match, MatchDetail, LineupPlayer, MatchLineup, MissingPlayer } from '../../data/types';

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
const STRIPE_COUNT = 8;

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
  grassA: '#1a1a1a', grassB: '#2d2d2d',
  lineColor: '#FFFFFF', lineWidth: 3,
  goalFrame: '#FFFFFF', shadow: 'rgba(0,0,0,0.4)',
  dotGlow: 'rgba(0,0,0,0.5)',
};

const LIGHT_PITCH: PitchTheme = {
  grassA: '#2D5F3E', grassB: '#3A7A4F',
  lineColor: '#FFFFFF', lineWidth: 3,
  goalFrame: '#FFFFFF', shadow: 'rgba(0,0,0,0.08)',
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

// ── Advertising banner — shown above and below the pitch ─────────────────────
const MatchBanner: React.FC = () => (
  <View style={{
    height: 40, backgroundColor: '#3b82f6',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  }}>
    {/* Logo mark */}
    <View style={{
      width: 24, height: 24, borderRadius: 6,
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: 13, fontWeight: '900', color: '#fff', includeFontPadding: false }}>A</Text>
    </View>
    {/* Text */}
    <View>
      <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff', letterSpacing: 0.6, lineHeight: 16 }}>
        ANALISTAS APP
      </Text>
      <Text style={{ fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.78)', letterSpacing: 0.4, lineHeight: 12 }}>
        analistasapp.com · DESCARGA YA
      </Text>
    </View>
  </View>
);

// ── Coach Detail Modal ────────────────────────────────────────────────────────
interface CoachModalData {
  lineup: MatchLineup;
  teamName: string;
  teamLogo: string;
  teamColor: string;
}

const CoachDetailModal: React.FC<{
  data: CoachModalData | null;
  visible: boolean;
  onClose: () => void;
}> = ({ data, visible, onClose }) => {
  const c   = useThemeColors();
  const { t } = useTranslation();
  const { isDark } = useDarkMode();
  if (!data) return null;
  const { lineup, teamName, teamLogo, teamColor } = data;
  const overlayBg = isDark ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.55)';
  const sheetBg   = isDark ? '#1c1c1e' : '#f2f2f7';
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[cdm.overlay, { backgroundColor: overlayBg }]} onPress={onClose} />
      <View style={[cdm.sheet, { backgroundColor: sheetBg }]}>
        {/* Handle */}
        <View style={[cdm.handle, { backgroundColor: c.border }]} />

        {/* Coach photo + name */}
        <View style={cdm.heroRow}>
          <View style={[cdm.photoWrap, { borderColor: teamColor + '60', backgroundColor: c.surface }]}>
            {lineup.coachImageUrl ? (
              <Image source={{ uri: lineup.coachImageUrl }} style={cdm.photo} resizeMode="cover" />
            ) : (
              <Text style={{ fontSize: 48 }}>👨‍💼</Text>
            )}
          </View>
          <View style={cdm.heroInfo}>
            <Text style={[cdm.coachName, { color: c.textPrimary }]} numberOfLines={2}>
              {lineup.coach || 'DT'}
            </Text>
            {lineup.coachNationality ? (
              <Text style={[cdm.coachNat, { color: c.textSecondary }]}>
                {lineup.coachNationality}
              </Text>
            ) : null}
            {/* Team badge */}
            <View style={cdm.teamRow}>
              {teamLogo?.startsWith('http') ? (
                <Image source={{ uri: teamLogo }} style={cdm.teamLogo} resizeMode="contain" />
              ) : null}
              <Text style={[cdm.teamName, { color: c.textTertiary }]} numberOfLines={1}>
                {teamName}
              </Text>
            </View>
          </View>
        </View>

        {/* Divider */}
        <View style={[cdm.divider, { backgroundColor: c.border }]} />

        {/* Title */}
        <Text style={[cdm.sectionTitle, { color: c.textTertiary }]}>
          {t('matchInfo.coachDetail').toUpperCase()}
        </Text>

        {/* Info rows */}
        <View style={[cdm.infoCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={cdm.infoRow}>
            <Text style={[cdm.infoLabel, { color: c.textTertiary }]}>{t('matchInfo.nationality')}</Text>
            <Text style={[cdm.infoValue, { color: c.textPrimary }]}>
              {lineup.coachNationality || '—'}
            </Text>
          </View>
          <View style={[cdm.infoRow, { borderTopWidth: 1, borderTopColor: c.border }]}>
            <Text style={[cdm.infoLabel, { color: c.textTertiary }]}>Equipo</Text>
            <Text style={[cdm.infoValue, { color: c.textPrimary }]}>{teamName}</Text>
          </View>
          <View style={[cdm.infoRow, { borderTopWidth: 1, borderTopColor: c.border }]}>
            <Text style={[cdm.infoLabel, { color: c.textTertiary }]}>Formación</Text>
            <Text style={[cdm.infoValue, { color: c.textPrimary }]}>{lineup.formation || '—'}</Text>
          </View>
        </View>

        {/* Close button */}
        <TouchableOpacity
          style={[cdm.closeBtn, { backgroundColor: c.surface, borderColor: c.border }]}
          onPress={onClose}
          activeOpacity={0.7}
        >
          <Text style={[cdm.closeBtnText, { color: c.textPrimary }]}>{t('common.close')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const cdm = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  photoWrap: {
    width: 90, height: 90, borderRadius: 45,
    borderWidth: 2, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  photo: { width: 90, height: 90 },
  heroInfo: { flex: 1, gap: 4 },
  coachName: { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  coachNat: { fontSize: 14, fontWeight: '500' },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  teamLogo: { width: 20, height: 20 },
  teamName: { fontSize: 13, fontWeight: '500' },
  divider: { height: 1, marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10 },
  infoCard: { borderRadius: 14, borderWidth: 1, marginBottom: 20, overflow: 'hidden' },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  infoLabel: { fontSize: 14, fontWeight: '500' },
  infoValue: { fontSize: 14, fontWeight: '700', textAlign: 'right', flex: 1, marginLeft: 16 },
  closeBtn: { borderRadius: 14, borderWidth: 1, paddingVertical: 14, alignItems: 'center' },
  closeBtnText: { fontSize: 15, fontWeight: '700' },
});

// ── Bajas / Sidelined section ─────────────────────────────────────────────────
const reasonIcon = (reason: MissingPlayer['reason']) => {
  switch (reason) {
    case 'injury':       return '🤕';
    case 'suspension':   return '🟨';
    case 'international': return '🌍';
    default:             return '❓';
  }
};

const SidelinedSection: React.FC<{
  home: MissingPlayer[];
  away: MissingPlayer[];
  homeTeamName: string;
  awayTeamName: string;
}> = ({ home, away, homeTeamName, awayTeamName }) => {
  const c = useThemeColors();
  const { t } = useTranslation();

  if (home.length === 0 && away.length === 0) return null;

  const renderList = (players: MissingPlayer[], color: string) => {
    if (players.length === 0) {
      return (
        <Text style={[sls.noSidelined, { color: c.textTertiary }]}>{t('lineup.noSidelined')}</Text>
      );
    }
    return players.map((p, i) => (
      <View key={i} style={sls.playerRow}>
        <Text style={sls.icon}>{reasonIcon(p.reason)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[sls.playerName, { color: c.textPrimary }]} numberOfLines={1}>{p.name}</Text>
          <Text style={[sls.playerDetail, { color: c.textTertiary }]}>{p.detail}</Text>
        </View>
        <View style={[sls.reasonBadge, { backgroundColor: color + '20' }]}>
          <Text style={[sls.reasonText, { color }]}>
            {p.reason === 'injury'        ? t('lineup.sidelinedInjury')
              : p.reason === 'suspension' ? t('lineup.sidelinedSuspension')
              : p.reason === 'international' ? t('lineup.sidelinedInternational')
              : t('lineup.sidelinedOther')}
          </Text>
        </View>
      </View>
    ));
  };

  return (
    <View style={{ marginTop: 4 }}>
      <Text style={[sls.sectionTitle, { color: c.textTertiary }]}>
        {t('lineup.sidelinedTitle').toUpperCase()}
      </Text>

      {/* Home team */}
      <View style={[sls.card, { backgroundColor: c.card, borderColor: HOME_COLOR + '30' }]}>
        <View style={[sls.teamHeader, { borderBottomColor: c.border }]}>
          <View style={[sls.teamDot, { backgroundColor: HOME_COLOR }]} />
          <Text style={[sls.teamLabel, { color: c.textPrimary }]} numberOfLines={1}>{homeTeamName}</Text>
        </View>
        <View style={sls.listBody}>
          {renderList(home, HOME_COLOR)}
        </View>
      </View>

      {/* Away team */}
      <View style={[sls.card, { backgroundColor: c.card, borderColor: AWAY_COLOR + '30', marginTop: 10 }]}>
        <View style={[sls.teamHeader, { borderBottomColor: c.border }]}>
          <View style={[sls.teamDot, { backgroundColor: AWAY_COLOR }]} />
          <Text style={[sls.teamLabel, { color: c.textPrimary }]} numberOfLines={1}>{awayTeamName}</Text>
        </View>
        <View style={sls.listBody}>
          {renderList(away, AWAY_COLOR)}
        </View>
      </View>
    </View>
  );
};

const sls = StyleSheet.create({
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10, marginTop: 6 },
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  teamHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1,
  },
  teamDot: { width: 8, height: 8, borderRadius: 4 },
  teamLabel: { fontSize: 13, fontWeight: '800' },
  listBody: { paddingHorizontal: 14, paddingVertical: 8, gap: 10 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  icon: { fontSize: 16, width: 22, textAlign: 'center' },
  playerName: { fontSize: 13, fontWeight: '700', lineHeight: 17 },
  playerDetail: { fontSize: 11, fontWeight: '400', marginTop: 1 },
  reasonBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  reasonText: { fontSize: 10, fontWeight: '700' },
  noSidelined: { fontSize: 12, fontStyle: 'italic', paddingVertical: 6 },
});

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export const AlineacionTab: React.FC<{ match: Match; detail: MatchDetail }> = ({ match, detail }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
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

  // Coach detail modal
  const [coachModalVisible, setCoachModalVisible] = useState(false);
  const [coachModalData, setCoachModalData] = useState<CoachModalData | null>(null);

  // Lineup state — three buckets:
  // • AI predicted (SportMonks expectedlineups add-on) → "🤖 Predicción IA"
  // • live/finished with real lineup data                → "✅ Confirmada"
  // • scheduled with non-expected data (rare)            → "ℹ️ Probable"
  const isExpected  = detail.homeLineup?.isExpected ?? detail.awayLineup?.isExpected ?? false;
  const isConfirmed = !isExpected && match.status !== 'scheduled';

  const handleShare = async () => {
    if (!ViewShot || !captureRef.current) return;
    try {
      const uri: string = await captureRef.current.capture();
      if (!Sharing) return;
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t('lineup.shareLineup') });
      }
    } catch {}
  };

  if (!hasLineups) {
    return (
      <View style={ms.empty}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>🏟️</Text>
        <Text style={[ms.emptyText, { color: c.textSecondary }]}>{t('lineup.noLineup')}</Text>
        <Text style={[ms.emptySubText, { color: c.textTertiary }]}>
          {t('lineup.availableSoon')}
        </Text>
      </View>
    );
  }

  // ── Pitch block ──────────────────────────────────────────────────────────
  const PitchBlock = (
    <View style={{ overflow: 'hidden', borderRadius: 18 }}>
      {/* Top advertising banner */}
      <MatchBanner />

      {/* Pitch */}
      <View style={[ms.pitchContainer, { backgroundColor: theme.grassA, borderRadius: 0 }]}>
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

      {/* Bottom advertising banner */}
      <MatchBanner />
    </View>
  );

  return (
    <View style={ms.outer}>

      {/* ── Confirmation banner ── */}
      <View style={[
        ms.banner,
        isExpected
          ? { backgroundColor: 'rgba(139,92,246,0.12)', borderColor: 'rgba(139,92,246,0.3)' }
          : isConfirmed
          ? { backgroundColor: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.3)' }
          : { backgroundColor: 'rgba(202,138,4,0.12)', borderColor: 'rgba(202,138,4,0.3)' },
      ]}>
        <Text style={{ fontSize: 14 }}>
          {isExpected ? '🤖' : isConfirmed ? '✅' : 'ℹ️'}
        </Text>
        <Text style={[
          ms.bannerText,
          { color: isExpected ? '#8b5cf6' : isConfirmed ? '#10b981' : '#ca8a04' },
        ]}>
          {isExpected ? t('lineup.aiPrediction') : isConfirmed ? t('lineup.confirmed') : t('lineup.probable')}
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

      {/* ── Share card ── */}
      {!!(ViewShot && Sharing) && (
        <View style={[ms.shareCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={ms.shareCardHeader}>
            <View style={[ms.shareCardIconWrap, { backgroundColor: 'rgba(0,224,150,0.12)' }]}>
              <ShareIcon color={c.accent} size={18} />
            </View>
            <Text style={[ms.shareCardTitle, { color: c.textPrimary }]}>
              {t('lineup.shareLineupTitle')}
            </Text>
          </View>
          <Text style={[ms.shareCardDesc, { color: c.textSecondary }]}>
            {t('lineup.shareLineupDesc')}
          </Text>
          <TouchableOpacity
            style={[ms.shareCardBtn, { backgroundColor: c.accent }]}
            onPress={handleShare}
            activeOpacity={0.82}
          >
            <ShareIcon color="#000" size={15} />
            <Text style={ms.shareCardBtnText}>
              {t('common.share').toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Coaches section ── */}
      <Text style={[ms.sectionTitle, { color: c.textTertiary }]}>ENTRENADORES</Text>
      <View style={ms.coachesRow}>
        {/* Home coach */}
        <TouchableOpacity
          style={[ms.coachCard, { backgroundColor: c.card, borderColor: HOME_COLOR + '40' }]}
          onPress={() => {
            setCoachModalData({
              lineup: detail.homeLineup,
              teamName: match.homeTeam.name,
              teamLogo: match.homeTeam.logo,
              teamColor: HOME_COLOR,
            });
            setCoachModalVisible(true);
          }}
          activeOpacity={0.7}
        >
          <View style={[ms.coachAvatarWrap, { borderColor: HOME_COLOR + '60' }]}>
            {detail.homeLineup.coachImageUrl ? (
              <Image source={{ uri: detail.homeLineup.coachImageUrl }} style={ms.coachPhoto} />
            ) : (
              <Text style={{ fontSize: 28 }}>👨‍💼</Text>
            )}
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
        </TouchableOpacity>

        {/* Away coach */}
        <TouchableOpacity
          style={[ms.coachCard, { backgroundColor: c.card, borderColor: AWAY_COLOR + '40' }]}
          onPress={() => {
            setCoachModalData({
              lineup: detail.awayLineup,
              teamName: match.awayTeam.name,
              teamLogo: match.awayTeam.logo,
              teamColor: AWAY_COLOR,
            });
            setCoachModalVisible(true);
          }}
          activeOpacity={0.7}
        >
          <View style={[ms.coachAvatarWrap, { borderColor: AWAY_COLOR + '60' }]}>
            {detail.awayLineup.coachImageUrl ? (
              <Image source={{ uri: detail.awayLineup.coachImageUrl }} style={ms.coachPhoto} />
            ) : (
              <Text style={{ fontSize: 28 }}>👨‍💼</Text>
            )}
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
        </TouchableOpacity>
      </View>

      {/* ── Bench / Suplentes — hidden for AI predictions (only starting XI matters) ── */}
      {!isExpected && (
        <>
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
                {/* Player photo or number badge */}
                {p.imageUrl ? (
                  <Image source={{ uri: p.imageUrl }} style={ms.benchPhoto} />
                ) : (
                  <View style={[ms.benchNum, { backgroundColor: benchTeam === 'home' ? HOME_COLOR : AWAY_COLOR }]}>
                    <Text style={ms.benchNumText}>{p.number}</Text>
                  </View>
                )}
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
        </>
      )}

      {/* ── Bajas y Suspensiones ── */}
      <SidelinedSection
        home={detail.missingPlayers?.home ?? []}
        away={detail.missingPlayers?.away ?? []}
        homeTeamName={match.homeTeam.name}
        awayTeamName={match.awayTeam.name}
      />

      <View style={{ height: 20 }} />

      {/* ── Coach detail modal ── */}
      <CoachDetailModal
        data={coachModalData}
        visible={coachModalVisible}
        onClose={() => setCoachModalVisible(false)}
      />
    </View>
  );
};

// ── Upload / Export icon — universal share symbol (↑ arrow + base tray) ──────
function UploadIcon({ color, size = 18 }: { color: string; size?: number }) {
  const s = size;
  const th = Math.max(1.8, s * 0.1); // stroke thickness
  const aw = s * 0.28;               // arrowhead arm width
  return (
    <View style={{ width: s, height: s }}>
      {/* Vertical shaft */}
      <View style={{ position: 'absolute', top: s * 0.06, left: s / 2 - th / 2, width: th, height: s * 0.58, backgroundColor: color, borderRadius: th }} />
      {/* Arrowhead — left arm */}
      <View style={{ position: 'absolute', top: s * 0.06 + aw * 0.28, left: s / 2 - aw - th * 0.2, width: aw, height: th, backgroundColor: color, borderRadius: th, transform: [{ rotate: '-45deg' }] }} />
      {/* Arrowhead — right arm */}
      <View style={{ position: 'absolute', top: s * 0.06 + aw * 0.28, right: s / 2 - aw - th * 0.2, width: aw, height: th, backgroundColor: color, borderRadius: th, transform: [{ rotate: '45deg' }] }} />
      {/* Base tray — horizontal line at bottom */}
      <View style={{ position: 'absolute', bottom: s * 0.07, left: s * 0.1, right: s * 0.1, height: th, backgroundColor: color, borderRadius: th }} />
    </View>
  );
}
const ShareIcon = UploadIcon;

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

  // Share card
  shareCard: {
    marginTop: 16,
    marginBottom: 4,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 10,
  },
  shareCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shareCardIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  shareCardTitle: { fontSize: 15, fontWeight: '800', flex: 1 },
  shareCardDesc: { fontSize: 13, lineHeight: 19, fontWeight: '400' },
  shareCardBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 12, paddingVertical: 13, marginTop: 2,
  },
  shareCardBtnText: { fontSize: 14, fontWeight: '800', color: '#000', letterSpacing: 0.8 },

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
  coachPhoto: { width: 52, height: 52, borderRadius: 26 },

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
  benchPhoto: { width: 32, height: 32, borderRadius: 16 },
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
