// ── Skeleton Loader System ────────────────────────────────────────────────────
// Animated placeholder components that mimic real content layouts while loading.
// Uses a pulsing opacity animation for a smooth, professional loading experience.

import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
import { useThemeColors } from '../theme/useTheme';
import { useDarkMode } from '../contexts/DarkModeContext';

// ── Base Skeleton Box ────────────────────────────────────────────────────────

interface SkeletonBoxProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

/** Shared pulse animation ref — all skeletons on screen pulse in sync */
const sharedAnim = new Animated.Value(0.35);
let animRunning = false;
let listenerCount = 0;

function startSharedAnimation() {
  if (animRunning) return;
  animRunning = true;
  Animated.loop(
    Animated.sequence([
      Animated.timing(sharedAnim, { toValue: 0.7, duration: 800, useNativeDriver: true }),
      Animated.timing(sharedAnim, { toValue: 0.35, duration: 800, useNativeDriver: true }),
    ]),
  ).start();
}

function useSkeletonPulse() {
  useEffect(() => {
    listenerCount++;
    startSharedAnimation();
    return () => {
      listenerCount--;
      if (listenerCount <= 0) {
        sharedAnim.stopAnimation();
        animRunning = false;
        listenerCount = 0;
      }
    };
  }, []);
  return sharedAnim;
}

export const SkeletonBox: React.FC<SkeletonBoxProps> = ({
  width = '100%',
  height = 16,
  borderRadius = 6,
  style,
}) => {
  const { isDark } = useDarkMode();
  const pulse = useSkeletonPulse();
  const bg = isDark ? '#252840' : '#e2e8f0';

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: bg, opacity: pulse },
        style,
      ]}
    />
  );
};

// ── Composed Skeleton Layouts ────────────────────────────────────────────────

/** Skeleton for a single match row inside a league section */
const SkeletonMatchRow: React.FC = () => (
  <View style={sk.matchRow}>
    <SkeletonBox width={24} height={24} borderRadius={12} />
    <SkeletonBox width={80} height={12} borderRadius={4} />
    <View style={{ flex: 1 }} />
    <SkeletonBox width={44} height={20} borderRadius={6} />
    <View style={{ flex: 1 }} />
    <SkeletonBox width={80} height={12} borderRadius={4} />
    <SkeletonBox width={24} height={24} borderRadius={12} />
  </View>
);

/** Skeleton for a league section (header + 2-3 match rows) */
export const SkeletonLeagueSection: React.FC<{ matchCount?: number }> = ({ matchCount = 2 }) => {
  const c = useThemeColors();
  return (
    <View style={[sk.leagueCard, { backgroundColor: c.card }]}>
      {/* League header */}
      <View style={[sk.leagueHeader, { backgroundColor: c.surface }]}>
        <SkeletonBox width={18} height={18} borderRadius={3} />
        <SkeletonBox width={110} height={12} borderRadius={4} />
        <View style={{ flex: 1 }} />
        <SkeletonBox width={12} height={12} borderRadius={2} />
      </View>
      {/* Match rows */}
      {Array.from({ length: matchCount }).map((_, i) => (
        <SkeletonMatchRow key={i} />
      ))}
    </View>
  );
};

/** Full skeleton for PartidosScreen — 3 league sections */
export const SkeletonPartidos: React.FC = () => (
  <View style={sk.container}>
    <SkeletonLeagueSection matchCount={1} />
    <SkeletonLeagueSection matchCount={3} />
    <SkeletonLeagueSection matchCount={2} />
  </View>
);

