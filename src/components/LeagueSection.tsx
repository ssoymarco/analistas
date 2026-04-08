import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { colors } from '../theme/colors';
import type { League, Match } from '../data/mockData';
import { MatchCard } from './MatchCard';

interface LeagueSectionProps {
  league: League;
  onMatchPress?: (match: Match) => void;
}

const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <View style={[styles.chevron, expanded && styles.chevronExpanded]}>
    <View style={styles.chevronLine1} />
    <View style={styles.chevronLine2} />
  </View>
);

const FlagEmoji: Record<string, string> = {
  Inglaterra: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  España: '🇪🇸',
  México: '🇲🇽',
  Europa: '🇪🇺',
};

export const LeagueSection: React.FC<LeagueSectionProps> = ({
  league,
  onMatchPress,
}) => {
  const [expanded, setExpanded] = useState(true);

  const liveMatches = league.matches.filter((m) => m.status === 'live').length;
  const flag = FlagEmoji[league.country] ?? '🏆';

  return (
    <View style={styles.section}>
      {/* League Header */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((prev) => !prev)}
        activeOpacity={0.7}
      >
        <Text style={styles.flag}>{flag}</Text>
        <View style={styles.headerInfo}>
          <Text style={styles.leagueName}>{league.name}</Text>
          <Text style={styles.countryName}>{league.country}</Text>
        </View>
        {liveMatches > 0 && (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeText}>{liveMatches} en vivo</Text>
          </View>
        )}
        <ChevronIcon expanded={expanded} />
      </TouchableOpacity>

      {/* Matches */}
      {expanded && (
        <View style={styles.matchesList}>
          {league.matches.map((match, index) => (
            <View key={match.id}>
              <MatchCard match={match} onPress={onMatchPress} />
              {index < league.matches.length - 1 && (
                <View style={styles.matchDivider} />
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginBottom: 8,
    overflow: 'hidden',
    borderRadius: 12,
    marginHorizontal: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.leagueHeaderBg,
    gap: 10,
  },
  flag: {
    fontSize: 20,
  },
  headerInfo: {
    flex: 1,
    gap: 1,
  },
  leagueName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  countryName: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '400',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.liveDim,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.live,
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.live,
  },
  chevron: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronExpanded: {
    transform: [{ rotate: '180deg' }],
  },
  chevronLine1: {
    position: 'absolute',
    width: 7,
    height: 1.5,
    backgroundColor: colors.textSecondary,
    borderRadius: 1,
    transform: [{ rotate: '-45deg' }, { translateX: -2 }],
  },
  chevronLine2: {
    position: 'absolute',
    width: 7,
    height: 1.5,
    backgroundColor: colors.textSecondary,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }, { translateX: 2 }],
  },
  matchesList: {},
  matchDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
  },
});
