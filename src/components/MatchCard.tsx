import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { colors } from '../theme/colors';
import type { Match } from '../data/mockData';

interface MatchCardProps {
  match: Match;
  onPress?: (match: Match) => void;
}

const LivePulse = () => {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.2, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return <Animated.View style={[s.liveDot, { opacity }]} />;
};

// Bell icon drawn with View primitives
const BellIcon = ({ muted }: { muted?: boolean }) => (
  <View style={[s.bellWrap, muted && s.bellWrapMuted]}>
    <View style={s.bellBody} />
    <View style={s.bellClapper} />
    {muted && <View style={s.bellSlash} />}
  </View>
);

export const MatchCard: React.FC<MatchCardProps> = ({ match, onPress }) => {
  const isLive      = match.status === 'live';
  const isFinished  = match.status === 'finished';
  const isScheduled = match.status === 'scheduled';

  const homeWon = isFinished && match.homeScore > match.awayScore;
  const awayWon = isFinished && match.awayScore > match.homeScore;

  return (
    <TouchableOpacity style={s.card} onPress={() => onPress?.(match)} activeOpacity={0.7}>
      <View style={s.row}>
        {/* ── Home team (left) ── */}
        <View style={s.teamLeft}>
          <Text style={s.teamLogo}>{match.homeTeam.logo}</Text>
          <Text
            style={[s.teamName, homeWon && s.teamNameBold]}
            numberOfLines={1}
          >
            {match.homeTeam.name}
          </Text>
        </View>

        {/* ── Score / Time (center) ── */}
        <View style={s.center}>
          {isScheduled ? (
            <View style={s.timePill}>
              <Text style={s.timePillText}>{match.time}</Text>
            </View>
          ) : (
            <View style={s.scoreRow}>
              <Text style={[s.scoreNum, homeWon && s.scoreWin, (!homeWon && !isLive) && s.scoreDim]}>
                {match.homeScore}
              </Text>
              <Text style={s.scoreDash}>—</Text>
              <Text style={[s.scoreNum, awayWon && s.scoreWin, (!awayWon && !isLive) && s.scoreDim]}>
                {match.awayScore}
              </Text>
            </View>
          )}
          {isLive && <Text style={s.liveMin}>{match.time}</Text>}
          {isFinished && <Text style={s.ftLabel}>Final</Text>}
        </View>

        {/* ── Away team (right) ── */}
        <View style={s.teamRight}>
          <Text
            style={[s.teamName, s.teamNameRight, awayWon && s.teamNameBold]}
            numberOfLines={1}
          >
            {match.awayTeam.name}
          </Text>
          <Text style={s.teamLogo}>{match.awayTeam.logo}</Text>
        </View>

        {/* ── Bell ── */}
        <TouchableOpacity style={s.bellBtn} activeOpacity={0.7}>
          <BellIcon muted={match.isFavorite} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    color: colors.textPrimary,
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
    color: colors.textPrimary,
  },
  scoreWin: { color: colors.textPrimary },
  scoreDim: { color: colors.textTertiary },
  scoreDash: {
    fontSize: 13,
    color: colors.textTertiary,
  },
  liveMin: {
    fontSize: 10,
    fontWeight: '700',
    color: '#f87171', // red-400
    marginTop: 2,
  },
  ftLabel: {
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: 2,
  },

  // Time pill (scheduled)
  timePill: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  timePillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },

  // Bell
  bellBtn: { marginLeft: 4, padding: 4 },
  bellWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellWrapMuted: { backgroundColor: 'rgba(239,68,68,0.1)' },
  bellBody: {
    width: 10,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.textTertiary,
    borderBottomWidth: 0,
    marginTop: 2,
  },
  bellClapper: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textTertiary,
    marginTop: -1,
  },
  bellSlash: {
    position: 'absolute',
    width: 14,
    height: 1.5,
    backgroundColor: '#f87171',
    borderRadius: 1,
    transform: [{ rotate: '-45deg' }],
  },

  // Live pulse
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.live,
  },
});
