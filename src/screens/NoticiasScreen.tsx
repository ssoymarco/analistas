import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, FlatList, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useThemeColors } from '../theme/useTheme';
import { useDarkMode } from '../contexts/DarkModeContext';
import type { NewsArticle } from '../data/types';

// TODO: replace with real news API
const news: NewsArticle[] = [];

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── League color map ──────────────────────────────────────────────────────────
const LEAGUE_COLORS: Record<string, string> = {
  'Premier League':   '#7C3AED',
  'La Liga':          '#EA580C',
  'Liga MX':          '#16A34A',
  'Bundesliga':       '#DC2626',
  'Serie A':          '#2563EB',
  'Ligue 1':          '#0891B2',
  'Champions League': '#CA8A04',
};

function leagueColor(category: string) {
  return LEAGUE_COLORS[category] ?? '#3B82F6';
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
type Tab = 'para-ti' | 'siguiendo' | 'ultimas';
const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: 'para-ti',   label: 'Para ti',   emoji: '⭐' },
  { id: 'siguiendo', label: 'Siguiendo', emoji: '📻' },
  { id: 'ultimas',   label: 'Últimas',   emoji: '🔥' },
];

// ── League badge ──────────────────────────────────────────────────────────────
function LeagueBadge({ category }: { category: string }) {
  const accent = leagueColor(category);
  return (
    <View style={[styles.badge, { backgroundColor: accent + '22' }]}>
      <View style={[styles.badgeDot, { backgroundColor: accent }]} />
      <Text style={[styles.badgeText, { color: accent }]}>{category}</Text>
    </View>
  );
}

