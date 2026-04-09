import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeColors } from '../theme/useTheme';
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

export const LeagueSection: React.FC<LeagueSectionProps> = ({ league, onMatchPress }) => {
  const c = useThemeColors();
  const hasLive = league.matches.some(m => m.status === 'live');
  const flag = LEAGUE_FLAGS[league.id] ?? '🏆';

  // Chevron ">" icon
  const ChevronRight = () => (
    <View style={s.chevron}>
      <View style={[s.chevronLine1, { backgroundColor: c.textTertiary }]} />
      <View style={[s.chevronLine2, { backgroundColor: c.textTertiary }]} />
    </View>
  );

  return (
    <View style={[s.card, { backgroundColor: c.card }]}>
      {/* Header */}
      <TouchableOpacity style={[s.header, { backgroundColor: c.surface, borderBottomColor: c.border }]} activeOpacity={0.7}>
        <Text style={s.flag}>{flag}</Text>
        <Text style={[s.leagueName, { color: c.textSecondary }]}>{league.name}</Text>
        {hasLive && (
          <View style={s.liveBadge}>
            <View style={[s.liveDot, { backgroundColor: c.live }]} />
            <Text style={[s.liveText, { color: c.live }]}>EN VIVO</Text>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  flag: { fontSize: 16 },
  leagueName: {
    fontSize: 12,
    fontWeight: '600',
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
  },
  liveText: {
    fontSize: 9,
    fontWeight: '800',
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
    borderRadius: 1,
    transform: [{ rotate: '45deg' }, { translateY: -2 }],
  },
  chevronLine2: {
    position: 'absolute',
    width: 6,
    height: 1.5,
    borderRadius: 1,
    transform: [{ rotate: '-45deg' }, { translateY: 2 }],
  },
});