/** Skeleton for Match Detail screen */
export const SkeletonMatchDetail: React.FC = () => {
  const c = useThemeColors();
  return (
    <View style={[sk.container, { paddingHorizontal: 16 }]}>
      {/* Score header area */}
      <View style={[sk.detailHeader, { backgroundColor: c.card }]}>
        <View style={sk.detailTeams}>
          <SkeletonBox width={56} height={56} borderRadius={28} />
          <View style={{ alignItems: 'center', gap: 6 }}>
            <SkeletonBox width={80} height={28} borderRadius={8} />
            <SkeletonBox width={60} height={10} borderRadius={4} />
          </View>
          <SkeletonBox width={56} height={56} borderRadius={28} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 10 }}>
          <SkeletonBox width={70} height={10} borderRadius={4} />
          <SkeletonBox width={70} height={10} borderRadius={4} />
        </View>
      </View>
      {/* Tabs */}
      <View style={sk.tabRow}>
        <SkeletonBox width={70} height={14} borderRadius={4} />
        <SkeletonBox width={70} height={14} borderRadius={4} />
        <SkeletonBox width={70} height={14} borderRadius={4} />
        <SkeletonBox width={70} height={14} borderRadius={4} />
      </View>
      {/* Stat bars */}
      <View style={[sk.statsCard, { backgroundColor: c.card }]}>
        {[1, 2, 3].map(i => (
          <View key={i} style={sk.statRow}>
            <SkeletonBox width={28} height={12} borderRadius={4} />
            <View style={{ flex: 1, marginHorizontal: 10 }}>
              <SkeletonBox width="100%" height={8} borderRadius={4} />
            </View>
            <SkeletonBox width={28} height={12} borderRadius={4} />
          </View>
        ))}
      </View>
      {/* Events */}
      <View style={[sk.statsCard, { backgroundColor: c.card }]}>
        {[1, 2, 3, 4].map(i => (
          <View key={i} style={sk.eventRow}>
            <SkeletonBox width={24} height={12} borderRadius={4} />
            <SkeletonBox width={140} height={12} borderRadius={4} />
            <View style={{ flex: 1 }} />
            <SkeletonBox width={20} height={20} borderRadius={10} />
          </View>
        ))}
      </View>
    </View>
  );
};

