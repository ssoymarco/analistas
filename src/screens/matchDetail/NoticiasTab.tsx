// ── Noticias Tab — placeholder for match-related news ────────────────────────
import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useThemeColors } from '../../theme/useTheme';
import type { Match, MatchDetail } from '../../data/types';

// ── Placeholder news data ───────────────────────────────────────────────────
const PLACEHOLDER_NEWS = [
  {
    id: '1',
    image: 'https://images.unsplash.com/photo-1508098682722-e99c643e7f0c?w=300&h=180&fit=crop',
    league: 'Premier League',
    title: 'Análisis táctico previo al encuentro',
    source: 'Analistas',
    timeAgo: 'Hace 2h',
  },
  {
    id: '2',
    image: 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=300&h=180&fit=crop',
    league: 'Premier League',
    title: 'Últimas noticias del mercado de fichajes',
    source: 'Analistas',
    timeAgo: 'Hace 3h',
  },
  {
    id: '3',
    image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=300&h=180&fit=crop',
    league: 'Premier League',
    title: 'Lesiones y bajas confirmadas para la jornada',
    source: 'Analistas',
    timeAgo: 'Hace 5h',
  },
];

// ── News card ───────────────────────────────────────────────────────────────
const NewsCard: React.FC<{
  image: string;
  league: string;
  title: string;
  source: string;
  timeAgo: string;
}> = ({ image, league, title, source, timeAgo }) => {
  const c = useThemeColors();

  return (
    <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <Image source={{ uri: image }} style={s.cardImage} />
      <View style={s.cardBody}>
        <Text style={[s.cardLeague, { color: c.accent }]}>{league}</Text>
        <Text style={[s.cardTitle, { color: c.textPrimary }]} numberOfLines={3}>
          {title}
        </Text>
        <Text style={[s.cardMeta, { color: c.textTertiary }]}>
          {source}  ·  {timeAgo}
        </Text>
      </View>
    </View>
  );
};

// ── Main component ──────────────────────────────────────────────────────────
export const NoticiasTab: React.FC<{ match: Match; detail: MatchDetail }> = ({ match }) => {
  const c = useThemeColors();

  return (
    <View style={s.outer}>
      {/* Placeholder info */}
      <View style={[s.infoBanner, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text style={{ fontSize: 16 }}>📰</Text>
        <Text style={[s.infoText, { color: c.textSecondary }]}>
          Noticias relacionadas con {match.homeTeam.shortName} y {match.awayTeam.shortName}
        </Text>
      </View>

      {PLACEHOLDER_NEWS.map(news => (
        <NewsCard
          key={news.id}
          image={news.image}
          league={match.league}
          title={news.title}
          source={news.source}
          timeAgo={news.timeAgo}
        />
      ))}

      <View style={{ height: 16 }} />
    </View>
  );
};

// ── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  outer: { paddingHorizontal: 16, gap: 12 },

  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  infoText: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 18 },

  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: 140,
    backgroundColor: '#1a1d2e',
  },
  cardBody: {
    padding: 14,
    gap: 6,
  },
  cardLeague: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  cardMeta: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
});
