// ── CupBracketView v2 — Bracket Tree ──────────────────────────────────────────
// Horizontal bracket tree for knockout competitions.
// • Round pills at top for quick navigation
// • Two-column bracket pairs with connector lines
// • Compact tie cards: logos, names, aggregate scores
// • Winner highlighted in green, eliminated teams with strikethrough
// • Current match highlighted with accent border
// • Special Final card with trophy icon
import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useThemeColors } from '../theme/useTheme';
import type { CupRound, CupTie } from '../services/sportsApi';

// ── Constants ─────────────────────────────────────────────────────────────────
const CARD_H = 64;       // height of a tie card
const CARD_W = 158;      // width of a tie card
const PAIR_GAP = 6;      // gap between paired ties (within a feeder pair)
const GROUP_GAP = 20;    // gap between bracket pairs in the first round
const CONN_W = 30;       // width of connector column between rounds
const LINE_W = 1.5;      // thickness of bracket lines
const LINE_COLOR = 'rgba(255,255,255,0.12)';
const ACCENT_LINE = '#00E096';

// ── Team Logo ─────────────────────────────────────────────────────────────────
const Logo: React.FC<{ uri: string; size?: number }> = ({ uri, size = 18 }) => {
  if (uri?.startsWith('http')) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 2 }} resizeMode="contain" />;
  }
  return <Text style={{ fontSize: size - 3 }}>{uri || '⚽'}</Text>;
};

// ── Position Calculator ───────────────────────────────────────────────────────
// Calculates the Y position of every tie card in the bracket tree.
// Round 0 (first round): ties grouped in pairs, stacked vertically.
// Round N: each tie centered between its two feeder ties from round N-1.

interface BracketLayout {
  /** Y position of each tie: positions[roundIdx][tieIdx] */
  positions: number[][];
  /** Total height of the bracket area */
  totalHeight: number;
  /** Total width of the bracket area */
  totalWidth: number;
}

function calculateLayout(rounds: CupRound[]): BracketLayout {
  if (rounds.length === 0) return { positions: [], totalHeight: 0, totalWidth: 0 };

  const positions: number[][] = [];
  const pairH = CARD_H * 2 + PAIR_GAP;

  // ── Round 0 ─────────────────────────────────────────────────────────────────
  const first: number[] = [];
  const n = rounds[0].ties.length;
  for (let i = 0; i < n; i++) {
    const pair = Math.floor(i / 2);
    const slot = i % 2;
    first.push(pair * (pairH + GROUP_GAP) + slot * (CARD_H + PAIR_GAP));
  }
  positions.push(first);

  // ── Subsequent rounds ───────────────────────────────────────────────────────
  for (let r = 1; r < rounds.length; r++) {
    const prev = positions[r - 1];
    const curr: number[] = [];

    for (let i = 0; i < rounds[r].ties.length; i++) {
      const topIdx = i * 2;
      const botIdx = i * 2 + 1;

      if (topIdx < prev.length && botIdx < prev.length) {
        const topCenter = prev[topIdx] + CARD_H / 2;
        const botCenter = prev[botIdx] + CARD_H / 2;
        curr.push((topCenter + botCenter) / 2 - CARD_H / 2);
      } else if (topIdx < prev.length) {
        curr.push(prev[topIdx]);
      } else {
        curr.push(i * (CARD_H + GROUP_GAP));
      }
    }
    positions.push(curr);
  }

  // Total height
  let maxY = 0;
  for (const rp of positions) {
    for (const y of rp) {
      if (y + CARD_H > maxY) maxY = y + CARD_H;
    }
  }

  // Total width = sum of round columns + connector columns
  const totalWidth = rounds.length * CARD_W + (rounds.length - 1) * CONN_W + 32;

  return { positions, totalHeight: maxY + 16, totalWidth };
}

// ── Bracket Connectors ────────────────────────────────────────────────────────
// Draws the ┐├┘ bracket lines between two consecutive rounds.

