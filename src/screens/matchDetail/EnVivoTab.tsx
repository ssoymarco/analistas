// ── Previa / En Vivo / Resumen Tab ───────────────────────────────────────────
// Adapts to match status: Previa (scheduled), En Vivo (live), Resumen (finished).
// Scheduled: Predictions carousel, Momios, H2H, Form, Match Info.
// Live/Finished: Quick stats, Events, Pressure, Odds, H2H, Form, Info.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  ScrollView, Dimensions, Modal, Pressable, Animated, Easing,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../theme/useTheme';
import { useDarkMode } from '../../contexts/DarkModeContext';
import { haptics } from '../../utils/haptics';
import { AnimatedPressable } from '../../components/AnimatedPressable';
import { GoalPicker, GOAL_OPTIONS } from '../../components/GoalPicker';
import { getDisplayVenueName, getDisplayVenueCity } from '../../config/worldCupVenues';
import { getLeagueDisplayName } from '../../config/leagues';
import type {
  Match, MatchDetail, MatchEvent, H2HResult, TeamFormEntry,
  OddsMarket, MatchPrediction, MissingPlayer, PressureIndex, MatchStatCategory,
  MatchVenue, MatchReferee, RefereeStats,
} from '../../data/types';
import { isImageUri } from '../../utils/imageUri';
import {
  MATCH_PHASES, maxRegulationMinute,
  runningScoreAt, cumulativeScoreAtMinute,
} from '../../utils/matchPhases';
import { translateNationalTeam } from '../../utils/nationalTeams';
import { BETTING_CONTENT_ENABLED } from '../../config/features';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH   = SCREEN_WIDTH - 72; // prediction card width
const CARD_GAP     = 10;

// ── Traduce condiciones meteorológicas de la API (siempre en inglés) ──────────
function translateWeatherDesc(desc: string, t: (key: string) => string): string {
  const d = desc.toLowerCase().trim();
  const map: Record<string, string> = {
    'clear sky':           t('weather.clearSky'),
    'clear-day':           t('weather.clearDay'),
    'clear-night':         t('weather.clearNight'),
    'few clouds':          t('weather.fewClouds'),
    'partly-cloudy-day':   t('weather.partlyCloudyDay'),
    'partly-cloudy-night': t('weather.partlyCloudyNight'),
    'scattered clouds':    t('weather.scatteredClouds'),
    'broken clouds':       t('weather.brokenClouds'),
    'overcast clouds':     t('weather.overcastClouds'),
    'cloudy':              t('weather.cloudy'),
    'light rain':          t('weather.lightRain'),
    'moderate rain':       t('weather.moderateRain'),
    'heavy rain':          t('weather.heavyRain'),
    'shower rain':         t('weather.showerRain'),
    'rain':                t('weather.rain'),
    'thunderstorm':        t('weather.thunderstorm'),
    'drizzle':             t('weather.drizzle'),
    'snow':                t('weather.snow'),
    'sleet':               t('weather.sleet'),
    'fog':                 t('weather.fog'),
    'mist':                t('weather.mist'),
    'haze':                t('weather.haze'),
    'wind':                t('weather.windy'),
    'smoke':               t('weather.smoke'),
    'dust':                t('weather.dust'),
  };
  return map[d] ?? desc; // fallback: muestra el string original si no hay traducción
}

// ══════════════════════════════════════════════════════════════════════════════
// SHARED SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

