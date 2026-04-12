// ── Favoritos Screen ─────────────────────────────────────────────────────────
// Combined dashboard + management: users can browse, search, follow/unfollow
// teams, players, and leagues. Tapping items navigates to their detail pages.
// Uses FavoritesContext for persistent follow state.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, FlatList, Image,
} from 'react-native';
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

const POPULAR_TEAMS: FavItem[] = [
  { id: 'america',      name: 'América',             subtitle: 'Liga MX · México',             emoji: '🦅' },
  { id: 'chivas',       name: 'Chivas',              subtitle: 'Liga MX · México',             emoji: '🐐' },
  { id: 'tigres',       name: 'Tigres UANL',         subtitle: 'Liga MX · México',             emoji: '🐯' },
  { id: 'cruz-azul',    name: 'Cruz Azul',           subtitle: 'Liga MX · México',             emoji: '🔵' },
  { id: 'monterrey',    name: 'Monterrey',           subtitle: 'Liga MX · México',             emoji: '⚽' },
  { id: 'pumas',        name: 'Pumas UNAM',          subtitle: 'Liga MX · México',             emoji: '🐆' },
  { id: 'real-madrid',  name: 'Real Madrid',         subtitle: 'La Liga · España',             emoji: '👑' },
  { id: 'barcelona',    name: 'Barcelona',           subtitle: 'La Liga · España',             emoji: '🔵🔴' },
  { id: 'liverpool',    name: 'Liverpool',           subtitle: 'Premier League · Inglaterra',  emoji: '🔴' },
  { id: 'man-city',     name: 'Manchester City',     subtitle: 'Premier League · Inglaterra',  emoji: '🔵' },
  { id: 'arsenal',      name: 'Arsenal',             subtitle: 'Premier League · Inglaterra',  emoji: '🔴' },
  { id: 'chelsea',      name: 'Chelsea',             subtitle: 'Premier League · Inglaterra',  emoji: '🔵' },
  { id: 'psg',          name: 'PSG',                 subtitle: 'Ligue 1 · Francia',            emoji: '🔴🔵' },
  { id: 'bayern',       name: 'Bayern Múnich',       subtitle: 'Bundesliga · Alemania',        emoji: '🔴' },
  { id: 'juventus',     name: 'Juventus',            subtitle: 'Serie A · Italia',             emoji: '⚪⚫' },
  { id: 'inter',        name: 'Inter de Milán',      subtitle: 'Serie A · Italia',             emoji: '🔵⚫' },
  { id: 'atletico',     name: 'Atlético de Madrid',  subtitle: 'La Liga · España',             emoji: '🔴⚪' },
  { id: 'dortmund',     name: 'Borussia Dortmund',   subtitle: 'Bundesliga · Alemania',        emoji: '🟡⚫' },
  { id: 'boca',         name: 'Boca Juniors',        subtitle: 'Liga Profesional · Argentina', emoji: '🔵🟡' },
  { id: 'flamengo',     name: 'Flamengo',            subtitle: 'Brasileirão · Brasil',         emoji: '🔴⚫' },
  { id: 'inter-miami',  name: 'Inter Miami',         subtitle: 'MLS · EUA',                    emoji: '🩷' },
  { id: 'sel-mexico',   name: 'Selección Mexicana',  subtitle: 'CONCACAF · México',            emoji: '🇲🇽' },
  { id: 'man-united',   name: 'Manchester United',   subtitle: 'Premier League · Inglaterra',  emoji: '🔴' },
  { id: 'ac-milan',     name: 'AC Milan',            subtitle: 'Serie A · Italia',             emoji: '🔴⚫' },
  { id: 'napoli',       name: 'Napoli',              subtitle: 'Serie A · Italia',             emoji: '🔵' },
  { id: 'tottenham',    name: 'Tottenham',           subtitle: 'Premier League · Inglaterra',  emoji: '⚪' },
  { id: 'real-sociedad',name: 'Real Sociedad',       subtitle: 'La Liga · España',             emoji: '🔵⚪' },
  { id: 'santos-laguna',name: 'Santos Laguna',       subtitle: 'Liga MX · México',             emoji: '🟢' },
  { id: 'toluca',       name: 'Toluca',              subtitle: 'Liga MX · México',             emoji: '🔴' },
  { id: 'leon',         name: 'León',                subtitle: 'Liga MX · México',             emoji: '🟢' },
  { id: 'river-plate',  name: 'River Plate',         subtitle: 'Liga Profesional · Argentina', emoji: '🔴⚪' },
  { id: 'palmeiras',    name: 'Palmeiras',           subtitle: 'Brasileirão · Brasil',         emoji: '🟢' },
  { id: 'benfica',      name: 'Benfica',             subtitle: 'Liga Portugal · Portugal',     emoji: '🔴' },
  { id: 'porto',        name: 'Porto',               subtitle: 'Liga Portugal · Portugal',     emoji: '🔵' },
  { id: 'ajax',         name: 'Ajax',                subtitle: 'Eredivisie · Países Bajos',    emoji: '🔴⚪' },
  { id: 'celtic',       name: 'Celtic',              subtitle: 'Premiership · Escocia',        emoji: '🟢⚪' },
  { id: 'aston-villa',  name: 'Aston Villa',         subtitle: 'Premier League · Inglaterra',  emoji: '🟤' },
  { id: 'newcastle',    name: 'Newcastle',           subtitle: 'Premier League · Inglaterra',  emoji: '⚫⚪' },
  { id: 'sevilla',      name: 'Sevilla',             subtitle: 'La Liga · España',             emoji: '⚪🔴' },
  { id: 'lazio',        name: 'Lazio',               subtitle: 'Serie A · Italia',             emoji: '🔵⚪' },
];

