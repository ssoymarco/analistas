import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import type { League, Match } from '../data/mockData';
import { MatchCard } from './MatchCard';

interface LeagueSectionProps {
  league: League;
  onMatchPress?: (match: Match) => void;
}

const LEAGUE_FLAGS: Record<string, string> = {
  'premier-league':   '🇬🇧',
  'la-liga':          '🇪🇸',
  'liga-mx':          '🇲🇽',
  'serie-a':          '🇮🇹',
  'ligue-1':          '🇫🇷',
  'bundesliga':       '🇩🇪',
  'brasileirao':      '🇧🇷',
  'champions-league': '🏆',
};

// Chevron ">" icon
const ChevronRight = () => (
  <View style={s.chevron}>
    <View style={s.chevronLine1} />
    <View style={s.chevronLine2} />
  </View>
);

export const LeagueSection: React.FC<LeagueSectionProps> = ({ league, onMatchPress }) => {
  const hasLive = league.matches.some(m => m.status === 'live');
  const flag = LEAGUE_FLAGS[league.id] ?? '🏆';

  return (
    <View style={s.card}>
      {/* Header */}
      <TouchableOpacity style={s.header} activeOpacity={0.7}>
        <Text style={s.flag}>{flag}</Text>
        <Text style={s.leagueName}>{league.name}</Text>
        {hasLive && (
          <View style={s.liveBadge}>
            <View style={s.liveDot} />
            <Text style={s.liveText}>EN VIVO</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <ChevronRight />
      </TouchableOpacity>

      {/* Matches */}
      {league.matches.map((match) => (
        <MatchCard key={match.id} match={match} onPress={onMatchPress} />
      ))}
    </View>
  );
};

const s = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  flag: { fontSize: 16 },
  leagueName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: -0.1,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 4,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.live,
  },
  liveText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.live,
    letterSpacing: 0.8,
  },
  chevron: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronLine1: {
    position: 'absolute',
    width: 6,
    height: 1.5,
    backgroundColor: colors.textTertiary,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }, { translateY: -2 }],
  },
  chevronLine2: {
    position: 'absolute',
    width: 6,
    height: 1.5,
    backgroundColor: colors.textTertiary,
    borderRadius: 1,
    transform: [{ rotate: '-45deg' }, { translateY: 2 }],
  },
});