/** Skeleton for Team Detail screen */
export const SkeletonTeamDetail: React.FC = () => {
  const c = useThemeColors();
  return (
    <View style={sk.container}>
      {/* Hero */}
      <View style={{ alignItems: 'center', paddingVertical: 30, gap: 12 }}>
        <SkeletonBox width={14} height={10} borderRadius={4} />
        <SkeletonBox width={80} height={80} borderRadius={40} />
        <SkeletonBox width={140} height={22} borderRadius={6} />
        <SkeletonBox width={80} height={12} borderRadius={4} />
        <SkeletonBox width={120} height={34} borderRadius={17} />
        {/* Stats row */}
        <View style={{ flexDirection: 'row', gap: 24, marginTop: 8 }}>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <SkeletonBox width={36} height={22} borderRadius={4} />
            <SkeletonBox width={50} height={10} borderRadius={4} />
          </View>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <SkeletonBox width={36} height={22} borderRadius={4} />
            <SkeletonBox width={50} height={10} borderRadius={4} />
          </View>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <View style={{ flexDirection: 'row', gap: 3 }}>
              {[1, 2, 3, 4, 5].map(i => (
                <SkeletonBox key={i} width={22} height={22} borderRadius={11} />
              ))}
            </View>
            <SkeletonBox width={50} height={10} borderRadius={4} />
          </View>
        </View>
      </View>
      {/* Tabs */}
      <View style={[sk.tabRow, { paddingHorizontal: 16 }]}>
        <SkeletonBox width={65} height={14} borderRadius={4} />
        <SkeletonBox width={65} height={14} borderRadius={4} />
        <SkeletonBox width={65} height={14} borderRadius={4} />
        <SkeletonBox width={65} height={14} borderRadius={4} />
      </View>
      {/* Content cards */}
      <View style={{ paddingHorizontal: 16, gap: 10, marginTop: 12 }}>
        <View style={[sk.statsCard, { backgroundColor: c.card }]}>
          <SkeletonBox width={100} height={14} borderRadius={4} />
          <View style={{ gap: 8, marginTop: 8 }}>
            {[1, 2, 3].map(i => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <SkeletonBox width={90} height={12} borderRadius={4} />
                <SkeletonBox width={60} height={12} borderRadius={4} />
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
};

/** Skeleton for League Detail screen */
export const SkeletonLeagueDetail: React.FC = () => {
  const c = useThemeColors();
  return (
    <View style={sk.container}>
      {/* Hero */}
      <View style={{ alignItems: 'center', paddingVertical: 24, gap: 10 }}>
        <SkeletonBox width={72} height={72} borderRadius={16} />
        <SkeletonBox width={160} height={22} borderRadius={6} />
        <SkeletonBox width={100} height={12} borderRadius={4} />
        <View style={{ flexDirection: 'row', gap: 20, marginTop: 6 }}>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <SkeletonBox width={30} height={20} borderRadius={4} />
            <SkeletonBox width={50} height={10} borderRadius={4} />
          </View>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <SkeletonBox width={30} height={20} borderRadius={4} />
            <SkeletonBox width={50} height={10} borderRadius={4} />
          </View>
        </View>
      </View>
      {/* Tabs */}
      <View style={sk.tabRow}>
        <SkeletonBox width={80} height={14} borderRadius={4} />
        <SkeletonBox width={80} height={14} borderRadius={4} />
        <SkeletonBox width={80} height={14} borderRadius={4} />
        <SkeletonBox width={80} height={14} borderRadius={4} />
      </View>
      {/* Standings table */}
      <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
        <View style={[sk.statsCard, { backgroundColor: c.card, gap: 0 }]}>
          {/* Table header */}
          <View style={[sk.tableRow, { paddingVertical: 10 }]}>
            <SkeletonBox width={16} height={10} borderRadius={3} />
            <SkeletonBox width={100} height={10} borderRadius={3} style={{ marginLeft: 8 }} />
            <View style={{ flex: 1 }} />
            {[1, 2, 3, 4].map(i => (
              <SkeletonBox key={i} width={20} height={10} borderRadius={3} style={{ marginLeft: 12 }} />
            ))}
            <SkeletonBox width={28} height={10} borderRadius={3} style={{ marginLeft: 12 }} />
          </View>
          {/* Table rows */}
          {Array.from({ length: 8 }).map((_, i) => (
            <View key={i} style={[sk.tableRow, { borderTopWidth: 1, borderTopColor: c.border }]}>
              <SkeletonBox width={16} height={12} borderRadius={3} />
              <SkeletonBox width={20} height={20} borderRadius={10} style={{ marginLeft: 8 }} />
              <SkeletonBox width={90} height={12} borderRadius={4} style={{ marginLeft: 6 }} />
              <View style={{ flex: 1 }} />
              {[1, 2, 3, 4].map(j => (
                <SkeletonBox key={j} width={20} height={12} borderRadius={3} style={{ marginLeft: 12 }} />
              ))}
              <SkeletonBox width={28} height={14} borderRadius={4} style={{ marginLeft: 12 }} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
};

/** Skeleton for GlobalSearch trending items */
export const SkeletonSearch: React.FC = () => {
  const c = useThemeColors();
  return (
    <View style={{ gap: 0 }}>
      {/* Section header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 12 }}>
        <SkeletonBox width={14} height={14} borderRadius={4} />
        <SkeletonBox width={100} height={10} borderRadius={4} />
      </View>
      {/* Items */}
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={[sk.searchRow, { borderBottomColor: c.border }]}>
          <SkeletonBox width={30} height={30} borderRadius={8} />
          <SkeletonBox width={36} height={36} borderRadius={8} />
          <View style={{ flex: 1, gap: 4 }}>
            <SkeletonBox width={120} height={14} borderRadius={4} />
            <SkeletonBox width={60} height={10} borderRadius={4} />
          </View>
          <SkeletonBox width={12} height={12} borderRadius={2} />
        </View>
      ))}
    </View>
  );
};

/** Skeleton for Player Detail screen */
export const SkeletonPlayerDetail: React.FC = () => {
  const c = useThemeColors();
  return (
    <View style={sk.container}>
      <View style={{ alignItems: 'center', paddingVertical: 30, gap: 12 }}>
        <SkeletonBox width={90} height={90} borderRadius={45} />
        <SkeletonBox width={160} height={22} borderRadius={6} />
        <SkeletonBox width={100} height={12} borderRadius={4} />
        <SkeletonBox width={120} height={34} borderRadius={17} />
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
          {[1, 2, 3, 4].map(i => (
            <View key={i} style={{ alignItems: 'center', gap: 4 }}>
              <SkeletonBox width={36} height={22} borderRadius={4} />
              <SkeletonBox width={44} height={10} borderRadius={4} />
            </View>
          ))}
        </View>
      </View>
      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        <View style={[sk.statsCard, { backgroundColor: c.card }]}>
          {[1, 2, 3, 4].map(i => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <SkeletonBox width={100} height={12} borderRadius={4} />
              <SkeletonBox width={50} height={12} borderRadius={4} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
};

/** Skeleton for Noticias screen — hero card + story cards + article rows */
export const SkeletonNoticias: React.FC = () => {
  const c = useThemeColors();
  return (
    <View style={sk.container}>
      {/* Hero card */}
      <View style={[sk.newsHero, { backgroundColor: c.card }]}>
        <SkeletonBox width="100%" height={180} borderRadius={0} />
        <View style={{ padding: 16, gap: 10 }}>
          <SkeletonBox width={90} height={18} borderRadius={6} />
          <SkeletonBox width="100%" height={18} borderRadius={4} />
          <SkeletonBox width="75%" height={18} borderRadius={4} />
          <SkeletonBox width="90%" height={12} borderRadius={4} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <SkeletonBox width={20} height={20} borderRadius={10} />
            <SkeletonBox width={50} height={10} borderRadius={4} />
            <SkeletonBox width={50} height={10} borderRadius={4} />
          </View>
        </View>
      </View>

      {/* Section label */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, marginTop: 4 }}>
        <SkeletonBox width={14} height={14} borderRadius={3} />
        <SkeletonBox width={100} height={8} borderRadius={4} />
        <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
      </View>

      {/* Story cards (horizontal) */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 12 }}>
        {[1, 2, 3].map(i => (
          <View key={i} style={[sk.newsStoryCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <SkeletonBox width={180} height={90} borderRadius={0} />
            <View style={{ padding: 10, gap: 6 }}>
              <SkeletonBox width={70} height={14} borderRadius={6} />
              <SkeletonBox width={150} height={12} borderRadius={4} />
              <SkeletonBox width={100} height={12} borderRadius={4} />
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <SkeletonBox width={40} height={8} borderRadius={4} />
                <SkeletonBox width={40} height={8} borderRadius={4} />
              </View>
            </View>
          </View>
        ))}
      </View>

      {/* Section label */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, marginTop: 4 }}>
        <SkeletonBox width={14} height={14} borderRadius={3} />
        <SkeletonBox width={120} height={8} borderRadius={4} />
        <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
      </View>

      {/* Article rows */}
      <View style={[sk.newsArticleList, { backgroundColor: c.card, borderColor: c.border }]}>
        {[1, 2, 3, 4].map(i => (
          <View key={i} style={[sk.newsArticleRow, i < 4 && { borderBottomWidth: 1, borderBottomColor: c.border }]}>
            <SkeletonBox width={80} height={64} borderRadius={10} />
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonBox width={70} height={14} borderRadius={6} />
              <SkeletonBox width="100%" height={12} borderRadius={4} />
              <SkeletonBox width="60%" height={12} borderRadius={4} />
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <SkeletonBox width={40} height={8} borderRadius={4} />
                <SkeletonBox width={40} height={8} borderRadius={4} />
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
};

/** Skeleton for Favoritos screen — chips + item rows */
export const SkeletonFavoritos: React.FC = () => {
  const c = useThemeColors();
  return (
    <View style={sk.container}>
      {/* Chips row */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 4 }}>
        {[80, 65, 90].map((w, i) => (
          <SkeletonBox key={i} width={w} height={30} borderRadius={15} />
        ))}
      </View>

      {/* Section label */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, marginVertical: 4 }}>
        <SkeletonBox width={14} height={14} borderRadius={3} />
        <SkeletonBox width={110} height={8} borderRadius={4} />
        <View style={{ flex: 1 }} />
        <SkeletonBox width={50} height={8} borderRadius={4} />
      </View>

      {/* Item rows */}
      {Array.from({ length: 8 }).map((_, i) => (
        <View key={i} style={sk.favItemRow}>
          <SkeletonBox width={44} height={44} borderRadius={22} />
          <View style={{ flex: 1, gap: 5 }}>
            <SkeletonBox width={120 + (i % 3) * 20} height={14} borderRadius={4} />
            <SkeletonBox width={80 + (i % 2) * 30} height={10} borderRadius={4} />
          </View>
          <SkeletonBox width={76} height={32} borderRadius={16} />
        </View>
      ))}
    </View>
  );
};

/** Skeleton for Perfil screen — user card + stats + settings rows */
export const SkeletonPerfil: React.FC = () => {
  const c = useThemeColors();
  return (
    <View style={sk.container}>
      {/* User card */}
      <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
          <SkeletonBox width={68} height={68} borderRadius={34} />
          <View style={{ flex: 1, gap: 6, paddingTop: 4 }}>
            <SkeletonBox width={130} height={16} borderRadius={4} />
            <SkeletonBox width={100} height={12} borderRadius={4} />
            <SkeletonBox width={90} height={22} borderRadius={12} style={{ marginTop: 4 }} />
            <SkeletonBox width={170} height={10} borderRadius={4} style={{ marginTop: 4 }} />
          </View>
          <SkeletonBox width={36} height={36} borderRadius={12} />
        </View>
        {/* Streak pill */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.bg, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 }}>
          <SkeletonBox width={80} height={12} borderRadius={4} />
          <View style={{ flex: 1 }} />
          <SkeletonBox width={70} height={12} borderRadius={4} />
        </View>
      </View>

      {/* Stats row */}
      <View style={{ flexDirection: 'row', backgroundColor: c.card, borderRadius: 16, marginHorizontal: 16, overflow: 'hidden', borderWidth: 1, borderColor: c.border }}>
        {[0, 1, 2].map(idx => (
          <React.Fragment key={idx}>
            {idx > 0 && <View style={{ width: 1, backgroundColor: c.border, marginVertical: 12 }} />}
            <View style={{ flex: 1, alignItems: 'center', paddingVertical: 16, gap: 6 }}>
              <SkeletonBox width={22} height={22} borderRadius={6} />
              <SkeletonBox width={30} height={20} borderRadius={4} />
              <SkeletonBox width={60} height={8} borderRadius={4} />
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* Settings section label */}
      <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
        <SkeletonBox width={60} height={8} borderRadius={4} />
      </View>

      {/* Settings rows */}
      <View style={{ backgroundColor: c.card, borderRadius: 16, marginHorizontal: 16, marginTop: 8, overflow: 'hidden', borderWidth: 1, borderColor: c.border }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <View key={i} style={[sk.perfilRow, i < 6 && { borderBottomWidth: 1, borderBottomColor: c.border }]}>
            <SkeletonBox width={36} height={36} borderRadius={12} />
            <View style={{ flex: 1, gap: 4 }}>
              <SkeletonBox width={100 + (i % 3) * 25} height={13} borderRadius={4} />
              {i % 2 === 0 && <SkeletonBox width={80} height={9} borderRadius={4} />}
            </View>
            <SkeletonBox width={i === 1 || i === 5 ? 48 : 12} height={i === 1 || i === 5 ? 28 : 12} borderRadius={i === 1 || i === 5 ? 14 : 3} />
          </View>
        ))}
      </View>
    </View>
  );
};

// ── Styles ───────────────────────────────────────────────────────────────────

const sk = StyleSheet.create({
  container: { gap: 8 },
  leagueCard: { marginHorizontal: 16, borderRadius: 12, overflow: 'hidden' },
  leagueHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  matchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  tabRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    paddingVertical: 12,
  },
  statsCard: {
    borderRadius: 14, padding: 14, gap: 12,
  },
  statRow: {
    flexDirection: 'row', alignItems: 'center',
  },
  eventRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  detailHeader: {
    borderRadius: 14, padding: 20, alignItems: 'center',
  },
  detailTeams: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24,
  },
  tableRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  // Noticias
  newsHero: {
    marginHorizontal: 16, borderRadius: 20, overflow: 'hidden',
  },
  newsStoryCard: {
    width: 180, borderRadius: 16, overflow: 'hidden', borderWidth: 1,
  },
  newsArticleList: {
    marginHorizontal: 16, borderRadius: 16, overflow: 'hidden', borderWidth: 1,
  },
  newsArticleRow: {
    flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12,
  },

  // Favoritos
  favItemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 10,
  },

  // Perfil
  perfilRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 13,
  },
});
