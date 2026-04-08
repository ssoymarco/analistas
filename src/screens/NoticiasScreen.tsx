import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, FlatList, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../theme/colors';
import { news } from '../data/mockData';
import type { NewsArticle } from '../data/types';

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
function HeroCard({ article, onPress }: { article: NewsArticle; onPress: () => void }) {
  const isRecent = (article.timeAgo ?? 999) <= 90;
  return (
    <TouchableOpacity
      style={styles.heroCard}
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
        <Text style={styles.heroTitle} numberOfLines={2}>{article.title}</Text>
        <Text style={styles.heroSummary} numberOfLines={1}>{article.summary}</Text>
        <View style={styles.heroFooter}>
          <View style={styles.sourceAvatar}>
            <Text style={styles.sourceAvatarText}>{article.source.charAt(0)}</Text>
          </View>
          <Text style={styles.heroSource}>{article.source}</Text>
          <Text style={styles.heroDot}>·</Text>
          <Text style={styles.heroTime}>{article.time}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Story card (horizontal scroll) ───────────────────────────────────────────
function StoryCard({ article, onPress }: { article: NewsArticle; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.storyCard} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.storyImage, { backgroundColor: leagueColor(article.category) + '33' }]}>
        <Text style={styles.storyImageEmoji}>⚽</Text>
      </View>
      <View style={styles.storyBody}>
        <LeagueBadge category={article.category} />
        <Text style={styles.storyTitle} numberOfLines={2}>{article.title}</Text>
        <View style={styles.storyFooter}>
          <Text style={styles.storySource}>{article.source}</Text>
          <Text style={styles.storyDot}>·</Text>
          <Text style={styles.storyTime}>{article.time}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Article row (list) ────────────────────────────────────────────────────────
function ArticleRow({ article, onPress }: { article: NewsArticle; onPress: () => void }) {
  const isRecent = (article.timeAgo ?? 999) <= 60;
  return (
    <TouchableOpacity style={styles.articleRow} onPress={onPress} activeOpacity={0.75}>
      {/* Thumbnail */}
      <View style={[styles.thumbnail, { backgroundColor: leagueColor(article.category) + '33' }]}>
        <Text style={styles.thumbnailEmoji}>⚽</Text>
        {isRecent && <View style={styles.liveIndicator} />}
      </View>
      {/* Text */}
      <View style={styles.articleText}>
        <LeagueBadge category={article.category} />
        <Text style={styles.articleTitle} numberOfLines={2}>{article.title}</Text>
        <View style={styles.articleMeta}>
          <Text style={styles.articleSource}>{article.source}</Text>
          <Text style={styles.articleDot}>·</Text>
          <Text style={styles.articleTime}>{article.time}</Text>
        </View>
      </View>
      <Text style={styles.articleChevron}>›</Text>
    </TouchableOpacity>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ label, emoji }: { label: string; emoji?: string }) {
  return (
    <View style={styles.sectionLabel}>
      {emoji && <Text style={styles.sectionEmoji}>{emoji}</Text>}
      <Text style={styles.sectionText}>{label}</Text>
      <View style={styles.sectionLine} />
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export const NoticiasScreen: React.FC = () => {
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
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        {showSearch ? (
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar noticias..."
              placeholderTextColor={colors.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            <TouchableOpacity onPress={() => { setShowSearch(false); setSearchQuery(''); }}>
              <Text style={styles.searchClose}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.title}>Noticias</Text>
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
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.tabEmoji}>{tab.emoji}</Text>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
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
            <Text style={styles.emptyTitle}>Sin noticias</Text>
            <Text style={styles.emptySubtitle}>Prueba con otra búsqueda</Text>
          </View>
        ) : (
          <>
            {/* Hero */}
            {hero && (
              <View style={styles.section}>
                <HeroCard article={hero} onPress={() => handlePress(hero)} />
              </View>
            )}

            {/* Stories horizontal scroll */}
            {stories.length > 0 && (
              <View style={styles.section}>
                <SectionLabel label="MÁS NOTICIAS" emoji="📌" />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.storiesScroll}
                >
                  {stories.map(a => (
                    <StoryCard key={a.id} article={a} onPress={() => handlePress(a)} />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Article list */}
            {rest.length > 0 && (
              <View style={[styles.section, styles.articleList]}>
                <SectionLabel label="TODAS LAS NOTICIAS" emoji="📋" />
                {rest.map(a => (
                  <ArticleRow key={a.id} article={a} onPress={() => handlePress(a)} />
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
  safeArea: { flex: 1, backgroundColor: colors.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10,
  },
  title: {
    fontSize: 28, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.8,
  },
  headerIcon: { padding: 6 },
  headerIconText: { fontSize: 20 },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12, paddingHorizontal: 12, height: 40,
    borderWidth: 1, borderColor: colors.border,
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 14 },
  searchClose: { fontSize: 14, color: colors.textSecondary, paddingLeft: 8 },

  // Tabs
  tabBar: {
    flexDirection: 'row', paddingHorizontal: 16, gap: 8, paddingBottom: 10,
  },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.textPrimary, borderColor: colors.textPrimary,
  },
  tabEmoji: { fontSize: 12 },
  tabLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  tabLabelActive: { color: colors.bg },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 4 },
  section: { marginBottom: 8 },

  // Hero card
  heroCard: {
    marginHorizontal: 16, borderRadius: 20, overflow: 'hidden',
    backgroundColor: colors.card,
  },
  heroImage: {
    height: 220, width: '100%', alignItems: 'center', justifyContent: 'center',
  },
  heroImageEmoji: { fontSize: 48 },
  heroGradient: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 160,
    backgroundColor: 'transparent',
    // simulate gradient with a semi-transparent overlay
  },
  heroContent: { padding: 16, paddingTop: 12 },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  heroTitle: {
    fontSize: 18, fontWeight: '800', color: colors.textPrimary,
    letterSpacing: -0.3, lineHeight: 24, marginBottom: 6,
  },
  heroSummary: {
    fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: 10,
  },
  heroFooter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sourceAvatar: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.borderLight, alignItems: 'center', justifyContent: 'center',
  },
  sourceAvatarText: { fontSize: 9, fontWeight: '800', color: colors.textPrimary },
  heroSource: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  heroDot: { fontSize: 10, color: colors.textTertiary },
  heroTime: { fontSize: 11, color: colors.textTertiary },

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
    fontSize: 10, fontWeight: '700', color: colors.textTertiary,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  sectionLine: { flex: 1, height: 1, backgroundColor: colors.border },

  // Story cards
  storiesScroll: { paddingHorizontal: 16, gap: 12 },
  storyCard: {
    width: 180, backgroundColor: colors.card,
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border,
  },
  storyImage: {
    height: 100, alignItems: 'center', justifyContent: 'center',
  },
  storyImageEmoji: { fontSize: 32 },
  storyBody: { padding: 10, gap: 6 },
  storyTitle: {
    fontSize: 13, fontWeight: '700', color: colors.textPrimary, lineHeight: 18,
  },
  storyFooter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  storySource: { fontSize: 10, fontWeight: '600', color: colors.textSecondary },
  storyDot: { fontSize: 9, color: colors.textTertiary },
  storyTime: { fontSize: 10, color: colors.textTertiary },

  // Article rows
  articleList: {
    backgroundColor: colors.card, marginHorizontal: 16,
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border,
  },
  articleRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, gap: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  thumbnail: {
    width: 80, height: 64, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  thumbnailEmoji: { fontSize: 24 },
  liveIndicator: {
    position: 'absolute', top: 6, left: 6,
    width: 8, height: 8, borderRadius: 4, backgroundColor: colors.live,
  },
  articleText: { flex: 1, gap: 5 },
  articleTitle: {
    fontSize: 13, fontWeight: '650' as any, color: colors.textPrimary, lineHeight: 18,
  },
  articleMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  articleSource: { fontSize: 10, fontWeight: '600', color: colors.textSecondary },
  articleDot: { fontSize: 9, color: colors.textTertiary },
  articleTime: { fontSize: 10, color: colors.textTertiary },
  articleChevron: { fontSize: 20, color: colors.textTertiary },

  // Empty state
  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingTop: 80, gap: 12,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  emptySubtitle: { fontSize: 14, color: colors.textSecondary },
});