const POPULAR_LEAGUES: FavItem[] = [
  { id: 'liga-mx',           name: 'Liga MX',              subtitle: 'México',                emoji: '🇲🇽' },
  { id: 'premier-league',    name: 'Premier League',       subtitle: 'Inglaterra',            emoji: '🇬🇧' },
  { id: 'la-liga',           name: 'La Liga',              subtitle: 'España',                emoji: '🇪🇸' },
  { id: 'champions-league',  name: 'Champions League',     subtitle: 'Europa · UEFA',         emoji: '⭐' },
  { id: 'serie-a',           name: 'Serie A',              subtitle: 'Italia',                emoji: '🇮🇹' },
  { id: 'bundesliga',        name: 'Bundesliga',           subtitle: 'Alemania',              emoji: '🇩🇪' },
  { id: 'ligue-1',           name: 'Ligue 1',              subtitle: 'Francia',               emoji: '🇫🇷' },
  { id: 'brasileirao',       name: 'Brasileirão',          subtitle: 'Brasil',                emoji: '🇧🇷' },
  { id: 'mls',               name: 'MLS',                  subtitle: 'EUA / Canadá',          emoji: '🇺🇸' },
  { id: 'liga-arg',          name: 'Liga Profesional',     subtitle: 'Argentina',             emoji: '🇦🇷' },
  { id: 'europa-league',     name: 'Europa League',        subtitle: 'Europa · UEFA',         emoji: '🟠' },
  { id: 'copa-libertadores', name: 'Copa Libertadores',    subtitle: 'Sudamérica',            emoji: '🏆' },
  { id: 'concacaf-cl',       name: 'CONCACAF Champions',   subtitle: 'CONCACAF',              emoji: '🏆' },
  { id: 'mundial-clubes',    name: 'Mundial de Clubes',    subtitle: 'FIFA',                  emoji: '🌍' },
  { id: 'eredivisie',        name: 'Eredivisie',           subtitle: 'Países Bajos',          emoji: '🇳🇱' },
  { id: 'liga-portugal',     name: 'Liga Portugal',        subtitle: 'Portugal',              emoji: '🇵🇹' },
  { id: 'saudi-pro',         name: 'Saudi Pro League',     subtitle: 'Arabia Saudita',        emoji: '🇸🇦' },
  { id: 'liga-mx-femenil',   name: 'Liga MX Femenil',      subtitle: 'México',                emoji: '🇲🇽' },
  { id: 'copa-america',      name: 'Copa América',         subtitle: 'CONMEBOL',              emoji: '🏆' },
  { id: 'euro',              name: 'Eurocopa',             subtitle: 'UEFA',                  emoji: '🇪🇺' },
];

