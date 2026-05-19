import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../theme/useTheme';
import { AnimatedPressable } from './AnimatedPressable';
import { MatchBell } from './MatchBell';
import { useLiveTick, computeLiveMinuteSeconds, formatLiveMinute } from '../hooks/useLiveTick';
import { useTimeFormat } from '../contexts/TimeFormatContext';
import { formatMatchTime } from '../utils/formatMatchTime';
import type { Match } from '../data/types';

/** Renders a team logo — Image if URL, Text if emoji/short string */
const TeamLogo = ({ logo, size = 24 }: { logo: string; size?: number }) => {
  const isUrl = logo.startsWith('http');
  if (isUrl) {
    return (
      <Image
        source={{ uri: logo }}
        style={{ width: size, height: size, borderRadius: 3 }}
        resizeMode="contain"
      />
    );
  }
  return <Text style={{ fontSize: size - 4 }}>{logo}</Text>;
};

interface MatchCardProps {
  match: Match;
  onPress?: (match: Match) => void;
}

export const MatchCard: React.FC<MatchCardProps> = ({ match, onPress }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const { timeFormat } = useTimeFormat();

  const isLive      = match.status === 'live';
  const isFinished  = match.status === 'finished';
  const isScheduled = match.status === 'scheduled';

  const homeWon = isFinished && match.homeScore > match.awayScore;
  const awayWon = isFinished && match.awayScore > match.homeScore;

  // Shared 1-Hz tick — advances the minute locally between API polls so the
  // list view never freezes at the minute it was first loaded. We only
  // subscribe for live matches so finished/scheduled cards don't re-render.
  const now = useLiveTick(isLive);
  const liveDisplay = isLive ? computeLiveMinuteSeconds(match, now) : null;
  const liveMinuteLabel = liveDisplay ? (formatLiveMinute(liveDisplay) ?? match.time) : match.time;

  return (
    <AnimatedPressable
      style={[s.card, { backgroundColor: c.card, borderBottomColor: c.border }]}
      onPress={() => onPress?.(match)}
      scaleValue={0.98}
      haptic="none"
    >
      <View style={s.row}>
        {/* Home team (left) */}
        <View style={s.teamLeft}>
          <TeamLogo logo={match.homeTeam.logo} />
          <Text
            style={[s.teamName, { color: c.textPrimary }, homeWon && s.teamNameBold]}
            numberOfLines={1}
          >
            {match.homeTeam.name}
          </Text>
          {!!match.homeRedCards && <RedCards count={match.homeRedCards} />}
        </View>

        {/* Score / Time (center) */}
        <View style={[s.center, timeFormat === '12h' && { width: 94 }]}>
          {isScheduled ? (
            <View style={[s.timePill, { backgroundColor: c.surface }]}>
              <Text style={[s.timePillText, { color: c.textSecondary }]} numberOfLines={1}>
                {formatMatchTime(match.time, timeFormat)}
              </Text>
            </View>
          ) : (
            <View style={s.scoreRow}>
              <Text style={[s.scoreNum, { color: c.textPrimary }, (!homeWon && !isLive) && { color: c.textTertiary }]}>
                {match.homeScore}
              </Text>
              <Text style={[s.scoreDash, { color: c.textTertiary }]}>—</Text>
              <Text style={[s.scoreNum, { color: c.textPrimary }, (!awayWon && !isLive) && { color: c.textTertiary }]}>
                {match.awayScore}
              </Text>
            </View>
          )}
          {isLive && (
            <Text style={s.liveMin}>
              {match.stateLabel === 'HT' ? t('matchStatus.halfTime') : liveMinuteLabel}
            </Text>
          )}
          {isFinished && <Text style={[s.ftLabel, { color: c.textTertiary }]}>Final</Text>}
        </View>

        {/* Away team (right) */}
        <View style={s.teamRight}>
          {!!match.awayRedCards && <RedCards count={match.awayRedCards} />}
          <Text
            style={[s.teamName, s.teamNameRight, { color: c.textPrimary }, awayWon && s.teamNameBold]}
            numberOfLines={1}
          >
            {match.awayTeam.name}
          </Text>
          <TeamLogo logo={match.awayTeam.logo} />
        </View>

        {/* Per-match notification toggle — only renders for followed matches */}
        <MatchBell match={match} />
      </View>
    </AnimatedPressable>
  );
};

// Red card indicator — one small rectangle per expelled player
const RedCards = ({ count }: { count: number }) => (
  <View style={s.redCardsWrap}>
    {Array.from({ length: count }).map((_, i) => (
      <View key={i} style={[s.redCard, i > 0 && s.redCardStacked]} />
    ))}
  </View>
);

const s = StyleSheet.create({
  card: {
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
  },

  // Teams
  teamLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  teamRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    minWidth: 0,
  },
  teamLogo: { fontSize: 20 },
  teamName: {
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 1,
  },
  teamNameRight: { textAlign: 'right' },
  teamNameBold: { fontWeight: '700' },

  // Score center
  center: {
    width: 76,
    alignItems: 'center',
    flexShrink: 0,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scoreNum: {
    fontSize: 19,
    fontWeight: '800',
  },
  scoreDash: {
    fontSize: 13,
  },
  liveMin: {
    fontSize: 10,
    fontWeight: '700',
    color: '#f87171', // red-400
    marginTop: 2,
  },
  ftLabel: {
    fontSize: 10,
    marginTop: 2,
  },

  // Time pill (scheduled)
  timePill: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  timePillText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Red cards
  redCardsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  redCard: {
    width: 7,
    height: 10,
    borderRadius: 1.5,
    backgroundColor: '#ef4444',
  },
  redCardStacked: {
    marginLeft: -3,
  },
});
