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

const TeamBadge = ({ name }: { name: string }) => {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const hue = name.charCodeAt(0) * 37 % 360;
  const bgColor = `hsl(${hue}, 60%, 25%)`;
  const textColor = `hsl(${hue}, 80%, 75%)`;

  return (
    <View style={[styles.teamBadge, { backgroundColor: bgColor }]}>
      <Text style={[styles.teamInitials, { color: textColor }]}>{initials}</Text>
    </View>
  );
};

const LivePulse = () => {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return <Animated.View style={[styles.liveDot, { opacity }]} />;
};

export const MatchCard: React.FC<MatchCardProps> = ({ match, onPress }) => {
  const isLive     = match.status === 'live';
  const isFinished = match.status === 'finished';
  const isScheduled = match.status === 'scheduled';

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress?.(match)}
      activeOpacity={0.75}
    >
      {/* Home team */}
      <View style={styles.teamRow}>
        <TeamBadge name={match.homeTeam.name} />
        <Text style={[styles.teamName, isFinished && match.homeScore > match.awayScore && styles.teamNameWinner]} numberOfLines={1}>
          {match.homeTeam.name}
        </Text>
        <Text style={[styles.score, isLive && styles.scoreLive]}>
          {isScheduled ? '' : match.homeScore}
        </Text>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Away team */}
      <View style={styles.teamRow}>
        <TeamBadge name={match.awayTeam.name} />
        <Text style={[styles.teamName, isFinished && match.awayScore > match.homeScore && styles.teamNameWinner]} numberOfLines={1}>
          {match.awayTeam.name}
        </Text>
        <Text style={[styles.score, isLive && styles.scoreLive]}>
          {isScheduled ? '' : match.awayScore}
        </Text>
      </View>

      {/* Status badge */}
      <View style={styles.statusContainer}>
        {isLive && (
          <View style={styles.liveContainer}>
            <LivePulse />
            <Text style={styles.liveMinute}>{match.minute ?? match.time}</Text>
          </View>
        )}
        {isFinished && <Text style={styles.finishedText}>FT</Text>}
        {isScheduled && <Text style={styles.upcomingText}>{match.time}</Text>}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: 'relative',
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingRight: 56,
  },
  teamBadge: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamInitials: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  teamName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
    letterSpacing: -0.1,
  },
  teamNameWinner: {
    fontWeight: '700',
  },
  score: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    width: 20,
    textAlign: 'center',
  },
  scoreLive: {
    color: colors.accent,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
    marginLeft: 38,
  },
  statusContainer: {
    position: 'absolute',
    right: 16,
    top: 0,
    bottom: 0,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveContainer: {
    alignItems: 'center',
    gap: 4,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.live,
  },
  liveMinute: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.live,
  },
  finishedText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textTertiary,
    letterSpacing: 0.5,
  },
  upcomingText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