const POPULAR_PLAYERS: FavItem[] = [
  { id: 'messi',          name: 'Lionel Messi',         subtitle: 'Inter Miami · Argentina',    emoji: '🐐' },
  { id: 'cr7',            name: 'Cristiano Ronaldo',    subtitle: 'Al Nassr · Portugal',        emoji: '🇵🇹' },
  { id: 'mbappe',         name: 'Kylian Mbappé',        subtitle: 'Real Madrid · Francia',      emoji: '🇫🇷' },
  { id: 'haaland',        name: 'Erling Haaland',       subtitle: 'Manchester City · Noruega',  emoji: '🇳🇴' },
  { id: 'vinicius',       name: 'Vinícius Jr',          subtitle: 'Real Madrid · Brasil',       emoji: '🇧🇷' },
  { id: 'bellingham',     name: 'Jude Bellingham',      subtitle: 'Real Madrid · Inglaterra',   emoji: '🇬🇧' },
  { id: 'salah',          name: 'Mohamed Salah',        subtitle: 'Liverpool · Egipto',         emoji: '🇪🇬' },
  { id: 'santi-gimenez',  name: 'Santi Giménez',        subtitle: 'Feyenoord · México',         emoji: '🇲🇽' },
  { id: 'lamine-yamal',   name: 'Lamine Yamal',         subtitle: 'Barcelona · España',         emoji: '🇪🇸' },
  { id: 'pedri',          name: 'Pedri',                subtitle: 'Barcelona · España',         emoji: '🇪🇸' },
  { id: 'de-bruyne',      name: 'Kevin De Bruyne',      subtitle: 'Manchester City · Bélgica',  emoji: '🇧🇪' },
  { id: 'saka',           name: 'Bukayo Saka',          subtitle: 'Arsenal · Inglaterra',       emoji: '🇬🇧' },
  { id: 'henry-martin',   name: 'Henry Martín',         subtitle: 'América · México',           emoji: '🇲🇽' },
  { id: 'lewandowski',    name: 'Robert Lewandowski',   subtitle: 'Barcelona · Polonia',        emoji: '🇵🇱' },
  { id: 'kane',           name: 'Harry Kane',           subtitle: 'Bayern Múnich · Inglaterra', emoji: '🇬🇧' },
  { id: 'chicharito',     name: 'Chicharito',           subtitle: 'Chivas · México',            emoji: '🇲🇽' },
  { id: 'edson-alvarez',  name: 'Edson Álvarez',        subtitle: 'West Ham · México',          emoji: '🇲🇽' },
  { id: 'modric',         name: 'Luka Modrić',          subtitle: 'Real Madrid · Croacia',      emoji: '🇭🇷' },
  { id: 'neymar',         name: 'Neymar Jr',            subtitle: 'Santos · Brasil',            emoji: '🇧🇷' },
  { id: 'rodri',          name: 'Rodri',                subtitle: 'Manchester City · España',    emoji: '🇪🇸' },
  { id: 'gavi',           name: 'Gavi',                 subtitle: 'Barcelona · España',          emoji: '🇪🇸' },
  { id: 'palmer',         name: 'Cole Palmer',          subtitle: 'Chelsea · Inglaterra',        emoji: '🇬🇧' },
  { id: 'valverde',       name: 'Fede Valverde',        subtitle: 'Real Madrid · Uruguay',       emoji: '🇺🇾' },
  { id: 'diaz',           name: 'Luis Díaz',            subtitle: 'Liverpool · Colombia',        emoji: '🇨🇴' },
  { id: 'alexis-vega',    name: 'Alexis Vega',          subtitle: 'Toluca · México',             emoji: '🇲🇽' },
  { id: 'ochoa',          name: 'Guillermo Ochoa',      subtitle: 'Salernitana · México',        emoji: '🇲🇽' },
  { id: 'alvarez',        name: 'Julián Álvarez',       subtitle: 'Atlético Madrid · Argentina', emoji: '🇦🇷' },
  { id: 'endrick',        name: 'Endrick',              subtitle: 'Real Madrid · Brasil',        emoji: '🇧🇷' },
  { id: 'foden',          name: 'Phil Foden',           subtitle: 'Manchester City · Inglaterra',emoji: '🇬🇧' },
  { id: 'martinez',       name: 'Lautaro Martínez',     subtitle: 'Inter de Milán · Argentina',  emoji: '🇦🇷' },
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
          {selectedChips.map(item => (
            <TouchableOpacity
              key={item.id}
              style={[st.chip, { backgroundColor: c.accentDim, borderColor: c.accent + '44' }]}
              onPress={() => config.toggle(item)}
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
                onPress={() => config.toggle(item)}
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