function eventEmoji(type: string, injured?: boolean): string {
  switch (type) {
    case 'goal':          return '⚽';
    case 'own-goal':      return '⚽';
    case 'penalty-goal':  return '⚽';
    case 'penalty-miss':  return '❌';
    // Shootout kicks live in their own timeline section. Green check for a
    // scored kick, red cross for a miss — matches the 365scores treatment.
    case 'shootout-goal': return '✅';
    case 'shootout-miss': return '❌';
    case 'yellow':        return '🟨';
    case 'second-yellow': return '🟨🟥';
    case 'red':           return '🟥';
    case 'sub':           return '🔄';
    case 'var':           return '📺';
    case 'delay-start':   return injured ? '🚨' : '⏸️'; // injury vs generic pause
    case 'delay-end':     return '▶️';
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
  centerLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' },
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
// `runningScore` is the cumulative score AT this event, passed in by the
// parent (TimelineBlock) for goal events only. Renders as a bold "2-1" under
// the scorer — the single biggest clarity win, present in every competitor.
const EventRow: React.FC<{
  event: MatchEvent;
  match: Match;
  runningScore?: { home: number; away: number } | null;
}> = ({ event, match, runningScore }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const isHome = event.team === 'home';
  const isGoal = isGoalEvent(event.type);
  const isPenaltyGoal = event.type === 'penalty-goal';
  const isOwnGoal = event.type === 'own-goal';
  const isDelay = event.type === 'delay-start' || event.type === 'delay-end';
  const isShootout = event.type === 'shootout-goal' || event.type === 'shootout-miss';
  // Shootout kicks happen after the 90/120-minute mark, but SM reports them
  // all stamped at the period start (e.g. minute=120). Showing "120'" for
  // ten consecutive kicks reads poorly — instead surface the kick number
  // ("Pen 5") and the running tally is shown separately by the parent.
  const minuteStr = isShootout
    ? (event.shootoutOrder != null ? `${t('timeline.penaltyKick')} ${event.shootoutOrder}` : t('timeline.penaltyKick'))
    : `${event.minute}${event.addedTime ? `+${event.addedTime}` : ''}'`;

  // Delays render as a single centered row — they don't belong to one team.
  if (isDelay) {
    const label =
      event.type === 'delay-end'
        ? 'Reanudación'
        : event.injured && event.player
          ? `Pausa por lesión · ${event.player}`
          : 'Pausa';
    return (
      <View style={[ev.row, { borderBottomColor: c.border }]}>
        <View style={ev.side} />
        <View style={ev.center}>
          <View style={[ev.iconWrap, { backgroundColor: c.surface }]}>
            <Text style={ev.icon}>{eventEmoji(event.type, event.injured)}</Text>
          </View>
          <Text style={[ev.minute, { color: c.textTertiary }]}>{minuteStr}</Text>
        </View>
        <View style={[ev.side, { alignItems: 'flex-start' }]}>
          <Text style={[ev.player, { color: c.textSecondary, flexShrink: 1 }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </View>
    );
  }

  // Subtitle under the player name for NON-sub events: assist (for goals)
  // and/or "(en propia)" for own goals. Subs render their own ▲/▼ block
  // inline below (handled in the JSX).
  const renderSubtitle = (align: 'flex-end' | 'flex-start') => {
    const bits: string[] = [];
    if (isOwnGoal) bits.push(t('timeline.ownGoal'));
    if (isGoal && event.relatedPlayer) bits.push(`${t('timeline.assist')}: ${event.relatedPlayer}`);
    if (bits.length === 0) return null;
    return (
      <Text style={[ev.sub, { color: c.textSecondary, textAlign: align === 'flex-end' ? 'right' : 'left' }]} numberOfLines={2}>
        {bits.join(' · ')}
      </Text>
    );
  };

  // The main name line. For subs we render the in/out arrows in the subtitle,
  // so the name line shows the incoming player. Penalty goals get a small "P"
  // badge after the name.
  const renderName = (align: 'flex-end' | 'flex-start') => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
      {align === 'flex-start' && isPenaltyGoal && <PenaltyBadge />}
      <Text
        style={[ev.player, { color: c.textPrimary }, isGoal && ev.playerGoal]}
        numberOfLines={1}
      >
        {event.player}
      </Text>
      {align === 'flex-end' && isPenaltyGoal && <PenaltyBadge />}
    </View>
  );

  return (
    <View style={[ev.row, { borderBottomColor: c.border }]}>
      <View style={ev.side}>
        {isHome && (
          <View style={ev.infoHome}>
            {renderName('flex-end')}
            {isGoal && runningScore && (
              <Text style={[ev.runScore, { color: c.accent }]}>{runningScore.home}-{runningScore.away}</Text>
            )}
            {event.type !== 'sub' && renderSubtitle('flex-end')}
            {event.type === 'sub' && (
              <Text style={[ev.sub, { color: c.textSecondary, textAlign: 'right' }]} numberOfLines={2}>
                <Text style={{ color: '#22c55e' }}>▲ </Text>{event.player}{'\n'}
                <Text style={{ color: '#ef4444' }}>▼ </Text>{event.relatedPlayer}
              </Text>
            )}
          </View>
        )}
      </View>
      <View style={ev.center}>
        <View style={[ev.iconWrap, { backgroundColor: c.surface }]}>
          <Text style={ev.icon}>{eventEmoji(event.type, event.injured)}</Text>
        </View>
        <Text style={[ev.minute, { color: c.textTertiary }]}>{minuteStr}</Text>
      </View>
      <View style={ev.side}>
        {!isHome && (
          <View style={ev.infoAway}>
            {renderName('flex-start')}
            {isGoal && runningScore && (
              <Text style={[ev.runScore, { color: c.accent }]}>{runningScore.home}-{runningScore.away}</Text>
            )}
            {event.type !== 'sub' && renderSubtitle('flex-start')}
            {event.type === 'sub' && (
              <Text style={[ev.sub, { color: c.textSecondary, textAlign: 'left' }]} numberOfLines={2}>
                <Text style={{ color: '#22c55e' }}>▲ </Text>{event.player}{'\n'}
                <Text style={{ color: '#ef4444' }}>▼ </Text>{event.relatedPlayer}
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
};

// Small "P" badge appended to penalty goals — language-agnostic (P reads as
// Penal/Penalty/Pênalti/etc. across our locales) and visually distinct.
const PenaltyBadge: React.FC = () => {
  const c = useThemeColors();
  return (
    <View style={ev.penBadge}>
      <Text style={[ev.penBadgeText, { color: c.textSecondary }]}>P</Text>
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
  sub: { fontSize: 11, marginTop: 1, lineHeight: 15 },
  runScore: { fontSize: 13, fontWeight: '900', marginTop: 1, letterSpacing: -0.3 },
  center: { alignItems: 'center', gap: 3, width: 54 },
  iconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 15 },
  minute: { fontSize: 10, fontWeight: '700' },
  penBadge: {
    borderWidth: 1, borderColor: 'rgba(127,127,127,0.5)', borderRadius: 4,
    paddingHorizontal: 3, paddingVertical: 0,
  },
  penBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
});

// ══════════════════════════════════════════════════════════════════════════════
// PREVIA-SPECIFIC SECTIONS (scheduled matches)
// ══════════════════════════════════════════════════════════════════════════════

// ── Vote storage helpers ─────────────────────────────────────────────────────
const VOTE_STORAGE_PREFIX = '@prediction_votes_';
const VOTE_COUNTS_PREFIX  = '@prediction_counts_';

type PollKey = 'winner' | 'goals' | 'corners' | 'bothScore' | 'redCard' | 'firstScorer';
const ALL_POLL_KEYS: PollKey[] = ['winner', 'goals', 'corners', 'bothScore', 'redCard', 'firstScorer'];
const TOTAL_POLLS = ALL_POLL_KEYS.length;

interface VoteState {
  winner?: string;       // '1' | 'X' | '2'
  goals?: string;        // '0'..'5' | '6+'
  corners?: string;      // '+8.5' | '-8.5'
  bothScore?: string;    // 'si' | 'no'
  redCard?: string;      // 'si' | 'no'
  firstScorer?: string;  // 'home' | 'away'
}
interface VoteCounts {
  winner: Record<string, number>;
  goals: Record<string, number>;
  corners: Record<string, number>;
  bothScore: Record<string, number>;
  redCard: Record<string, number>;
  firstScorer: Record<string, number>;
}

function defaultCounts(): VoteCounts {
  return {
    winner: { '1': 0, 'X': 0, '2': 0 },
    goals: Object.fromEntries(GOAL_OPTIONS.map(k => [k, 0])),
    corners: { '+8.5': 0, '-8.5': 0 },
    bothScore: { si: 0, no: 0 },
    redCard: { si: 0, no: 0 },
    firstScorer: { home: 0, away: 0 },
  };
}

async function loadVotes(matchId: string): Promise<{ votes: VoteState; counts: VoteCounts }> {
  try {
    const [vRaw, cRaw] = await Promise.all([
      AsyncStorage.getItem(VOTE_STORAGE_PREFIX + matchId),
      AsyncStorage.getItem(VOTE_COUNTS_PREFIX + matchId),
    ]);
    const votes: VoteState = vRaw ? JSON.parse(vRaw) : {};
    const defaults = defaultCounts();
    const stored: Partial<VoteCounts> = cRaw ? JSON.parse(cRaw) : {};
    // Merge: keep stored data, fill missing polls with defaults
    const counts: VoteCounts = {
      winner: { ...defaults.winner, ...stored.winner },
      goals: { ...defaults.goals, ...stored.goals },
      corners: { ...defaults.corners, ...stored.corners },
      bothScore: { ...defaults.bothScore, ...stored.bothScore },
      redCard: { ...defaults.redCard, ...stored.redCard },
      firstScorer: { ...defaults.firstScorer, ...stored.firstScorer },
    };
    return { votes, counts };
  } catch {
    return { votes: {}, counts: defaultCounts() };
  }
}

async function saveVote(
  matchId: string,
  poll: PollKey,
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

// ── Predictions carousel (6 interactive polls) ─────────────────────────────
export const PredictionsCarousel: React.FC<{ match: Match }> = ({ match }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const [activeDot, setActiveDot] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  // ── Vote state ──
  const [votes, setVotes] = useState<VoteState>({});
  const [counts, setCounts] = useState<VoteCounts>(defaultCounts);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadVotes(match.id).then(({ votes: v, counts: ct }) => {
      setVotes(v);
      setCounts(ct);
      setLoaded(true);
    });
  }, [match.id]);

  const handleVote = useCallback(async (poll: PollKey, option: string) => {
    if (votes[poll]) return;
    haptics.medium();
    const { votes: nv, counts: nc } = await saveVote(match.id, poll, option, votes, counts);
    setVotes(nv);
    setCounts(nc);
  }, [match.id, votes, counts]);

  const handleCarouselScroll = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / (CARD_WIDTH + CARD_GAP));
    if (idx !== activeDot) setActiveDot(idx);
  };

  const answeredCount = ALL_POLL_KEYS.filter(k => votes[k] != null).length;

  // Helper: get percentage
  const pct = (n: number, total: number) => total > 0 ? Math.round((n / total) * 100) : 0;

  // Helper: render a binary option button (compact, full-width)
  // NOTE: Uses plain TouchableOpacity instead of AnimatedPressable because
  // Animated.View with flex:1 + transform inside a flex-row has a known iOS
  // rendering bug where content becomes invisible (height collapses to 0).
  const BinaryBtn = ({ pollKey, optKey, label, sub }: {
    pollKey: PollKey; optKey: string; label: string; sub: string;
  }) => {
    const voted = votes[pollKey] != null;
    const isSelected = votes[pollKey] === optKey;
    const total = Object.values(counts[pollKey]).reduce((a, b) => a + b, 0);
    const percentage = pct(counts[pollKey][optKey] || 0, total);

    return (
      <TouchableOpacity
        style={[
          pc.optBtn,
          { borderColor: isSelected ? c.accent : c.border, backgroundColor: isSelected ? c.accent + '12' : c.surface },
        ]}
        activeOpacity={0.7}
        onPress={() => handleVote(pollKey, optKey)}
        disabled={voted}
      >
        <Text style={[pc.optLabel, { color: isSelected ? c.accent : c.textPrimary }]}>{label}</Text>
        <Text style={[pc.optSub, { color: isSelected ? c.accent : c.textTertiary }]}>{sub}</Text>
        {voted && (
          <Text style={[pc.optPct, { color: isSelected ? c.accent : c.textTertiary }]}>{percentage}%</Text>
        )}
      </TouchableOpacity>
    );
  };

  // Helper: total votes for a poll
  const pollTotal = (key: PollKey) => Object.values(counts[key]).reduce((a, b) => a + b, 0);

  // Helper: vote count text
  const VoteCountText = ({ pollKey }: { pollKey: PollKey }) => {
    const total = pollTotal(pollKey);
    if (!votes[pollKey] || total === 0) return null;
    return <Text style={[pc.totalVotes, { color: c.textTertiary }]}>{t('predictions.vote', { count: total })}</Text>;
  };

  const cards = [
    // ── Card 1: ¿Quién ganará? ──────────────────────────────────────────────
    <View key="winner" style={[pc.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[pc.question, { color: c.textPrimary }]}>{t('predictions.whoWillWin')}</Text>
      <View style={pc.optionsRow}>
        {[
          { key: '1', label: '1', sub: match.homeTeam.shortName },
          { key: 'X', label: 'X', sub: t('predictions.draw') },
          { key: '2', label: '2', sub: match.awayTeam.shortName },
        ].map(opt => {
          const voted = votes.winner != null;
          const isSelected = votes.winner === opt.key;
          const total = pollTotal('winner');
          const percentage = pct(counts.winner[opt.key] || 0, total);
          return (
            <TouchableOpacity
              key={opt.key}
              style={[
                pc.optBtn,
                { borderColor: isSelected ? c.accent : c.border, backgroundColor: isSelected ? c.accent + '12' : c.surface },
              ]}
              activeOpacity={0.7}
              onPress={() => handleVote('winner', opt.key)}
              disabled={voted}
            >
              <Text style={[pc.optLabel, { color: isSelected ? c.accent : c.textPrimary }]}>{opt.label}</Text>
              <Text style={[pc.optSub, { color: isSelected ? c.accent : c.textTertiary }]}>{opt.sub}</Text>
              {voted && (
                <Text style={[pc.optPct, { color: isSelected ? c.accent : c.textTertiary }]}>{percentage}%</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      <VoteCountText pollKey="winner" />
    </View>,

    // ── Card 2: ¿Cuántos goles? ─────────────────────────────────────────────
    <View key="goals" style={[pc.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[pc.question, { color: c.textPrimary }]}>{t('predictions.howManyGoals')}</Text>
      <GoalPicker
        selected={votes.goals}
        onSelect={(val) => handleVote('goals', val)}
        counts={counts.goals}
        cardWidth={CARD_WIDTH}
      />
    </View>,

    // ── Card 3: Corners ─────────────────────────────────────────────────────
    <View key="corners" style={[pc.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[pc.question, { color: c.textPrimary }]}>{t('predictions.cornersQuestion')}</Text>
      <View style={pc.optionsRow}>
        <BinaryBtn pollKey="corners" optKey="+8.5" label="+8.5" sub={t('predictions.moreCorners')} />
        <BinaryBtn pollKey="corners" optKey="-8.5" label="-8.5" sub={t('predictions.lessCorners')} />
      </View>
      <VoteCountText pollKey="corners" />
    </View>,

    // ── Card 4: Ambos anotan ────────────────────────────────────────────────
    <View key="btts" style={[pc.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[pc.question, { color: c.textPrimary }]}>{t('predictions.bothScore')}</Text>
      <View style={pc.optionsRow}>
        <BinaryBtn pollKey="bothScore" optKey="si" label={t('predictions.yes')} sub={t('predictions.bothScoreYes')} />
        <BinaryBtn pollKey="bothScore" optKey="no" label={t('predictions.no')} sub={t('predictions.bothScoreNo')} />
      </View>
      <VoteCountText pollKey="bothScore" />
    </View>,

    // ── Card 5: Tarjeta roja ────────────────────────────────────────────────
    <View key="red" style={[pc.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[pc.question, { color: c.textPrimary }]}>{t('predictions.redCard')}</Text>
      <View style={pc.optionsRow}>
        <BinaryBtn pollKey="redCard" optKey="si" label={t('predictions.yes')} sub={t('predictions.redCardYes')} />
        <BinaryBtn pollKey="redCard" optKey="no" label={t('predictions.no')} sub={t('predictions.redCardNo')} />
      </View>
      <VoteCountText pollKey="redCard" />
    </View>,

    // ── Card 6: Primer gol ──────────────────────────────────────────────────
    <View key="first" style={[pc.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[pc.question, { color: c.textPrimary }]}>{t('predictions.firstScorer')}</Text>
      <View style={pc.optionsRow}>
        <BinaryBtn pollKey="firstScorer" optKey="home" label={match.homeTeam.shortName} sub={t('predictions.home')} />
        <BinaryBtn pollKey="firstScorer" optKey="away" label={match.awayTeam.shortName} sub={t('predictions.away')} />
      </View>
      <VoteCountText pollKey="firstScorer" />
    </View>,
  ];

  return (
    <View style={pc.outer}>
      {/* Header */}
      <View style={pc.headerRow}>
        <View style={[pc.headerBar, { backgroundColor: c.accent }]} />
        <Text style={[pc.headerTitle, { color: c.textPrimary }]}>{t('predictions.title')}</Text>
        <Text style={[pc.headerLeague, { color: c.textTertiary }]}>  · {getLeagueDisplayName(match.leagueId, match.league)}</Text>
        <View style={{ flex: 1 }} />
        <View style={pc.dots}>
          {cards.map((_, i) => (
            <View key={i} style={[
              pc.dot,
              { backgroundColor: i === activeDot ? c.accent : c.textTertiary },
              i === activeDot && pc.dotActive,
            ]} />
          ))}
        </View>
        <Text style={[pc.counter, { color: c.textTertiary }]}>{answeredCount}/{TOTAL_POLLS}</Text>
      </View>
      <Text style={[pc.hintText, { color: c.textTertiary }]}>{t('predictions.swipeForMore')}</Text>

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
  const isUrl = isImageUri(logo);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {isUrl ? (
        <Image source={{ uri: logo }} style={{ width: 20, height: 20, borderRadius: 3 }} />
      ) : (
        <View style={{ width: 20, height: 20, borderRadius: 3, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 8, color: '#fff', fontWeight: '800' }}>{name.slice(0, 1)}</Text>
        </View>
      )}
      <Text style={{ fontSize: 13, fontWeight: '700', color: c.textPrimary }}>{name}</Text>
    </View>
  );
}

const pc = StyleSheet.create({
  outer: { gap: 6 },
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
  // ── Card shell (fixed height for uniformity) ──
  card: {
    borderRadius: 16, borderWidth: 1, paddingHorizontal: 16,
    paddingTop: 16, paddingBottom: 16, gap: 10,
    height: 170,
    justifyContent: 'center' as const,
  },
  question: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  // ── Options row ──
  optionsRow: { flexDirection: 'row', gap: 8 },
  // ── Option buttons ──
  optBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 3,
  },
  optLabel: { fontSize: 22, fontWeight: '900' },
  optSub: { fontSize: 10, fontWeight: '600' },
  optPct: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  // ── Vote count ──
  totalVotes: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
});

// ── Poll Results (live/finished) — shows locked voting results ───────────────
const PollResultsSection: React.FC<{ match: Match }> = ({ match }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const [votes, setVotes] = useState<VoteState>({});
  const [counts, setCounts] = useState<VoteCounts>(defaultCounts);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadVotes(match.id).then(({ votes: v, counts: ct }) => {
      setVotes(v);
      setCounts(ct);
      setLoaded(true);
    });
  }, [match.id]);

  const pct = (n: number, total: number) => total > 0 ? Math.round((n / total) * 100) : 0;

  const isFinished = match.status === 'finished';
  const totalGoals = match.homeScore + match.awayScore;

  // Define all 6 polls with their options and actual result logic
  const pollConfigs: Array<{
    key: PollKey;
    question: string;
    options: Array<{ key: string; label: string }>;
    barColor: string;
    actual: string | null;
    resultText?: string;
  }> = [
    {
      key: 'winner',
      question: t('predictions.whoWins'),
      options: [
        { key: '1', label: match.homeTeam.shortName },
        { key: 'X', label: t('predictions.draw') },
        { key: '2', label: match.awayTeam.shortName },
      ],
      barColor: '#3b82f6',
      actual: isFinished
        ? (match.homeScore > match.awayScore ? '1' : match.homeScore < match.awayScore ? '2' : 'X')
        : null,
    },
    {
      key: 'goals',
      question: t('predictions.howManyGoalsShort'),
      options: GOAL_OPTIONS.map(k => ({
        key: k,
        label: k === '6+' ? '6+' : t('predictions.goalLabel', { count: Number(k) }),
      })),
      barColor: '#f59e0b',
      actual: isFinished ? (totalGoals >= 6 ? '6+' : String(totalGoals)) : null,
      resultText: isFinished ? t('predictions.goalResult', { count: totalGoals }) : undefined,
    },
    {
      key: 'corners',
      question: t('predictions.cornersShort'),
      options: [{ key: '+8.5', label: '+8.5' }, { key: '-8.5', label: '-8.5' }],
      barColor: '#8b5cf6',
      actual: null, // corners stat not available in Match type
    },
    {
      key: 'bothScore',
      question: t('predictions.bothScoreResult'),
      options: [{ key: 'si', label: t('predictions.yes') }, { key: 'no', label: t('predictions.no') }],
      barColor: '#06b6d4',
      actual: isFinished ? (match.homeScore > 0 && match.awayScore > 0 ? 'si' : 'no') : null,
    },
    {
      key: 'redCard',
      question: t('predictions.redCardResult'),
      options: [{ key: 'si', label: t('predictions.yes') }, { key: 'no', label: t('predictions.no') }],
      barColor: '#ef4444',
      actual: null, // would need match events data
    },
    {
      key: 'firstScorer',
      question: t('predictions.firstScorerResult'),
      options: [
        { key: 'home', label: match.homeTeam.shortName },
        { key: 'away', label: match.awayTeam.shortName },
      ],
      barColor: '#f97316',
      actual: null, // would need match events data
    },
  ];

  // Only show polls that have votes
  const activePolls = pollConfigs.filter(p => {
    const total = Object.values(counts[p.key]).reduce((a, b) => a + b, 0);
    return total > 0;
  });

  if (!loaded || activePolls.length === 0) return null;

  return (
    <View style={[pr.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={pr.header}>
        <Text style={[pr.title, { color: c.textTertiary }]}>{t('predictions.communityPredictions')}</Text>
        <View style={{ flex: 1 }} />
        <View style={[pr.lockBadge, { backgroundColor: c.surface }]}>
          <Text style={{ fontSize: 10 }}>🔒</Text>
          <Text style={[pr.lockText, { color: c.textTertiary }]}>
            {isFinished ? t('predictions.finished') : t('predictions.inPlay')}
          </Text>
        </View>
      </View>

      {activePolls.map(poll => {
        const total = Object.values(counts[poll.key]).reduce((a, b) => a + b, 0);
        return (
          <View key={poll.key} style={[pr.pollBlock, { borderTopColor: c.border }]}>
            <Text style={[pr.pollQuestion, { color: c.textSecondary }]}>{poll.question}</Text>
            <View style={pr.barsWrap}>
              {poll.options.map(opt => {
                const count = counts[poll.key][opt.key] || 0;
                const percentage = pct(count, total);
                const isCorrect = poll.actual === opt.key;
                const userPicked = votes[poll.key] === opt.key;
                const barColor = isCorrect ? '#10b981' : (poll.actual && !isCorrect ? c.textTertiary + '40' : poll.barColor);

                return (
                  <View key={opt.key} style={pr.barRow}>
                    <View style={pr.barLabelWrap}>
                      <Text style={[pr.barLabel, { color: isCorrect ? '#10b981' : c.textPrimary }]} numberOfLines={1}>
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
            <Text style={[pr.voteCount, { color: c.textTertiary }]}>{t('predictions.vote', { count: total })}</Text>
            {poll.resultText && (
              <Text style={[pr.actualResult, { color: c.textTertiary }]}>{poll.resultText}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
};

const pr = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  title: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' },
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

// ── AI Predictions ────────────────────────────────────────────────────────────
export const AIPredictionsSection: React.FC<{ predictions: MatchPrediction[]; match: Match }> = ({ predictions, match }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  if (!predictions || predictions.length === 0) return null;

  return (
    <View style={[ai.card, { backgroundColor: c.card, borderColor: c.border }]}>
      {/* Header */}
      <View style={ai.header}>
        <View style={ai.aiBadge}>
          <Text style={{ fontSize: 12 }}>🤖</Text>
        </View>
        <View>
          <Text style={[ai.title, { color: c.textTertiary }]}>{t('lineup.predictionTitle')}</Text>
          <Text style={[ai.subtitle, { color: c.textTertiary }]}>{t('lineup.predictionSubtitle')}</Text>
        </View>
      </View>

      {predictions.map((pred, idx) => {
        // 3-way prediction (Resultado Final, Doble Oportunidad)
        const isThreeWay = pred.homeWin != null && pred.draw != null && pred.awayWin != null;
        const isYesNo = pred.yes != null && pred.no != null && !isThreeWay;

        if (isThreeWay) {
          const homeLabel = pred.type.includes('Doble') ? '1X' : match.homeTeam.shortName;
          const drawLabel = pred.type.includes('Doble') ? 'X2' : 'Empate';
          const awayLabel = pred.type.includes('Doble') ? '12' : match.awayTeam.shortName;
          return (
            <View key={idx} style={[ai.predBlock, { borderTopColor: c.border }]}>
              <Text style={[ai.predLabel, { color: c.textSecondary }]}>{pred.type}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                {[
                  { label: homeLabel, pct: pred.homeWin! },
                  { label: drawLabel, pct: pred.draw! },
                  { label: awayLabel, pct: pred.awayWin! },
                ].map((opt, i) => {
                  const best = Math.max(pred.homeWin!, pred.draw!, pred.awayWin!);
                  const isBest = opt.pct === best;
                  return (
                    <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4, backgroundColor: isBest ? 'rgba(16,185,129,0.1)' : c.surface, borderRadius: 10, paddingVertical: 10 }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: c.textSecondary }}>{opt.label}</Text>
                      <Text style={{ fontSize: 18, fontWeight: '900', color: isBest ? '#10b981' : c.textPrimary }}>{Math.round(opt.pct)}%</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          );
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
          {t('predictions.disclaimer')}
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
  title: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' },
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
        <Text style={[od.title, { color: c.textTertiary }]}>Momios</Text>
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
    paddingHorizontal: 16, paddingVertical: 12,
  },
  title: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' },
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
        <Text style={[h2.title, { color: c.textTertiary }]}>Enfrentamientos directos</Text>
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
    paddingHorizontal: 16, paddingVertical: 12,
  },
  title: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' },
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
  const { t } = useTranslation();
  if ((!homeForm || homeForm.length === 0) && (!awayForm || awayForm.length === 0)) return null;

  const resultColor = (r: 'W' | 'D' | 'L') =>
    r === 'W' ? '#10b981' : r === 'L' ? '#ef4444' : '#f59e0b';
  const resultLabel = (r: 'W' | 'D' | 'L') =>
    r === 'W' ? t('preview.formWin') : r === 'L' ? t('preview.formLoss') : t('preview.formDraw');
  const calcPoints = (form: TeamFormEntry[]) =>
    form.slice(0, 5).reduce((sum, f) => sum + (f.result === 'W' ? 3 : f.result === 'D' ? 1 : 0), 0);

  const renderTeamForm = (form: TeamFormEntry[], team: { shortName: string; logo: string }) => (
    <View style={fm.teamRow}>
      <View style={fm.teamInfo}>
        {isImageUri(team.logo) ? (
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
      <Text style={[fm.points, { color: c.textTertiary }]}>{t('preview.formPoints', { pts: calcPoints(form) })}</Text>
    </View>
  );

  return (
    <View style={[fm.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={fm.header}>
        <Text style={[fm.title, { color: c.textTertiary }]}>{t('preview.form')}</Text>
        <Text style={[fm.subtitle, { color: c.textTertiary }]}>{t('preview.formLast5')}</Text>
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
    paddingHorizontal: 16, paddingVertical: 12,
  },
  title: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' },
  subtitle: { fontSize: 12, fontWeight: '500' },
  teamRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 10,
  },
  teamInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 80 },
  teamLogo: { width: 24, height: 24, borderRadius: 3 },
  teamName: { fontSize: 13, fontWeight: '700' },
  badges: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  badge: {
    width: 30, height: 30, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  points: { fontSize: 13, fontWeight: '600', width: 28, textAlign: 'right' },
});

// ── Venue Detail Modal ───────────────────────────────────────────────────────
const VenueDetailModal: React.FC<{
  venue: MatchVenue | null;
  /** Used to apply the FIFA "clean venue" override for World Cup 2026 fixtures */
  leagueId?: number;
  visible: boolean;
  onClose: () => void;
}> = ({ venue, leagueId, visible, onClose }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const { isDark } = useDarkMode();
  if (!venue) return null;
  // Apply FIFA override (no-op outside the World Cup)
  const displayName = getDisplayVenueName(venue.id, leagueId, venue.name) ?? venue.name;
  const displayCity = getDisplayVenueCity(venue.id, leagueId, venue.city) ?? venue.city;
  const showCity = !!displayCity
    && !displayName.toLowerCase().includes(displayCity.toLowerCase());
  const sheetBg = isDark ? '#1c1c1e' : '#f2f2f7';
  const overlayBg = isDark ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.55)';

  const surfaceLabel = () => {
    const s = (venue.surface ?? '').toLowerCase();
    if (s.includes('artif')) return t('matchInfo.surfaceArtificial');
    if (s.includes('hybrid')) return t('matchInfo.surfaceHybrid');
    return t('matchInfo.surfaceGrass');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[vdm.overlay, { backgroundColor: overlayBg }]} onPress={onClose} />
      <View style={[vdm.sheet, { backgroundColor: sheetBg }]}>
        <View style={[vdm.handle, { backgroundColor: c.border }]} />

        {/* Venue image */}
        {!!venue.image && isImageUri(venue.image) && (
          <Image source={{ uri: venue.image }} style={vdm.heroImage} resizeMode="cover" />
        )}

        {/* Icon + name row */}
        <View style={vdm.heroRow}>
          <Text style={{ fontSize: 36 }}>🏟️</Text>
          <View style={vdm.heroInfo}>
            <Text style={[vdm.venueName, { color: c.textPrimary }]} numberOfLines={2}>
              {displayName}
            </Text>
            {showCity && (
              <Text style={[vdm.venueCity, { color: c.textSecondary }]}>📍 {displayCity}</Text>
            )}
          </View>
        </View>

        <View style={[vdm.divider, { backgroundColor: c.border }]} />
        <Text style={[vdm.sectionTitle, { color: c.textTertiary }]}>
          {t('matchInfo.venueDetail').toUpperCase()}
        </Text>

        <View style={[vdm.infoCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={vdm.infoRow}>
            <Text style={[vdm.infoLabel, { color: c.textTertiary }]}>{t('matchInfo.capacity')}</Text>
            <Text style={[vdm.infoValue, { color: c.textPrimary }]}>
              {venue.capacity > 0 ? venue.capacity.toLocaleString() : '—'}
            </Text>
          </View>
          <View style={[vdm.infoRow, { borderTopWidth: 1, borderTopColor: c.border }]}>
            <Text style={[vdm.infoLabel, { color: c.textTertiary }]}>{t('matchInfo.surface')}</Text>
            <Text style={[vdm.infoValue, { color: c.textPrimary }]}>{surfaceLabel()}</Text>
          </View>
          {!!venue.attendance && (
            <View style={[vdm.infoRow, { borderTopWidth: 1, borderTopColor: c.border }]}>
              <Text style={[vdm.infoLabel, { color: c.textTertiary }]}>Asistencia</Text>
              <Text style={[vdm.infoValue, { color: c.textPrimary }]}>
                {venue.attendance.toLocaleString()}
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[vdm.closeBtn, { backgroundColor: c.surface, borderColor: c.border }]}
          onPress={onClose}
          activeOpacity={0.7}
        >
          <Text style={[vdm.closeBtnText, { color: c.textPrimary }]}>{t('common.close')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const vdm = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  heroImage: { width: '100%', height: 160, borderRadius: 16, marginBottom: 16 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  heroInfo: { flex: 1, gap: 4 },
  venueName: { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  venueCity: { fontSize: 14, fontWeight: '500' },
  divider: { height: 1, marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10 },
  infoCard: { borderRadius: 14, borderWidth: 1, marginBottom: 20, overflow: 'hidden' },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  infoLabel: { fontSize: 14, fontWeight: '500' },
  infoValue: { fontSize: 14, fontWeight: '700', textAlign: 'right', flex: 1, marginLeft: 16 },
  closeBtn: { borderRadius: 14, borderWidth: 1, paddingVertical: 14, alignItems: 'center' },
  closeBtnText: { fontSize: 15, fontWeight: '700' },
});

// ── Referee Detail Modal ──────────────────────────────────────────────────────
const RefereeDetailModal: React.FC<{
  referee: MatchReferee | null;
  stats: RefereeStats | undefined;
  visible: boolean;
  onClose: () => void;
}> = ({ referee, stats, visible, onClose }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const { isDark } = useDarkMode();
  if (!referee) return null;
  const sheetBg = isDark ? '#1c1c1e' : '#f2f2f7';
  const overlayBg = isDark ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.55)';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[rdm.overlay, { backgroundColor: overlayBg }]} onPress={onClose} />
      <View style={[rdm.sheet, { backgroundColor: sheetBg }]}>
        <View style={[rdm.handle, { backgroundColor: c.border }]} />

        {/* Photo + name */}
        <View style={rdm.heroRow}>
          <View style={[rdm.photoWrap, { borderColor: '#f59e0b60', backgroundColor: c.surface }]}>
            {referee.imageUrl && isImageUri(referee.imageUrl) ? (
              <Image source={{ uri: referee.imageUrl }} style={rdm.photo} resizeMode="cover" />
            ) : (
              <Text style={{ fontSize: 40 }}>👤</Text>
            )}
          </View>
          <View style={rdm.heroInfo}>
            <Text style={[rdm.refName, { color: c.textPrimary }]} numberOfLines={2}>
              {referee.name}
            </Text>
            {!!referee.nationality && (
              <Text style={[rdm.refNat, { color: c.textSecondary }]}>
                {referee.flag ? `${referee.flag} ` : ''}{referee.nationality}
              </Text>
            )}
          </View>
        </View>

        <View style={[rdm.divider, { backgroundColor: c.border }]} />
        <Text style={[rdm.sectionTitle, { color: c.textTertiary }]}>
          {t('matchInfo.refereeDetail').toUpperCase()}
        </Text>

        {stats ? (
          <View style={rdm.statsGrid}>
            <View style={[rdm.statCell, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[rdm.statValue, { color: c.textPrimary }]}>{stats.totalMatches}</Text>
              <Text style={[rdm.statLabel, { color: c.textTertiary }]}>{t('matchInfo.totalMatches')}</Text>
            </View>
            <View style={[rdm.statCell, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[rdm.statValue, { color: '#facc15' }]}>{stats.yellowCardsPerMatch.toFixed(1)}</Text>
              <Text style={[rdm.statLabel, { color: c.textTertiary }]}>{t('matchInfo.yellowCardsPerMatch')}</Text>
            </View>
            <View style={[rdm.statCell, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[rdm.statValue, { color: '#ef4444' }]}>{stats.redCardsPerMatch.toFixed(1)}</Text>
              <Text style={[rdm.statLabel, { color: c.textTertiary }]}>{t('matchInfo.redCardsPerMatch')}</Text>
            </View>
            <View style={[rdm.statCell, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[rdm.statValue, { color: c.textPrimary }]}>{stats.foulsPerMatch.toFixed(1)}</Text>
              <Text style={[rdm.statLabel, { color: c.textTertiary }]}>{t('matchInfo.foulsPerMatch')}</Text>
            </View>
          </View>
        ) : (
          <View style={[rdm.infoCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={rdm.infoRow}>
              <Text style={[rdm.infoLabel, { color: c.textTertiary }]}>{t('matchInfo.nationality')}</Text>
              <Text style={[rdm.infoValue, { color: c.textPrimary }]}>
                {referee.flag ? `${referee.flag} ` : ''}{referee.nationality || '—'}
              </Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[rdm.closeBtn, { backgroundColor: c.surface, borderColor: c.border }]}
          onPress={onClose}
          activeOpacity={0.7}
        >
          <Text style={[rdm.closeBtnText, { color: c.textPrimary }]}>{t('common.close')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const rdm = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  photoWrap: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 2, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  photo: { width: 80, height: 80 },
  heroInfo: { flex: 1, gap: 4 },
  refName: { fontSize: 20, fontWeight: '800', lineHeight: 24 },
  refNat: { fontSize: 14, fontWeight: '500' },
  divider: { height: 1, marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCell: {
    width: '47%', borderRadius: 14, borderWidth: 1,
    paddingVertical: 16, alignItems: 'center', gap: 4,
  },
  statValue: { fontSize: 24, fontWeight: '900' },
  statLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center', letterSpacing: 0.3 },
  infoCard: { borderRadius: 14, borderWidth: 1, marginBottom: 20, overflow: 'hidden' },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  infoLabel: { fontSize: 14, fontWeight: '500' },
  infoValue: { fontSize: 14, fontWeight: '700', textAlign: 'right', flex: 1, marginLeft: 16 },
  closeBtn: { borderRadius: 14, borderWidth: 1, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  closeBtnText: { fontSize: 15, fontWeight: '700' },
});

// ── Match info card ──────────────────────────────────────────────────────────
const MatchInfoCard: React.FC<{ match: Match; detail: MatchDetail }> = ({ match, detail }) => {
  const c = useThemeColors();
  const { t } = useTranslation();

  // Modal state
  const [venueModal, setVenueModal] = useState(false);
  const [refereeModal, setRefereeModal] = useState(false);

  type InfoRow = { icon: string; iconBg: string; label: string; sublabel?: string; rightText?: string; onPress?: () => void };
  const rows: InfoRow[] = [];

  // Venue (apply FIFA "clean venue" override for World Cup 2026 matches)
  if (detail.venue?.name) {
    const vSurface = detail.venue.surface ?? '';
    const vSurfaceLabel = !vSurface ? '' :
      vSurface.toLowerCase().includes('artif') ? t('matchInfo.surfaceArtificial') :
      vSurface.toLowerCase().includes('hybrid') ? t('matchInfo.surfaceHybrid') :
      t('matchInfo.surfaceGrass');
    const leagueIdNum = Number(match.leagueId) || 0;
    const vName = getDisplayVenueName(detail.venue.id, leagueIdNum, detail.venue.name) ?? detail.venue.name;
    const vCity = getDisplayVenueCity(detail.venue.id, leagueIdNum, detail.venue.city) ?? detail.venue.city;
    const showCity = !!vCity && !vName.toLowerCase().includes(vCity.toLowerCase());
    rows.push({
      icon: '📍', iconBg: 'rgba(16,185,129,0.15)',
      label: vName,
      sublabel: [
        showCity ? vCity : '',
        vSurfaceLabel,
      ].filter(Boolean).join(' · '),
      rightText: [
        detail.venue.capacity > 0 ? `Capacidad: ${detail.venue.capacity.toLocaleString()}` : '',
        detail.venue.attendance ? `Asistencia: ${detail.venue.attendance.toLocaleString()}` : '',
      ].filter(Boolean).join('    '),
      onPress: () => setVenueModal(true),
    });
  }

  // Referee
  if (detail.referee?.name) {
    rows.push({
      icon: '👤', iconBg: 'rgba(245,158,11,0.15)',
      label: detail.referee.name,
      sublabel: detail.referee.flag ? `${detail.referee.flag} ${detail.referee.nationality}` : detail.referee.nationality,
      onPress: () => setRefereeModal(true),
    });
  }

  // Weather
  if (detail.weather) {
    const w = detail.weather;
    rows.push({
      icon: w.icon || '☀️', iconBg: 'rgba(251,191,36,0.15)',
      label: `${w.temp}°C · ${translateWeatherDesc(w.description, t)}`,
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
        <Text style={[mi.title, { color: c.textTertiary }]}>Información del partido</Text>
        <View style={{ flex: 1 }} />
        <Text style={[mi.round, { color: c.textTertiary }]}>
          {seasonStr ? `${t('matches.matchday')} · ${seasonStr}` : t('matches.matchday')}
        </Text>
      </View>

      {rows.map((row, i) => {
        const inner = (
          <>
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
            {!!row.onPress && (
              <Text style={[mi.chevron, { color: c.textTertiary }]}>›</Text>
            )}
          </>
        );
        return row.onPress ? (
          <TouchableOpacity
            key={i}
            style={[mi.row, { borderTopColor: c.border }]}
            onPress={row.onPress}
            activeOpacity={0.65}
          >
            {inner}
          </TouchableOpacity>
        ) : (
          <View key={i} style={[mi.row, { borderTopColor: c.border }]}>
            {inner}
          </View>
        );
      })}

      {/* Modals */}
      <VenueDetailModal
        venue={detail.venue ?? null}
        leagueId={Number(match.leagueId) || undefined}
        visible={venueModal}
        onClose={() => setVenueModal(false)}
      />
      <RefereeDetailModal
        referee={detail.referee ?? null}
        stats={detail.refereeStats}
        visible={refereeModal}
        onClose={() => setRefereeModal(false)}
      />
    </View>
  );
};

const mi = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  title: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' },
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
  chevron: { fontSize: 22, fontWeight: '300', lineHeight: 26 },
});

// ── Pressure Index Area Chart ────────────────────────────────────────────────
//
// Smooth dual-area chart with Catmull-Rom upsampling + Gaussian blur.
// Event markers (goals ⚽, red cards 🟥) shown above/below the chart.

const CHART_H    = 120;
const MARKER_H   = 22;   // height of goal/card marker rows
const Y_AXIS_W   = 28;
const CHART_PAD_R = 14;
const PI_HOME    = '#ef4444';
const PI_AWAY    = '#10b981';

// ── Smooth-curve math ─────────────────────────────────────────────────────────

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t
  );
}

/** Upsample a data array to `targetCount` points using Catmull-Rom spline. */
function upsampleCurve(data: number[], targetCount: number): number[] {
  const n = data.length;
  if (n < 2) return data;
  const out: number[] = [];
  for (let i = 0; i < targetCount; i++) {
    const t   = (i / (targetCount - 1)) * (n - 1);
    const idx = Math.floor(t);
    const f   = t - idx;
    const p0  = data[Math.max(0, idx - 1)];
    const p1  = data[idx];
    const p2  = data[Math.min(n - 1, idx + 1)];
    const p3  = data[Math.min(n - 1, idx + 2)];
    out.push(Math.max(5, Math.min(95, catmullRom(p0, p1, p2, p3, f))));
  }
  return out;
}

/** Gaussian smoothing (radius = half-window size). */
function gaussianSmooth(data: number[], radius: number): number[] {
  const sigma = radius / 2.0;
  const kernel: number[] = [];
  let ksum = 0;
  for (let i = -radius; i <= radius; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel.push(w);
    ksum += w;
  }
  return data.map((_, i) =>
    kernel.reduce((acc, w, j) => {
      const idx = Math.max(0, Math.min(data.length - 1, i + j - radius));
      return acc + (w / ksum) * data[idx];
    }, 0),
  );
}

// ── Raw pressure curve (per-minute) ──────────────────────────────────────────

function buildPressureCurve(
  events: MatchEvent[],
  homePressure: number,
  matchMinutes: number,
  totalMin: number = 90,
): number[] {
  // The X-axis of the chart always shows 0–`totalMin` so the labels and the
  // half-time marker stay anchored. The CURVE itself, however, must only
  // contain real data up to the current match minute — otherwise a match at
  // minute 4 would render a noisy "history" through to minute 90 that the
  // user reads as if it actually happened (reported on AC Milan 1-0 Cagliari
  // at 4:48' on 2026-05-24). For finished matches we still extend to the
  // full `totalMin` (90 for regulation, 120 for ET matches) so the full-
  // match shape renders.
  const total      = totalMin;
  const elapsed    = Math.max(0, Math.min(matchMinutes, total)); // 0..total cap
  const points     = new Array<number>(total + 1).fill(50);
  const impulse    = new Array<number>(total + 1).fill(0);

  // Only ingest events that have actually happened — defensively skip any
  // event minute beyond the current elapsed time (SportMonks occasionally
  // backfills events with the next-period minute number while the period is
  // still going).
  for (const ev of events) {
    if (ev.minute > elapsed) continue;
    const min    = Math.min(ev.minute, elapsed);
    const isHome = ev.team === 'home';
    if (ev.type === 'goal' || ev.type === 'penalty-goal' || ev.type === 'own-goal') {
      impulse[min] += isHome ? 15 : -15;
    } else if (ev.type === 'yellow' || ev.type === 'second-yellow') {
      impulse[min] += isHome ? -4 : 4;
    } else if (ev.type === 'red') {
      impulse[min] += isHome ? -12 : 12;
    }
  }

  // Walk momentum + bias + jitter ONLY through the elapsed window.
  // Beyond `elapsed` we keep the neutral 50 fill — the chart will visually
  // show an empty flat line for time the match hasn't reached yet.
  let momentum = 0;
  const bias   = homePressure - 50;
  for (let i = 0; i <= elapsed; i++) {
    momentum  = momentum * 0.91 + impulse[i];
    points[i] = 50 + momentum;
  }
  for (let i = 0; i <= elapsed; i++) {
    // Normalize t against the elapsed window so the sine wave shape feels
    // proportional to how much of the match has played out so far. Guard
    // against divide-by-zero when elapsed is 0.
    const t     = elapsed > 0 ? i / elapsed : 0;
    const blend = 50 + bias * (0.5 + 0.5 * Math.sin(t * Math.PI * 3 + bias * 0.05));
    points[i]   = points[i] * 0.6 + blend * 0.4;
    points[i]  += Math.sin(i * 0.31) * 3.5 + Math.cos(i * 0.68) * 2.5;
    points[i]   = Math.max(5, Math.min(95, points[i]));
  }

  return points;
}

// ── Event marker helpers ──────────────────────────────────────────────────────

interface PressureMarker { minute: number; icon: string; isOwnGoal?: boolean }

function extractMarkers(
  events: MatchEvent[],
  side: 'home' | 'away',
  totalMin: number,
): PressureMarker[] {
  const seen = new Set<string>();
  const out: PressureMarker[] = [];
  for (const ev of events) {
    if (ev.minute > totalMin + 15) continue;
    const key = `${ev.type}-${ev.minute}-${ev.team}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const isOwnGoal = ev.type === 'own-goal';
    // Own goal: appears on the CONCEDING team's side (opposite)
    const displaySide = isOwnGoal
      ? (ev.team === 'home' ? 'away' : 'home')
      : ev.team;

    if (displaySide !== side) continue;

    if (ev.type === 'goal' || ev.type === 'penalty-goal') {
      out.push({ minute: ev.minute, icon: '⚽' });
    } else if (ev.type === 'own-goal') {
      out.push({ minute: ev.minute, icon: '⚽', isOwnGoal: true });
    } else if (ev.type === 'red') {
      out.push({ minute: ev.minute, icon: '🟥' });
    }
  }
  return out;
}

// ── PressureSection component ─────────────────────────────────────────────────

const UPSAMPLE_POINTS = 300; // upsampled resolution → smooth bezier-like curve

const PressureSection: React.FC<{
  pressure: PressureIndex;
  match: Match;
  events?: MatchEvent[];
  /**
   * Pass `detail.statistics` so the section can render a compact 4-stat strip
   * below the chart (corners / fouls / saves / big chances). Optional — the
   * strip is hidden entirely when stats are missing.
   */
  statistics?: MatchStatCategory[];
}> = ({ pressure, match, events = [], statistics = [] }) => {
  const c           = useThemeColors();
  const { isDark }  = useDarkMode();
  // The X-axis maxes out at 90 for a regulation match and 120 when extra
  // time happened — see matchPhases.maxRegulationMinute. This is what lets
  // FotMob-style ET goals (Mbappé 108', Messi 118', Petković 117') sit on
  // the chart instead of being silently dropped past the 90-minute mark.
  const totalMin = maxRegulationMinute(match, events);

  // How many minutes of the match have actually been played. Drives how far
  // along the 0–`totalMin` X-axis the curve is filled with real momentum
  // data; beyond this minute the chart stays neutral (50). The X-axis
  // itself is always 0–`totalMin` so the half-time line and tick labels
  // stay anchored.
  //   • finished → totalMin (full match shape)
  //   • live     → current minute (curve grows over time)
  //   • scheduled → 0 (curve stays flat — shouldn't render here at all, but
  //                     the fallback is graceful)
  // Previously `match.minute ?? 90` was used, which during a brief data revert
  // (syncFixtures stomping the live state with stale scheduled state, observed
  // on MEX 2-0 GHA on 2026-05-23) caused the FULL 90-min curve to render as if
  // the match had ended — explicit status mapping prevents that.
  const matchMinutes = match.status === 'finished'
    ? totalMin
    : match.status === 'live' && typeof match.minute === 'number' && match.minute > 0
      ? match.minute
      : 0;

  const rawCurve = React.useMemo(
    () => buildPressureCurve(events, pressure.home, matchMinutes, totalMin),
    [events, pressure.home, matchMinutes, totalMin],
  );

  // Catmull-Rom upsample → Gaussian smooth → final smooth wave
  const smoothCurve = React.useMemo(() => {
    const up = upsampleCurve(rawCurve, UPSAMPLE_POINTS);
    return gaussianSmooth(up, 6);
  }, [rawCurve]);

  // `totalMin` declared above (~line 1741) — drives both buildPressureCurve
  // and the x-axis labels. rawCurve.length === totalMin + 1 by construction.
  const numBars     = smoothCurve.length;

  // Measure actual chart pixel width via onLayout
  const [chartW, setChartW] = React.useState(SCREEN_WIDTH - Y_AXIS_W - CHART_PAD_R - 34);
  const barW = chartW / numBars;

  // Event markers
  const homeMarkers = React.useMemo(
    () => extractMarkers(events, 'home', totalMin),
    [events, totalMin],
  );
  const awayMarkers = React.useMemo(
    () => extractMarkers(events, 'away', totalMin),
    [events, totalMin],
  );

  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  const gridColor   = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  // ── Live playhead ──────────────────────────────────────────────────────────
  // The pressure chart used to have no "you are here" indicator during live
  // play — users couldn't tell which slice of the chart corresponded to the
  // moment they were watching. Now we render a vertical accent line at the
  // current minute (capped to the chart's 0–90 domain) plus a soft pulsing dot
  // at the top of the line to draw the eye. Only visible during live; the
  // chart stays clean for scheduled/finished matches.
  const playheadMin: number | null =
    match.status === 'live' &&
    typeof match.minute === 'number' &&
    match.minute > 0
      ? Math.min(match.minute, totalMin)
      : null;

  const pulseAnim = React.useRef(new Animated.Value(0.45)).current;
  React.useEffect(() => {
    if (playheadMin === null) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.45,
          duration: 850,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playheadMin === null]);

  // ── Extra stats strip ──────────────────────────────────────────────────────
  // Compact 4-row block beneath the summary bar. Picks stats that AREN'T
  // already in the top-level QuickStats card (possession/shots/xG) so the
  // section adds genuinely new info instead of repeating numbers. Each entry
  // is filtered out if the stat is missing from SportMonks for this match.
  const extraStats = React.useMemo(() => {
    const all = statistics.flatMap(c => c.stats);
    const pick = (label: string) => all.find(s => s.label === label);
    return [
      { key: 'corners', label: 'Saques de esquina',  stat: pick('Saques de esquina') },
      { key: 'fouls',   label: 'Faltas',             stat: pick('Faltas') },
      { key: 'saves',   label: 'Salvadas de portero',stat: pick('Salvadas de portero') },
      { key: 'chances', label: 'Grandes chances',    stat: pick('Grandes chances') },
    ].filter(row => row.stat !== undefined);
  }, [statistics]);

  return (
    <View style={[pi.card, { backgroundColor: c.card, borderColor: c.border }]}>
      {/* ── Header ── */}
      <View style={pi.header}>
        <Text style={[pi.title, { color: c.textTertiary }]}>ÍNDICE DE PRESIÓN</Text>
        <View style={{ flex: 1 }} />
        <View style={pi.legend}>
          <View style={[pi.legendDot, { backgroundColor: PI_HOME }]} />
          <Text style={[pi.legendLabel, { color: c.textTertiary }]}>{match.homeTeam.shortName}</Text>
          <View style={[pi.legendDot, { backgroundColor: PI_AWAY, marginLeft: 8 }]} />
          <Text style={[pi.legendLabel, { color: c.textTertiary }]}>{match.awayTeam.shortName}</Text>
        </View>
      </View>

      {/* ── Chart body ── */}
      <View style={[pi.chartWrap, { borderTopColor: borderColor }]}>
        {/* Y-axis */}
        <View style={[pi.yAxis, { height: MARKER_H + CHART_H + MARKER_H }]}>
          <Text style={[pi.yLabel, { color: c.textTertiary, marginTop: MARKER_H }]}>100</Text>
          <Text style={[pi.yLabel, { color: c.textTertiary }]}>50</Text>
          <Text style={[pi.yLabel, { color: c.textTertiary, marginBottom: MARKER_H }]}>0</Text>
        </View>

        <View style={{ flex: 1 }}>
          {/* ── Home event markers (above chart) ── */}
          <View
            style={{ height: MARKER_H, position: 'relative', overflow: 'hidden', paddingRight: CHART_PAD_R }}
            onLayout={e => setChartW(e.nativeEvent.layout.width - CHART_PAD_R)}
          >
            {homeMarkers.map((m, idx) => {
              const x = (m.minute / totalMin) * chartW - 8;
              return (
                <View key={idx} style={{ position: 'absolute', left: x, top: 2, width: 16, alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, lineHeight: 14 }}>{m.icon}</Text>
                  {m.isOwnGoal && (
                    <Text style={{ fontSize: 6, color: c.textTertiary, lineHeight: 8 }}>pp</Text>
                  )}
                </View>
              );
            })}
          </View>

          {/* ── Area chart ── */}
          <View
            style={{ height: CHART_H, overflow: 'hidden', position: 'relative', paddingRight: CHART_PAD_R }}
          >
            {/* Background grid */}
            <View style={[pi.gridLine, { top: 0, borderBottomColor: gridColor }]} />
            <View style={[pi.gridLine, { top: CHART_H / 2, borderBottomColor: gridColor }]} />
            <View style={[pi.gridLine, { top: CHART_H - 1, borderBottomColor: gridColor }]} />
            {/* Half-time dotted line */}
            <View style={[pi.htLine, {
              left: (45 / totalMin) * chartW,
              borderColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)',
            }]} />
            {/* Full-time dotted line — only when the chart extends into ET,
                so the user can read where regulation ended (90') vs. where
                extra time began. For 0-90 charts this is the right edge of
                the chart, where a dashed line would be invisible. */}
            {totalMin === 120 && (
              <View style={[pi.htLine, {
                left: (90 / totalMin) * chartW,
                borderColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)',
              }]} />
            )}

            {/* Live playhead — only when the match is actually live. */}
            {playheadMin !== null && (
              <>
                {/* Vertical line at the current minute */}
                <View style={{
                  position: 'absolute',
                  left: (playheadMin / totalMin) * chartW,
                  top: 0,
                  bottom: 0,
                  width: 1.5,
                  backgroundColor: c.accent,
                  opacity: 0.55,
                }} />
                {/* Pulsing dot anchored to the top of the line. Pokes a few
                    pixels above the chart container so it sits between the
                    chart and the row of home event markers above, drawing
                    the eye without overlapping the curve. */}
                <Animated.View style={{
                  position: 'absolute',
                  left: (playheadMin / totalMin) * chartW - 5,
                  top: -3,
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: c.accent,
                  opacity: pulseAnim,
                }} />
              </>
            )}

            {/* Red-card vertical lines */}
            {[...homeMarkers, ...awayMarkers]
              .filter(m => m.icon === '🟥')
              .map((m, idx) => (
                <View key={idx} style={{
                  position: 'absolute',
                  left: (m.minute / totalMin) * chartW,
                  top: 0,
                  bottom: 0,
                  width: 1.5,
                  backgroundColor: '#ef4444',
                  opacity: 0.4,
                }} />
              ))}

            {/* Smooth fill bars — upsampled to 300 points */}
            {smoothCurve.map((val, i) => {
              const dev   = val - 50;
              const barH  = Math.abs(dev) * (CHART_H / 100);
              const isHome = dev > 0;
              if (barH < 0.3) return null;
              return (
                <View
                  key={i}
                  style={{
                    position: 'absolute',
                    left: i * barW,
                    width: Math.ceil(barW) + 0.5,  // +0.5 closes sub-pixel gaps
                    height: barH,
                    top: isHome ? CHART_H / 2 - barH : CHART_H / 2,
                    backgroundColor: isHome ? PI_HOME : PI_AWAY,
                    opacity: 0.55,
                  }}
                />
              );
            })}
          </View>

          {/* ── Away event markers (below chart) ── */}
          <View style={{ height: MARKER_H, position: 'relative', overflow: 'hidden', paddingRight: CHART_PAD_R }}>
            {awayMarkers.map((m, idx) => {
              const x = (m.minute / totalMin) * chartW - 8;
              return (
                <View key={idx} style={{ position: 'absolute', left: x, top: 4, width: 16, alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, lineHeight: 14 }}>{m.icon}</Text>
                  {m.isOwnGoal && (
                    <Text style={{ fontSize: 6, color: c.textTertiary, lineHeight: 8 }}>pp</Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      </View>

      {/* ── X-axis labels ── */}
      <View style={pi.xAxis}>
        {/* X-axis labels adapt to whether the chart extends into extra time.
            Regulation matches: 7 anchors evenly spaced 0'..90' with "MT"
            (medio tiempo) at the halftime position. ET matches: collapse
            to 4 anchors (0', MT=45', TC=90', AET=120') — mirrors the FotMob
            "Inercia" pattern so users get a clear visual cue that the chart
            covers ET. We use the same flexbox container so spacing stays
            even regardless of label count. */}
        {totalMin === 120 ? (
          <>
            <Text style={[pi.xLabel, { color: c.textTertiary }]}>0'</Text>
            <Text style={[pi.xLabel, { color: c.textTertiary }]}>MT</Text>
            <Text style={[pi.xLabel, { color: c.textTertiary }]}>TC</Text>
            <Text style={[pi.xLabel, { color: c.textTertiary }]}>AET</Text>
          </>
        ) : (
          <>
            <Text style={[pi.xLabel, { color: c.textTertiary }]}>0'</Text>
            <Text style={[pi.xLabel, { color: c.textTertiary }]}>15'</Text>
            <Text style={[pi.xLabel, { color: c.textTertiary }]}>30'</Text>
            <Text style={[pi.xLabel, { color: c.textTertiary }]}>MT</Text>
            <Text style={[pi.xLabel, { color: c.textTertiary }]}>60'</Text>
            <Text style={[pi.xLabel, { color: c.textTertiary }]}>75'</Text>
            <Text style={[pi.xLabel, { color: c.textTertiary }]}>90'</Text>
          </>
        )}
      </View>

      {/* ── Summary bar ── */}
      <View style={[pi.summary, { borderTopColor: borderColor }]}>
        <Text style={[pi.summaryValue, { color: PI_HOME }]}>{pressure.home}%</Text>
        <View style={pi.summaryBarWrap}>
          <View style={[pi.summaryBarBg, { backgroundColor: c.surface }]}>
            <View style={[pi.summaryBarHome, { width: `${pressure.home}%` }]} />
          </View>
        </View>
        <Text style={[pi.summaryValue, { color: PI_AWAY, textAlign: 'right' }]}>{pressure.away}%</Text>
      </View>

      {/* ── Extra stats strip (corners / fouls / saves / big chances) ── */}
      {extraStats.length > 0 && (
        <View style={[pi.extraStats, { borderTopColor: borderColor }]}>
          {extraStats.map((row, idx) => {
            const stat = row.stat!;
            return (
              <View
                key={row.key}
                style={[
                  pi.extraStatRow,
                  idx > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: borderColor,
                  },
                ]}
              >
                <Text style={[pi.extraStatVal, { color: PI_HOME }]}>{stat.home}</Text>
                <Text style={[pi.extraStatLabel, { color: c.textSecondary }]} numberOfLines={1}>
                  {row.label}
                </Text>
                <Text style={[pi.extraStatVal, { color: PI_AWAY, textAlign: 'right' }]}>{stat.away}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

const pi = StyleSheet.create({
  card:        { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 8 },
  header:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  icon:        { fontSize: 16 },
  title:       { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' },
  legend:      { flexDirection: 'row', alignItems: 'center' },
  legendDot:   { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 10, fontWeight: '500', marginLeft: 4 },

  chartWrap: { flexDirection: 'row', paddingLeft: 4, borderTopWidth: 1 },
  yAxis:     { width: Y_AXIS_W, justifyContent: 'space-between', paddingVertical: 2 },
  yLabel:    { fontSize: 8, fontWeight: '500', textAlign: 'right', paddingRight: 4 },

  gridLine: { position: 'absolute', left: 0, right: 0, borderBottomWidth: StyleSheet.hairlineWidth },
  htLine:   {
    position: 'absolute', top: 0, bottom: 0,
    width: 1,
    borderLeftWidth: 1,
    borderStyle: 'dashed' as const,
  },

  // Padding here MUST mirror the chart container's effective margins so the
  // X-axis labels align with the bars and the half-time dashed line:
  //   • Left: chartWrap.paddingLeft (4) + yAxis.width (Y_AXIS_W = 28) = 32
  //   • Right: CHART_PAD_R = 14 (was previously 32, which pushed the "90'"
  //     label 18 px inward and threw the MT label out of line with the
  //     dashed half-time marker by 9 px).
  xAxis:  { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 32, paddingRight: CHART_PAD_R, paddingVertical: 6 },
  xLabel: { fontSize: 8, fontWeight: '500' },

  summary:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 10, borderTopWidth: 1 },
  summaryValue:   { fontSize: 15, fontWeight: '800', width: 42 },
  summaryBarWrap: { flex: 1 },
  summaryBarBg:   { height: 6, borderRadius: 3, overflow: 'hidden' },
  summaryBarHome: { height: 6, backgroundColor: PI_HOME, borderRadius: 3 },

  // Compact stats strip below the summary bar. Same visual rhythm as the
  // miniStatRow used by QuickStats so the two cards feel related, just
  // narrower vertical padding to keep the section dense.
  extraStats:     { borderTopWidth: 1 },
  extraStatRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 7 },
  extraStatVal:   { width: 36, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  extraStatLabel: { flex: 1, fontSize: 11, fontWeight: '500', textAlign: 'center' },
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
  title: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' },
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

// Events that always show in "Destacados" mode. Shootout kicks are added here
// so a saved penalty or a missed kick is never hidden under the "Mostrar todo"
// toggle — every kick is consequential when a final goes to penalties.
const IMPORTANT_TYPES = new Set([
  'goal', 'own-goal', 'penalty-goal', 'red', 'second-yellow', 'var',
  'shootout-goal', 'shootout-miss',
]);

export const EnVivoTab: React.FC<{ match: Match; detail: MatchDetail }> = ({ match, detail }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const isScheduled = match.status === 'scheduled';
  const isFinished  = match.status === 'finished';
  const [showAllEvents, setShowAllEvents] = useState(false);

  // Split shootout kicks out of the regulation timeline before the half
  // split — otherwise SM tends to report them at minute 120 which would
  // bunch all 10+ kicks at the bottom of "Segundo tiempo" and break the
  // chronological reading flow. They get their own section instead.
  const isShootoutEvent = (e: typeof detail.events[number]) =>
    e.type === 'shootout-goal' || e.type === 'shootout-miss';
  const shootoutEvents = detail.events
    .filter(isShootoutEvent)
    .sort((a, b) => (a.shootoutOrder ?? 0) - (b.shootoutOrder ?? 0));

  // Filter + bucket regulation/ET events into phase sections. The MATCH_PHASES
  // array (utils/matchPhases.ts) drives this — adding a new phase later means
  // changing one constant, not patching every consumer.
  const regulationEvents = detail.events.filter(e => !isShootoutEvent(e));
  const filteredEvents = showAllEvents
    ? regulationEvents
    : regulationEvents.filter(e => IMPORTANT_TYPES.has(e.type));
  const phaseBuckets = MATCH_PHASES.map(phase => ({
    phase,
    events: filteredEvents
      .filter(e => e.minute >= phase.minRange[0] && e.minute <= phase.minRange[1])
      .sort((a, b) => a.minute - b.minute),
  }));
  const visiblePhaseBuckets = phaseBuckets.filter(b => b.events.length > 0);
  const hasEvents = detail.events.length > 0;
  const hasMissing = (detail.missingPlayers?.home?.length ?? 0) > 0 || (detail.missingPlayers?.away?.length ?? 0) > 0;

  // ── Boundary marker (phase divider with cumulative score) ──────────────────
  // "Medio tiempo · 2-0" style. `bold` is used for the final closing marker.
  const BoundaryMarker = ({ label, score, bold }: {
    label: string; score?: { home: number; away: number } | null; bold?: boolean;
  }) => (
    <View style={[tl.boundary, { backgroundColor: c.surface }]}>
      <Text style={[tl.boundaryText, { color: bold ? c.textPrimary : c.textTertiary }, bold && { fontWeight: '800' }]}>
        {label}{score ? `  ·  ${score.home}-${score.away}` : ''}
      </Text>
    </View>
  );

  // ── Timeline block — reused in two positions (finished: top, live: below stats)
  const TimelineBlock = () => (
    <View style={[tl.card, { backgroundColor: c.card, borderColor: c.border }]}>
      {/* Title */}
      <View style={[tl.titleRow, { borderBottomColor: c.border }]}>
        <Text style={[tl.titleText, { color: c.textTertiary }]}>{t('timeline.title')}</Text>
      </View>
      {/* Full team names — left (home, blue) / right (away, orange) */}
      <View style={tl.teamsHeader}>
        <Text style={[tl.teamName, { color: '#3b82f6' }]} numberOfLines={1}>
          {translateNationalTeam(match.homeTeam.name)}
        </Text>
        <Text style={[tl.teamName, { color: '#f97316', textAlign: 'right' }]} numberOfLines={1}>
          {translateNationalTeam(match.awayTeam.name)}
        </Text>
      </View>
      {/* Filter toggle — "Destacados" (no emoji) / "Todo" */}
      <View style={[tl.filterRow, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          style={[tl.filterBtn, { borderColor: !showAllEvents ? c.accent : c.border },
            !showAllEvents && { backgroundColor: c.accent + '1A' }]}
          onPress={() => setShowAllEvents(false)}
          activeOpacity={0.7}
        >
          <Text style={[tl.filterBtnText, { color: !showAllEvents ? c.accent : c.textTertiary }]}>
            {t('timeline.highlights')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[tl.filterBtn, { borderColor: showAllEvents ? c.accent : c.border },
            showAllEvents && { backgroundColor: c.accent + '1A' }]}
          onPress={() => setShowAllEvents(true)}
          activeOpacity={0.7}
        >
          <Text style={[tl.filterBtnText, { color: showAllEvents ? c.accent : c.textTertiary }]}>
            {t('timeline.showAll')}
          </Text>
        </TouchableOpacity>
      </View>
      {/* Event rows or empty state */}
      {visiblePhaseBuckets.length === 0 && shootoutEvents.length === 0 ? (
        <View style={tl.emptyHighlights}>
          <Text style={[tl.emptyHighlightsText, { color: c.textTertiary }]}>
            {t('timeline.noHighlights')}
          </Text>
        </View>
      ) : (
        <>
          {/* Each phase: a START header, its events (goals carry a running
              score), then a CLOSING boundary marker with the cumulative score
              at that boundary. The closing marker only renders once the match
              has actually crossed that boundary (a later phase has events, OR
              the match is finished) — so a live 1st half shows no premature
              "Medio tiempo" badge. */}
          {visiblePhaseBuckets.map(({ phase, events }, idx) => {
            const isLast = idx === visiblePhaseBuckets.length - 1;
            // Decide the closing boundary for this phase.
            let boundary: { label: string; score: { home: number; away: number } | null; bold: boolean } | null = null;
            if (!isLast) {
              // We've clearly passed this boundary — show it with cumulative score.
              boundary = {
                label: t(phase.boundaryKey ?? 'timeline.matchEnd'),
                score: cumulativeScoreAtMinute(regulationEvents, phase.boundaryMinute),
                bold: false,
              };
            } else if (shootoutEvents.length > 0) {
              // Last regulation/ET phase before penalties — close it with its
              // own boundary (e.g. "Final de la prórroga · 3-3").
              boundary = {
                label: t(phase.boundaryKey ?? 'timeline.matchEnd'),
                score: cumulativeScoreAtMinute(regulationEvents, phase.boundaryMinute),
                bold: true,
              };
            } else if (isFinished) {
              // Match truly ended here (no shootout) — "Final del partido".
              // SportMonks only reports finished state (5/7/8) at the real end,
              // so this never fires prematurely for a knockout awaiting ET/pens.
              boundary = {
                label: t('timeline.matchEnd'),
                score: { home: match.homeScore, away: match.awayScore },
                bold: true,
              };
            }
            return (
              <React.Fragment key={phase.key}>
                <View style={[tl.phaseHeader, { backgroundColor: c.surface }]}>
                  <Text style={[tl.phaseHeaderText, { color: c.textTertiary }]}>{t(phase.i18nKey)}</Text>
                </View>
                {events.map(e => (
                  <EventRow
                    key={e.id}
                    event={e}
                    match={match}
                    runningScore={isGoalEvent(e.type) ? runningScoreAt(regulationEvents, e) : null}
                  />
                ))}
                {boundary && <BoundaryMarker label={boundary.label} score={boundary.score} bold={boundary.bold} />}
              </React.Fragment>
            );
          })}

          {/* Penalty shootout — kick-by-kick, numbered, ✅/❌. Header carries
              the final shootout tally so the reader sees the result first. */}
          {shootoutEvents.length > 0 && (
            <>
              <View style={[tl.boundary, { backgroundColor: c.surface }]}>
                <Text style={[tl.boundaryText, { color: c.textPrimary, fontWeight: '800' }]}>
                  {t('timeline.penaltyShootout')}
                  {typeof match.homePenScore === 'number' && typeof match.awayPenScore === 'number'
                    ? `  ·  ${match.homePenScore}-${match.awayPenScore}`
                    : ''}
                </Text>
              </View>
              {shootoutEvents.map(e => <EventRow key={e.id} event={e} match={match} />)}
            </>
          )}
        </>
      )}
    </View>
  );

  return (
    <View style={{ paddingHorizontal: 16, gap: 12 }}>

      {/* ── SCHEDULED: Previa layout ── */}
      {isScheduled && (
        <>
          {/* Predictions carousel (community poll — free, not gambling) */}
          <PredictionsCarousel match={match} />

          {/* AI Predictions + Momios — betting content, gated off for v1.0 (Apple 2.3.6) */}
          {BETTING_CONTENT_ENABLED && detail.predictions && detail.predictions.length > 0 && (
            <AIPredictionsSection predictions={detail.predictions} match={match} />
          )}
          {BETTING_CONTENT_ENABLED && detail.odds && detail.odds.length > 0 && (
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

      {/* ── LIVE / FINISHED: live+finished share most sections; order differs ── */}
      {!isScheduled && (
        <>
          {/* ── Cronología — FIRST for finished, after stats for live ── */}
          {isFinished && hasEvents && <TimelineBlock />}

          {/* Quick stats (possession bar + key numbers) */}
          <QuickStats match={match} detail={detail} />

          {/* Pressure index */}
          {detail.pressureIndex && <PressureSection pressure={detail.pressureIndex} match={match} events={detail.events} statistics={detail.statistics} />}

          {/* Poll results (locked after match) */}
          <PollResultsSection match={match} />

          {/* Odds — betting content, gated off for v1.0 (Apple 2.3.6) */}
          {BETTING_CONTENT_ENABLED && detail.odds && detail.odds.length > 0 && (
            <MomiosSection odds={detail.odds} match={match} />
          )}

          {/* ── Cronología — for live matches (after stats) ── */}
          {!isFinished && hasEvents && <TimelineBlock />}

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
  // Title row ("Minuto a minuto"), centered
  titleRow: { alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1 },
  titleText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' },
  // Full team names row (home left / away right)
  teamsHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
  teamName: { flex: 1, fontSize: 14, fontWeight: '800' },
  // Phase START header ("Primer tiempo")
  phaseHeader: { paddingVertical: 7, alignItems: 'center' },
  phaseHeaderText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  // Boundary marker with cumulative score ("Medio tiempo · 2-0")
  boundary: { paddingVertical: 8, alignItems: 'center' },
  boundaryText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  resultText: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 18 },
  // Filter toggle
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderTopWidth: 1 },
  filterBtn: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  filterBtnText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  // Empty highlights state
  emptyHighlights: { paddingVertical: 22, alignItems: 'center' },
  emptyHighlightsText: { fontSize: 13, fontWeight: '500' },
});
