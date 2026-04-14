// ── Favoritos Screen ─────────────────────────────────────────────────────────
// Combined dashboard + management: users can browse, search, follow/unfollow
// teams, players, and leagues. Tapping items navigates to their detail pages.
// Uses FavoritesContext for persistent follow state.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, FlatList, Image,
} from 'react-native';
import { haptics } from '../utils/haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useThemeColors } from '../theme/useTheme';
import { useDarkMode } from '../contexts/DarkModeContext';
import { SkeletonFavoritos } from '../components/Skeleton';
import { useFavorites } from '../contexts/FavoritesContext';
import {
  getSearchableTeams,
  getSearchablePlayers,
  getSearchableLeagues,
} from '../services/sportsApi';
import type {
  SearchableTeam,
  SearchablePlayer,
  SearchableLeague,
} from '../services/sportsApi';
import type { FavoritosStackParamList } from '../navigation/AppNavigator';
import { normalize } from '../utils/normalize';

// ── Types ────────────────────────────────────────────────────────────────────

interface FavItem {
  id: string;
  name: string;
  subtitle: string;
  emoji: string;
  smId?: number;       // SportMonks ID for navigation
  image?: string;      // Photo URL (player/team logo)
  seasonId?: number;
  teamName?: string;
  teamLogo?: string;
  jerseyNumber?: number;
  position?: string;
}

type Tab = 'equipos' | 'ligas' | 'jugadores';

// ── Curated popular data ─────────────────────────────────────────────────────
// Shown to all users regardless of connected SportMonks leagues.

