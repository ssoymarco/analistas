// ── Previa / En Vivo / Resumen Tab ───────────────────────────────────────────
// Adapts to match status: Previa (scheduled), En Vivo (live), Resumen (finished).
// Scheduled: Predictions carousel, Momios, H2H, Form, Match Info.
// Live/Finished: Quick stats, Events, Pressure, Odds, H2H, Form, Info.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  ScrollView, Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeColors } from '../../theme/useTheme';
import type {
  Match, MatchDetail, MatchEvent, H2HResult, TeamFormEntry,
  OddsMarket, MatchPrediction, MissingPlayer, PressureIndex,
} from '../../data/types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH   = SCREEN_WIDTH - 72; // prediction card width
const CARD_GAP     = 10;

// ══════════════════════════════════════════════════════════════════════════════
// SHARED SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

function eventEmoji(type: string): string {
  switch (type) {
    case 'goal':          return '⚽';
    case 'own-goal':      return '⚽';
    case 'penalty-goal':  return '⚽';
    case 'penalty-miss':  return '❌';
    case 'yellow':        return '🟨';
    case 'second-yellow': return '🟨🟥';
    case 'red':           return '🟥';
    case 'sub':           return '🔄';
    case 'var':           return '📺';
    default:              return '●';
  }
}

function isGoalEvent(type: string): boolean {
  return type === 'goal' || type === 'own-goal' || type === 'penalty-goal';
}

// ── Quick stats strip (live/finished) ────────────────────────────────────────
const QuickStats: React.FC<{ match: Match; detail: MatchDetail }> = ({ match, detail }) => {
  const c = useThemeColors();
  const allStats = detail.statistics.flatMap(cat => cat.stats);
  const poss     = allStats.find(s => s.label === 'Posesión');
  const shots    = allStats.find(s => s.label === 'Tiros totales');
  const onTarget = allStats.find(s => s.label === 'Tiros a puerta');
  const xg       = allStats.find(s => s.label === 'xG (Goles esperados)');

  if (!poss && !shots) return null;

  const homeP = poss?.home ?? 50;
  const awayP = poss?.away ?? 50;

  return (
    <View style={[qs.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={qs.row}>
        <Text style={[qs.teamAbbr, { color: '#3b82f6' }]}>{match.homeTeam.shortName}</Text>
        <View style={qs.center}>
          <Text style={[qs.centerLabel, { color: c.textTertiary }]}>Posesión</Text>
          <View style={qs.possBar}>
            <View style={[qs.possHome, { flex: homeP }]} />
            <View style={[qs.possAway, { flex: awayP }]} />
          </View>
          <View style={qs.possNumbers}>
            <Text style={[qs.possNum, { color: '#3b82f6' }]}>{homeP}%</Text>
            <Text style={[qs.possNum, { color: '#f97316' }]}>{awayP}%</Text>
          </View>
        </View>
        <Text style={[qs.teamAbbr, { color: '#f97316' }]}>{match.awayTeam.shortName}</Text>
      </View>
      {[shots, onTarget, xg].filter(Boolean).map(s => s && (
        <View key={s.label} style={[qs.miniStatRow, { borderTopColor: c.border }]}>
          <Text style={[qs.miniVal, { color: '#3b82f6' }]}>{s.type === 'percentage' ? `${s.home}%` : s.home}</Text>
          <Text style={[qs.miniLabel, { color: c.textTertiary }]}>{s.label}</Text>
          <Text style={[qs.miniVal, { color: '#f97316' }]}>{s.type === 'percentage' ? `${s.away}%` : s.away}</Text>
        </View>
      ))}
    </View>
  );
};

const qs = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, marginBottom: 8, overflow: 'hidden', paddingTop: 14 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  teamAbbr: { fontSize: 13, fontWeight: '800', width: 36 },
  center: { flex: 1, alignItems: 'center', gap: 6 },
  centerLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
  possBar: { flexDirection: 'row', height: 6, width: '100%', borderRadius: 3, overflow: 'hidden' },
  possHome: { backgroundColor: '#3b82f6' },
  possAway: { backgroundColor: '#f97316' },
  possNumbers: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  possNum: { fontSize: 12, fontWeight: '700' },
  miniStatRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1 },
  miniVal: { width: 36, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  miniLabel: { flex: 1, fontSize: 11, fontWeight: '500', textAlign: 'center' },
});

