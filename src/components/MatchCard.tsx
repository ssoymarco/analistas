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

// Circular team badge with initials (matches Figma style)
const TeamBadge = ({ name }: { name: string }) => {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const hue = (name.charCodeAt(0) * 47 + name.charCodeAt(1) * 13) % 360;
  return (
    <View style={[styles.teamBadge, { backgroundColor: `hsl(${hue},45%,30%)` }]}>
      <Text style={[styles.teamInitials, { color: `hsl(${hue},80%,80%)` }]}>{initials}</Text>
    </View>
  );
};

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
  return <Animated.View style={[styles.liveDot, { opacity }]} />;
};

export const MatchCard: React.FC<MatchCardProps> = ({ match, onPress }) => {
  const isLive      = match.status === 'live';
  const isFinished  = match.status === 'finished';
  const isScheduled = match.status === 'scheduled';

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress?.(match)} activeOpacity={0.7}>
      {/* Home team row */}
      <View style={styles.teamRow}>
        <TeamBadge name={match.homeTeam.name} />
        <Text
          style={[styles.teamName, isFinished && match.homeScore > match.awayScore && styles.teamNameWinner]}
          numberOfLines={1}
        >
          {match.homeTeam.name}
        </Text>
        {!isScheduled && (
          <Text style={[styles.score, isFinished && match.homeScore > match.awayScore && styles.scoreWinner]}>
            {match.homeScore}
          </Text>
        )}
      </View>

      {/* Away team row */}
      <View style={styles.teamRow}>
        <TeamBadge name={match.awayTeam.name} />
        <Text
          style={[styles.teamName, isFinished && match.awayScore > match.homeScore && styles.teamNameWinner]}
          numberOfLines={1}
        >
          {match.awayTeam.name}
        </Text>
        {!isScheduled && (
          <Text style={[styles.score, isFinished && match.awayScore > match.homeScore && styles.scoreWinner]}>
            {match.awayScore}
          </Text>
        )}
      </View>

      {/* Status column (absolute right) */}
      <View style={styles.statusCol}>
        {isLive && (
          <View style={styles.liveWrap}>
            <LivePulse />
            <Text style={styles.liveMin}>{match.minute ?? match.time}'</Text>
          </View>
        )}
        {isFinished && <Text style={styles.ftText}>FT</Text>}
        {isScheduled && <Text style={styles.timeText}>{match.time}</Text>}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    paddingLeft: 14,
    paddingRight: 58,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    position: 'relative',
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  teamBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamInitials: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  teamName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    letterSpacing: -0.1,
  },
  teamNameWinner: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  score: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    width: 18,
    textAlign: 'center',
  },
  scoreWinner: {
    color: colors.textPrimary,
  },
  statusCol: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveWrap: { alignItems: 'center', gap: 3 },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.live,
  },
  liveMin: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.live,
  },
  ftText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textTertiary,
    letterSpacing: 0.5,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
