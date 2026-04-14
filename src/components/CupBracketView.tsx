// ── CupBracketView ────────────────────────────────────────────────────────────
// Renders a knockout bracket as a vertical list of rounds.
// Each round shows ties with team logos, leg scores, and aggregate.
// The tie containing the current fixture is highlighted.
import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useThemeColors } from '../theme/useTheme';
import type { CupRound, CupTie, CupLeg } from '../services/sportsApi';

// ── Team Logo ─────────────────────────────────────────────────────────────────
const TeamLogo: React.FC<{ logo: string; size?: number }> = ({ logo, size = 24 }) => {
  if (logo?.startsWith('http')) {
    return (
      <Image
        source={{ uri: logo }}
        style={{ width: size, height: size, borderRadius: 3 }}
        resizeMode="contain"
      />
    );
  }
  return <Text style={{ fontSize: size - 4 }}>{logo ?? '⚽'}</Text>;
};

// ── Round status badge ────────────────────────────────────────────────────────
const RoundBadge: React.FC<{ isCurrent: boolean; isFinished: boolean }> = ({
  isCurrent,
  isFinished,
}) => {
  if (isCurrent) {
    return (
      <View style={[cb.badge, { backgroundColor: 'rgba(0,224,150,0.15)' }]}>
        <View style={[cb.badgeDot, { backgroundColor: '#00E096' }]} />
        <Text style={[cb.badgeText, { color: '#00E096' }]}>EN CURSO</Text>
      </View>
    );
  }
  if (isFinished) {
    return (
      <View style={[cb.badge, { backgroundColor: 'rgba(142,142,147,0.12)' }]}>
        <Text style={[cb.badgeText, { color: '#8E8E93' }]}>FINALIZADO</Text>
      </View>
    );
  }
  return (
    <View style={[cb.badge, { backgroundColor: 'rgba(59,130,246,0.12)' }]}>
      <Text style={[cb.badgeText, { color: '#3b82f6' }]}>PRÓXIMO</Text>
    </View>
  );
};

// ── Single leg row (score line) ───────────────────────────────────────────────
const LegRow: React.FC<{ leg: CupLeg; canonicalHomeId: string }> = ({ leg, canonicalHomeId }) => {
  const c = useThemeColors();
  // From canonical perspective: if this leg's home team IS the canonical home, scores are direct
  const isReversed = leg.homeTeam.id !== canonicalHomeId;
  const homeScore = leg.homeScore;
  const awayScore = leg.awayScore;
  const played = homeScore !== null && awayScore !== null;

  const homeName = isReversed ? leg.awayTeam.name : leg.homeTeam.name;
  const awayName = isReversed ? leg.homeTeam.name : leg.awayTeam.name;
  const homeGoals = isReversed ? awayScore : homeScore;
  const awayGoals = isReversed ? homeScore : awayScore;

  return (
    <View style={cb.legRow}>
      {leg.legLabel ? (
        <Text style={[cb.legLabel, { color: c.textTertiary }]}>{leg.legLabel}</Text>
      ) : null}
      <Text style={[cb.legDate, { color: c.textTertiary }]}>
        {leg.date.slice(5).replace('-', '/')}
      </Text>
      {played ? (
        <Text style={[cb.legScore, { color: c.textSecondary }]}>
          {homeGoals}–{awayGoals}
        </Text>
      ) : (
        <Text style={[cb.legScore, { color: c.textTertiary }]}>–</Text>
      )}
    </View>
  );
};