const Connectors: React.FC<{
  fromYs: number[];
  toYs: number[];
  colX: number; // x of the connector column (right edge of left round)
  highlight?: Set<number>; // indices of feeder pairs that contain the current match
}> = ({ fromYs, toYs, colX, highlight }) => {
  const elements: React.ReactElement[] = [];
  const half = CONN_W / 2;

  for (let i = 0; i < toYs.length; i++) {
    const topIdx = i * 2;
    const botIdx = i * 2 + 1;
    if (topIdx >= fromYs.length) break;

    const topMid = fromYs[topIdx] + CARD_H / 2;
    const botMid = botIdx < fromYs.length ? fromYs[botIdx] + CARD_H / 2 : topMid;
    const targetMid = toYs[i] + CARD_H / 2;
    const color = highlight?.has(i) ? ACCENT_LINE : LINE_COLOR;

    // Horizontal exit from top tie
    elements.push(<View key={`ht${i}`} style={[bk.lineH, { left: colX, top: topMid - LINE_W / 2, width: half, backgroundColor: color }]} />);

    // Horizontal exit from bottom tie (if different from top)
    if (botIdx < fromYs.length) {
      elements.push(<View key={`hb${i}`} style={[bk.lineH, { left: colX, top: botMid - LINE_W / 2, width: half, backgroundColor: color }]} />);
    }

    // Vertical line connecting top and bottom exits
    const vTop = Math.min(topMid, botMid);
    const vBot = Math.max(topMid, botMid);
    elements.push(<View key={`v${i}`} style={[bk.lineV, { left: colX + half - LINE_W / 2, top: vTop, height: vBot - vTop + LINE_W, backgroundColor: color }]} />);

    // Horizontal line from vertical midpoint to target
    elements.push(<View key={`ho${i}`} style={[bk.lineH, { left: colX + half, top: targetMid - LINE_W / 2, width: half, backgroundColor: color }]} />);
  }

  return <>{elements}</>;
};

// ── Bracket Tie Card ──────────────────────────────────────────────────────────