// All IDs verified against SportMonks API — NO mock data
const POPULAR_TEAMS: FavItem[] = [
  // Liga MX
  { id: '2687',  name: 'América',           subtitle: 'Liga MX · México',             emoji: '⚽', smId: 2687,   image: 'https://cdn.sportmonks.com/images/soccer/teams/31/2687.png' },
  { id: '427',   name: 'Guadalajara',       subtitle: 'Liga MX · México',             emoji: '⚽', smId: 427,    image: 'https://cdn.sportmonks.com/images/soccer/teams/11/427.png' },
  { id: '609',   name: 'Tigres UANL',       subtitle: 'Liga MX · México',             emoji: '⚽', smId: 609,    image: 'https://cdn.sportmonks.com/images/soccer/teams/1/609.png' },
  { id: '2626',  name: 'Cruz Azul',         subtitle: 'Liga MX · México',             emoji: '⚽', smId: 2626,   image: 'https://cdn.sportmonks.com/images/soccer/teams/2/2626.png' },
  { id: '2662',  name: 'Monterrey',         subtitle: 'Liga MX · México',             emoji: '⚽', smId: 2662,   image: 'https://cdn.sportmonks.com/images/soccer/teams/6/2662.png' },
  { id: '2989',  name: 'Pumas UNAM',        subtitle: 'Liga MX · México',             emoji: '⚽', smId: 2989,   image: 'https://cdn.sportmonks.com/images/soccer/teams/13/2989.png' },
  // La Liga
  { id: '3468',  name: 'Real Madrid',       subtitle: 'La Liga · España',             emoji: '⚽', smId: 3468,   image: 'https://cdn.sportmonks.com/images/soccer/teams/12/3468.png' },
  { id: '83',    name: 'FC Barcelona',      subtitle: 'La Liga · España',             emoji: '⚽', smId: 83,     image: 'https://cdn.sportmonks.com/images/soccer/teams/19/83.png' },
  // Premier League
  { id: '8',     name: 'Liverpool',         subtitle: 'Premier League · Inglaterra',  emoji: '⚽', smId: 8,      image: 'https://cdn.sportmonks.com/images/soccer/teams/8/8.png' },
  { id: '9',     name: 'Manchester City',   subtitle: 'Premier League · Inglaterra',  emoji: '⚽', smId: 9,      image: 'https://cdn.sportmonks.com/images/soccer/teams/9/9.png' },
  { id: '19',    name: 'Arsenal',           subtitle: 'Premier League · Inglaterra',  emoji: '⚽', smId: 19,     image: 'https://cdn.sportmonks.com/images/soccer/teams/19/19.png' },
  { id: '18',    name: 'Chelsea',           subtitle: 'Premier League · Inglaterra',  emoji: '⚽', smId: 18,     image: 'https://cdn.sportmonks.com/images/soccer/teams/18/18.png' },
  { id: '14',    name: 'Manchester United',  subtitle: 'Premier League · Inglaterra', emoji: '⚽', smId: 14,     image: 'https://cdn.sportmonks.com/images/soccer/teams/14/14.png' },
  { id: '6',     name: 'Tottenham',         subtitle: 'Premier League · Inglaterra',  emoji: '⚽', smId: 6,      image: 'https://cdn.sportmonks.com/images/soccer/teams/6/6.png' },
  // Other Europe
  { id: '591',   name: 'Paris Saint-Germain', subtitle: 'Ligue 1 · Francia',          emoji: '⚽', smId: 591,    image: 'https://cdn.sportmonks.com/images/soccer/teams/15/591.png' },
  { id: '503',   name: 'Bayern München',    subtitle: 'Bundesliga · Alemania',        emoji: '⚽', smId: 503,    image: 'https://cdn.sportmonks.com/images/soccer/teams/23/503.png' },
  { id: '625',   name: 'Juventus',          subtitle: 'Serie A · Italia',             emoji: '⚽', smId: 625,    image: 'https://cdn.sportmonks.com/images/soccer/teams/17/625.png' },
  { id: '113',   name: 'AC Milan',          subtitle: 'Serie A · Italia',             emoji: '⚽', smId: 113,    image: 'https://cdn.sportmonks.com/images/soccer/teams/17/113.png' },
  { id: '2930',  name: 'Inter',             subtitle: 'Serie A · Italia',             emoji: '⚽', smId: 2930,   image: 'https://cdn.sportmonks.com/images/soccer/teams/18/2930.png' },
  { id: '676',   name: 'Sevilla',           subtitle: 'La Liga · España',             emoji: '⚽', smId: 676,    image: 'https://cdn.sportmonks.com/images/soccer/teams/4/676.png' },
  // Americas
  { id: '587',   name: 'Boca Juniors',      subtitle: 'Liga Profesional · Argentina', emoji: '⚽', smId: 587,    image: 'https://cdn.sportmonks.com/images/soccer/teams/11/587.png' },
  { id: '10002', name: 'River Plate',       subtitle: 'Liga Profesional · Argentina', emoji: '⚽', smId: 10002,  image: 'https://cdn.sportmonks.com/images/soccer/teams/18/10002.png' },
  { id: '1024',  name: 'Flamengo',          subtitle: 'Brasileirão · Brasil',         emoji: '⚽', smId: 1024,   image: 'https://cdn.sportmonks.com/images/soccer/teams/0/1024.png' },
  { id: '239235',name: 'Inter Miami',       subtitle: 'MLS · EUA',                    emoji: '⚽', smId: 239235, image: 'https://cdn.sportmonks.com/images/soccer/teams/3/239235.png' },
  // Saudi
  { id: '2506',  name: 'Al Nassr',          subtitle: 'Saudi Pro League · Arabia',    emoji: '⚽', smId: 2506,   image: 'https://cdn.sportmonks.com/images/soccer/teams/10/2506.png' },
  { id: '7011',  name: 'Al Hilal',          subtitle: 'Saudi Pro League · Arabia',    emoji: '⚽', smId: 7011,   image: 'https://cdn.sportmonks.com/images/soccer/teams/3/7011.png' },
  // More Liga MX
  { id: '2844',  name: 'Santos Laguna',     subtitle: 'Liga MX · México',             emoji: '⚽', smId: 2844,   image: 'https://cdn.sportmonks.com/images/soccer/teams/28/2844.png' },
  { id: '967',   name: 'Toluca',            subtitle: 'Liga MX · México',             emoji: '⚽', smId: 967,    image: 'https://cdn.sportmonks.com/images/soccer/teams/7/967.png' },
  { id: '10036', name: 'Pachuca',           subtitle: 'Liga MX · México',             emoji: '⚽', smId: 10036,  image: 'https://cdn.sportmonks.com/images/soccer/teams/20/10036.png' },
  { id: '680',   name: 'Atlas',             subtitle: 'Liga MX · México',             emoji: '⚽', smId: 680,    image: 'https://cdn.sportmonks.com/images/soccer/teams/8/680.png' },
];