// ── Tie card ──────────────────────────────────────────────────────────────────
const TieCard: React.FC<{ tie: CupTie; isCurrentRound: boolean }> = ({
  tie,
  isCurrentRound,
}) => {
  const c = useThemeColors();
  const [expanded, setExpanded] = useState(tie.isCurrentMatch || isCurrentRound);
  const hasAggregate = tie.aggregate !== null;
  const isTwoLeg = tie.legs.length > 1;

  // Winner highlight
  const homeWon = tie.winner?.id === tie.homeTeam.id;
  const awayWon = tie.winner?.id === tie.awayTeam.id;

  // Display score: aggregate if two-legged; single leg score otherwise
  const displayHomeScore = hasAggregate
    ? tie.aggregate!.home
    : tie.legs[0]?.homeScore;
  const displayAwayScore = hasAggregate
    ? tie.aggregate!.away
    : tie.legs[0]?.awayScore;
  const hasScore = displayHomeScore !== null && displayHomeScore !== undefined;

  const cardBg = tie.isCurrentMatch
    ? 'rgba(0,224,150,0.05)'
    : 'transparent';
  const cardBorder = tie.isCurrentMatch
    ? '#00E096'
    : c.border;

  return (
    <TouchableOpacity
      style={[cb.tieCard, { backgroundColor: cardBg, borderColor: cardBorder }]}
      onPress={() => isTwoLeg && setExpanded(e => !e)}
      activeOpacity={isTwoLeg ? 0.7 : 1}
    >
      {/* Home team row */}
      <View style={cb.teamRow}>
        <TeamLogo logo={tie.homeTeam.logo} size={22} />
        <Text
          style={[
            cb.teamName,
            { color: homeWon ? '#00E096' : awayWon ? c.textTertiary : c.textPrimary },
            homeWon && { fontWeight: '800' },
          ]}
          numberOfLines={1}
        >
          {tie.homeTeam.name}
        </Text>
        {homeWon && <Text style={cb.winnerTrophy}>🏆</Text>}
        <Text style={[
          cb.scoreNum,
          { color: homeWon ? '#00E096' : c.textPrimary, opacity: hasScore ? 1 : 0.3 },
          homeWon && { fontWeight: '900' },
        ]}>
          {hasScore ? displayHomeScore : '–'}
        </Text>
      </View>

      {/* Away team row */}
      <View style={cb.teamRow}>
        <TeamLogo logo={tie.awayTeam.logo} size={22} />
        <Text
          style={[
            cb.teamName,
            { color: awayWon ? '#00E096' : homeWon ? c.textTertiary : c.textPrimary },
            awayWon && { fontWeight: '800' },
          ]}
          numberOfLines={1}
        >
          {tie.awayTeam.name}
        </Text>
        {awayWon && <Text style={cb.winnerTrophy}>🏆</Text>}
        <Text style={[
          cb.scoreNum,
          { color: awayWon ? '#00E096' : c.textPrimary, opacity: hasScore ? 1 : 0.3 },
          awayWon && { fontWeight: '900' },
        ]}>
          {hasScore ? displayAwayScore : '–'}
        </Text>
      </View>

      {/* Aggregate label + expand hint for two-leg ties */}
      {isTwoLeg && hasScore && (
        <View style={cb.aggRow}>
          <Text style={[cb.aggLabel, { color: c.textTertiary }]}>
            Global
          </Text>
          <Text style={[cb.aggHint, { color: c.textTertiary }]}>
            {expanded ? '▲ ocultar' : '▼ detalles'}
          </Text>
        </View>
      )}

      {/* Expanded: individual leg details */}
      {expanded && isTwoLeg && (
        <View style={[cb.legsContainer, { borderTopColor: c.border }]}>
          {tie.legs.map((leg, idx) => (
            <LegRow key={idx} leg={leg} canonicalHomeId={tie.homeTeam.id} />
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
};

// ── Round card ────────────────────────────────────────────────────────────────
const RoundCard: React.FC<{ round: CupRound; hasCurrentMatch: boolean }> = ({
  round,
  hasCurrentMatch,
}) => {
  const c = useThemeColors();

  return (
    <View style={cb.roundCard}>
      {/* Round header */}
      <View style={[cb.roundHeader, { borderBottomColor: c.border }]}>
        <Text style={[cb.roundName, { color: c.textPrimary }]}>{round.name}</Text>
        <RoundBadge isCurrent={round.isCurrent} isFinished={round.isFinished} />
      </View>

      {/* Ties */}
      <View style={[cb.tiesContainer, { backgroundColor: c.card }]}>
        {round.ties.length > 0 ? (
          round.ties.map((tie) => (
            <View key={tie.id}>
              <TieCard tie={tie} isCurrentRound={hasCurrentMatch} />
              <View style={[cb.tieDivider, { backgroundColor: c.border }]} />
            </View>
          ))
        ) : (
          <View style={cb.emptyTie}>
            <Text style={{ fontSize: 20 }}>⚽</Text>
            <Text style={[cb.emptyTieText, { color: c.textTertiary }]}>Por definir</Text>
          </View>
        )}
      </View>
    </View>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
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
  const hasCurrentMatch = rounds.some(r => r.ties.some(t => t.isCurrentMatch));

  if (rounds.length === 0) {
    return (
      <View style={[cb.emptyState, { paddingTop: 40 }]}>
        <Text style={{ fontSize: 36 }}>🏆</Text>
        <Text style={[cb.emptyTitle, { color: c.textSecondary }]}>
          Bracket no disponible
        </Text>
        <Text style={[cb.emptySubtitle, { color: c.textTertiary }]}>
          Los datos de eliminatoria estarán disponibles próximamente
        </Text>
      </View>
    );
  }

  return (
    <View style={cb.container}>
      {/* Cup header */}
      <View style={cb.cupHeader}>
        <Text style={{ fontSize: 28 }}>🏆</Text>
        <View style={{ flex: 1 }}>
          <Text style={[cb.cupName, { color: c.textPrimary }]}>{leagueName}</Text>
          <Text style={[cb.cupSeason, { color: c.textTertiary }]}>{seasonStr} · Eliminatoria</Text>
        </View>
      </View>

      {/* Rounds */}
      {rounds.map((round) => (
        <RoundCard
          key={round.id}
          round={round}
          hasCurrentMatch={round.ties.some(t => t.isCurrentMatch)}
        />
      ))}

      {/* Legend */}
      <View style={[cb.legend, { borderTopColor: c.border }]}>
        <View style={cb.legendItem}>
          <View style={[cb.legendDot, { backgroundColor: '#00E096' }]} />
          <Text style={[cb.legendText, { color: c.textTertiary }]}>Partido actual</Text>
        </View>
        <View style={cb.legendItem}>
          <Text style={cb.legendTrophy}>🏆</Text>
          <Text style={[cb.legendText, { color: c.textTertiary }]}>Clasificado</Text>
        </View>
      </View>
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const cb = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 12,
  },

  // Cup header (trophy + name + season)
  cupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  cupName: { fontSize: 18, fontWeight: '800' },
  cupSeason: { fontSize: 12, fontWeight: '500', marginTop: 2 },

  // Round card
  roundCard: { gap: 0 },
  roundHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 8,
    marginTop: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 6,
  },
  roundName: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },

  // Round badge
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeDot: { width: 5, height: 5, borderRadius: 3 },
  badgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },

  // Ties container
  tiesContainer: { borderRadius: 14, overflow: 'hidden' },
  tieDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },

  // Tie card
  tieCard: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderLeftWidth: 3,
    gap: 6,
  },

  // Team row
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  teamName: { flex: 1, fontSize: 14, fontWeight: '600' },
  winnerTrophy: { fontSize: 12 },
  scoreNum: { fontSize: 18, fontWeight: '800', minWidth: 24, textAlign: 'right' },

  // Aggregate hint
  aggRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 4,
  },
  aggLabel: { fontSize: 11, fontWeight: '600' },
  aggHint: { fontSize: 11 },

  // Expanded legs
  legsContainer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    paddingTop: 8,
    gap: 4,
  },
  legRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legLabel: { fontSize: 10, fontWeight: '700', width: 44 },
  legDate: { fontSize: 11, flex: 1 },
  legScore: { fontSize: 13, fontWeight: '600', minWidth: 32, textAlign: 'right' },

  // Empty tie
  emptyTie: { paddingVertical: 16, alignItems: 'center', gap: 6 },
  emptyTieText: { fontSize: 13, fontWeight: '500' },

  // Empty state (no rounds at all)
  emptyState: { alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '600' },
  emptySubtitle: { fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },

  // Legend
  legend: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendTrophy: { fontSize: 12 },
  legendText: { fontSize: 11, fontWeight: '500' },
});
