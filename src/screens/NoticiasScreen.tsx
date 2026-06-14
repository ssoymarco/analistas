import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Image, RefreshControl,
} from 'react-native';
import { haptics } from '../utils/haptics';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useThemeColors } from '../theme/useTheme';
import { useDarkMode } from '../contexts/DarkModeContext';
import { SkeletonNoticias } from '../components/Skeleton';
import { ScreenHeader } from '../components/ScreenHeader';
import { SearchIcon } from '../components/NavIcons';
import { SectionHeader } from '../components/SectionHeader';
import { CategoryTabs } from '../components/CategoryTabs';
import { radius, ui } from '../theme/tokens';
import { getNews } from '../services/sportsApi';
import type { NewsArticle } from '../data/types';
import type { NoticiasStackParamList } from '../navigation/AppNavigator';
import { normalize } from '../utils/normalize';
import { useTranslation } from 'react-i18next';
import { PlaceholderBannerAd } from '../components/PlaceholderBannerAd';
import { BETTING_CONTENT_ENABLED } from '../config/features';

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
const TABS: { id: Tab; labelKey: string; emoji: string }[] = [
  { id: 'para-ti',   labelKey: 'news.forYou',    emoji: '⭐' },
  { id: 'siguiendo', labelKey: 'news.following',  emoji: '📻' },
  { id: 'ultimas',   labelKey: 'news.latest',     emoji: '🔥' },
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
  const { t } = useTranslation();
  const isRecent = (article.timeAgo ?? 999) <= 90;
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <AnimatedPressable
      style={[styles.heroCard, { backgroundColor: c.card }]}
      onPress={onPress}
      scaleValue={0.97}
      haptic="light"
    >
      {/* Hero image */}
      <View style={styles.heroImage}>
        {article.image && !imgFailed ? (
          <Image
            source={{ uri: article.image }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: leagueColor(article.category) + '33', alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={styles.heroImageEmoji}>⚽</Text>
          </View>
        )}
        {/* Dark gradient overlay for readability */}
        <View style={styles.heroOverlay} />
      </View>
      {/* Content */}
      <View style={styles.heroContent}>
        <View style={styles.heroMeta}>
          <LeagueBadge category={article.category} />
          {isRecent && (
            <View style={styles.breakingPill}>
              <Text style={styles.breakingText}>{t('news.breakingNow')}</Text>
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
    </AnimatedPressable>
  );
}

// ── Story card (horizontal scroll) ───────────────────────────────────────────
function StoryCard({ article, onPress, c }: { article: NewsArticle; onPress: () => void; c: ReturnType<typeof useThemeColors> }) {
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <TouchableOpacity style={[styles.storyCard, { backgroundColor: c.card, borderColor: c.border }]} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.storyImage}>
        {article.image && !imgFailed ? (
          <Image
            source={{ uri: article.image }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: leagueColor(article.category) + '33', alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={styles.storyImageEmoji}>⚽</Text>
          </View>
        )}
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
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <TouchableOpacity style={[styles.articleRow, { borderBottomColor: c.border }]} onPress={onPress} activeOpacity={0.75}>
      {/* Thumbnail */}
      <View style={styles.thumbnail}>
        {article.image && !imgFailed ? (
          <Image
            source={{ uri: article.image }}
            style={[StyleSheet.absoluteFill, { borderRadius: 10 }]}
            resizeMode="cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { borderRadius: 10, backgroundColor: leagueColor(article.category) + '33', alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={styles.thumbnailEmoji}>⚽</Text>
          </View>
        )}
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

// ── Main screen ───────────────────────────────────────────────────────────────
export const NoticiasScreen: React.FC = () => {
  const { t } = useTranslation();
  const c = useThemeColors();
  const { isDark } = useDarkMode();
  const navigation = useNavigation<NativeStackNavigationProp<NoticiasStackParamList>>();
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('para-ti');
  const [searchQuery, setSearchQuery] = useState('');
  // showSearch removed — search bar is always visible below tabs

  const loadNews = useCallback(async () => {
    try {
      const data = await getNews();
      setNews(data);
    } catch {
      // silently fail — keep existing data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadNews(); }, [loadNews]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadNews();
  }, [loadNews]);

  const filtered = useMemo(() => {
    let base = news;
    if (activeTab !== 'ultimas') {
      base = base.filter(n => n.sections?.includes(activeTab));
    }
    if (searchQuery.trim()) {
      const q = normalize(searchQuery);
      base = base.filter(n =>
        normalize(n.title).includes(q) ||
        normalize(n.category).includes(q) ||
        normalize(n.source).includes(q),
      );
    }
    return base;
  }, [activeTab, searchQuery, news]);

  const hero = filtered[0];
  const stories = filtered.slice(1, 4);
  const rest = filtered.slice(4);

  const handlePress = useCallback((article: NewsArticle) => {
    navigation.navigate('NewsDetail', { article });
  }, [navigation]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.bg }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header — unified (see ScreenHeader) */}
      <ScreenHeader
        icon="📰"
        iconBg="rgba(59,130,246,0.15)"
        title={t('news.title')}
      />

      {/* Tabs — unified CategoryTabs (see CategoryTabs.tsx) */}
      <CategoryTabs<Tab>
        tabs={TABS.map(tab => ({
          key: tab.id,
          label: t(tab.labelKey),
          emoji: tab.emoji,
        }))}
        activeKey={activeTab}
        onChange={setActiveTab}
        layout="fill"
      />

      {/* Search bar — same markup as FavoritosScreen for pixel parity */}
      <View style={styles.searchWrap}>
        <View style={[styles.searchBar, { backgroundColor: c.surface, borderColor: c.border }]}>
          <SearchIcon color={c.textTertiary} size={16} />
          <TextInput
            style={[styles.searchInput, { color: c.textPrimary }]}
            placeholder={t('news.searchPlaceholder')}
            placeholderTextColor={c.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
              <Text style={[styles.searchClear, { color: c.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={c.accent} />
        }
      >
        {loading ? (
          <View style={{ paddingTop: 8 }}>
            <SkeletonNoticias />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📰</Text>
            <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>{t('news.noNews')}</Text>
            <Text style={[styles.emptySubtitle, { color: c.textSecondary }]}>{t('news.tryAnotherSearch')}</Text>
          </View>
        ) : (
          <>
            {/* Hero */}
            {hero && (
              <View style={styles.section}>
                <HeroCard article={hero} onPress={() => handlePress(hero)} c={c} />
              </View>
            )}

            {/* Caliente banner — gated off for v1.0 (no agreement + Apple 2.3.6) */}
            {BETTING_CONTENT_ENABLED && <PlaceholderBannerAd variant="caliente-banner" />}

            {/* Stories horizontal scroll */}
            {stories.length > 0 && (
              <View style={styles.section}>
                <SectionHeader label={t('news.moreNews')} icon="📌" line paddingHorizontal={16} />
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
                <SectionHeader label={t('news.allNews')} icon="📋" line paddingHorizontal={16} />
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

  // Search — structure mirrors FavoritosScreen so the two search bars look
  // pixel-identical: same paddingHorizontal, same icon→text `gap`, same
  // input height and font.
  searchWrap: { paddingHorizontal: 16, marginBottom: 8 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: radius.md, paddingHorizontal: 12, height: ui.searchBarHeight,
    borderWidth: 1, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  searchClear: { fontSize: 13, fontWeight: '600' },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 4 },
  section: { marginBottom: 8 },

  // Hero card
  heroCard: {
    marginHorizontal: 16, borderRadius: radius.xxl, overflow: 'hidden',
  },
  heroImage: {
    height: 220, width: '100%', overflow: 'hidden',
  },
  heroImageEmoji: { fontSize: 48 },
  heroOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 120,
    backgroundColor: 'rgba(0,0,0,0.45)',
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

  // Story cards
  storiesScroll: { paddingHorizontal: 16, gap: 12 },
  storyCard: {
    width: 180, borderRadius: radius.xl, overflow: 'hidden',
    borderWidth: 1,
  },
  storyImage: {
    height: 100, overflow: 'hidden',
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
    marginHorizontal: 16, borderRadius: radius.xl, overflow: 'hidden',
    borderWidth: 1,
  },
  articleRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, gap: 12,
    borderBottomWidth: 1,
  },
  thumbnail: {
    width: 80, height: 64, borderRadius: 10, overflow: 'hidden',
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