const BracketTieCard: React.FC<{ tie: CupTie }> = ({ tie }) => {
  const c = useThemeColors();
  const homeWon = tie.winner?.id === tie.homeTeam.id;
  const awayWon = tie.winner?.id === tie.awayTeam.id;
  const hasAgg = tie.aggregate !== null;
  const isTBD = tie.homeTeam.name === 'TBD' && tie.awayTeam.name === 'TBD';

  const homeScore = hasAgg ? tie.aggregate!.home : tie.legs[0]?.homeScore;
  const awayScore = hasAgg ? tie.aggregate!.away : tie.legs[0]?.awayScore;
  const hasScore = homeScore !== null && homeScore !== undefined;

  if (isTBD) {
    return (
      <View style={[bk.card, { backgroundColor: c.surface, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={[bk.tbdText, { color: c.textTertiary }]}>Por definir</Text>
      </View>
    );
  }

  const borderColor = tie.isCurrentMatch ? ACCENT_LINE : 'transparent';

  return (
    <View style={[bk.card, { backgroundColor: c.card, borderLeftColor: borderColor, borderLeftWidth: 3 }]}>
      {/* Aggregate label */}
      {hasAgg && (
        <Text style={[bk.aggLabel, { color: c.textTertiary }]}>Global</Text>
      )}

      {/* Home row */}
      <View style={bk.teamRow}>
        <Logo uri={tie.homeTeam.logo} size={16} />
        <Text
          style={[
            bk.teamName,
            { color: awayWon ? c.textTertiary : c.textPrimary },
            homeWon && { fontWeight: '800' },
            awayWon && { textDecorationLine: 'line-through' },
          ]}
          numberOfLines={1}
        >
          {tie.homeTeam.shortName || tie.homeTeam.name}
        </Text>
        <Text style={[
          bk.score,
          { color: homeWon ? ACCENT_LINE : hasScore ? c.textPrimary : c.textTertiary },
          homeWon && { fontWeight: '900' },
        ]}>
          {hasScore ? homeScore : '–'}
        </Text>
      </View>

      {/* Away row */}
      <View style={bk.teamRow}>
        <Logo uri={tie.awayTeam.logo} size={16} />
        <Text
          style={[
            bk.teamName,
            { color: homeWon ? c.textTertiary : c.textPrimary },
            awayWon && { fontWeight: '800' },
            homeWon && { textDecorationLine: 'line-through' },
          ]}
          numberOfLines={1}
        >
          {tie.awayTeam.shortName || tie.awayTeam.name}
        </Text>
        <Text style={[
          bk.score,
          { color: awayWon ? ACCENT_LINE : hasScore ? c.textPrimary : c.textTertiary },
          awayWon && { fontWeight: '900' },
        ]}>
          {hasScore ? awayScore : '–'}
        </Text>
      </View>
    </View>
  );
};

// ── Final Card (special treatment) ────────────────────────────────────────────

const FinalCard: React.FC<{ tie: CupTie }> = ({ tie }) => {
  const c = useThemeColors();
  const homeWon = tie.winner?.id === tie.homeTeam.id;
  const awayWon = tie.winner?.id === tie.awayTeam.id;
  const hasScore = tie.legs[0]?.homeScore !== null && tie.legs[0]?.homeScore !== undefined;
  const isTBD = tie.homeTeam.name === 'TBD' || tie.awayTeam.name === 'TBD';

  return (
    <View style={[bk.finalCard, { backgroundColor: c.card, borderColor: hasScore ? ACCENT_LINE : c.border }]}>
      <Text style={{ fontSize: 32, marginBottom: 4 }}>🏆</Text>
      <Text style={[bk.finalTitle, { color: c.textTertiary }]}>FINAL</Text>

      {isTBD ? (
        <Text style={[bk.tbdText, { color: c.textTertiary, marginTop: 8 }]}>Por definir</Text>
      ) : (
        <View style={bk.finalTeams}>
          {/* Home */}
          <View style={bk.finalTeamCol}>
            <Logo uri={tie.homeTeam.logo} size={28} />
            <Text style={[
              bk.finalTeamName,
              { color: awayWon ? c.textTertiary : c.textPrimary },
              homeWon && { fontWeight: '800' },
            ]} numberOfLines={2}>
              {tie.homeTeam.name}
            </Text>
            {hasScore && (
              <Text style={[bk.finalScore, { color: homeWon ? ACCENT_LINE : c.textPrimary }]}>
                {tie.legs[0]?.homeScore}
              </Text>
            )}
          </View>

          <Text style={[bk.finalVs, { color: c.textTertiary }]}>vs</Text>

          {/* Away */}
          <View style={bk.finalTeamCol}>
            <Logo uri={tie.awayTeam.logo} size={28} />
            <Text style={[
              bk.finalTeamName,
              { color: homeWon ? c.textTertiary : c.textPrimary },
              awayWon && { fontWeight: '800' },
            ]} numberOfLines={2}>
              {tie.awayTeam.name}
            </Text>
            {hasScore && (
              <Text style={[bk.finalScore, { color: awayWon ? ACCENT_LINE : c.textPrimary }]}>
                {tie.legs[0]?.awayScore}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Date */}
      {tie.legs[0]?.date && (
        <Text style={[bk.finalDate, { color: c.textTertiary }]}>
          {tie.legs[0].date}
        </Text>
      )}
    </View>
  );
};

// ── Round Pills ───────────────────────────────────────────────────────────────

const RoundPills: React.FC<{
  rounds: CupRound[];
  selected: number;
  onSelect: (idx: number) => void;
}> = ({ rounds, selected, onSelect }) => {
  const c = useThemeColors();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={bk.pillsContent}
    >
      {rounds.map((round, idx) => {
        const active = selected === idx;
        return (
          <TouchableOpacity
            key={round.id}
            style={[
              bk.pill,
              { backgroundColor: active ? c.accent : c.surface },
            ]}
            onPress={() => onSelect(idx)}
            activeOpacity={0.7}
          >
            <Text style={[
              bk.pillText,
              { color: active ? '#000' : c.textSecondary },
            ]}>
              {round.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

interface CupBracketViewProps {
  rounds: CupRound[];
  leagueName: string;
  seasonStr: string;
}

export const CupBracketView: React.FC<CupBracketViewProps> = ({
  rounds,
  leagueName,
  seasonStr,
}) => {
  const c = useThemeColors();
  const scrollRef = useRef<ScrollView>(null);
  const screenW = Dimensions.get('window').width;

  // Find which round contains the current match (for initial scroll + pill)
  const currentRoundIdx = rounds.findIndex(r => r.ties.some(t => t.isCurrentMatch));
  const [selectedRound, setSelectedRound] = useState(Math.max(0, currentRoundIdx));

  // Calculate bracket layout
  const layout = calculateLayout(rounds);

  // Scroll to a round column
  const scrollToRound = useCallback((idx: number) => {
    setSelectedRound(idx);
    const x = idx * (CARD_W + CONN_W);
    scrollRef.current?.scrollTo({ x: Math.max(0, x - 16), animated: true });
  }, []);

  // On mount, scroll to the current round
  useEffect(() => {
    if (currentRoundIdx > 0) {
      setTimeout(() => scrollToRound(currentRoundIdx), 300);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (rounds.length === 0) {
    return (
      <View style={{ alignItems: 'center', paddingTop: 40, gap: 10 }}>
        <Text style={{ fontSize: 36 }}>🏆</Text>
        <Text style={{ fontSize: 15, fontWeight: '600', color: c.textSecondary }}>
          Bracket no disponible
        </Text>
      </View>
    );
  }

  // Detect final round
  const finalRoundIdx = rounds.length - 1;
  const isFinalSingle = rounds[finalRoundIdx]?.ties.length === 1;

  // Find highlight pairs (feeder pairs that contain the current match)
  const highlightPairs: Set<number>[] = rounds.map(() => new Set());
  for (let r = 0; r < rounds.length; r++) {
    for (let t = 0; t < rounds[r].ties.length; t++) {
      if (rounds[r].ties[t].isCurrentMatch && r > 0) {
        // Highlight the connector pair in the previous round
        highlightPairs[r - 1].add(t);
      }
    }
  }

  return (
    <View style={bk.container}>
      {/* Cup header */}
      <View style={bk.cupHeader}>
        <Text style={{ fontSize: 24 }}>🏆</Text>
        <View style={{ flex: 1 }}>
          <Text style={[bk.cupName, { color: c.textPrimary }]}>{leagueName}</Text>
          <Text style={[bk.cupSeason, { color: c.textTertiary }]}>
            {seasonStr} · Eliminatoria
          </Text>
        </View>
      </View>

      {/* Round pills */}
      <RoundPills
        rounds={rounds}
        selected={selectedRound}
        onSelect={scrollToRound}
      />

      {/* Bracket tree */}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16 }}
      >
        <View style={{ height: layout.totalHeight, width: layout.totalWidth, position: 'relative' }}>
          {rounds.map((round, rIdx) => {
            const colX = rIdx * (CARD_W + CONN_W);
            const yPositions = layout.positions[rIdx] ?? [];

            return (
              <React.Fragment key={round.id || rIdx}>
                {/* Round column label */}
                <View style={[bk.roundLabel, { left: colX, width: CARD_W }]}>
                  <Text style={[bk.roundLabelText, { color: c.textTertiary }]}>
                    {round.name}
                  </Text>
                </View>

                {/* Tie cards */}
                {round.ties.map((tie, tIdx) => {
                  // Special Final card
                  if (rIdx === finalRoundIdx && isFinalSingle) {
                    return (
                      <View
                        key={tie.id || tIdx}
                        style={{
                          position: 'absolute',
                          left: colX,
                          top: (yPositions[tIdx] ?? 0),
                          width: CARD_W,
                        }}
                      >
                        <FinalCard tie={tie} />
                      </View>
                    );
                  }

                  return (
                    <View
                      key={tie.id || tIdx}
                      style={{
                        position: 'absolute',
                        left: colX,
                        top: (yPositions[tIdx] ?? 0),
                        width: CARD_W,
                        height: CARD_H,
                      }}
                    >
                      <BracketTieCard tie={tie} />
                    </View>
                  );
                })}

                {/* Connector lines to next round */}
                {rIdx < rounds.length - 1 && (
                  <Connectors
                    fromYs={yPositions}
                    toYs={layout.positions[rIdx + 1] ?? []}
                    colX={colX + CARD_W}
                    highlight={highlightPairs[rIdx]}
                  />
                )}
              </React.Fragment>
            );
          })}
        </View>
      </ScrollView>

      {/* Legend */}
      <View style={[bk.legend, { borderTopColor: c.border }]}>
        <View style={bk.legendItem}>
          <View style={[bk.legendDot, { backgroundColor: ACCENT_LINE }]} />
          <Text style={[bk.legendText, { color: c.textTertiary }]}>Tu partido</Text>
        </View>
        <View style={bk.legendItem}>
          <View style={[bk.legendLine, { backgroundColor: LINE_COLOR }]} />
          <Text style={[bk.legendText, { color: c.textTertiary }]}>Bracket</Text>
        </View>
      </View>
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const bk = StyleSheet.create({
  container: { paddingTop: 8, paddingBottom: 16, gap: 12 },

  // Cup header
  cupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, marginBottom: 2,
  },
  cupName: { fontSize: 17, fontWeight: '800' },
  cupSeason: { fontSize: 11, fontWeight: '500', marginTop: 1 },

  // Pills
  pillsContent: { paddingHorizontal: 16, gap: 8 },
  pill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  pillText: { fontSize: 12, fontWeight: '700' },

  // Round labels (above each column in the bracket)
  roundLabel: { position: 'absolute' as const, top: -20 },
  roundLabelText: { fontSize: 10, fontWeight: '600', textAlign: 'center', letterSpacing: 0.3 },

  // Tie card
  card: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    justifyContent: 'center',
    gap: 1,
  },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  teamName: { flex: 1, fontSize: 11, fontWeight: '600' },
  score: { fontSize: 14, fontWeight: '800', minWidth: 18, textAlign: 'right' },
  aggLabel: { fontSize: 8, fontWeight: '700', letterSpacing: 0.5, marginBottom: 1 },
  tbdText: { fontSize: 12, fontWeight: '600', fontStyle: 'italic' },

  // Final card
  finalCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 4,
  },
  finalTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  finalTeams: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  finalTeamCol: { alignItems: 'center', gap: 4, flex: 1 },
  finalTeamName: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  finalScore: { fontSize: 22, fontWeight: '900' },
  finalVs: { fontSize: 12, fontWeight: '600' },
  finalDate: { fontSize: 10, fontWeight: '500', marginTop: 4 },

  // Connector lines (positioned absolutely)
  lineH: { position: 'absolute' as const, height: LINE_W },
  lineV: { position: 'absolute' as const, width: LINE_W },

  // Legend
  legend: {
    flexDirection: 'row', gap: 20, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLine: { width: 20, height: 2, borderRadius: 1 },
  legendText: { fontSize: 10, fontWeight: '500' },
});