// ── Event row (live/finished) ────────────────────────────────────────────────
const EventRow: React.FC<{ event: MatchEvent; match: Match }> = ({ event, match }) => {
  const c = useThemeColors();
  const isHome = event.team === 'home';
  const isGoal = isGoalEvent(event.type);
  const minuteStr = `${event.minute}${event.addedTime ? `+${event.addedTime}` : ''}'`;

  return (
    <View style={[ev.row, { borderBottomColor: c.border }]}>
      <View style={ev.side}>
        {isHome && (
          <View style={ev.infoHome}>
            <Text style={[ev.player, { color: c.textPrimary }, isGoal && ev.playerGoal]}>{event.player}</Text>
            {event.relatedPlayer && (
              <Text style={[ev.sub, { color: c.textSecondary }]}>
                {event.type === 'sub' ? `↓ ${event.relatedPlayer}` : `Asistencia: ${event.relatedPlayer}`}
              </Text>
            )}
          </View>
        )}
      </View>
      <View style={ev.center}>
        <View style={[ev.iconWrap, { backgroundColor: c.surface }]}>
          <Text style={ev.icon}>{eventEmoji(event.type)}</Text>
        </View>
        <Text style={[ev.minute, { color: c.textTertiary }]}>{minuteStr}</Text>
      </View>
      <View style={ev.side}>
        {!isHome && (
          <View style={ev.infoAway}>
            <Text style={[ev.player, { color: c.textPrimary }, isGoal && ev.playerGoal]}>{event.player}</Text>
            {event.relatedPlayer && (
              <Text style={[ev.sub, { color: c.textSecondary }]}>
                {event.type === 'sub' ? `↓ ${event.relatedPlayer}` : `Asistencia: ${event.relatedPlayer}`}
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
};

const ev = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  side: { flex: 1, minHeight: 36 },
  infoHome: { alignItems: 'flex-end', paddingRight: 4 },
  infoAway: { alignItems: 'flex-start', paddingLeft: 4 },
  player: { fontSize: 13, fontWeight: '500' },
  playerGoal: { fontWeight: '700' },
  sub: { fontSize: 11, marginTop: 1 },
  center: { alignItems: 'center', gap: 3, width: 54 },
  iconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 15 },
  minute: { fontSize: 10, fontWeight: '700' },
});

// ══════════════════════════════════════════════════════════════════════════════
// PREVIA-SPECIFIC SECTIONS (scheduled matches)
// ══════════════════════════════════════════════════════════════════════════════

// ── Vote storage helpers ─────────────────────────────────────────────────────
const VOTE_STORAGE_PREFIX = '@prediction_votes_';
const VOTE_COUNTS_PREFIX  = '@prediction_counts_';

interface VoteState {
  winner?: string;   // '1' | 'X' | '2'
  goals?: string;    // '+2.5' | '-2.5'
}
interface VoteCounts {
  winner: Record<string, number>;  // { '1': n, 'X': n, '2': n }
  goals: Record<string, number>;   // { '+2.5': n, '-2.5': n }
}

async function loadVotes(matchId: string): Promise<{ votes: VoteState; counts: VoteCounts }> {
  try {
    const [vRaw, cRaw] = await Promise.all([
      AsyncStorage.getItem(VOTE_STORAGE_PREFIX + matchId),
      AsyncStorage.getItem(VOTE_COUNTS_PREFIX + matchId),
    ]);
    const votes: VoteState = vRaw ? JSON.parse(vRaw) : {};
    const counts: VoteCounts = cRaw
      ? JSON.parse(cRaw)
      : { winner: { '1': 0, 'X': 0, '2': 0 }, goals: { '+2.5': 0, '-2.5': 0 } };
    return { votes, counts };
  } catch {
    return { votes: {}, counts: { winner: { '1': 0, 'X': 0, '2': 0 }, goals: { '+2.5': 0, '-2.5': 0 } } };
  }
}

async function saveVote(
  matchId: string,
  poll: 'winner' | 'goals',
  option: string,
  currentVotes: VoteState,
  currentCounts: VoteCounts,
): Promise<{ votes: VoteState; counts: VoteCounts }> {
  const newVotes = { ...currentVotes, [poll]: option };
  const newCounts = {
    ...currentCounts,
    [poll]: {
      ...currentCounts[poll],
      [option]: (currentCounts[poll][option] || 0) + 1,
    },
  };
  await Promise.all([
    AsyncStorage.setItem(VOTE_STORAGE_PREFIX + matchId, JSON.stringify(newVotes)),
    AsyncStorage.setItem(VOTE_COUNTS_PREFIX + matchId, JSON.stringify(newCounts)),
  ]);
  return { votes: newVotes, counts: newCounts };
}

// ── Predictions carousel ─────────────────────────────────────────────────────
const PredictionsCarousel: React.FC<{ match: Match }> = ({ match }) => {
  const c = useThemeColors();
  const [activeDot, setActiveDot] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  // ── Vote state ──
  const [votes, setVotes] = useState<VoteState>({});
  const [counts, setCounts] = useState<VoteCounts>({
    winner: { '1': 0, 'X': 0, '2': 0 },
    goals: { '+2.5': 0, '-2.5': 0 },
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadVotes(match.id).then(({ votes: v, counts: ct }) => {
      setVotes(v);
      setCounts(ct);
      setLoaded(true);
    });
  }, [match.id]);

  const handleVote = useCallback(async (poll: 'winner' | 'goals', option: string) => {
    // Already voted on this poll → ignore
    if (votes[poll]) return;
    const { votes: nv, counts: nc } = await saveVote(match.id, poll, option, votes, counts);
    setVotes(nv);
    setCounts(nc);
  }, [match.id, votes, counts]);

  const handleCarouselScroll = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / (CARD_WIDTH + CARD_GAP));
    setActiveDot(idx);
  };

  const winnerTotal = Object.values(counts.winner).reduce((a, b) => a + b, 0);
  const goalsTotal  = Object.values(counts.goals).reduce((a, b) => a + b, 0);
  const answeredCount = (votes.winner ? 1 : 0) + (votes.goals ? 1 : 0);

  // Helper: get percentage string
  const pct = (n: number, total: number) => total > 0 ? Math.round((n / total) * 100) : 0;

  const cards = [
    // Card 1: Who wins?
    <View key="1" style={[pc.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={pc.cardHeader}>
        <TeamBadgeMini name={match.homeTeam.shortName} logo={match.homeTeam.logo} color="#ef4444" />
        <Text style={[pc.vsLabel, { color: c.textTertiary }]}>vs</Text>
        <TeamBadgeMini name={match.awayTeam.shortName} logo={match.awayTeam.logo} color="#9ca3af" />
      </View>
      <Text style={[pc.question, { color: c.textPrimary }]}>¿Quién crees que ganará?</Text>
      <View style={pc.optionsRow}>
        {[
          { key: '1', label: '1', sub: match.homeTeam.shortName },
          { key: 'X', label: 'X', sub: 'Empate' },
          { key: '2', label: '2', sub: match.awayTeam.shortName },
        ].map(opt => {
          const voted = votes.winner != null;
          const isSelected = votes.winner === opt.key;
          const percentage = pct(counts.winner[opt.key] || 0, winnerTotal);
          return (
            <TouchableOpacity
              key={opt.key}
              style={[
                pc.optionBtn,
                { borderColor: isSelected ? c.accent : c.border },
                isSelected && { backgroundColor: c.accent + '18' },
              ]}
              activeOpacity={voted ? 1 : 0.7}
              onPress={() => handleVote('winner', opt.key)}
            >
              <Text style={[pc.optionLabel, { color: isSelected ? c.accent : c.textPrimary }]}>{opt.label}</Text>
              <Text style={[pc.optionTeam, { color: isSelected ? c.accent : c.textTertiary }]}>{opt.sub}</Text>
              {voted && (
                <View style={pc.resultBadge}>
                  <Text style={[pc.resultPct, { color: isSelected ? c.accent : c.textTertiary }]}>{percentage}%</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      {votes.winner && (
        <Text style={[pc.totalVotes, { color: c.textTertiary }]}>
          {winnerTotal} {winnerTotal === 1 ? 'voto' : 'votos'}
        </Text>
      )}
    </View>,

    // Card 2: Goals
    <View key="2" style={[pc.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={pc.cardHeader}>
        <TeamBadgeMini name={match.homeTeam.shortName} logo={match.homeTeam.logo} color="#ef4444" />
        <Text style={[pc.vsLabel, { color: c.textTertiary }]}>vs</Text>
        <TeamBadgeMini name={match.awayTeam.shortName} logo={match.awayTeam.logo} color="#9ca3af" />
      </View>
      <Text style={[pc.question, { color: c.textPrimary }]}>¿Cuántos goles habrá?</Text>
      <View style={pc.optionsRow}>
        {[
          { key: '+2.5', label: '+2.5', sub: 'Más goles' },
          { key: '-2.5', label: '-2.5', sub: 'Menos goles' },
        ].map(opt => {
          const voted = votes.goals != null;
          const isSelected = votes.goals === opt.key;
          const percentage = pct(counts.goals[opt.key] || 0, goalsTotal);
          return (
            <TouchableOpacity
              key={opt.key}
              style={[
                pc.optionBtn, pc.optionBtnWide,
                { borderColor: isSelected ? c.accent : c.border },
                isSelected && { backgroundColor: c.accent + '18' },
              ]}
              activeOpacity={voted ? 1 : 0.7}
              onPress={() => handleVote('goals', opt.key)}
            >
              <Text style={[pc.optionLabel, { color: isSelected ? c.accent : c.textPrimary }]}>{opt.label}</Text>
              <Text style={[pc.optionTeam, { color: isSelected ? c.accent : c.textTertiary }]}>{opt.sub}</Text>
              {voted && (
                <View style={pc.resultBadge}>
                  <Text style={[pc.resultPct, { color: isSelected ? c.accent : c.textTertiary }]}>{percentage}%</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      {votes.goals && (
        <Text style={[pc.totalVotes, { color: c.textTertiary }]}>
          {goalsTotal} {goalsTotal === 1 ? 'voto' : 'votos'}
        </Text>
      )}
    </View>,

    // Card 3: CTA / Ad
    <View key="3" style={[pc.card, pc.ctaCard, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={{ fontSize: 40 }}>🎰</Text>
      <Text style={[pc.ctaTitle, { color: c.textPrimary }]}>¿Listo para apostar?</Text>
      <TouchableOpacity style={pc.ctaBtn} activeOpacity={0.8}>
        <Text style={pc.ctaBtnText}>Apuesta ahora</Text>
      </TouchableOpacity>
      <Text style={[pc.ctaDisclaimer, { color: c.textTertiary }]}>
        Publicidad · +18 · Juega responsablemente
      </Text>
    </View>,
  ];

  return (
    <View style={pc.outer}>
      {/* Header */}
      <View style={pc.headerRow}>
        <View style={[pc.headerBar, { backgroundColor: c.accent }]} />
        <Text style={[pc.headerTitle, { color: c.textPrimary }]}>PREDICCIONES</Text>
        <Text style={[pc.headerLeague, { color: c.textTertiary }]}>  · {match.league}</Text>
        <View style={{ flex: 1 }} />
        {/* Pagination dots */}
        <View style={pc.dots}>
          {cards.map((_, i) => (
            <View key={i} style={[
              pc.dot,
              { backgroundColor: i === activeDot ? c.accent : c.textTertiary },
              i === activeDot && pc.dotActive,
            ]} />
          ))}
        </View>
        <Text style={[pc.counter, { color: c.textTertiary }]}>{answeredCount}/2</Text>
      </View>
      <Text style={[pc.hintText, { color: c.textTertiary }]}>Desliza para más  →</Text>

      {/* Carousel */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled={false}
        snapToInterval={CARD_WIDTH + CARD_GAP}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: 32 }}
        onScroll={handleCarouselScroll}
        scrollEventThrottle={16}
      >
        {cards.map((card, i) => (
          <View key={i} style={{ width: CARD_WIDTH, marginRight: CARD_GAP }}>
            {card}
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

// Mini team badge for prediction cards
function TeamBadgeMini({ name, logo, color }: { name: string; logo: string; color: string }) {
  const c = useThemeColors();
  const isUrl = logo.startsWith('http');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {isUrl ? (
        <Image source={{ uri: logo }} style={{ width: 20, height: 20, borderRadius: 10 }} />
      ) : (
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 8, color: '#fff', fontWeight: '800' }}>{name.slice(0, 1)}</Text>
        </View>
      )}
      <Text style={{ fontSize: 13, fontWeight: '700', color: c.textPrimary }}>{name}</Text>
    </View>
  );
}

const pc = StyleSheet.create({
  outer: { gap: 8 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  headerBar: { width: 3, height: 14, borderRadius: 1.5, marginRight: 8 },
  headerTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
  headerLeague: { fontSize: 12, fontWeight: '500' },
  dots: { flexDirection: 'row', gap: 4, marginRight: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, opacity: 0.5 },
  dotActive: { width: 16, borderRadius: 3, opacity: 1 },
  counter: { fontSize: 12, fontWeight: '600' },
  hintText: {
    fontSize: 11, fontWeight: '500',
    textAlign: 'right', paddingRight: 4, marginTop: -2,
  },
  card: {
    borderRadius: 14, borderWidth: 1, padding: 16, gap: 14,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  vsLabel: { fontSize: 12, fontWeight: '500' },
  question: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  optionsRow: { flexDirection: 'row', gap: 10 },
  optionBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 16,
    borderRadius: 12, borderWidth: 1, gap: 4,
  },
  optionBtnWide: { paddingVertical: 18 },
  optionLabel: { fontSize: 22, fontWeight: '900' },
  optionTeam: { fontSize: 11, fontWeight: '600' },
  ctaCard: { alignItems: 'center', justifyContent: 'center' },
  ctaTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  ctaBtn: {
    backgroundColor: '#10b981', paddingHorizontal: 32, paddingVertical: 14,
    borderRadius: 14,
  },
  ctaBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  ctaDisclaimer: { fontSize: 10, fontWeight: '500' },
  resultBadge: { marginTop: 4 },
  resultPct: { fontSize: 15, fontWeight: '800' },
  totalVotes: { fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: -4 },
});

// ── Poll Results (live/finished) — shows locked voting results ───────────────
const PollResultsSection: React.FC<{ match: Match }> = ({ match }) => {
  const c = useThemeColors();
  const [votes, setVotes] = useState<VoteState>({});
  const [counts, setCounts] = useState<VoteCounts>({
    winner: { '1': 0, 'X': 0, '2': 0 },
    goals: { '+2.5': 0, '-2.5': 0 },
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadVotes(match.id).then(({ votes: v, counts: ct }) => {
      setVotes(v);
      setCounts(ct);
      setLoaded(true);
    });
  }, [match.id]);

  const winnerTotal = Object.values(counts.winner).reduce((a, b) => a + b, 0);
  const goalsTotal  = Object.values(counts.goals).reduce((a, b) => a + b, 0);
  const pct = (n: number, total: number) => total > 0 ? Math.round((n / total) * 100) : 0;

  // If nobody voted, don't show anything
  if (!loaded || (winnerTotal === 0 && goalsTotal === 0)) return null;

  const isFinished = match.status === 'finished';
  const totalGoals = match.homeScore + match.awayScore;

  // Determine actual outcomes for finished matches
  const actualWinner = isFinished
    ? (match.homeScore > match.awayScore ? '1' : match.homeScore < match.awayScore ? '2' : 'X')
    : null;
  const actualGoals = isFinished
    ? (totalGoals > 2.5 ? '+2.5' : '-2.5')
    : null;

  const winnerOptions = [
    { key: '1', label: '1', sub: match.homeTeam.shortName },
    { key: 'X', label: 'X', sub: 'Empate' },
    { key: '2', label: '2', sub: match.awayTeam.shortName },
  ];
  const goalsOptions = [
    { key: '+2.5', label: '+2.5', sub: 'Más de 2.5' },
    { key: '-2.5', label: '-2.5', sub: 'Menos de 2.5' },
  ];

  return (
    <View style={[pr.card, { backgroundColor: c.card, borderColor: c.border }]}>
      {/* Header */}
      <View style={pr.header}>
        <Text style={{ fontSize: 16 }}>📊</Text>
        <Text style={[pr.title, { color: c.textPrimary }]}>Predicciones de la comunidad</Text>
        <View style={{ flex: 1 }} />
        <View style={[pr.lockBadge, { backgroundColor: c.surface }]}>
          <Text style={{ fontSize: 10 }}>🔒</Text>
          <Text style={[pr.lockText, { color: c.textTertiary }]}>
            {isFinished ? 'Finalizado' : 'En juego'}
          </Text>
        </View>
      </View>

      {/* Winner poll */}
      {winnerTotal > 0 && (
        <View style={[pr.pollBlock, { borderTopColor: c.border }]}>
          <Text style={[pr.pollQuestion, { color: c.textSecondary }]}>¿Quién gana?</Text>
          <View style={pr.barsWrap}>
            {winnerOptions.map(opt => {
              const count = counts.winner[opt.key] || 0;
              const percentage = pct(count, winnerTotal);
              const isWinner = actualWinner === opt.key;
              const userPicked = votes.winner === opt.key;
              const barColor = isWinner ? '#10b981' : (actualWinner && !isWinner ? c.textTertiary + '40' : '#3b82f6');

              return (
                <View key={opt.key} style={pr.barRow}>
                  <View style={pr.barLabelWrap}>
                    <Text style={[pr.barLabel, { color: isWinner ? '#10b981' : c.textPrimary }]}>
                      {opt.label}
                    </Text>
                    {userPicked && <Text style={{ fontSize: 8 }}>👤</Text>}
                    {isFinished && isWinner && <Text style={{ fontSize: 10 }}>✅</Text>}
                  </View>
                  <View style={[pr.barBg, { backgroundColor: c.surface }]}>
                    <View style={[pr.barFill, { width: `${Math.max(percentage, 2)}%`, backgroundColor: barColor }]} />
                  </View>
                  <Text style={[pr.barPct, { color: isWinner ? '#10b981' : c.textSecondary }]}>
                    {percentage}%
                  </Text>
                </View>
              );
            })}
          </View>
          <Text style={[pr.voteCount, { color: c.textTertiary }]}>{winnerTotal} votos</Text>
        </View>
      )}

      {/* Goals poll */}
      {goalsTotal > 0 && (
        <View style={[pr.pollBlock, { borderTopColor: c.border }]}>
          <Text style={[pr.pollQuestion, { color: c.textSecondary }]}>¿Más o menos de 2.5 goles?</Text>
          <View style={pr.barsWrap}>
            {goalsOptions.map(opt => {
              const count = counts.goals[opt.key] || 0;
              const percentage = pct(count, goalsTotal);
              const isCorrect = actualGoals === opt.key;
              const userPicked = votes.goals === opt.key;
              const barColor = isCorrect ? '#10b981' : (actualGoals && !isCorrect ? c.textTertiary + '40' : '#f59e0b');

              return (
                <View key={opt.key} style={pr.barRow}>
                  <View style={pr.barLabelWrap}>
                    <Text style={[pr.barLabel, { color: isCorrect ? '#10b981' : c.textPrimary }]}>
                      {opt.label}
                    </Text>
                    {userPicked && <Text style={{ fontSize: 8 }}>👤</Text>}
                    {isFinished && isCorrect && <Text style={{ fontSize: 10 }}>✅</Text>}
                  </View>
                  <View style={[pr.barBg, { backgroundColor: c.surface }]}>
                    <View style={[pr.barFill, { width: `${Math.max(percentage, 2)}%`, backgroundColor: barColor }]} />
                  </View>
                  <Text style={[pr.barPct, { color: isCorrect ? '#10b981' : c.textSecondary }]}>
                    {percentage}%
                  </Text>
                </View>
              );
            })}
          </View>
          <Text style={[pr.voteCount, { color: c.textTertiary }]}>{goalsTotal} votos</Text>
          {isFinished && (
            <Text style={[pr.actualResult, { color: c.textTertiary }]}>
              Resultado: {totalGoals} {totalGoals === 1 ? 'gol' : 'goles'}
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

const pr = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  title: { fontSize: 13, fontWeight: '700' },
  lockBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  lockText: { fontSize: 10, fontWeight: '600' },
  pollBlock: { paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, gap: 8 },
  pollQuestion: { fontSize: 12, fontWeight: '700' },
  barsWrap: { gap: 6 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabelWrap: { width: 42, flexDirection: 'row', alignItems: 'center', gap: 3 },
  barLabel: { fontSize: 13, fontWeight: '700' },
  barBg: { flex: 1, height: 20, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 20, borderRadius: 4 },
  barPct: { width: 36, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  voteCount: { fontSize: 10, fontWeight: '500', textAlign: 'right' },
  actualResult: { fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 2 },
});

// ── AI Predictions (SportMonks) ──────────────────────────────────────────────
const AIPredictionsSection: React.FC<{ predictions: MatchPrediction[]; match: Match }> = ({ predictions, match }) => {
  const c = useThemeColors();
  if (!predictions || predictions.length === 0) return null;

  return (
    <View style={[ai.card, { backgroundColor: c.card, borderColor: c.border }]}>
      {/* Header */}
      <View style={ai.header}>
        <View style={ai.aiBadge}>
          <Text style={{ fontSize: 12 }}>🤖</Text>
        </View>
        <View>
          <Text style={[ai.title, { color: c.textPrimary }]}>Predicción IA</Text>
          <Text style={[ai.subtitle, { color: c.textTertiary }]}>Modelo predictivo de SportMonks</Text>
        </View>
      </View>

      {predictions.map((pred, idx) => {
        // Determine if it's a 3-way (result) or 2-way (yes/no) prediction
        const isThreeWay = pred.homeWin != null || pred.type.includes('Resultado');
        const isYesNo = pred.yes != null && pred.no != null;

        if (isThreeWay && pred.yes != null) {
          // SM returns individual entries for result — show as probability bar
          return null; // Skip individual entries, we combine below
        }

        if (isYesNo) {
          const yesVal = pred.yes ?? 0;
          const noVal = pred.no ?? 0;
          const total = yesVal + noVal || 1;
          const yesPct = Math.round((yesVal / total) * 100);
          const noPct = 100 - yesPct;
          const yesLabel = pred.type.includes('Anotan') ? 'Sí' : 'Más 2.5';
          const noLabel = pred.type.includes('Anotan') ? 'No' : 'Menos 2.5';

          return (
            <View key={idx} style={[ai.predBlock, { borderTopColor: c.border }]}>
              <Text style={[ai.predLabel, { color: c.textSecondary }]}>{pred.type}</Text>
              <View style={ai.dualBarRow}>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={ai.barLabelRow}>
                    <Text style={[ai.barOptionLabel, { color: c.textPrimary }]}>{yesLabel}</Text>
                    <Text style={[ai.barPctText, { color: yesPct >= noPct ? '#10b981' : c.textTertiary }]}>{yesPct}%</Text>
                  </View>
                  <View style={[ai.barTrack, { backgroundColor: c.surface }]}>
                    <View style={[ai.barFill, { width: `${yesPct}%`, backgroundColor: yesPct >= noPct ? '#10b981' : c.textTertiary + '60' }]} />
                  </View>
                </View>
                <View style={ai.barDivider} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={ai.barLabelRow}>
                    <Text style={[ai.barOptionLabel, { color: c.textPrimary }]}>{noLabel}</Text>
                    <Text style={[ai.barPctText, { color: noPct > yesPct ? '#10b981' : c.textTertiary }]}>{noPct}%</Text>
                  </View>
                  <View style={[ai.barTrack, { backgroundColor: c.surface }]}>
                    <View style={[ai.barFill, { width: `${noPct}%`, backgroundColor: noPct > yesPct ? '#10b981' : c.textTertiary + '60' }]} />
                  </View>
                </View>
              </View>
            </View>
          );
        }

        return null;
      })}

      {/* Disclaimer */}
      <View style={[ai.footer, { borderTopColor: c.border }]}>
        <Text style={[ai.disclaimer, { color: c.textTertiary }]}>
          Basado en análisis estadístico. No constituye asesoría de apuestas.
        </Text>
      </View>
    </View>
  );
};

const ai = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  aiBadge: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: 'rgba(99,102,241,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 14, fontWeight: '700' },
  subtitle: { fontSize: 10, fontWeight: '500', marginTop: 1 },
  predBlock: { paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, gap: 8 },
  predLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  dualBarRow: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  barDivider: { width: 12 },
  barLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  barOptionLabel: { fontSize: 12, fontWeight: '600' },
  barPctText: { fontSize: 14, fontWeight: '800' },
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  footer: { paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1 },
  disclaimer: { fontSize: 9, fontWeight: '500', textAlign: 'center' },
});

// ── Momios (odds) section ────────────────────────────────────────────────────
const MomiosSection: React.FC<{ odds: OddsMarket[]; match: Match }> = ({ odds, match }) => {
  const c = useThemeColors();
  if (!odds || odds.length === 0) return null;

  return (
    <View style={[od.card, { backgroundColor: c.card, borderColor: c.border }]}>
      {/* Header */}
      <View style={od.header}>
        <Text style={{ fontSize: 16 }}>📊</Text>
        <Text style={[od.title, { color: c.textPrimary }]}>Momios</Text>
        <View style={{ flex: 1 }} />
        <Text style={[od.subtitle, { color: c.textTertiary }]}>Promedio del mercado</Text>
      </View>

      {odds.slice(0, 4).map((market, mi) => (
        <View key={mi} style={[od.marketBlock, { borderTopColor: c.border }]}>
          <Text style={[od.marketName, { color: c.textTertiary }]}>{market.name.toUpperCase()}</Text>
          <View style={od.optionsRow}>
            {market.options.map((opt, oi) => (
              <View key={oi} style={[od.optionCard, { backgroundColor: c.surface }]}>
                <Text style={[od.optionLabel, { color: c.textTertiary }]}>{opt.label}</Text>
                <Text style={[od.optionValue, { color: c.textPrimary }]}>{opt.value.toFixed(2)}</Text>
                {opt.trend && opt.trend !== 'stable' && (
                  <Text style={[od.trendIcon, { color: opt.trend === 'up' ? '#10b981' : '#ef4444' }]}>
                    {opt.trend === 'up' ? '↗' : '↘'}
                  </Text>
                )}
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
};

const od = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  title: { fontSize: 16, fontWeight: '800' },
  subtitle: { fontSize: 12, fontWeight: '500' },
  marketBlock: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, gap: 10 },
  marketName: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  optionsRow: { flexDirection: 'row', gap: 10 },
  optionCard: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    borderRadius: 10, gap: 4,
  },
  optionLabel: { fontSize: 10, fontWeight: '600' },
  optionValue: { fontSize: 18, fontWeight: '800' },
  trendIcon: { fontSize: 12, fontWeight: '700', marginTop: -2 },
});

// ── H2H section ──────────────────────────────────────────────────────────────
const H2HSection: React.FC<{ h2h: MatchDetail['h2h']; match: Match }> = ({ h2h, match }) => {
  const c = useThemeColors();
  const [showAll, setShowAll] = useState(false);

  if (!h2h.results || h2h.results.length === 0) return null;

  const displayed = showAll ? h2h.results : h2h.results.slice(0, 5);
  let homeWins = 0, awayWins = 0, draws = 0, totalGoals = 0;
  for (const r of h2h.results) {
    if (r.homeScore > r.awayScore) homeWins++;
    else if (r.awayScore > r.homeScore) awayWins++;
    else draws++;
    totalGoals += r.homeScore + r.awayScore;
  }
  const total = h2h.results.length;
  const avgGoals = total > 0 ? (totalGoals / total).toFixed(1) : '0.0';

  // Progress bar ratios
  const barTotal = homeWins + awayWins + draws || 1;

  return (
    <View style={[h2.card, { backgroundColor: c.card, borderColor: c.border }]}>
      {/* Header */}
      <View style={h2.header}>
        <Text style={[h2.title, { color: c.textPrimary }]}>Enfrentamientos directos</Text>
        <Text style={[h2.count, { color: c.textTertiary }]}>Últimos {total}</Text>
      </View>

      {/* Progress bar */}
      <View style={h2.barWrap}>
        <View style={[h2.barSegment, { flex: homeWins, backgroundColor: '#3b82f6', borderTopLeftRadius: 4, borderBottomLeftRadius: 4 }]} />
        <View style={[h2.barSegment, { flex: draws, backgroundColor: '#f59e0b' }]} />
        <View style={[h2.barSegment, { flex: awayWins, backgroundColor: '#ef4444', borderTopRightRadius: 4, borderBottomRightRadius: 4 }]} />
      </View>

      {/* Stats row */}
      <View style={h2.statsRow}>
        <View style={h2.statItem}>
          <Text style={[h2.statVal, { color: '#3b82f6' }]}>{homeWins}</Text>
          <Text style={[h2.statLabel, { color: c.textTertiary }]}>{match.homeTeam.shortName}</Text>
        </View>
        <View style={h2.statItem}>
          <Text style={[h2.statVal, { color: c.textSecondary }]}>{draws}</Text>
          <Text style={[h2.statLabel, { color: c.textTertiary }]}>EMPATES</Text>
        </View>
        <View style={h2.statItem}>
          <Text style={[h2.statVal, { color: '#f97316' }]}>{awayWins}</Text>
          <Text style={[h2.statLabel, { color: c.textTertiary }]}>{match.awayTeam.shortName}</Text>
        </View>
        <View style={[h2.statDivider, { backgroundColor: c.border }]} />
        <View style={h2.statItem}>
          <Text style={[h2.statVal, { color: c.textPrimary }]}>{avgGoals}</Text>
          <Text style={[h2.statLabel, { color: c.textTertiary }]}>PROM. GOLES</Text>
        </View>
      </View>

      {/* Match results */}
      {displayed.map((r, i) => {
        const homeShort = h2h.homeTeam || match.homeTeam.shortName;
        const awayShort = h2h.awayTeam || match.awayTeam.shortName;
        return (
          <View key={i} style={[h2.resultRow, { borderTopColor: c.border }]}>
            <Text style={[h2.date, { color: c.textTertiary }]}>{r.date}</Text>
            <View style={h2.scoreCenter}>
              <Text style={[h2.shortName, { color: c.textPrimary }]}>{homeShort}</Text>
              <Text style={[h2.scoreVal, { color: c.accent }]}>{r.homeScore}</Text>
              <Text style={[h2.scoreSep, { color: c.textTertiary }]}>-</Text>
              <Text style={[h2.scoreVal, { color: c.accent }]}>{r.awayScore}</Text>
              <Text style={[h2.shortName, { color: c.textPrimary }]}>{awayShort}</Text>
            </View>
            <Text style={[h2.comp, { color: c.textTertiary }]} numberOfLines={1}>{r.competition}</Text>
          </View>
        );
      })}

      {h2h.results.length > 5 && (
        <TouchableOpacity onPress={() => setShowAll(!showAll)} style={h2.showMore}>
          <Text style={[h2.showMoreText, { color: c.accent }]}>
            {showAll ? 'Ver menos' : `Ver todos (${h2h.results.length})`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const h2 = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', paddingBottom: 4 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  title: { fontSize: 16, fontWeight: '800' },
  count: { fontSize: 12, fontWeight: '500' },
  barWrap: {
    flexDirection: 'row', height: 8, marginHorizontal: 16, borderRadius: 4,
    overflow: 'hidden', marginBottom: 14,
  },
  barSegment: { height: 8 },
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statVal: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.3 },
  statDivider: { width: 1, height: 28, marginHorizontal: 4 },
  resultRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, gap: 8,
  },
  date: { fontSize: 11, fontWeight: '500', width: 76 },
  scoreCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  shortName: { fontSize: 13, fontWeight: '700' },
  scoreVal: { fontSize: 15, fontWeight: '800' },
  scoreSep: { fontSize: 13, fontWeight: '300' },
  comp: { fontSize: 11, textAlign: 'right', width: 50 },
  showMore: { paddingVertical: 10, alignItems: 'center' },
  showMoreText: { fontSize: 12, fontWeight: '600' },
});

// ── Form section ─────────────────────────────────────────────────────────────
const FormSection: React.FC<{ homeForm?: TeamFormEntry[]; awayForm?: TeamFormEntry[]; match: Match }> = ({ homeForm, awayForm, match }) => {
  const c = useThemeColors();
  if ((!homeForm || homeForm.length === 0) && (!awayForm || awayForm.length === 0)) return null;

  const resultColor = (r: 'W' | 'D' | 'L') =>
    r === 'W' ? '#10b981' : r === 'L' ? '#ef4444' : '#f59e0b';
  const resultLabel = (r: 'W' | 'D' | 'L') =>
    r === 'W' ? 'G' : r === 'L' ? 'P' : 'E';
  const calcPoints = (form: TeamFormEntry[]) =>
    form.slice(0, 5).reduce((sum, f) => sum + (f.result === 'W' ? 3 : f.result === 'D' ? 1 : 0), 0);

  const renderTeamForm = (form: TeamFormEntry[], team: { shortName: string; logo: string }) => (
    <View style={fm.teamRow}>
      <View style={fm.teamInfo}>
        {team.logo.startsWith('http') ? (
          <Image source={{ uri: team.logo }} style={fm.teamLogo} />
        ) : (
          <View style={[fm.teamLogo, { backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ fontSize: 12 }}>⚽</Text>
          </View>
        )}
        <Text style={[fm.teamName, { color: c.textPrimary }]}>{team.shortName}</Text>
      </View>
      <View style={fm.badges}>
        {form.slice(0, 5).map((f, i) => (
          <View key={i} style={[fm.badge, { backgroundColor: resultColor(f.result) }]}>
            <Text style={fm.badgeText}>{resultLabel(f.result)}</Text>
          </View>
        ))}
      </View>
      <Text style={[fm.points, { color: c.textTertiary }]}>{calcPoints(form)}p</Text>
    </View>
  );

  return (
    <View style={[fm.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={fm.header}>
        <Text style={[fm.title, { color: c.textPrimary }]}>Forma reciente</Text>
        <Text style={[fm.subtitle, { color: c.textTertiary }]}>Últimos 5 partidos</Text>
      </View>
      {homeForm && homeForm.length > 0 && renderTeamForm(homeForm, match.homeTeam)}
      {awayForm && awayForm.length > 0 && (
        <View style={{ borderTopWidth: 1, borderTopColor: c.border }}>
          {renderTeamForm(awayForm, match.awayTeam)}
        </View>
      )}
    </View>
  );
};

const fm = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  title: { fontSize: 16, fontWeight: '800' },
  subtitle: { fontSize: 12, fontWeight: '500' },
  teamRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 10,
  },
  teamInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 80 },
  teamLogo: { width: 24, height: 24, borderRadius: 12 },
  teamName: { fontSize: 13, fontWeight: '700' },
  badges: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  badge: {
    width: 30, height: 30, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  points: { fontSize: 13, fontWeight: '600', width: 28, textAlign: 'right' },
});

// ── Match info card ──────────────────────────────────────────────────────────
const MatchInfoCard: React.FC<{ match: Match; detail: MatchDetail }> = ({ match, detail }) => {
  const c = useThemeColors();

  type InfoRow = { icon: string; iconBg: string; label: string; sublabel?: string; rightText?: string };
  const rows: InfoRow[] = [];

  // Venue
  if (detail.venue?.name) {
    rows.push({
      icon: '📍', iconBg: 'rgba(16,185,129,0.15)',
      label: detail.venue.name,
      sublabel: [
        detail.venue.city,
        detail.venue.surface === 'grass' ? 'Césped natural' : detail.venue.surface,
      ].filter(Boolean).join(' · '),
      rightText: [
        detail.venue.capacity > 0 ? `Capacidad: ${detail.venue.capacity.toLocaleString()}` : '',
        detail.venue.attendance ? `Asistencia: ${detail.venue.attendance.toLocaleString()}` : '',
      ].filter(Boolean).join('    '),
    });
  }

  // Referee
  if (detail.referee?.name) {
    rows.push({
      icon: '👤', iconBg: 'rgba(245,158,11,0.15)',
      label: detail.referee.name,
      sublabel: detail.referee.flag ? `${detail.referee.flag} ${detail.referee.nationality}` : detail.referee.nationality,
    });
  }

  // Weather
  if (detail.weather) {
    const w = detail.weather;
    rows.push({
      icon: w.icon || '☀️', iconBg: 'rgba(251,191,36,0.15)',
      label: `${w.temp}°C · ${w.description}`,
      rightText: [
        w.wind > 0 ? `⇆ ${w.wind} km/h` : '',
        w.humidity > 0 ? `💧 ${w.humidity}%` : '',
      ].filter(Boolean).join('    '),
    });
  }

  // Coaches
  if (detail.homeLineup.coach || detail.awayLineup.coach) {
    rows.push({
      icon: '🕐', iconBg: 'rgba(96,165,250,0.15)',
      label: `DT LOCAL`,
      sublabel: detail.homeLineup.coach || 'DT',
      rightText: `DT VISITANTE\n${detail.awayLineup.coach || 'DT'}`,
    });
  }

  if (rows.length === 0) return null;

  // Get round/season info
  const seasonStr = match.seasonId ? `Temporada ${new Date().getFullYear() - 1}/${String(new Date().getFullYear()).slice(2)}` : '';

  return (
    <View style={[mi.card, { backgroundColor: c.card, borderColor: c.border }]}>
      {/* Header */}
      <View style={mi.header}>
        <Text style={{ fontSize: 16 }}>⚡</Text>
        <Text style={[mi.title, { color: c.textPrimary }]}>Información del partido</Text>
        <View style={{ flex: 1 }} />
        <Text style={[mi.round, { color: c.textTertiary }]}>
          {seasonStr ? `Jornada · ${seasonStr}` : 'Jornada'}
        </Text>
      </View>

      {rows.map((row, i) => (
        <View key={i} style={[mi.row, { borderTopColor: c.border }]}>
          <View style={[mi.iconWrap, { backgroundColor: row.iconBg }]}>
            <Text style={mi.icon}>{row.icon}</Text>
          </View>
          <View style={mi.content}>
            <Text style={[mi.label, { color: c.textPrimary }]}>{row.label}</Text>
            {row.sublabel && (
              <Text style={[mi.sublabel, { color: c.textTertiary }]}>{row.sublabel}</Text>
            )}
            {row.rightText && (
              <Text style={[mi.rightText, { color: c.textTertiary }]}>{row.rightText}</Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
};

const mi = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  title: { fontSize: 16, fontWeight: '800' },
  round: { fontSize: 11, fontWeight: '500' },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  icon: { fontSize: 16 },
  content: { flex: 1, gap: 2 },
  label: { fontSize: 15, fontWeight: '700' },
  sublabel: { fontSize: 12, fontWeight: '500' },
  rightText: { fontSize: 11, fontWeight: '500', marginTop: 2 },
});

// ── Pressure Index Area Chart (SportMonks style) ────────────────────────────
//
// Generates minute-by-minute pressure from match events & aggregate stats,
// then renders a dual-area chart showing dominance swings over the match.

const CHART_HEIGHT = 140;
const HOME_COLOR = '#ef4444';   // red for home (SportMonks style)
const AWAY_COLOR = '#10b981';   // green/teal for away

/** Build per-minute pressure array from events + aggregate pressure */
function buildPressureCurve(
  events: MatchEvent[],
  homePressure: number,
  matchMinutes: number,
): number[] {
  const total = Math.max(matchMinutes, 90);
  const points = new Array(total + 1).fill(50); // start neutral

  // Seed from events — goals, shots, corners shift pressure
  const impulses = new Array(total + 1).fill(0);
  for (const ev of events) {
    const min = Math.min(ev.minute, total);
    const isHome = ev.team === 'home';
    if (ev.type === 'goal' || ev.type === 'penalty-goal') {
      impulses[min] += isHome ? 15 : -15;
    } else if (ev.type === 'yellow' || ev.type === 'second-yellow') {
      impulses[min] += isHome ? -5 : 5; // card hurts
    } else if (ev.type === 'red') {
      impulses[min] += isHome ? -12 : 12;
    }
  }

  // Apply impulses with decay
  let momentum = 0;
  for (let i = 0; i <= total; i++) {
    momentum = momentum * 0.92 + impulses[i]; // decay + new impulse
    points[i] = 50 + momentum;
  }

  // Blend toward aggregate pressure
  const bias = homePressure - 50;
  for (let i = 0; i <= total; i++) {
    const t = i / total;
    points[i] = points[i] * 0.6 + (50 + bias * (0.5 + 0.5 * Math.sin(t * Math.PI * 3 + bias * 0.05))) * 0.4;
    // Add subtle organic variation
    points[i] += Math.sin(i * 0.3) * 4 + Math.cos(i * 0.7) * 3;
    points[i] = Math.max(5, Math.min(95, points[i]));
  }

  return points;
}

const PressureSection: React.FC<{
  pressure: PressureIndex;
  match: Match;
  events?: MatchEvent[];
}> = ({ pressure, match, events = [] }) => {
  const c = useThemeColors();
  const matchMinutes = match.minute ?? 90;
  const curve = React.useMemo(
    () => buildPressureCurve(events, pressure.home, matchMinutes),
    [events, pressure.home, matchMinutes],
  );
  const totalMin = curve.length - 1;

  // Chart dimensions
  const chartWidth = SCREEN_WIDTH - 72; // card padding
  const stepX = chartWidth / totalMin;

  return (
    <View style={[pi.card, { backgroundColor: c.card, borderColor: c.border }]}>
      {/* Header */}
      <View style={pi.header}>
        <Text style={pi.icon}>🔥</Text>
        <Text style={[pi.title, { color: c.textTertiary }]}>ÍNDICE DE PRESIÓN</Text>
        <View style={{ flex: 1 }} />
        {/* Legend */}
        <View style={pi.legend}>
          <View style={[pi.legendDot, { backgroundColor: HOME_COLOR }]} />
          <Text style={[pi.legendLabel, { color: c.textTertiary }]}>{match.homeTeam.shortName}</Text>
          <View style={[pi.legendDot, { backgroundColor: AWAY_COLOR, marginLeft: 8 }]} />
          <Text style={[pi.legendLabel, { color: c.textTertiary }]}>{match.awayTeam.shortName}</Text>
        </View>
      </View>

      {/* Chart area */}
      <View style={[pi.chartWrap, { borderTopColor: c.border }]}>
        {/* Y-axis labels */}
        <View style={pi.yAxis}>
          <Text style={[pi.yLabel, { color: c.textTertiary }]}>100</Text>
          <Text style={[pi.yLabel, { color: c.textTertiary }]}>50</Text>
          <Text style={[pi.yLabel, { color: c.textTertiary }]}>0</Text>
        </View>

        {/* Chart */}
        <View style={[pi.chart, { height: CHART_HEIGHT }]}>
          {/* Grid lines */}
          <View style={[pi.gridLine, { top: 0, borderBottomColor: c.border }]} />
          <View style={[pi.gridLine, { top: CHART_HEIGHT / 2, borderBottomColor: c.border }]} />
          <View style={[pi.gridLine, { top: CHART_HEIGHT - 1, borderBottomColor: c.border }]} />
          {/* Half-time marker */}
          <View style={[pi.htLine, { left: (45 / totalMin) * chartWidth, backgroundColor: c.border }]} />

          {/* Area bars — one per minute, from center line */}
          {curve.map((val, i) => {
            const homeVal = val; // % for home (>50 = home dominates)
            const deviationFromCenter = homeVal - 50;
            const barHeight = Math.abs(deviationFromCenter) * (CHART_HEIGHT / 100);
            const isHomeDominant = deviationFromCenter > 0;
            return (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  left: i * stepX,
                  width: Math.max(stepX, 1.5),
                  height: barHeight,
                  top: isHomeDominant ? CHART_HEIGHT / 2 - barHeight : CHART_HEIGHT / 2,
                  backgroundColor: isHomeDominant ? HOME_COLOR : AWAY_COLOR,
                  opacity: 0.35,
                }}
              />
            );
          })}
        </View>
      </View>

      {/* X-axis */}
      <View style={pi.xAxis}>
        <Text style={[pi.xLabel, { color: c.textTertiary }]}>0'</Text>
        <Text style={[pi.xLabel, { color: c.textTertiary }]}>15'</Text>
        <Text style={[pi.xLabel, { color: c.textTertiary }]}>30'</Text>
        <Text style={[pi.xLabel, { color: c.textTertiary }]}>MT</Text>
        <Text style={[pi.xLabel, { color: c.textTertiary }]}>60'</Text>
        <Text style={[pi.xLabel, { color: c.textTertiary }]}>75'</Text>
        <Text style={[pi.xLabel, { color: c.textTertiary }]}>90'</Text>
      </View>

      {/* Summary bar */}
      <View style={[pi.summary, { borderTopColor: c.border }]}>
        <Text style={[pi.summaryValue, { color: HOME_COLOR }]}>{pressure.home}%</Text>
        <View style={pi.summaryBarWrap}>
          <View style={[pi.summaryBarBg, { backgroundColor: c.surface }]}>
            <View style={[pi.summaryBarHome, { width: `${pressure.home}%` }]} />
          </View>
        </View>
        <Text style={[pi.summaryValue, { color: AWAY_COLOR, textAlign: 'right' }]}>{pressure.away}%</Text>
      </View>
    </View>
  );
};

const pi = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  icon: { fontSize: 16 },
  title: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  legend: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 10, fontWeight: '500', marginLeft: 4 },
  chartWrap: { flexDirection: 'row', paddingLeft: 4, paddingRight: 14, borderTopWidth: 1 },
  yAxis: { width: 28, justifyContent: 'space-between', paddingVertical: 2 },
  yLabel: { fontSize: 8, fontWeight: '500', textAlign: 'right', paddingRight: 4 },
  chart: { flex: 1, overflow: 'hidden', position: 'relative' },
  gridLine: { position: 'absolute', left: 0, right: 0, borderBottomWidth: StyleSheet.hairlineWidth },
  htLine: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth },
  xAxis: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 32, paddingVertical: 6,
  },
  xLabel: { fontSize: 8, fontWeight: '500' },
  summary: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 10, borderTopWidth: 1 },
  summaryValue: { fontSize: 15, fontWeight: '800', width: 42 },
  summaryBarWrap: { flex: 1 },
  summaryBarBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  summaryBarHome: { height: 6, backgroundColor: HOME_COLOR, borderRadius: 3 },
});

// ── Injuries section ─────────────────────────────────────────────────────────
const InjuriesSection: React.FC<{ home: MissingPlayer[]; away: MissingPlayer[]; match: Match }> = ({ home, away, match }) => {
  const c = useThemeColors();
  if (home.length === 0 && away.length === 0) return null;

  const reasonIcon = (r: string) =>
    r === 'injury' ? '🏥' : r === 'suspension' ? '🟥' : r === 'international' ? '🌍' : '❓';

  const renderList = (players: MissingPlayer[], teamName: string, color: string) => (
    <View style={injS.teamBlock}>
      <Text style={[injS.teamLabel, { color }]}>{teamName}</Text>
      {players.map((p, i) => (
        <View key={i} style={[injS.playerRow, { borderTopColor: c.border }]}>
          <Text style={injS.reasonIcon}>{reasonIcon(p.reason)}</Text>
          <Text style={[injS.playerName, { color: c.textPrimary }]}>{p.name}</Text>
          <Text style={[injS.detail, { color: c.textTertiary }]}>{p.detail}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <View style={[injS.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={injS.header}>
        <Text style={injS.headerIcon}>🏥</Text>
        <Text style={[injS.title, { color: c.textTertiary }]}>BAJAS Y SANCIONES</Text>
      </View>
      <View style={injS.body}>
        {home.length > 0 && renderList(home, match.homeTeam.shortName, '#3b82f6')}
        {away.length > 0 && renderList(away, match.awayTeam.shortName, '#f97316')}
      </View>
    </View>
  );
};

const injS = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  headerIcon: { fontSize: 16 },
  title: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  body: { paddingHorizontal: 14, paddingBottom: 12, gap: 12 },
  teamBlock: { gap: 4 },
  teamLabel: { fontSize: 12, fontWeight: '800', marginBottom: 2 },
  playerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, gap: 8 },
  reasonIcon: { fontSize: 14, width: 20, textAlign: 'center' },
  playerName: { flex: 1, fontSize: 12, fontWeight: '500' },
  detail: { fontSize: 10 },
});

// ══════════════════════════════════════════════════════════════════════════════
// MAIN TAB COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export const EnVivoTab: React.FC<{ match: Match; detail: MatchDetail }> = ({ match, detail }) => {
  const c = useThemeColors();
  const isScheduled = match.status === 'scheduled';

  // Split events into halves
  const first  = detail.events.filter(e => e.minute <= 45).sort((a, b) => a.minute - b.minute);
  const second = detail.events.filter(e => e.minute > 45).sort((a, b) => a.minute - b.minute);
  const hasEvents = detail.events.length > 0;
  const hasMissing = (detail.missingPlayers?.home?.length ?? 0) > 0 || (detail.missingPlayers?.away?.length ?? 0) > 0;

  return (
    <View style={{ paddingHorizontal: 16, gap: 12 }}>

      {/* ── SCHEDULED: Previa layout ── */}
      {isScheduled && (
        <>
          {/* Predictions carousel (community) */}
          <PredictionsCarousel match={match} />

          {/* AI Predictions (SportMonks) */}
          {detail.predictions && detail.predictions.length > 0 && (
            <AIPredictionsSection predictions={detail.predictions} match={match} />
          )}

          {/* Momios */}
          {detail.odds && detail.odds.length > 0 && (
            <MomiosSection odds={detail.odds} match={match} />
          )}

          {/* H2H */}
          {detail.h2h && detail.h2h.results.length > 0 && (
            <H2HSection h2h={detail.h2h} match={match} />
          )}

          {/* Form */}
          {(detail.homeForm || detail.awayForm) && (
            <FormSection homeForm={detail.homeForm} awayForm={detail.awayForm} match={match} />
          )}

          {/* Injuries */}
          {hasMissing && (
            <InjuriesSection home={detail.missingPlayers!.home} away={detail.missingPlayers!.away} match={match} />
          )}

          {/* Match info */}
          <MatchInfoCard match={match} detail={detail} />
        </>
      )}

      {/* ── LIVE/FINISHED: existing layout ── */}
      {!isScheduled && (
        <>
          {/* Result info */}
          {detail.resultInfo && match.status === 'finished' && (
            <View style={[tl.resultBanner, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={{ fontSize: 16 }}>📋</Text>
              <Text style={[tl.resultText, { color: c.textPrimary }]}>{detail.resultInfo}</Text>
            </View>
          )}

          {/* Quick stats */}
          <QuickStats match={match} detail={detail} />

          {/* Pressure */}
          {detail.pressureIndex && <PressureSection pressure={detail.pressureIndex} match={match} events={detail.events} />}

          {/* Poll results (locked) */}
          <PollResultsSection match={match} />

          {/* Odds */}
          {detail.odds && detail.odds.length > 0 && (
            <MomiosSection odds={detail.odds} match={match} />
          )}

          {/* Events timeline */}
          {hasEvents && (
            <View style={[tl.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={[tl.teamsHeader, { borderBottomColor: c.border }]}>
                <Text style={[tl.teamLabel, { color: '#3b82f6' }]}>{match.homeTeam.shortName}</Text>
                <Text style={[tl.cronLabel, { color: c.textTertiary }]}>Cronología</Text>
                <Text style={[tl.teamLabel, { color: '#f97316', textAlign: 'right' }]}>{match.awayTeam.shortName}</Text>
              </View>
              {first.length > 0 && (
                <>
                  <View style={[tl.halfSep, { backgroundColor: c.surface }]}>
                    <Text style={[tl.halfSepText, { color: c.textTertiary }]}>1er Tiempo</Text>
                  </View>
                  {first.map(e => <EventRow key={e.id} event={e} match={match} />)}
                </>
              )}
              {first.length > 0 && second.length > 0 && (
                <View style={[tl.halfSep, { backgroundColor: c.surface }]}>
                  <Text style={[tl.halfSepText, { color: c.textTertiary }]}>2do Tiempo</Text>
                </View>
              )}
              {second.map(e => <EventRow key={e.id} event={e} match={match} />)}
            </View>
          )}

          {/* H2H */}
          {detail.h2h && detail.h2h.results.length > 0 && (
            <H2HSection h2h={detail.h2h} match={match} />
          )}

          {/* Form */}
          {(detail.homeForm || detail.awayForm) && (
            <FormSection homeForm={detail.homeForm} awayForm={detail.awayForm} match={match} />
          )}

          {/* Injuries */}
          {hasMissing && (
            <InjuriesSection home={detail.missingPlayers!.home} away={detail.missingPlayers!.away} match={match} />
          )}

          {/* Match info */}
          <MatchInfoCard match={match} detail={detail} />
        </>
      )}

      <View style={{ height: 8 }} />
    </View>
  );
};

const tl = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  teamsHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  teamLabel: { flex: 1, fontSize: 12, fontWeight: '800' },
  cronLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  halfSep: { paddingVertical: 7, alignItems: 'center' },
  halfSepText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  resultBanner: { borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  resultText: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 18 },
});
