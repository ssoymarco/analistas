// ── CupBracketView v3 — Stage-based vertical list with round pills ────────────
// Shows one stage at a time. Pills navigate between stages.
// Each stage shows its ties as full-width cards with scores and leg details.
// Works for any tournament size (from 4-team cups to 64-team qualifiers).
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useThemeColors } from '../theme/useTheme';
import type { CupRound, CupTie, CupLeg } from '../services/sportsApi';

// ── Team Logo ─────────────────────────────────────────────────────────────────
const Logo: React.FC<{ uri: string; size?: number }> = ({ uri, size = 22 }) => {
  if (uri?.startsWith('http')) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 3 }} resizeMode="contain" />;
  }
  return <Text style={{ fontSize: size - 4 }}>{uri || '⚽'}</Text>;
};

// ── Stage status badge ────────────────────────────────────────────────────────
const StageBadge: React.FC<{ isCurrent: boolean; isFinished: boolean; tieCount: number }> = ({
  isCurrent, isFinished, tieCount,
}) => {
  const c = useThemeColors();
  if (isCurrent) {
    return (
      <View style={[s.badge, { backgroundColor: 'rgba(0,224,150,0.12)' }]}>
        <View style={[s.badgeDot, { backgroundColor: '#00E096' }]} />
        <Text style={[s.badgeText, { color: '#00E096' }]}>EN CURSO · {tieCount} llaves</Text>
      </View>
    );
  }
  if (isFinished) {
    return (
      <View style={[s.badge, { backgroundColor: 'rgba(142,142,147,0.08)' }]}>
        <Text style={[s.badgeText, { color: '#8E8E93' }]}>FINALIZADO · {tieCount} llaves</Text>
      </View>
    );
  }
  return (
    <View style={[s.badge, { backgroundColor: 'rgba(59,130,246,0.08)' }]}>
      <Text style={[s.badgeText, { color: '#3b82f6' }]}>PRÓXIMO · {tieCount} llaves</Text>
    </View>
  );
};

// ── Leg detail row ────────────────────────────────────────────────────────────
const LegDetail: React.FC<{ leg: CupLeg; canonicalHomeId: string }> = ({ leg, canonicalHomeId }) => {
  const c = useThemeColors();
  const isReversed = leg.homeTeam.id !== canonicalHomeId;
  const played = leg.homeScore !== null && leg.awayScore !== null;
  const h = isReversed ? leg.awayScore : leg.homeScore;
  const a = isReversed ? leg.homeScore : leg.awayScore;

  return (
    <View style={s.legRow}>
      <View style={[s.legBullet, { backgroundColor: played ? '#00E096' : c.textTertiary }]} />
      <Text style={[s.legLabel, { color: c.textTertiary }]}>
        {leg.legLabel || leg.date.slice(5).replace('-', '/')}
      </Text>
      {played ? (
        <Text style={[s.legScore, { color: c.textSecondary }]}>{h}–{a}</Text>
      ) : (
        <Text style={[s.legScore, { color: c.textTertiary }]}>
          {leg.date.slice(5).replace('-', '/')}
        </Text>
      )}
    </View>
  );
};

