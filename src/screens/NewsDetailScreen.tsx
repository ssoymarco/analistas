import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Animated, Dimensions, Share, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeColors } from '../theme/useTheme';
import { useUserStats } from '../contexts/UserStatsContext';
import { useDarkMode } from '../contexts/DarkModeContext';
import type { NewsArticle } from '../data/types';
import type { NoticiasStackParamList } from '../navigation/AppNavigator';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Reaction configuration ───────────────────────────────────────────────────
const REACTIONS = [
  { emoji: '\u{1F525}', label: 'Fuego' },      // 🔥
  { emoji: '\u2764\uFE0F', label: 'Me encanta' }, // ❤️
  { emoji: '\u{1F62E}', label: 'Sorprendido' }, // 😮
  { emoji: '\u{1F44F}', label: 'Aplausos' },    // 👏
  { emoji: '\u{1F602}', label: 'Gracioso' },    // 😂
  { emoji: '\u{1F624}', label: 'Enojado' },     // 😤
];

// Generate deterministic base counts per article (mock engagement data)
function getBaseCounts(articleId: string): Record<string, number> {
  let hash = 0;
  for (let i = 0; i < articleId.length; i++) {
    hash = ((hash << 5) - hash) + articleId.charCodeAt(i);
    hash |= 0;
  }
  const counts: Record<string, number> = {};
  REACTIONS.forEach((r, i) => {
    const seed = Math.abs((hash * (i + 1) * 7919) % 300);
    counts[r.emoji] = seed + 12;
  });
  return counts;
}

// ── League accent colors ─────────────────────────────────────────────────────
const LEAGUE_COLORS: Record<string, string> = {
  'Premier League':   '#7C3AED',
  'La Liga':          '#EA580C',
  'Liga MX':          '#16A34A',
  'Bundesliga':       '#DC2626',
  'Serie A':          '#2563EB',
  'Ligue 1':          '#0891B2',
  'Champions League': '#CA8A04',
};
function leagueColor(cat: string) { return LEAGUE_COLORS[cat] ?? '#3B82F6'; }

// ── Back arrow icon ──────────────────────────────────────────────────────────
const BackArrow = ({ color }: { color: string }) => (
  <View style={{ width: 10, height: 18, justifyContent: 'center' }}>
    <View style={{
      width: 10, height: 10, borderLeftWidth: 2.5, borderBottomWidth: 2.5,
      borderColor: color, transform: [{ rotate: '45deg' }], marginLeft: 2,
    }} />
  </View>
);

// ── Share icon ───────────────────────────────────────────────────────────────
const ShareIcon = ({ color }: { color: string }) => (
  <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{
      width: 12, height: 12, borderWidth: 2, borderColor: color,
      borderRadius: 3, borderTopWidth: 0, borderRightWidth: 0,
      transform: [{ rotate: '-45deg' }], marginTop: 4,
    }} />
    <View style={{
      position: 'absolute', top: 1, right: 4,
      width: 2, height: 10, backgroundColor: color, borderRadius: 1,
      transform: [{ rotate: '45deg' }],
    }} />
  </View>
);

// ── Bookmark icon ────────────────────────────────────────────────────────────
const BookmarkIcon = ({ color }: { color: string }) => (
  <View style={{ width: 14, height: 18 }}>
    <View style={{
      width: 14, height: 16, borderWidth: 2, borderColor: color,
      borderBottomWidth: 0, borderTopLeftRadius: 2, borderTopRightRadius: 2,
    }} />
    <View style={{
      width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 6,
      borderLeftColor: color, borderRightColor: color, borderTopColor: color,
      backgroundColor: 'transparent',
      borderBottomColor: 'transparent', marginTop: -1,
      transform: [{ rotate: '180deg' }],
    }} />
  </View>
);