// ── Hero card (featured article) ──────────────────────────────────────────────
function HeroCard({ article, onPress, c }: { article: NewsArticle; onPress: () => void; c: ReturnType<typeof useThemeColors> }) {
  const isRecent = (article.timeAgo ?? 999) <= 90;
  return (
    <TouchableOpacity
      style={[styles.heroCard, { backgroundColor: c.card }]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      {/* Gradient overlay */}
      <View style={styles.heroGradient} />
      {/* Image placeholder with color */}
      <View style={[styles.heroImage, { backgroundColor: leagueColor(article.category) + '33' }]}>
        <Text style={styles.heroImageEmoji}>⚽</Text>
      </View>
      {/* Content */}
      <View style={styles.heroContent}>
        <View style={styles.heroMeta}>
          <LeagueBadge category={article.category} />
          {isRecent && (
            <View style={styles.breakingPill}>
              <Text style={styles.breakingText}>⚡ AHORA</Text>
            </View>
          )}
        </View>
        <Text style={[styles.heroTitle, { color: c.textPrimary }]} numberOfLines={2}>{article.title}</Text>
        <Text style={[styles.heroSummary, { color: c.textSecondary }]} numberOfLines={1}>{article.summary}</Text>
        <View style={styles.heroFooter}>
          <View style={[styles.sourceAvatar, { backgroundColor: c.borderLight }]}>
            <Text style={[styles.sourceAvatarText, { color: c.textPrimary }]}>{article.source.charAt(0)}</Text>
          </View>
          <Text style={[styles.heroSource, { color: c.textSecondary }]}>{article.source}</Text>
          <Text style={[styles.heroDot, { color: c.textTertiary }]}>·</Text>
          <Text style={[styles.heroTime, { color: c.textTertiary }]}>{article.time}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Story card (horizontal scroll) ───────────────────────────────────────────
function StoryCard({ article, onPress, c }: { article: NewsArticle; onPress: () => void; c: ReturnType<typeof useThemeColors> }) {
  return (
    <TouchableOpacity style={[styles.storyCard, { backgroundColor: c.card, borderColor: c.border }]} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.storyImage, { backgroundColor: leagueColor(article.category) + '33' }]}>
        <Text style={styles.storyImageEmoji}>⚽</Text>
      </View>
      <View style={styles.storyBody}>
        <LeagueBadge category={article.category} />
        <Text style={[styles.storyTitle, { color: c.textPrimary }]} numberOfLines={2}>{article.title}</Text>
        <View style={styles.storyFooter}>
          <Text style={[styles.storySource, { color: c.textSecondary }]}>{article.source}</Text>
          <Text style={[styles.storyDot, { color: c.textTertiary }]}>·</Text>
          <Text style={[styles.storyTime, { color: c.textTertiary }]}>{article.time}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Article row (list) ────────────────────────────────────────────────────────
function ArticleRow({ article, onPress, c }: { article: NewsArticle; onPress: () => void; c: ReturnType<typeof useThemeColors> }) {
  const isRecent = (article.timeAgo ?? 999) <= 60;
  return (
    <TouchableOpacity style={[styles.articleRow, { borderBottomColor: c.border }]} onPress={onPress} activeOpacity={0.75}>
      {/* Thumbnail */}
      <View style={[styles.thumbnail, { backgroundColor: leagueColor(article.category) + '33' }]}>
        <Text style={styles.thumbnailEmoji}>⚽</Text>
        {isRecent && <View style={[styles.liveIndicator, { backgroundColor: c.live }]} />}
      </View>
      {/* Text */}
      <View style={styles.articleText}>
        <LeagueBadge category={article.category} />
        <Text style={[styles.articleTitle, { color: c.textPrimary }]} numberOfLines={2}>{article.title}</Text>
        <View style={styles.articleMeta}>
          <Text style={[styles.articleSource, { color: c.textSecondary }]}>{article.source}</Text>
          <Text style={[styles.articleDot, { color: c.textTertiary }]}>·</Text>
          <Text style={[styles.articleTime, { color: c.textTertiary }]}>{article.time}</Text>
        </View>
      </View>
      <Text style={[styles.articleChevron, { color: c.textTertiary }]}>›</Text>
    </TouchableOpacity>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ label, emoji, c }: { label: string; emoji?: string; c: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={styles.sectionLabel}>
      {emoji && <Text style={styles.sectionEmoji}>{emoji}</Text>}
      <Text style={[styles.sectionText, { color: c.textTertiary }]}>{label}</Text>
      <View style={[styles.sectionLine, { backgroundColor: c.border }]} />
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export const NoticiasScreen: React.FC = () => {
  const c = useThemeColors();
  const { isDark } = useDarkMode();
  const [activeTab, setActiveTab] = useState<Tab>('para-ti');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const filtered = useMemo(() => {
    let base = news;
    if (activeTab !== 'ultimas') {
      base = base.filter(n => n.sections?.includes(activeTab));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      base = base.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.category.toLowerCase().includes(q) ||
        n.source.toLowerCase().includes(q),
      );
    }
    return base;
  }, [activeTab, searchQuery]);

  const hero = filtered[0];
  const stories = filtered.slice(1, 4);
  const rest = filtered.slice(4);

  const handlePress = (_article: NewsArticle) => {
    // TODO: navigate to NewsDetail screen
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.bg }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <View style={styles.header}>
        {showSearch ? (
          <View style={[styles.searchBar, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={[styles.searchInput, { color: c.textPrimary }]}
              placeholder="Buscar noticias..."
              placeholderTextColor={c.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            <TouchableOpacity onPress={() => { setShowSearch(false); setSearchQuery(''); }}>
              <Text style={[styles.searchClose, { color: c.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={[styles.title, { color: c.textPrimary }]}>Noticias</Text>
            <TouchableOpacity onPress={() => setShowSearch(true)} style={styles.headerIcon}>
              <Text style={styles.headerIconText}>🔍</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[
                styles.tab,
                { backgroundColor: c.surface, borderColor: c.border },
                active && { backgroundColor: c.textPrimary, borderColor: c.textPrimary },
              ]}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.tabEmoji}>{tab.emoji}</Text>
              <Text style={[styles.tabLabel, { color: c.textSecondary }, active && { color: c.bg }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📰</Text>
            <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>Sin noticias</Text>
            <Text style={[styles.emptySubtitle, { color: c.textSecondary }]}>Prueba con otra búsqueda</Text>
          </View>
        ) : (
          <>
            {/* Hero */}
            {hero && (
              <View style={styles.section}>
                <HeroCard article={hero} onPress={() => handlePress(hero)} c={c} />
              </View>
            )}

            {/* Stories horizontal scroll */}
            {stories.length > 0 && (
              <View style={styles.section}>
                <SectionLabel label="MÁS NOTICIAS" emoji="📌" c={c} />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.storiesScroll}
                >
                  {stories.map(a => (
                    <StoryCard key={a.id} article={a} onPress={() => handlePress(a)} c={c} />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Article list */}
            {rest.length > 0 && (
              <View style={[styles.section, styles.articleList, { backgroundColor: c.card, borderColor: c.border }]}>
                <SectionLabel label="TODAS LAS NOTICIAS" emoji="📋" c={c} />
                {rest.map(a => (
                  <ArticleRow key={a.id} article={a} onPress={() => handlePress(a)} c={c} />
                ))}
              </View>
            )}
          </>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10,
  },
  title: {
    fontSize: 28, fontWeight: '800', letterSpacing: -0.8,
  },
  headerIcon: { padding: 6 },
  headerIconText: { fontSize: 20 },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, paddingHorizontal: 12, height: 40,
    borderWidth: 1,
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14 },
  searchClose: { fontSize: 14, paddingLeft: 8 },

  // Tabs
  tabBar: {
    flexDirection: 'row', paddingHorizontal: 16, gap: 8, paddingBottom: 10,
  },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1,
  },
  tabEmoji: { fontSize: 12 },
  tabLabel: { fontSize: 13, fontWeight: '600' },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 4 },
  section: { marginBottom: 8 },

  // Hero card
  heroCard: {
    marginHorizontal: 16, borderRadius: 20, overflow: 'hidden',
  },
  heroImage: {
    height: 220, width: '100%', alignItems: 'center', justifyContent: 'center',
  },
  heroImageEmoji: { fontSize: 48 },
  heroGradient: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 160,
    backgroundColor: 'transparent',
  },
  heroContent: { padding: 16, paddingTop: 12 },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  heroTitle: {
    fontSize: 18, fontWeight: '800',
    letterSpacing: -0.3, lineHeight: 24, marginBottom: 6,
  },
  heroSummary: {
    fontSize: 13, lineHeight: 18, marginBottom: 10,
  },
  heroFooter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sourceAvatar: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  sourceAvatarText: { fontSize: 9, fontWeight: '800' },
  heroSource: { fontSize: 11, fontWeight: '600' },
  heroDot: { fontSize: 10 },
  heroTime: { fontSize: 11 },

  // Breaking pill
  breakingPill: {
    backgroundColor: '#FF453A22', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  breakingText: { fontSize: 9, fontWeight: '800', color: '#FF453A' },

  // Badge
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start',
  },
  badgeDot: { width: 5, height: 5, borderRadius: 3 },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },

  // Section label
  sectionLabel: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, marginBottom: 10, marginTop: 4,
  },
  sectionEmoji: { fontSize: 13 },
  sectionText: {
    fontSize: 10, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase',
  },
  sectionLine: { flex: 1, height: 1 },

  // Story cards
  storiesScroll: { paddingHorizontal: 16, gap: 12 },
  storyCard: {
    width: 180, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1,
  },
  storyImage: {
    height: 100, alignItems: 'center', justifyContent: 'center',
  },
  storyImageEmoji: { fontSize: 32 },
  storyBody: { padding: 10, gap: 6 },
  storyTitle: {
    fontSize: 13, fontWeight: '700', lineHeight: 18,
  },
  storyFooter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  storySource: { fontSize: 10, fontWeight: '600' },
  storyDot: { fontSize: 9 },
  storyTime: { fontSize: 10 },

  // Article rows
  articleList: {
    marginHorizontal: 16, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1,
  },
  articleRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, gap: 12,
    borderBottomWidth: 1,
  },
  thumbnail: {
    width: 80, height: 64, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  thumbnailEmoji: { fontSize: 24 },
  liveIndicator: {
    position: 'absolute', top: 6, left: 6,
    width: 8, height: 8, borderRadius: 4,
  },
  articleText: { flex: 1, gap: 5 },
  articleTitle: {
    fontSize: 13, fontWeight: '650' as any, lineHeight: 18,
  },
  articleMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  articleSource: { fontSize: 10, fontWeight: '600' },
  articleDot: { fontSize: 9 },
  articleTime: { fontSize: 10 },
  articleChevron: { fontSize: 20 },

  // Empty state
  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingTop: 80, gap: 12,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptySubtitle: { fontSize: 14 },
});
