// ── Team Detail Screen ────────────────────────────────────────────────────────
// Full team profile: collapsible header, 4 tabs (Resumen, Plantilla, Partidos, Tabla).
// Dark/Light mode responsive. Uses real SportMonks data.
import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Animated,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useThemeColors } from '../theme/useTheme';
import { useDarkMode } from '../contexts/DarkModeContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { useTeamDetail } from '../hooks/useTeamDetail';
import type { PartidosStackParamList } from '../navigation/AppNavigator';
import type { TeamDetailData, SquadPlayer, RecentMatch, FormEntry } from '../hooks/useTeamDetail';
import type { LeagueStanding } from '../data/types';

type Props = NativeStackScreenProps<PartidosStackParamList, 'TeamDetail'>;
type Tab = 'resumen' | 'plantilla' | 'partidos' | 'tabla';

// ── Animation constants ──────────────────────────────────────────────────────
const HERO_EXPANDED = 220;
const HERO_COMPACT  = 56;
const COLLAPSE_RANGE = 120;

// ── Back arrow ───────────────────────────────────────────────────────────────
function BackArrow({ color }: { color: string }) {
  return (
    <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', top: 4, left: 2, width: 9, height: 1.8, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '-45deg' }] }} />
      <View style={{ position: 'absolute', bottom: 4, left: 2, width: 9, height: 1.8, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '45deg' }] }} />
    </View>
  );
}

// ── Share icon ───────────────────────────────────────────────────────────────
function ShareIcon({ color }: { color: string }) {
  return (
    <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 2, height: 10, backgroundColor: color, borderRadius: 1, position: 'absolute', bottom: 2 }} />
      <View style={{ position: 'absolute', top: 0, left: 2, width: 6, height: 1.5, backgroundColor: color, transform: [{ rotate: '-45deg' }] }} />
      <View style={{ position: 'absolute', top: 0, right: 2, width: 6, height: 1.5, backgroundColor: color, transform: [{ rotate: '45deg' }] }} />
    </View>
  );
}

