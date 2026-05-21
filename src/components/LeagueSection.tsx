import React, { useRef, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { useThemeColors } from '../theme/useTheme';
import type { Match } from '../data/types';
import type { LeagueWithMatches } from '../services/sportsApi';
import { MatchCard } from './MatchCard';
import { getLeagueConfig } from '../config/leagues';

/**
 * Leagues whose remote logo we must NOT display due to trademark / brand
 * concerns (e.g. the official FIFA World Cup mark). For these we fall back
 * to the flag emoji defined in `src/config/leagues.ts` and use the config
 * name instead of whatever string SportMonks sends ("World Cup" → "Mundial 2026").
 */
const COPYRIGHT_SENSITIVE_LEAGUE_IDS = new Set<string>(['732']);

/** Renders a league flag — Image if URL, Text if emoji */
const LeagueFlag = ({ logo, size = 18 }: { logo: string; size?: number }) => {
  const isUrl = logo.startsWith('http');
  if (isUrl) {
    return (
      <Image
        source={{ uri: logo }}
        style={{ width: size, height: size, borderRadius: 2 }}
        resizeMode="contain"
      />
    );
  }
  return <Text style={{ fontSize: size - 2 }}>{logo}</Text>;
};

interface LeagueSectionProps {
  league: LeagueWithMatches;
  onMatchPress?: (match: Match) => void;
  onLeaguePress?: (league: LeagueWithMatches) => void;
  /** Index in parent list — drives staggered entry animation */
  index?: number;
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

export const LeagueSection: React.FC<LeagueSectionProps> = ({ league, onMatchPress, onLeaguePress, index = 0 }) => {
  const c = useThemeColors();
  const hasLive = league.matches.some(m => m.status === 'live');

  // Resolve display name + flag with trademark-sensitive override.
  // For leagues in COPYRIGHT_SENSITIVE_LEAGUE_IDS (e.g. WC 2026), prefer
  // the curated config (name "Mundial 2026", flag "🌍") over whatever
  // SportMonks supplies ("World Cup", FIFA logo URL).
  const numericId = Number(league.id);
  const cfg = Number.isFinite(numericId) ? getLeagueConfig(numericId) : undefined;
  const isCopyrightSensitive = COPYRIGHT_SENSITIVE_LEAGUE_IDS.has(String(league.id));

  const displayName = (isCopyrightSensitive && cfg?.name) ? cfg.name : league.name;
  const flag = isCopyrightSensitive
    ? (cfg?.flag || '🌍')
    : (league.logo || LEAGUE_FLAGS[league.id] || cfg?.flag || '🏆');

  // ── Staggered entry animation ──────────────────────────────────────────────
  const entryAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(entryAnim, {
      toValue: 1,
      duration: 450,
      delay: index * 80,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const entryStyle = {
    opacity: entryAnim,
    transform: [{
      translateY: entryAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [18, 0],
      }),
    }],
  };

  // Chevron ">" icon
  const ChevronRight = () => (
    <View style={s.chevron}>
      <View style={[s.chevronLine1, { backgroundColor: c.textTertiary }]} />
      <View style={[s.chevronLine2, { backgroundColor: c.textTertiary }]} />
    </View>
  );

  return (
    <Animated.View style={[s.card, { backgroundColor: c.card }, entryStyle]}>
      {/* Header */}
      <TouchableOpacity style={[s.header, { backgroundColor: c.surface, borderBottomColor: c.border }]} activeOpacity={0.7} onPress={() => onLeaguePress?.(league)}>
        <LeagueFlag logo={flag} />
        <Text style={[s.leagueName, { color: c.textSecondary }]}>{displayName}</Text>
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
    </Animated.View>
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