// All league IDs match config/leagues.ts — NO mock data
const POPULAR_LEAGUES: FavItem[] = [
  { id: '743',  name: 'Liga MX',              subtitle: 'México',           emoji: '🇲🇽', smId: 743 },
  { id: '8',    name: 'Premier League',       subtitle: 'Inglaterra',       emoji: '🇬🇧', smId: 8 },
  { id: '564',  name: 'La Liga',              subtitle: 'España',           emoji: '🇪🇸', smId: 564 },
  { id: '384',  name: 'Serie A',              subtitle: 'Italia',           emoji: '🇮🇹', smId: 384 },
  { id: '82',   name: 'Bundesliga',           subtitle: 'Alemania',         emoji: '🇩🇪', smId: 82 },
  { id: '301',  name: 'Ligue 1',              subtitle: 'Francia',          emoji: '🇫🇷', smId: 301 },
  { id: '648',  name: 'Brasileirão',          subtitle: 'Brasil',           emoji: '🇧🇷', smId: 648 },
  { id: '779',  name: 'MLS',                  subtitle: 'EUA / Canadá',     emoji: '🇺🇸', smId: 779 },
  { id: '636',  name: 'Liga Profesional',     subtitle: 'Argentina',        emoji: '🇦🇷', smId: 636 },
  { id: '1122', name: 'Copa Libertadores',    subtitle: 'Sudamérica',       emoji: '🏆', smId: 1122 },
  { id: '1111', name: 'CONCACAF Champions',   subtitle: 'CONCACAF',         emoji: '🏆', smId: 1111 },
  { id: '72',   name: 'Eredivisie',           subtitle: 'Países Bajos',     emoji: '🇳🇱', smId: 72 },
  { id: '462',  name: 'Liga Portugal',        subtitle: 'Portugal',         emoji: '🇵🇹', smId: 462 },
  { id: '944',  name: 'Saudi Pro League',     subtitle: 'Arabia Saudita',   emoji: '🇸🇦', smId: 944 },
  { id: '672',  name: 'Liga BetPlay',         subtitle: 'Colombia',         emoji: '🇨🇴', smId: 672 },
  { id: '600',  name: 'Süper Lig',            subtitle: 'Turquía',          emoji: '🇹🇷', smId: 600 },
  { id: '1579', name: 'Liga MX Femenil',      subtitle: 'México',           emoji: '🇲🇽', smId: 1579 },
  { id: '663',  name: 'Primera División',     subtitle: 'Chile',            emoji: '🇨🇱', smId: 663 },
  { id: '968',  name: 'J1 League',            subtitle: 'Japón',            emoji: '🇯🇵', smId: 968 },
  { id: '1082', name: 'Amistosos',            subtitle: 'Internacional',    emoji: '🌍', smId: 1082 },
];