// ── Form badges ──────────────────────────────────────────────────────────────
const FormBadges: React.FC<{ form: FormEntry[] }> = ({ form }) => {
  const colors = { W: '#10b981', D: '#f59e0b', L: '#ef4444' };
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {form.map((f, i) => (
        <View key={i} style={{
          width: 22, height: 22, borderRadius: 11,
          backgroundColor: colors[f.result],
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>{f.result}</Text>
        </View>
      ))}
    </View>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Resumen
// ══════════════════════════════════════════════════════════════════════════════

const ResumenTab: React.FC<{ data: TeamDetailData }> = ({ data }) => {
  const c = useThemeColors();
  const { info, recentMatches, squad } = data;

  // Top 5 players by number (just a quick display)
  const topPlayers = squad.filter(p => p.positionId !== 24).slice(0, 5);

  return (
    <View style={{ paddingHorizontal: 16, gap: 12 }}>
      {/* Info card */}
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[s.cardTitle, { color: c.textPrimary }]}>Información</Text>
        {[
          { icon: '🏟️', label: 'Estadio', value: info.venueName },
          ...(info.venueCapacity > 0 ? [{ icon: '💺', label: 'Capacidad', value: info.venueCapacity.toLocaleString() }] : []),
          ...(info.founded > 0 ? [{ icon: '📅', label: 'Fundado', value: String(info.founded) }] : []),
          ...(info.coach ? [{ icon: '👔', label: 'Director técnico', value: info.coach }] : []),
          ...(info.leagueName ? [{ icon: '🏆', label: 'Liga', value: info.leagueName }] : []),
        ].map((row, i) => (
          <View key={i} style={[s.infoRow, { borderTopColor: c.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <Text style={{ fontSize: 18 }}>{row.icon}</Text>
              <Text style={[s.infoLabel, { color: c.textSecondary }]}>{row.label}</Text>
            </View>
            <Text style={[s.infoValue, { color: c.textPrimary }]}>{row.value}</Text>
          </View>
        ))}
      </View>

      {/* Recent matches */}
      {recentMatches.length > 0 && (
        <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[s.cardTitle, { color: c.textPrimary }]}>Partidos recientes</Text>
          {recentMatches.slice(0, 3).map((m, i) => (
            <View key={i} style={[s.matchRow, { borderTopColor: c.border }]}>
              <View style={s.matchTeam}>
                {m.homeLogo.startsWith('http') ? (
                  <Image source={{ uri: m.homeLogo }} style={s.matchLogo} />
                ) : (
                  <Text style={{ fontSize: 16 }}>⚽</Text>
                )}
                <Text style={[s.matchName, { color: c.textPrimary }]} numberOfLines={1}>{m.homeShort}</Text>
              </View>
              <View style={s.matchScore}>
                <Text style={[s.scoreText, { color: c.textPrimary }]}>{m.homeScore}</Text>
                <Text style={[s.scoreSep, { color: c.textTertiary }]}>-</Text>
                <Text style={[s.scoreText, { color: c.textPrimary }]}>{m.awayScore}</Text>
                {m.result && (
                  <View style={[s.resultDot, {
                    backgroundColor: m.result === 'W' ? '#10b981' : m.result === 'L' ? '#ef4444' : '#f59e0b',
                  }]} />
                )}
              </View>
              <View style={[s.matchTeam, { justifyContent: 'flex-end' }]}>
                <Text style={[s.matchName, { color: c.textPrimary, textAlign: 'right' }]} numberOfLines={1}>{m.awayShort}</Text>
                {m.awayLogo.startsWith('http') ? (
                  <Image source={{ uri: m.awayLogo }} style={s.matchLogo} />
                ) : (
                  <Text style={{ fontSize: 16 }}>⚽</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Top players */}
      {topPlayers.length > 0 && (
        <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[s.cardTitle, { color: c.textPrimary }]}>Jugadores destacados</Text>
          {topPlayers.map((p, i) => (
            <View key={i} style={[s.playerRow, { borderTopColor: c.border }]}>
              {p.image.startsWith('http') ? (
                <Image source={{ uri: p.image }} style={s.playerImg} />
              ) : (
                <View style={[s.playerImg, { backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ fontSize: 16 }}>⚽</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[s.playerName, { color: c.textPrimary }]}>{p.displayName}</Text>
                <Text style={[s.playerMeta, { color: c.textTertiary }]}>#{p.number} · {p.position}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 20 }} />
    </View>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Plantilla
// ══════════════════════════════════════════════════════════════════════════════

const POSITION_GROUPS: { label: string; posId: number }[] = [
  { label: 'PORTEROS', posId: 24 },
  { label: 'DEFENSAS', posId: 25 },
  { label: 'MEDIOCAMPISTAS', posId: 26 },
  { label: 'DELANTEROS', posId: 27 },
];

const PlantillaTab: React.FC<{ data: TeamDetailData }> = ({ data }) => {
  const c = useThemeColors();

  return (
    <View style={{ paddingHorizontal: 16, gap: 8 }}>
      {POSITION_GROUPS.map(group => {
        const players = data.squad.filter(p => p.positionId === group.posId);
        if (players.length === 0) return null;

        return (
          <View key={group.posId}>
            <Text style={[s.sectionLabel, { color: c.textTertiary }]}>{group.label}</Text>
            <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
              {players.map((p, i) => (
                <View key={p.id} style={[s.squadRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
                  <View style={[s.squadNum, { backgroundColor: c.surface }]}>
                    <Text style={[s.squadNumText, { color: c.textPrimary }]}>{p.number}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={[s.squadName, { color: c.textPrimary }]}>{p.displayName}</Text>
                    <Text style={[s.squadMeta, { color: c.textTertiary }]}>
                      {p.age > 0 ? `${p.age} años` : ''}
                    </Text>
                  </View>
                  {p.isCaptain && (
                    <View style={[s.captainBadge, { backgroundColor: '#fbbf24' }]}>
                      <Text style={s.captainText}>C</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        );
      })}
      <View style={{ height: 20 }} />
    </View>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Partidos
// ══════════════════════════════════════════════════════════════════════════════

const PartidosTab: React.FC<{ data: TeamDetailData }> = ({ data }) => {
  const c = useThemeColors();

  if (data.recentMatches.length === 0) {
    return (
      <View style={{ alignItems: 'center', paddingTop: 60 }}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>📋</Text>
        <Text style={[{ fontSize: 15, fontWeight: '600', color: c.textSecondary }]}>Sin partidos disponibles</Text>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 16, gap: 4 }}>
      {data.recentMatches.map((m, i) => (
        <View key={m.id} style={[s.fixtureRow, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[s.fixtureDate, { color: c.textTertiary }]}>{m.date}</Text>
          <View style={s.fixtureTeams}>
            <View style={s.fixtureTeam}>
              {m.homeLogo.startsWith('http') ? (
                <Image source={{ uri: m.homeLogo }} style={s.fixtureLogo} />
              ) : <Text style={{ fontSize: 14 }}>⚽</Text>}
              <Text style={[s.fixtureName, { color: c.textPrimary }]} numberOfLines={1}>{m.homeShort}</Text>
            </View>
            <View style={s.fixtureScoreWrap}>
              <Text style={[s.fixtureScore, { color: c.textPrimary }]}>{m.homeScore}</Text>
              <Text style={[s.fixtureScoreSep, { color: c.textTertiary }]}> </Text>
              <Text style={[s.fixtureScore, { color: c.textPrimary }]}>{m.awayScore}</Text>
              {m.result && (
                <View style={[s.resultDotSmall, {
                  backgroundColor: m.result === 'W' ? '#10b981' : m.result === 'L' ? '#ef4444' : '#f59e0b',
                }]} />
              )}
            </View>
            <View style={[s.fixtureTeam, { justifyContent: 'flex-end' }]}>
              <Text style={[s.fixtureName, { color: c.textPrimary, textAlign: 'right' }]} numberOfLines={1}>{m.awayShort}</Text>
              {m.awayLogo.startsWith('http') ? (
                <Image source={{ uri: m.awayLogo }} style={s.fixtureLogo} />
              ) : <Text style={{ fontSize: 14 }}>⚽</Text>}
            </View>
          </View>
        </View>
      ))}
      <View style={{ height: 20 }} />
    </View>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Tabla
// ══════════════════════════════════════════════════════════════════════════════

const TablaTab: React.FC<{ data: TeamDetailData }> = ({ data }) => {
  const c = useThemeColors();

  if (data.standings.length === 0) {
    return (
      <View style={{ alignItems: 'center', paddingTop: 60 }}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>🏆</Text>
        <Text style={[{ fontSize: 15, fontWeight: '600', color: c.textSecondary }]}>Sin tabla disponible</Text>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <View style={[s.tableCard, { backgroundColor: c.card, borderColor: c.border }]}>
        {/* Header */}
        <View style={[s.tableHeader, { backgroundColor: c.surface }]}>
          <Text style={[s.thPos, { color: c.textTertiary }]}></Text>
          <Text style={[s.thTeam, { color: c.textTertiary }]}>EQUIPO</Text>
          <Text style={[s.thStat, { color: c.textTertiary }]}>J</Text>
          <Text style={[s.thStat, { color: c.textTertiary }]}>G</Text>
          <Text style={[s.thStat, { color: c.textTertiary }]}>E</Text>
          <Text style={[s.thStat, { color: c.textTertiary }]}>P</Text>
          <Text style={[s.thPts, { color: c.textTertiary }]}>PTS</Text>
        </View>
        {data.standings.map((st, i) => {
          const isHighlighted = st.team.id === String(data.info.id);
          return (
            <View key={st.team.id} style={[
              s.tableRow,
              { borderTopColor: c.border },
              isHighlighted && { backgroundColor: 'rgba(59,130,246,0.1)' },
            ]}>
              <Text style={[s.tdPos, { color: isHighlighted ? '#3b82f6' : c.textTertiary }]}>{st.position}</Text>
              <View style={s.tdTeam}>
                {st.team.logo.startsWith('http') ? (
                  <Image source={{ uri: st.team.logo }} style={s.tableLogo} />
                ) : <Text style={{ fontSize: 12 }}>⚽</Text>}
                <Text style={[
                  s.tdTeamName,
                  { color: c.textPrimary },
                  isHighlighted && { fontWeight: '700', color: '#3b82f6' },
                ]} numberOfLines={1}>{st.team.name}</Text>
              </View>
              <Text style={[s.tdStat, { color: c.textSecondary }]}>{st.played}</Text>
              <Text style={[s.tdStat, { color: c.textSecondary }]}>{st.won}</Text>
              <Text style={[s.tdStat, { color: c.textSecondary }]}>{st.drawn}</Text>
              <Text style={[s.tdStat, { color: c.textSecondary }]}>{st.lost}</Text>
              <Text style={[s.tdPts, { color: isHighlighted ? '#3b82f6' : c.textPrimary }]}>{st.points}</Text>
            </View>
          );
        })}
      </View>
      <View style={{ height: 20 }} />
    </View>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════════════════════════════

export const TeamDetailScreen: React.FC<Props> = ({ route }) => {
  const { teamId, teamName, teamLogo, seasonId } = route.params;
  const c = useThemeColors();
  const { isDark } = useDarkMode();
  const navigation = useNavigation();
  const { isFollowingTeam, toggleFollowTeam } = useFavorites();
  const scrollY = useRef(new Animated.Value(0)).current;
  const [activeTab, setActiveTab] = useState<Tab>('resumen');

  const { data, loading, error } = useTeamDetail(teamId, seasonId);
  const isFollowing = isFollowingTeam(String(teamId));

  // Animated header interpolations
  const heroHeight = scrollY.interpolate({
    inputRange: [0, COLLAPSE_RANGE],
    outputRange: [HERO_EXPANDED, HERO_COMPACT],
    extrapolate: 'clamp',
  });
  const expandedOpacity = scrollY.interpolate({
    inputRange: [0, COLLAPSE_RANGE * 0.5],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const compactOpacity = scrollY.interpolate({
    inputRange: [COLLAPSE_RANGE * 0.5, COLLAPSE_RANGE],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // Header gradient
  const headerBg = isDark ? '#0a1528' : '#1e40af';
  const headerBgLight = isDark ? '#13243d' : '#2563eb';

  const TABS: { key: Tab; label: string }[] = [
    { key: 'resumen', label: 'Resumen' },
    { key: 'plantilla', label: 'Plantilla' },
    { key: 'partidos', label: 'Partidos' },
    { key: 'tabla', label: 'Tabla' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <StatusBar style="light" />

      {/* ── Animated Hero Header ── */}
      <Animated.View style={[hs.hero, { height: heroHeight, backgroundColor: headerBg }]}>
        {/* Background gradient overlay */}
        <View style={[hs.gradient, { backgroundColor: headerBgLight, opacity: 0.5 }]} />

        {/* Top bar (always visible) */}
        <View style={hs.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={hs.backBtn} activeOpacity={0.7}>
            <BackArrow color="#fff" />
          </TouchableOpacity>
          <Animated.View style={{ opacity: compactOpacity, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
            {teamLogo?.startsWith('http') ? (
              <Image source={{ uri: teamLogo }} style={{ width: 24, height: 24, borderRadius: 12 }} />
            ) : null}
            <Text style={hs.compactName} numberOfLines={1}>{data?.info.name ?? teamName}</Text>
          </Animated.View>
          <TouchableOpacity style={hs.shareBtn} activeOpacity={0.7}>
            <ShareIcon color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Expanded content */}
        <Animated.View style={[hs.expanded, { opacity: expandedOpacity }]}>
          {/* League label */}
          <Text style={hs.leagueLabel}>{data?.info.leagueName ?? ''}</Text>

          {/* Logo */}
          <View style={hs.logoWrap}>
            {teamLogo?.startsWith('http') ? (
              <Image source={{ uri: teamLogo }} style={hs.logo} />
            ) : (
              <View style={[hs.logo, { backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ fontSize: 32 }}>⚽</Text>
              </View>
            )}
          </View>

          {/* Team name */}
          <Text style={hs.teamName}>{data?.info.name ?? teamName}</Text>

          {/* City */}
          {data?.info.city ? (
            <Text style={hs.cityText}>{data.info.city}</Text>
          ) : null}

          {/* Follow button */}
          <TouchableOpacity
            style={[hs.followBtn, isFollowing && hs.followBtnActive]}
            onPress={() => toggleFollowTeam(String(teamId))}
            activeOpacity={0.8}
          >
            <Text style={[hs.followText, isFollowing && hs.followTextActive]}>
              {isFollowing ? '✓ Siguiendo' : '+ Seguir'}
            </Text>
          </TouchableOpacity>

          {/* Stats strip: Position, Points, Form */}
          {data?.teamStanding && (
            <View style={hs.statsStrip}>
              <View style={hs.statItem}>
                <Text style={hs.statValue}>#{data.teamStanding.position}</Text>
                <Text style={hs.statLabel}>Posición</Text>
              </View>
              <View style={hs.statItem}>
                <Text style={hs.statValue}>{data.teamStanding.points}</Text>
                <Text style={hs.statLabel}>Puntos</Text>
              </View>
              {data.form.length > 0 && (
                <View style={hs.statItem}>
                  <FormBadges form={data.form} />
                  <Text style={hs.statLabel}>Forma</Text>
                </View>
              )}
            </View>
          )}
        </Animated.View>
      </Animated.View>

      {/* ── Tab bar (sticky) ── */}
      <View style={[hs.tabBar, { backgroundColor: c.bg, borderBottomColor: c.border }]}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[hs.tab, active && { borderBottomColor: c.accent }]}
              activeOpacity={0.7}
            >
              <Text style={[
                hs.tabText,
                { color: active ? c.textPrimary : c.textTertiary },
                active && { fontWeight: '700' },
              ]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Scrollable content ── */}
      <Animated.ScrollView
        style={{ flex: 1, backgroundColor: c.bg }}
        contentContainerStyle={{ paddingTop: 12 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
      >
        {loading ? (
          <View style={{ alignItems: 'center', paddingTop: 80, gap: 10 }}>
            <ActivityIndicator size="large" color={c.emerald} />
            <Text style={{ fontSize: 14, color: c.textSecondary, marginTop: 8 }}>Cargando equipo...</Text>
          </View>
        ) : error && !data ? (
          <View style={{ alignItems: 'center', paddingTop: 80, gap: 10 }}>
            <Text style={{ fontSize: 40 }}>⚠️</Text>
            <Text style={{ fontSize: 15, fontWeight: '600', color: c.textSecondary }}>Error cargando equipo</Text>
            <Text style={{ fontSize: 12, color: c.textTertiary }}>{error}</Text>
          </View>
        ) : data ? (
          <>
            {activeTab === 'resumen' && <ResumenTab data={data} />}
            {activeTab === 'plantilla' && <PlantillaTab data={data} />}
            {activeTab === 'partidos' && <PartidosTab data={data} />}
            {activeTab === 'tabla' && <TablaTab data={data} />}
          </>
        ) : null}

        <View style={{ height: 80 }} />
      </Animated.ScrollView>
    </SafeAreaView>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════════════════════

const hs = StyleSheet.create({
  hero: {
    overflow: 'hidden',
    position: 'relative',
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
    height: 44,
    zIndex: 2,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  shareBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  compactName: {
    fontSize: 16, fontWeight: '700', color: '#fff',
    textAlign: 'center',
  },
  expanded: {
    alignItems: 'center',
    paddingTop: 0,
    gap: 6,
    zIndex: 1,
  },
  leagueLabel: {
    fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.3,
  },
  logoWrap: {
    width: 72, height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },
  logo: { width: 56, height: 56, borderRadius: 28 },
  teamName: {
    fontSize: 20, fontWeight: '800', color: '#fff',
    letterSpacing: -0.3,
  },
  cityText: {
    fontSize: 12, color: 'rgba(255,255,255,0.6)',
    marginTop: -2,
  },
  followBtn: {
    paddingHorizontal: 20, paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'transparent',
    marginTop: 2,
  },
  followBtnActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  followText: {
    fontSize: 12, fontWeight: '700', color: '#fff',
  },
  followTextActive: {
    color: '#111',
  },
  statsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginTop: 4,
  },
  statItem: { alignItems: 'center', gap: 2 },
  statValue: { fontSize: 18, fontWeight: '800', color: '#fff' },
  statLabel: { fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5, textTransform: 'uppercase' },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
});

const s = StyleSheet.create({
  // Cards
  card: {
    borderRadius: 14, borderWidth: 1, overflow: 'hidden',
    paddingTop: 0,
  },
  cardTitle: {
    fontSize: 16, fontWeight: '700',
    paddingHorizontal: 14, paddingVertical: 14,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1,
    paddingHorizontal: 4, paddingTop: 12, paddingBottom: 6,
    textTransform: 'uppercase',
  },

  // Info rows
  infoRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 14,
    borderTopWidth: 1,
  },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 14, fontWeight: '600', textAlign: 'right' },

  // Match rows
  matchRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    borderTopWidth: 1,
  },
  matchTeam: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  matchLogo: { width: 24, height: 24, borderRadius: 12 },
  matchName: { fontSize: 13, fontWeight: '600', flex: 1 },
  matchScore: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8,
  },
  scoreText: { fontSize: 16, fontWeight: '800' },
  scoreSep: { fontSize: 14 },
  resultDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 4 },

  // Player rows
  playerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1, gap: 12,
  },
  playerImg: { width: 40, height: 40, borderRadius: 20 },
  playerName: { fontSize: 14, fontWeight: '600' },
  playerMeta: { fontSize: 11 },

  // Squad rows
  squadRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10, gap: 12,
  },
  squadNum: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  squadNumText: { fontSize: 14, fontWeight: '800' },
  squadName: { fontSize: 14, fontWeight: '600' },
  squadMeta: { fontSize: 11 },
  captainBadge: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  captainText: { fontSize: 10, fontWeight: '800', color: '#111' },

  // Fixture rows (Partidos tab)
  fixtureRow: {
    borderRadius: 12, borderWidth: 1, padding: 12,
    marginBottom: 6,
  },
  fixtureDate: { fontSize: 10, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  fixtureTeams: { flexDirection: 'row', alignItems: 'center' },
  fixtureTeam: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  fixtureLogo: { width: 22, height: 22, borderRadius: 11 },
  fixtureName: { fontSize: 13, fontWeight: '600', flex: 1 },
  fixtureScoreWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10 },
  fixtureScore: { fontSize: 16, fontWeight: '800' },
  fixtureScoreSep: { fontSize: 12 },
  resultDotSmall: { width: 7, height: 7, borderRadius: 4 },

  // Table
  tableCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  tableHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1,
  },
  thPos:  { width: 24, fontSize: 9, fontWeight: '700', textAlign: 'center' },
  thTeam: { flex: 1, fontSize: 9, fontWeight: '700' },
  thStat: { width: 26, fontSize: 9, fontWeight: '700', textAlign: 'center' },
  thPts:  { width: 32, fontSize: 9, fontWeight: '700', textAlign: 'center' },
  tdPos:  { width: 24, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  tdTeam: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  tableLogo: { width: 20, height: 20, borderRadius: 10 },
  tdTeamName: { fontSize: 12, fontWeight: '500', flex: 1 },
  tdStat: { width: 26, fontSize: 12, textAlign: 'center' },
  tdPts:  { width: 32, fontSize: 14, fontWeight: '800', textAlign: 'center' },
});