// ── Reading time estimate ────────────────────────────────────────────────────
function estimateReadTime(content?: string): number {
  if (!content) return 1;
  const words = content.split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

// ══════════════════════════════════════════════════════════════════════════════
// ── NewsDetailScreen ─────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export const NewsDetailScreen: React.FC = () => {
  const c = useThemeColors();
  const { isDark } = useDarkMode();
  const navigation = useNavigation<NativeStackNavigationProp<NoticiasStackParamList>>();
  const route = useRoute<RouteProp<NoticiasStackParamList, 'NewsDetail'>>();
  const { article } = route.params;

  const { incrementNewsRead } = useUserStats();
  const accent = leagueColor(article.category);
  const readMins = estimateReadTime(article.content);

  // Track news read (once per unique article)
  useEffect(() => { incrementNewsRead(article.id); }, [article.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const paragraphs = article.content ? article.content.split('\n\n') : [article.summary];

  // ── Scroll-driven animations ───────────────────────────────────────────────
  const scrollY = useRef(new Animated.Value(0)).current;

  const heroScale = scrollY.interpolate({
    inputRange: [-150, 0],
    outputRange: [1.3, 1],
    extrapolateRight: 'clamp',
  });
  const heroTranslateY = scrollY.interpolate({
    inputRange: [-150, 0, 250],
    outputRange: [75, 0, -80],
    extrapolate: 'clamp',
  });
  const headerOpacity = scrollY.interpolate({
    inputRange: [180, 240],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // ── Reaction state ─────────────────────────────────────────────────────────
  const [userReaction, setUserReaction] = useState<string | null>(null);
  const baseCounts = useMemo(() => getBaseCounts(article.id), [article.id]);
  const reactionScales = useRef<Record<string, Animated.Value>>({});

  // Ensure all animated values exist
  REACTIONS.forEach(r => {
    if (!reactionScales.current[r.emoji]) {
      reactionScales.current[r.emoji] = new Animated.Value(1);
    }
  });

  // Load persisted reaction
  useEffect(() => {
    AsyncStorage.getItem(`news_reaction_${article.id}`).then(saved => {
      if (saved) setUserReaction(saved);
    });
  }, [article.id]);

  const handleReaction = useCallback((emoji: string) => {
    if (userReaction === emoji) return; // can't undo — only change

    // Pop animation
    const anim = reactionScales.current[emoji];
    if (anim) {
      Animated.sequence([
        Animated.timing(anim, { toValue: 1.5, duration: 120, useNativeDriver: true }),
        Animated.spring(anim, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]).start();
    }

    // Shrink old selection
    if (userReaction) {
      const old = reactionScales.current[userReaction];
      if (old) {
        Animated.sequence([
          Animated.timing(old, { toValue: 0.85, duration: 80, useNativeDriver: true }),
          Animated.spring(old, { toValue: 1, friction: 4, useNativeDriver: true }),
        ]).start();
      }
    }

    setUserReaction(emoji);
    AsyncStorage.setItem(`news_reaction_${article.id}`, emoji);
  }, [userReaction, article.id]);

  // ── Share ──────────────────────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: `${article.title}\n\nLe\u00EDdo en Analistas \u26BD`,
      });
    } catch { /* user cancelled */ }
  }, [article.title]);

  // ── Total reactions display ────────────────────────────────────────────────
  const totalReactions = useMemo(() => {
    let total = 0;
    REACTIONS.forEach(r => {
      total += baseCounts[r.emoji] + (userReaction === r.emoji ? 1 : 0);
    });
    return total;
  }, [baseCounts, userReaction]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── Sticky header (appears on scroll) ── */}
      <Animated.View style={[
        s.stickyHeader,
        { backgroundColor: c.bg, borderBottomColor: c.border, opacity: headerOpacity },
      ]}>
        <SafeAreaView edges={['top']} style={{ width: '100%' }}>
          <View style={s.stickyHeaderInner}>
            <Text style={[s.stickyTitle, { color: c.textPrimary }]} numberOfLines={1}>
              {article.title}
            </Text>
          </View>
        </SafeAreaView>
      </Animated.View>

      {/* ── Floating nav buttons ── */}
      <SafeAreaView edges={['top']} style={s.floatingNav} pointerEvents="box-none">
        <View style={s.floatingNavRow} pointerEvents="box-none">
          <TouchableOpacity
            style={[s.navBtn, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.85)' }]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <BackArrow color={c.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.navBtn, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.85)' }]}
            onPress={handleShare}
            activeOpacity={0.7}
          >
            <ShareIcon color={c.textPrimary} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* ── Scrollable content ── */}
      <Animated.ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}
      >
        {/* ── Hero image area ── */}
        <Animated.View style={[
          s.heroWrap,
          { backgroundColor: accent + '18', transform: [{ scale: heroScale }, { translateY: heroTranslateY }] },
        ]}>
          <View style={[s.heroGlow, { backgroundColor: accent + '0D' }]} />
          <Text style={s.heroEmoji}>{'\u26BD'}</Text>
          {/* Accent stripe at bottom */}
          <View style={[s.accentStripe, { backgroundColor: accent }]} />
        </Animated.View>

        {/* ── Content card ── */}
        <View style={[s.contentCard, { backgroundColor: c.bg }]}>
          {/* Meta row: badge + reading time */}
          <View style={s.metaRow}>
            <View style={[s.leagueBadge, { backgroundColor: accent + '1A' }]}>
              <View style={[s.leagueDot, { backgroundColor: accent }]} />
              <Text style={[s.leagueText, { color: accent }]}>{article.category}</Text>
            </View>
            <View style={s.readTimeWrap}>
              <Text style={[s.readTimeText, { color: c.textTertiary }]}>
                {'\u{1F552}'} {readMins} min de lectura
              </Text>
            </View>
          </View>

          {/* Title */}
          <Text style={[s.title, { color: c.textPrimary }]}>{article.title}</Text>

          {/* Source + time row */}
          <View style={s.sourceRow}>
            <View style={[s.sourceAvatar, { backgroundColor: accent + '22' }]}>
              <Text style={[s.sourceInitial, { color: accent }]}>
                {article.source.charAt(0)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.sourceName, { color: c.textPrimary }]}>{article.source}</Text>
              <Text style={[s.sourceInfo, { color: c.textTertiary }]}>
                Fuente verificada {'\u00B7'} {article.time}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={[s.divider, { backgroundColor: c.border }]} />

          {/* Summary callout */}
          <View style={[s.summaryBox, { backgroundColor: accent + '0A', borderLeftColor: accent }]}>
            <Text style={[s.summaryText, { color: c.textSecondary }]}>
              {article.summary}
            </Text>
          </View>

          {/* Article body paragraphs */}
          {paragraphs.map((p, i) => (
            <Text key={i} style={[s.paragraph, { color: c.textSecondary }]}>{p}</Text>
          ))}

          {/* Tags row */}
          <View style={s.tagsRow}>
            {[`#${article.category.replace(/\s/g, '')}`, '#F\u00FAtbol', `#${article.source.replace(/\s/g, '')}`].map(tag => (
              <View key={tag} style={[s.tag, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={[s.tagText, { color: c.textTertiary }]}>{tag}</Text>
              </View>
            ))}
          </View>

          {/* ── Reactions section ── */}
          <View style={[s.reactionSection, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={s.reactionHeader}>
              <Text style={[s.reactionTitle, { color: c.textPrimary }]}>
                {'\u00BF'}Qu{'\u00E9'} te pareci{'\u00F3'}?
              </Text>
              <Text style={[s.reactionCount, { color: c.textTertiary }]}>
                {totalReactions.toLocaleString()} reacciones
              </Text>
            </View>
            <Text style={[s.reactionSub, { color: c.textTertiary }]}>
              {userReaction
                ? `Reaccionaste con ${REACTIONS.find(r => r.emoji === userReaction)?.label ?? ''} \u00B7 Puedes cambiar`
                : 'Selecciona una reacci\u00F3n'}
            </Text>

            <View style={s.reactionGrid}>
              {REACTIONS.map(r => {
                const isActive = userReaction === r.emoji;
                const count = baseCounts[r.emoji] + (isActive ? 1 : 0);
                const scale = reactionScales.current[r.emoji] ?? new Animated.Value(1);

                return (
                  <TouchableOpacity
                    key={r.emoji}
                    onPress={() => handleReaction(r.emoji)}
                    activeOpacity={0.65}
                    style={[
                      s.reactionBtn,
                      { backgroundColor: c.surface, borderColor: c.border },
                      isActive && {
                        backgroundColor: accent + '18',
                        borderColor: accent + '55',
                      },
                    ]}
                  >
                    <Animated.Text style={[s.reactionEmoji, { transform: [{ scale }] }]}>
                      {r.emoji}
                    </Animated.Text>
                    <Text style={[
                      s.reactionLabel,
                      { color: c.textTertiary },
                      isActive && { color: accent, fontWeight: '700' as const },
                    ]}>
                      {count}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Progress bar showing distribution */}
            {userReaction && (
              <View style={[s.distBar, { backgroundColor: c.surface }]}>
                {REACTIONS.map(r => {
                  const count = baseCounts[r.emoji] + (userReaction === r.emoji ? 1 : 0);
                  const pct = totalReactions > 0 ? (count / totalReactions) * 100 : 0;
                  return (
                    <View
                      key={r.emoji}
                      style={{
                        flex: pct,
                        height: 4,
                        backgroundColor: userReaction === r.emoji ? accent : c.border,
                        borderRadius: 2,
                      }}
                    />
                  );
                })}
              </View>
            )}
          </View>
        </View>
      </Animated.ScrollView>
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Sticky header
  stickyHeader: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5,
    borderBottomWidth: 1,
  },
  stickyHeaderInner: {
    paddingHorizontal: 56, paddingBottom: 10, paddingTop: 4, alignItems: 'center',
  },
  stickyTitle: { fontSize: 14, fontWeight: '700' },

  // Floating nav
  floatingNav: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
  },
  floatingNavRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 8,
  },
  navBtn: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6 },
      android: { elevation: 4 },
      default: {},
    }),
  },

  // Hero
  heroWrap: {
    height: 300, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  heroGlow: { ...StyleSheet.absoluteFillObject },
  heroEmoji: { fontSize: 72, opacity: 0.2 },
  accentStripe: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 4,
  },

  // Content card
  contentCard: {
    marginTop: -20, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 24,
  },

  // Meta
  metaRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 16,
  },
  leagueBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
  },
  leagueDot: { width: 6, height: 6, borderRadius: 3 },
  leagueText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  readTimeWrap: {},
  readTimeText: { fontSize: 11 },

  // Title
  title: {
    fontSize: 26, fontWeight: '800', letterSpacing: -0.5, lineHeight: 34,
    marginBottom: 18,
  },

  // Source row
  sourceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20,
  },
  sourceAvatar: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
  },
  sourceInitial: { fontSize: 18, fontWeight: '800' },
  sourceName: { fontSize: 14, fontWeight: '700' },
  sourceInfo: { fontSize: 11, marginTop: 2 },

  // Divider
  divider: { height: 1, marginBottom: 24 },

  // Summary callout
  summaryBox: {
    borderLeftWidth: 3, borderRadius: 8, paddingVertical: 14, paddingHorizontal: 16,
    marginBottom: 24,
  },
  summaryText: { fontSize: 15, fontWeight: '600', fontStyle: 'italic', lineHeight: 22 },

  // Paragraphs
  paragraph: {
    fontSize: 16, lineHeight: 27, marginBottom: 18, letterSpacing: 0.15,
  },

  // Tags
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 32 },
  tag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  tagText: { fontSize: 12, fontWeight: '600' },

  // Reactions section
  reactionSection: {
    borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 20,
  },
  reactionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 2,
  },
  reactionTitle: { fontSize: 15, fontWeight: '700' },
  reactionCount: { fontSize: 11 },
  reactionSub: { fontSize: 11, marginBottom: 12 },

  reactionGrid: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 6,
  },
  reactionBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 8,
    borderRadius: 12, borderWidth: 1,
  },
  reactionEmoji: { fontSize: 20, marginBottom: 2 },
  reactionLabel: { fontSize: 11, fontWeight: '600' },

  // Distribution bar
  distBar: {
    flexDirection: 'row', height: 3, borderRadius: 2,
    marginTop: 12, overflow: 'hidden', gap: 1,
  },
});
