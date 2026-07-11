import { ChevronRight as SharedChevron } from './ChevronRight';
import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { Image } from 'expo-image';
import { useThemeColors } from '../theme/useTheme';
import type { Match } from '../data/types';
import type { LeagueWithMatches } from '../services/sportsApi';
import { MatchCard } from './MatchCard';
import { getLeagueDisplayName, getLeagueDisplayFlag, isCopyrightSensitiveLeague } from '../config/leagues';
import { isImageUri } from '../utils/imageUri';

/** Renders a league flag — Image if URL, Text if emoji */
const LeagueFlag = ({ logo, size = 18 }: { logo: string; size?: number }) => {
  const isUrl = isImageUri(logo);
  if (isUrl) {
    return (
      <Image
        source={{ uri: logo }}
        style={{ width: size, height: size, borderRadius: 2 }}
        contentFit="contain"
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

// Tope de revelado progresivo por sección (ver comentario en el render).
const CAP_THRESHOLD = 15; // más de esto → se corta
const CAP_INITIAL = 10;   // primeras visibles
const CAP_STEP = 20;      // cuánto agrega cada "Ver más"

export const LeagueSection: React.FC<LeagueSectionProps> = ({ league, onMatchPress, onLeaguePress, index = 0 }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const hasLive = league.matches.some(m => m.status === 'live');
  const [visibleCount, setVisibleCount] = useState(CAP_INITIAL);

  // Resolve display name + flag using the centralised helpers. For
  // trademark-sensitive leagues (e.g. WC 2026) these return the curated
  // config values; for everything else they pass through SportMonks' data.
  const displayName = getLeagueDisplayName(league.id, league.name);
  const fallbackLogo = league.logo || LEAGUE_FLAGS[league.id] || '🏆';
  const flag = getLeagueDisplayFlag(league.id, fallbackLogo);

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
  const ChevronRightRow = () => <SharedChevron color={c.textTertiary} size={15} />;

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
        <ChevronRightRow />
      </TouchableOpacity>

      {/* Matches — secciones gigantes (amistosos: 100+ partidos el mismo día)
          se revelan por partes: primeras 10, botón "Ver más" suma 20 por tap.
          Solo aplica cuando la sección pasa de 15 (reporte del dueño, 4 jul
          2026: la lista inmensa "se llega a ver mal"). */}
      {(league.matches.length > CAP_THRESHOLD
        ? league.matches.slice(0, visibleCount)
        : league.matches
      ).map((match) => (
        <MatchCard key={match.id} match={match} onPress={onMatchPress} />
      ))}
      {league.matches.length > CAP_THRESHOLD && visibleCount < league.matches.length && (
        <TouchableOpacity
          style={[s.showMoreBtn, { borderTopColor: c.border }]}
          activeOpacity={0.7}
          onPress={() => setVisibleCount(n => n + CAP_STEP)}
        >
          <Text style={[s.showMoreText, { color: c.accent }]}>
            {t('league.showMoreMatches', { count: league.matches.length - visibleCount })}
          </Text>
        </TouchableOpacity>
      )}
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
  showMoreBtn: {
    borderTopWidth: 1,
    paddingVertical: 13,
    alignItems: 'center',
  },
  showMoreText: {
    fontSize: 13,
    fontWeight: '700',
  },
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