// Player IDs from SportMonks — NO mock data
const POPULAR_PLAYERS: FavItem[] = [
  { id: '93392',  name: 'Lionel Messi',         subtitle: 'Inter Miami · Argentina',    emoji: '🇦🇷', smId: 93392,  image: 'https://cdn.sportmonks.com/images/soccer/players/24/93392.png' },
  { id: '85668',  name: 'Cristiano Ronaldo',    subtitle: 'Al Nassr · Portugal',        emoji: '🇵🇹', smId: 85668,  image: 'https://cdn.sportmonks.com/images/soccer/players/20/85668.png' },
  { id: '163637', name: 'Kylian Mbappé',        subtitle: 'Real Madrid · Francia',      emoji: '🇫🇷', smId: 163637, image: 'https://cdn.sportmonks.com/images/soccer/players/21/163637.png' },
  { id: '159583', name: 'Erling Haaland',       subtitle: 'Manchester City · Noruega',  emoji: '🇳🇴', smId: 159583, image: 'https://cdn.sportmonks.com/images/soccer/players/15/159583.png' },
  { id: '284909', name: 'Vinícius Júnior',      subtitle: 'Real Madrid · Brasil',       emoji: '🇧🇷', smId: 284909, image: 'https://cdn.sportmonks.com/images/soccer/players/13/284909.png' },
  { id: '316264', name: 'Jude Bellingham',      subtitle: 'Real Madrid · Inglaterra',   emoji: '🇬🇧', smId: 316264, image: 'https://cdn.sportmonks.com/images/soccer/players/24/316264.png' },
  { id: '37572',  name: 'Mohamed Salah',        subtitle: 'Liverpool · Egipto',         emoji: '🇪🇬', smId: 37572,  image: 'https://cdn.sportmonks.com/images/soccer/players/20/37572.png' },
  { id: '162396', name: 'Santiago Giménez',      subtitle: 'Feyenoord · México',        emoji: '🇲🇽', smId: 162396, image: 'https://cdn.sportmonks.com/images/soccer/players/12/162396.png' },
  { id: '370498', name: 'Lamine Yamal',         subtitle: 'Barcelona · España',         emoji: '🇪🇸', smId: 370498, image: 'https://cdn.sportmonks.com/images/soccer/players/18/370498.png' },
  { id: '153357', name: 'Pedri',                subtitle: 'Barcelona · España',         emoji: '🇪🇸', smId: 153357, image: 'https://cdn.sportmonks.com/images/soccer/players/13/153357.png' },
  { id: '110137', name: 'Raúl Jiménez',         subtitle: 'Fulham · México',            emoji: '🇲🇽', smId: 110137, image: 'https://cdn.sportmonks.com/images/soccer/players/25/110137.png' },
  { id: '163535', name: 'Julián Quiñones',      subtitle: 'América · México',           emoji: '🇲🇽', smId: 163535, image: 'https://cdn.sportmonks.com/images/soccer/players/19/163535.png' },
  { id: '85966',  name: 'Guillermo Ochoa',      subtitle: 'Salernitana · México',       emoji: '🇲🇽', smId: 85966,  image: 'https://cdn.sportmonks.com/images/soccer/players/14/85966.png' },
  { id: '37557',  name: 'Hirving Lozano',       subtitle: 'PSV · México',               emoji: '🇲🇽', smId: 37557,  image: 'https://cdn.sportmonks.com/images/soccer/players/5/37557.png' },
  { id: '159584', name: 'Florian Wirtz',        subtitle: 'Leverkusen · Alemania',      emoji: '🇩🇪', smId: 159584, image: 'https://cdn.sportmonks.com/images/soccer/players/16/159584.png' },
  { id: 'diaz',           name: 'Luis Díaz',            subtitle: 'Liverpool · Colombia',        emoji: '🇨🇴' },
  { id: 'alexis-vega',    name: 'Alexis Vega',          subtitle: 'Toluca · México',             emoji: '🇲🇽' },
];

// ── Tab config ───────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: 'equipos',    label: 'Equipos',    emoji: '🏟️' },
  { id: 'ligas',      label: 'Ligas',      emoji: '🏆' },
  { id: 'jugadores',  label: 'Jugadores',  emoji: '⚽' },
];

const SEARCH_PLACEHOLDERS: Record<Tab, string> = {
  equipos:   'Buscar equipos...',
  ligas:     'Buscar ligas o torneos...',
  jugadores: 'Buscar jugadores...',
};

const INITIAL_VISIBLE = 10;
const LOAD_MORE_COUNT = 10;

// ── Avatar component ─────────────────────────────────────────────────────────

const ItemAvatar: React.FC<{ emoji: string; image?: string; size?: number; bg: string; border: string }> = ({
  emoji, image, size = 42, bg, border,
}) => {
  if (image && image.startsWith('http')) {
    return (
      <Image
        source={{ uri: image }}
        style={[av.circle, { width: size, height: size, borderRadius: size / 2, borderColor: border }]}
        resizeMode="cover"
      />
    );
  }
  return (
    <View style={[av.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg, borderColor: border }]}>
      <Text style={{ fontSize: size * 0.45 }}>{emoji}</Text>
    </View>
  );
};