// ── Tie Card (full-width) ─────────────────────────────────────────────────────
const TieCard: React.FC<{ tie: CupTie }> = ({ tie }) => {
  const c = useThemeColors();
  const [expanded, setExpanded] = useState(tie.isCurrentMatch);
  const homeWon = tie.winner?.id === tie.homeTeam.id;
  const awayWon = tie.winner?.id === tie.awayTeam.id;
  const hasAgg = tie.aggregate !== null;
  const isTwoLeg = tie.legs.length > 1;
  const isInferred = tie.id.startsWith('inferred-');
  const isTBD = tie.homeTeam.name === 'TBD' && tie.awayTeam.name === 'TBD';

  const homeScore = hasAgg ? tie.aggregate!.home : tie.legs[0]?.homeScore;
  const awayScore = hasAgg ? tie.aggregate!.away : tie.legs[0]?.awayScore;
  const hasScore = homeScore !== null && homeScore !== undefined;

  if (isTBD) {
    return (
      <View style={[s.tieCard, { backgroundColor: c.surface, borderLeftColor: 'transparent' }]}>
        <Text style={{ color: c.textTertiary, fontSize: 13, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 }}>
          Por definir
        </Text>
      </View>
    );
  }

  const borderColor = tie.isCurrentMatch ? '#00E096' : isInferred ? 'rgba(59,130,246,0.3)' : 'transparent';
  const cardBg = isInferred ? c.surface : c.card;

  return (
    <TouchableOpacity
      style={[s.tieCard, { backgroundColor: cardBg, borderLeftColor: borderColor }]}
      activeOpacity={isTwoLeg ? 0.7 : 1}
      onPress={() => isTwoLeg && setExpanded(e => !e)}
    >
      {/* Inferred label */}
      {isInferred && (
        <Text style={[s.inferredLabel, { color: '#3b82f6' }]}>🔮 Proyección</Text>
      )}
      {/* Aggregate label */}
      {hasAgg && isTwoLeg && (
        <Text style={[s.aggLabel, { color: c.textTertiary }]}>Global</Text>
      )}

      {/* Home team row */}
      <View style={s.teamRow}>
        <Logo uri={tie.homeTeam.logo} />
        <Text
          style={[
            s.teamName,
            { color: awayWon ? c.textTertiary : c.textPrimary },
            homeWon && { fontWeight: '800' },
            awayWon && { textDecorationLine: 'line-through' },
          ]}
          numberOfLines={1}
        >
          {tie.homeTeam.name}
        </Text>
        <Text style={[
          s.scoreNum,
          { color: homeWon ? '#00E096' : hasScore ? c.textPrimary : c.textTertiary },
          homeWon && { fontWeight: '900' },
        ]}>
          {hasScore ? homeScore : '–'}
        </Text>
      </View>

      {/* Away team row */}
      <View style={s.teamRow}>
        <Logo uri={tie.awayTeam.logo} />
        <Text
          style={[
            s.teamName,
            { color: homeWon ? c.textTertiary : c.textPrimary },
            awayWon && { fontWeight: '800' },
            homeWon && { textDecorationLine: 'line-through' },
          ]}
          numberOfLines={1}
        >
          {tie.awayTeam.name}
        </Text>
        <Text style={[
          s.scoreNum,
          { color: awayWon ? '#00E096' : hasScore ? c.textPrimary : c.textTertiary },
          awayWon && { fontWeight: '900' },
        ]}>
          {hasScore ? awayScore : '–'}
        </Text>
      </View>

      {/* Expand hint for two-legged ties */}
      {isTwoLeg && hasScore && (
        <Text style={[s.expandHint, { color: c.textTertiary }]}>
          {expanded ? '▲ ocultar detalles' : '▼ ver ida y vuelta'}
        </Text>
      )}

      {/* Expanded legs */}
      {expanded && isTwoLeg && (
        <View style={[s.legsContainer, { borderTopColor: c.border }]}>
          {tie.legs.map((leg, idx) => (
            <LegDetail key={idx} leg={leg} canonicalHomeId={tie.homeTeam.id} />
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
};

// ── Round Pills ───────────────────────────────────────────────────────────────
const RoundPills: React.FC<{
  rounds: CupRound[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
}> = ({ rounds, selectedIdx, onSelect }) => {
  const c = useThemeColors();
  const scrollRef = useRef<ScrollView>(null);

  // Auto-scroll pills to selected
  useEffect(() => {
    if (selectedIdx > 0) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ x: Math.max(0, selectedIdx * 130 - 60), animated: true });
      }, 100);
    }
  }, [selectedIdx]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.pillsContent}
    >
      {rounds.map((round, idx) => {
        const active = selectedIdx === idx;
        return (
          <TouchableOpacity
            key={`${round.id}-${idx}`}
            style={[s.pill, { backgroundColor: active ? c.accent : c.surface }]}
            onPress={() => onSelect(idx)}
            activeOpacity={0.7}
          >
            <Text
              style={[s.pillText, { color: active ? '#000' : c.textSecondary }]}
              numberOfLines={1}
            >
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

  // Find the round containing the current match, or the last current/unfinished round
  const currentRoundIdx = (() => {
    const matchIdx = rounds.findIndex(r => r.ties.some(t => t.isCurrentMatch));
    if (matchIdx >= 0) return matchIdx;
    const currentIdx = rounds.findIndex(r => r.isCurrent);
    if (currentIdx >= 0) return currentIdx;
    // Default to the last round with scores
    for (let i = rounds.length - 1; i >= 0; i--) {
      if (rounds[i].ties.some(t => t.aggregate !== null || t.legs.some(l => l.homeScore !== null))) {
        return i;
      }
    }
    return 0;
  })();

  const [selectedIdx, setSelectedIdx] = useState(currentRoundIdx);
  const selectedRound = rounds[selectedIdx];

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

  return (
    <View style={s.container}>
      {/* Cup header */}
      <View style={s.cupHeader}>
        <Text style={{ fontSize: 24 }}>🏆</Text>
        <View style={{ flex: 1 }}>
          <Text style={[s.cupName, { color: c.textPrimary }]}>{leagueName}</Text>
          <Text style={[s.cupSeason, { color: c.textTertiary }]}>
            {seasonStr} · Eliminatoria
          </Text>
        </View>
      </View>

      {/* Round pills */}
      <RoundPills
        rounds={rounds}
        selectedIdx={selectedIdx}
        onSelect={setSelectedIdx}
      />

      {/* Stage header */}
      {selectedRound && (
        <View style={s.stageHeader}>
          <Text style={[s.stageName, { color: c.textPrimary }]}>{selectedRound.name}</Text>
          <StageBadge
            isCurrent={selectedRound.isCurrent}
            isFinished={selectedRound.isFinished}
            tieCount={selectedRound.ties.length}
          />
        </View>
      )}

      {/* Ties list */}
      {selectedRound?.ties.map((tie) => (
        <TieCard key={tie.id} tie={tie} />
      ))}

      {/* Navigation arrows */}
      <View style={s.navRow}>
        {selectedIdx > 0 && (
          <TouchableOpacity
            style={[s.navBtn, { backgroundColor: c.surface }]}
            onPress={() => setSelectedIdx(selectedIdx - 1)}
            activeOpacity={0.7}
          >
            <Text style={[s.navBtnText, { color: c.textSecondary }]}>
              ← {rounds[selectedIdx - 1]?.name}
            </Text>
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }} />
        {selectedIdx < rounds.length - 1 && (
          <TouchableOpacity
            style={[s.navBtn, { backgroundColor: c.surface }]}
            onPress={() => setSelectedIdx(selectedIdx + 1)}
            activeOpacity={0.7}
          >
            <Text style={[s.navBtnText, { color: c.textSecondary }]}>
              {rounds[selectedIdx + 1]?.name} →
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { paddingTop: 8, paddingBottom: 20, gap: 10 },

  // Cup header
  cupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, marginBottom: 2,
  },
  cupName: { fontSize: 17, fontWeight: '800' },
  cupSeason: { fontSize: 11, fontWeight: '500', marginTop: 1 },

  // Pills
  pillsContent: { paddingHorizontal: 16, gap: 8 },
  pill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  pillText: { fontSize: 12, fontWeight: '700' },

  // Stage header
  stageHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, marginTop: 4,
  },
  stageName: { fontSize: 16, fontWeight: '800' },

  // Badge
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  badgeDot: { width: 5, height: 5, borderRadius: 3 },
  badgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },

  // Tie card
  tieCard: {
    marginHorizontal: 16,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderLeftWidth: 3,
    gap: 6,
  },
  aggLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  inferredLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3, marginBottom: 2 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  teamName: { flex: 1, fontSize: 14, fontWeight: '600' },
  scoreNum: { fontSize: 18, fontWeight: '800', minWidth: 24, textAlign: 'right' },
  expandHint: { fontSize: 11, textAlign: 'center', marginTop: 4 },

  // Expanded legs
  legsContainer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8, paddingTop: 8, gap: 6,
  },
  legRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legBullet: { width: 6, height: 6, borderRadius: 3 },
  legLabel: { fontSize: 11, fontWeight: '600', flex: 1 },
  legScore: { fontSize: 13, fontWeight: '600' },

  // Navigation arrows
  navRow: {
    flexDirection: 'row', paddingHorizontal: 16, marginTop: 8, gap: 8,
  },
  navBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  navBtnText: { fontSize: 12, fontWeight: '600' },
});