const av = StyleSheet.create({
  circle: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// ── Main Screen ──────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

export const FavoritosScreen: React.FC = () => {
  const c = useThemeColors();
  const { isDark } = useDarkMode();
  const navigation = useNavigation<NativeStackNavigationProp<FavoritosStackParamList>>();
  const {
    followedTeamIds, isFollowingTeam, toggleFollowTeam,
    followedPlayerIds, isFollowingPlayer, toggleFollowPlayer,
    followedLeagueIds, isFollowingLeague, toggleFollowLeague,
  } = useFavorites();

  // ── State ──
  const [activeTab, setActiveTab] = useState<Tab>('equipos');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  // SportMonks data for enrichment (photos, IDs for navigation)
  const [smTeams, setSmTeams] = useState<SearchableTeam[]>([]);
  const [smPlayers, setSmPlayers] = useState<SearchablePlayer[]>([]);
  const [smLeagues, setSmLeagues] = useState<SearchableLeague[]>([]);
  const [loading, setLoading] = useState(true);

  // Load SportMonks data for enrichment
  useEffect(() => {
    Promise.all([
      getSearchableTeams().then(setSmTeams).catch(() => {}),
      getSearchablePlayers().then(setSmPlayers).catch(() => {}),
    ]).finally(() => setLoading(false));
    setSmLeagues(getSearchableLeagues());
  }, []);

  // Reset visible count when tab/search changes
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [activeTab, searchQuery]);

  // ── SportMonks name lookup maps ──
  const smTeamMap = useMemo(() => {
    const m = new Map<string, SearchableTeam>();
    smTeams.forEach(t => m.set(normalize(t.name), t));
    return m;
  }, [smTeams]);

  const smPlayerMap = useMemo(() => {
    const m = new Map<string, SearchablePlayer>();
    smPlayers.forEach(p => m.set(normalize(p.name), p));
    return m;
  }, [smPlayers]);

  const smLeagueMap = useMemo(() => {
    const m = new Map<string, SearchableLeague>();
    smLeagues.forEach(l => m.set(normalize(l.name), l));
    return m;
  }, [smLeagues]);

  // ── Enrich popular items with SportMonks data ──
  const enrichedTeams = useMemo(() => {
    const names = new Set(POPULAR_TEAMS.map(t => normalize(t.name)));
    // Enrich popular items
    const popular = POPULAR_TEAMS.map(item => {
      const sm = smTeamMap.get(normalize(item.name));
      if (sm) {
        return {
          ...item,
          smId: sm.id,
          image: sm.logo?.startsWith('http') ? sm.logo : undefined,
          seasonId: sm.seasonId,
        };
      }
      return item;
    });
    // Add SportMonks teams not in popular list
    const extras: FavItem[] = smTeams
      .filter(t => !names.has(normalize(t.name)))
      .map(t => ({
        id: String(t.id),
        name: t.name,
        subtitle: t.leagueName || '',
        emoji: t.logo?.startsWith('http') ? '⚽' : (t.logo || '⚽'),
        smId: t.id,
        image: t.logo?.startsWith('http') ? t.logo : undefined,
        seasonId: t.seasonId,
      }));
    return [...popular, ...extras];
  }, [smTeamMap, smTeams]);

  const enrichedPlayers = useMemo(() => {
    const names = new Set(POPULAR_PLAYERS.map(p => normalize(p.name)));
    const popular = POPULAR_PLAYERS.map(item => {
      const sm = smPlayerMap.get(normalize(item.name));
      if (sm) {
        return {
          ...item,
          smId: sm.id,
          image: sm.image,
          teamName: sm.teamName,
          teamLogo: sm.teamLogo,
          jerseyNumber: sm.jerseyNumber,
          position: sm.position,
        };
      }
      return item;
    });
    const extras: FavItem[] = smPlayers
      .filter(p => !names.has(normalize(p.name)))
      .map(p => ({
        id: String(p.id),
        name: p.name,
        subtitle: [p.teamName, p.position].filter(Boolean).join(' · ') || '',
        emoji: '⚽',
        smId: p.id,
        image: p.image,
        teamName: p.teamName,
        teamLogo: p.teamLogo,
        jerseyNumber: p.jerseyNumber,
        position: p.position,
      }));
    return [...popular, ...extras];
  }, [smPlayerMap, smPlayers]);

  const enrichedLeagues = useMemo(() => {
    const names = new Set(POPULAR_LEAGUES.map(l => normalize(l.name)));
    const popular = POPULAR_LEAGUES.map(item => {
      const sm = smLeagueMap.get(normalize(item.name));
      if (sm) return { ...item, smId: sm.id, seasonId: sm.seasonId };
      return item;
    });
    const extras: FavItem[] = smLeagues
      .filter(l => !names.has(normalize(l.name)))
      .map(l => ({
        id: String(l.id),
        name: l.name,
        subtitle: l.country || '',
        emoji: l.flag || '🏆',
        smId: l.id,
        seasonId: l.seasonId,
      }));
    return [...popular, ...extras];
  }, [smLeagueMap, smLeagues]);

  // ── Effective ID (SportMonks if available, else hardcoded) ──
  const getEffectiveId = useCallback((item: FavItem): string => {
    return item.smId ? String(item.smId) : item.id;
  }, []);

  // ── Follow helpers per tab ──
  const tabConfig = useMemo(() => ({
    equipos: {
      items: enrichedTeams,
      followedIds: followedTeamIds,
      isFollowing: (item: FavItem) => isFollowingTeam(getEffectiveId(item)),
      toggle: (item: FavItem) => toggleFollowTeam(getEffectiveId(item)),
      count: followedTeamIds.length,
    },
    ligas: {
      items: enrichedLeagues,
      followedIds: followedLeagueIds,
      isFollowing: (item: FavItem) => isFollowingLeague(getEffectiveId(item)),
      toggle: (item: FavItem) => toggleFollowLeague(getEffectiveId(item)),
      count: followedLeagueIds.length,
    },
    jugadores: {
      items: enrichedPlayers,
      followedIds: followedPlayerIds,
      isFollowing: (item: FavItem) => isFollowingPlayer(getEffectiveId(item)),
      toggle: (item: FavItem) => toggleFollowPlayer(getEffectiveId(item)),
      count: followedPlayerIds.length,
    },
  }), [enrichedTeams, enrichedLeagues, enrichedPlayers, followedTeamIds, followedLeagueIds, followedPlayerIds, isFollowingTeam, isFollowingLeague, isFollowingPlayer, toggleFollowTeam, toggleFollowLeague, toggleFollowPlayer, getEffectiveId]);

  const config = tabConfig[activeTab];

  // ── Filtered items (search) ──
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return config.items;
    const q = normalize(searchQuery);
    return config.items.filter(
      i => normalize(i.name).includes(q) || normalize(i.subtitle).includes(q),
    );
  }, [config.items, searchQuery]);

  const visibleItems = filteredItems.slice(0, visibleCount);
  const remaining = filteredItems.length - visibleCount;
  const hasMore = remaining > 0;

  // ── Selected chips (items the user follows in the active tab) ──
  const selectedChips = useMemo(() => {
    return config.items.filter(item => config.isFollowing(item));
  }, [config]);

  // ── Navigation ──
  const handleItemNav = useCallback((item: FavItem) => {
    if (!item.smId) return; // No SportMonks ID — can't navigate
    if (activeTab === 'equipos') {
      navigation.navigate('TeamDetail', {
        teamId: item.smId,
        teamName: item.name,
        teamLogo: item.image || item.emoji,
        seasonId: item.seasonId,
      });
    } else if (activeTab === 'ligas') {
      navigation.navigate('LeagueDetail', {
        leagueId: item.smId,
        leagueName: item.name,
        leagueLogo: item.emoji,
        seasonId: item.seasonId,
      });
    } else {
      navigation.navigate('PlayerDetail', {
        playerId: item.smId,
        playerName: item.name,
        playerImage: item.image,
        teamName: item.teamName,
        teamLogo: item.teamLogo,
        jerseyNumber: item.jerseyNumber,
      });
    }
  }, [activeTab, navigation]);

  // ── Total favorites count ──
  const totalCount = followedTeamIds.length + followedPlayerIds.length + followedLeagueIds.length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[st.safe, { backgroundColor: c.bg }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── Header ── */}
      <View style={st.header}>
        <View style={st.headerLeft}>
          <Text style={st.headerStar}>★</Text>
          <View>
            <Text style={[st.headerTitle, { color: c.textPrimary }]}>Favoritos</Text>
            <Text style={[st.headerSub, { color: c.textSecondary }]}>
              {totalCount} favorito{totalCount !== 1 ? 's' : ''} seleccionado{totalCount !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
        {totalCount > 0 && (
          <View style={[st.headerBadge, { backgroundColor: '#fbbf24' }]}>
            <Text style={st.headerBadgeStar}>★</Text>
            <Text style={st.headerBadgeNum}>{totalCount}</Text>
          </View>
        )}
      </View>

      {/* ── Tabs ── */}
      <View style={st.tabBar}>
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          const count = tabConfig[tab.id].count;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[
                st.tab,
                { backgroundColor: c.surface, borderColor: c.border },
                active && { backgroundColor: c.accent, borderColor: c.accent },
              ]}
              onPress={() => { setActiveTab(tab.id); setSearchQuery(''); }}
              activeOpacity={0.7}
            >
              <Text style={st.tabEmoji}>{tab.emoji}</Text>
              <Text style={[st.tabLabel, { color: c.textSecondary }, active && { color: '#fff' }]}>
                {tab.label}
              </Text>
              {count > 0 && (
                <View style={[st.tabCount, active ? { backgroundColor: c.accent } : { backgroundColor: c.border }]}>
                  <Text style={[st.tabCountText, active ? { color: '#fff' } : { color: c.textSecondary }]}>
                    {count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Search ── */}
      <View style={st.searchWrap}>
        <View style={[st.searchBar, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={st.searchIcon}>🔍</Text>
          <TextInput
            style={[st.searchInput, { color: c.textPrimary }]}
            placeholder={SEARCH_PLACEHOLDERS[activeTab]}
            placeholderTextColor={c.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[st.searchClear, { color: c.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Loading skeleton ── */}
      {loading ? (
        <View style={{ paddingTop: 8 }}>
          <SkeletonFavoritos />
        </View>
      ) : (
      <>
      {/* ── Selected chips ── */}
      {selectedChips.length > 0 && !searchQuery && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={st.chipsScroll}
          contentContainerStyle={st.chipsContent}
        >
          {selectedChips.map((item, idx) => (
            <TouchableOpacity
              key={`chip_${item.id}_${idx}`}
              style={[st.chip, { backgroundColor: c.accentDim, borderColor: c.accent + '44' }]}
              onPress={() => { haptics.medium(); config.toggle(item); }}
              activeOpacity={0.8}
            >
              <Text style={st.chipEmoji}>{item.emoji}</Text>
              <Text style={[st.chipName, { color: c.accent }]} numberOfLines={1}>{item.name}</Text>
              <Text style={[st.chipRemove, { color: c.accent }]}>✕</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* ── List ── */}
      <FlatList
        data={visibleItems}
        keyExtractor={i => i.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={st.listContent}
        ListHeaderComponent={
          !searchQuery ? (
            <View style={st.listHeader}>
              <View style={st.listHeaderLeft}>
                <Text style={st.listHeaderIcon}>⚡</Text>
                <Text style={[st.listHeaderTitle, { color: c.textSecondary }]}>LOS MÁS SEGUIDOS</Text>
              </View>
              <Text style={[st.listHeaderCount, { color: c.textTertiary }]}>
                {Math.min(visibleCount, filteredItems.length)} de {filteredItems.length}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const followed = config.isFollowing(item);
          const canNavigate = !!item.smId;
          return (
            <View
              style={[
                st.itemRow,
                { borderBottomColor: c.border },
                followed && { backgroundColor: c.accentDim + '18' },
              ]}
            >
              {/* Avatar */}
              <ItemAvatar
                emoji={item.emoji}
                image={item.image}
                size={42}
                bg={c.surface}
                border={c.border}
              />

              {/* Name + subtitle — tappable for navigation */}
              <TouchableOpacity
                style={st.itemInfo}
                onPress={() => handleItemNav(item)}
                disabled={!canNavigate}
                activeOpacity={0.7}
              >
                <Text style={[st.itemName, { color: c.textPrimary }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[st.itemSub, { color: c.textSecondary }]} numberOfLines={1}>
                  {item.subtitle}
                </Text>
              </TouchableOpacity>

              {/* Navigation arrow */}
              {canNavigate && (
                <TouchableOpacity
                  onPress={() => handleItemNav(item)}
                  style={st.navArrow}
                  hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                  activeOpacity={0.6}
                >
                  <Text style={[st.navArrowText, { color: c.textTertiary }]}>›</Text>
                </TouchableOpacity>
              )}

              {/* Follow / Unfollow button */}
              <TouchableOpacity
                style={[
                  st.followBtn,
                  followed
                    ? { backgroundColor: '#10b981' }
                    : { backgroundColor: c.accent },
                ]}
                onPress={() => { haptics.medium(); config.toggle(item); }}
                activeOpacity={0.8}
              >
                <Text style={st.followBtnText}>
                  {followed ? '✓ Siguiendo' : '+ Seguir'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        }}
        ListFooterComponent={
          hasMore ? (
            <TouchableOpacity
              style={[st.showMore, { borderColor: c.border }]}
              onPress={() => setVisibleCount(v => v + LOAD_MORE_COUNT)}
              activeOpacity={0.7}
            >
              <Text style={[st.showMoreChevron, { color: c.textTertiary }]}>▼</Text>
              <Text style={[st.showMoreText, { color: c.textSecondary }]}>
                Ver {Math.min(LOAD_MORE_COUNT, remaining)} más
              </Text>
              <Text style={[st.showMoreCount, { color: c.textTertiary }]}>
                ({remaining} restantes)
              </Text>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          <View style={st.emptyState}>
            <Text style={st.emptyIcon}>🔍</Text>
            <Text style={[st.emptyText, { color: c.textSecondary }]}>Sin resultados</Text>
          </View>
        }
      />
      </>
      )}
    </SafeAreaView>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── Styles ───────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const st = StyleSheet.create({
  safe: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerStar: { fontSize: 26, color: '#fbbf24' },
  headerTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  headerSub: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  headerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
  },
  headerBadgeStar: { fontSize: 12, color: '#000' },
  headerBadgeNum: { fontSize: 13, fontWeight: '800', color: '#000' },

  // Tabs
  tabBar: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, paddingBottom: 12 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, flex: 1, justifyContent: 'center',
  },
  tabEmoji: { fontSize: 13 },
  tabLabel: { fontSize: 12, fontWeight: '600' },
  tabCount: {
    minWidth: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4, marginLeft: 2,
  },
  tabCountText: { fontSize: 10, fontWeight: '800' },

  // Search
  searchWrap: { paddingHorizontal: 16, marginBottom: 8 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, paddingHorizontal: 12, height: 42,
    borderWidth: 1,
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  searchClear: { fontSize: 13, paddingLeft: 8, fontWeight: '600' },

  // Chips
  chipsScroll: { maxHeight: 44, marginBottom: 8 },
  chipsContent: { paddingHorizontal: 16, gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1,
  },
  chipEmoji: { fontSize: 12 },
  chipName: { fontSize: 11, fontWeight: '600', maxWidth: 100 },
  chipRemove: { fontSize: 10, fontWeight: '700', marginLeft: 2 },

  // List header
  listHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: 10, marginBottom: 4,
  },
  listHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  listHeaderIcon: { fontSize: 13 },
  listHeaderTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  listHeaderCount: { fontSize: 11, fontWeight: '500' },

  // Item row
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 4, gap: 10,
    borderBottomWidth: 1,
    borderRadius: 10,
    marginBottom: 2,
  },
  itemInfo: { flex: 1, minWidth: 0 },
  itemName: { fontSize: 14, fontWeight: '600' },
  itemSub: { fontSize: 11, fontWeight: '500', marginTop: 1 },
  navArrow: { paddingHorizontal: 4 },
  navArrowText: { fontSize: 22, fontWeight: '300' },
  followBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 14,
  },
  followBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // Show more
  showMore: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, marginTop: 8,
    borderWidth: 1, borderRadius: 14,
  },
  showMoreChevron: { fontSize: 10 },
  showMoreText: { fontSize: 13, fontWeight: '600' },
  showMoreCount: { fontSize: 12, fontWeight: '400' },

  // Empty
  emptyState: { paddingTop: 60, alignItems: 'center', gap: 10 },
  emptyIcon: { fontSize: 36 },
  emptyText: { fontSize: 15 },

  // List
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
});
