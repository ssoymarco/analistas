// ── Favoritos Screen ─────────────────────────────────────────────────────────
// Combined dashboard + management: users can browse, search, follow/unfollow
// teams, players, and leagues. Tapping items navigates to their detail pages.
// Two sections: "MIS SEGUIDOS" (top) → "LOS MÁS SEGUIDOS" (suggestions below).

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, FlatList, Image, SectionList,
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
import { useTranslation } from 'react-i18next';

// ── Types ────────────────────────────────────────────────────────────────────

interface FavItem {
  id: string;
  name: string;
  subtitle: string;
  emoji: string;
  smId?: number;
  image?: string;
  seasonId?: number;
  teamName?: string;
  teamLogo?: string;
  jerseyNumber?: number;
  position?: string;
}

type Tab = 'equipos' | 'ligas' | 'jugadores';

// ── Popular curated lists ─────────────────────────────────────────────────────
// Ordered by global popularity. IDs verified against SportMonks API.

const POPULAR_TEAMS: FavItem[] = [
  // Liga MX
  { id: '2687',  name: 'América',             subtitle: 'Liga MX · México',             emoji: 'AM', smId: 2687,   image: 'https://cdn.sportmonks.com/images/soccer/teams/31/2687.png' },
  { id: '427',   name: 'Guadalajara',         subtitle: 'Liga MX · México',             emoji: 'GU', smId: 427,    image: 'https://cdn.sportmonks.com/images/soccer/teams/11/427.png' },
  { id: '609',   name: 'Tigres UANL',         subtitle: 'Liga MX · México',             emoji: 'TI', smId: 609,    image: 'https://cdn.sportmonks.com/images/soccer/teams/1/609.png' },
  { id: '2626',  name: 'Cruz Azul',           subtitle: 'Liga MX · México',             emoji: 'CA', smId: 2626,   image: 'https://cdn.sportmonks.com/images/soccer/teams/2/2626.png' },
  { id: '2662',  name: 'Monterrey',           subtitle: 'Liga MX · México',             emoji: 'MO', smId: 2662,   image: 'https://cdn.sportmonks.com/images/soccer/teams/6/2662.png' },
  { id: '2989',  name: 'Pumas UNAM',          subtitle: 'Liga MX · México',             emoji: 'PU', smId: 2989,   image: 'https://cdn.sportmonks.com/images/soccer/teams/13/2989.png' },
  // La Liga
  { id: '3468',  name: 'Real Madrid',         subtitle: 'La Liga · España',             emoji: 'RM', smId: 3468,   image: 'https://cdn.sportmonks.com/images/soccer/teams/12/3468.png' },
  { id: '83',    name: 'FC Barcelona',        subtitle: 'La Liga · España',             emoji: 'FC', smId: 83,     image: 'https://cdn.sportmonks.com/images/soccer/teams/19/83.png' },
  // Premier League
  { id: '8',     name: 'Liverpool',           subtitle: 'Premier League · Inglaterra',  emoji: 'LI', smId: 8,      image: 'https://cdn.sportmonks.com/images/soccer/teams/8/8.png' },
  { id: '9',     name: 'Manchester City',     subtitle: 'Premier League · Inglaterra',  emoji: 'MC', smId: 9,      image: 'https://cdn.sportmonks.com/images/soccer/teams/9/9.png' },
  { id: '19',    name: 'Arsenal',             subtitle: 'Premier League · Inglaterra',  emoji: 'AR', smId: 19,     image: 'https://cdn.sportmonks.com/images/soccer/teams/19/19.png' },
  { id: '18',    name: 'Chelsea',             subtitle: 'Premier League · Inglaterra',  emoji: 'CH', smId: 18,     image: 'https://cdn.sportmonks.com/images/soccer/teams/18/18.png' },
  { id: '14',    name: 'Manchester United',   subtitle: 'Premier League · Inglaterra',  emoji: 'MU', smId: 14,     image: 'https://cdn.sportmonks.com/images/soccer/teams/14/14.png' },
  { id: '6',     name: 'Tottenham',           subtitle: 'Premier League · Inglaterra',  emoji: 'TO', smId: 6,      image: 'https://cdn.sportmonks.com/images/soccer/teams/6/6.png' },
  // Other Europe
  { id: '591',   name: 'Paris Saint-Germain', subtitle: 'Ligue 1 · Francia',            emoji: 'PS', smId: 591,    image: 'https://cdn.sportmonks.com/images/soccer/teams/15/591.png' },
  { id: '503',   name: 'Bayern München',      subtitle: 'Bundesliga · Alemania',        emoji: 'BY', smId: 503,    image: 'https://cdn.sportmonks.com/images/soccer/teams/23/503.png' },
  { id: '625',   name: 'Juventus',            subtitle: 'Serie A · Italia',             emoji: 'JU', smId: 625,    image: 'https://cdn.sportmonks.com/images/soccer/teams/17/625.png' },
  { id: '113',   name: 'AC Milan',            subtitle: 'Serie A · Italia',             emoji: 'AC', smId: 113,    image: 'https://cdn.sportmonks.com/images/soccer/teams/17/113.png' },
  { id: '2930',  name: 'Inter',               subtitle: 'Serie A · Italia',             emoji: 'IN', smId: 2930,   image: 'https://cdn.sportmonks.com/images/soccer/teams/18/2930.png' },
  { id: '676',   name: 'Sevilla',             subtitle: 'La Liga · España',             emoji: 'SE', smId: 676,    image: 'https://cdn.sportmonks.com/images/soccer/teams/4/676.png' },
  // Americas
  { id: '587',   name: 'Boca Juniors',        subtitle: 'Liga Profesional · Argentina', emoji: 'BJ', smId: 587,    image: 'https://cdn.sportmonks.com/images/soccer/teams/11/587.png' },
  { id: '10002', name: 'River Plate',         subtitle: 'Liga Profesional · Argentina', emoji: 'RP', smId: 10002,  image: 'https://cdn.sportmonks.com/images/soccer/teams/18/10002.png' },
  { id: '1024',  name: 'Flamengo',            subtitle: 'Brasileirão · Brasil',         emoji: 'FL', smId: 1024,   image: 'https://cdn.sportmonks.com/images/soccer/teams/0/1024.png' },
  { id: '239235',name: 'Inter Miami',         subtitle: 'MLS · EUA',                    emoji: 'IM', smId: 239235, image: 'https://cdn.sportmonks.com/images/soccer/teams/3/239235.png' },
  // Saudi
  { id: '2506',  name: 'Al Nassr',            subtitle: 'Saudi Pro League · Arabia',    emoji: 'AN', smId: 2506,   image: 'https://cdn.sportmonks.com/images/soccer/teams/10/2506.png' },
  { id: '7011',  name: 'Al Hilal',            subtitle: 'Saudi Pro League · Arabia',    emoji: 'AH', smId: 7011,   image: 'https://cdn.sportmonks.com/images/soccer/teams/3/7011.png' },
  // More Liga MX
  { id: '2844',  name: 'Santos Laguna',       subtitle: 'Liga MX · México',             emoji: 'SL', smId: 2844,   image: 'https://cdn.sportmonks.com/images/soccer/teams/28/2844.png' },
  { id: '967',   name: 'Toluca',              subtitle: 'Liga MX · México',             emoji: 'TO', smId: 967,    image: 'https://cdn.sportmonks.com/images/soccer/teams/7/967.png' },
  { id: '10036', name: 'Pachuca',             subtitle: 'Liga MX · México',             emoji: 'PA', smId: 10036,  image: 'https://cdn.sportmonks.com/images/soccer/teams/20/10036.png' },
  { id: '680',   name: 'Atlas',               subtitle: 'Liga MX · México',             emoji: 'AT', smId: 680,    image: 'https://cdn.sportmonks.com/images/soccer/teams/8/680.png' },
];

const POPULAR_LEAGUES: FavItem[] = [
  { id: '743',  name: 'Liga MX',              subtitle: 'México',           emoji: '🇲🇽', smId: 743 },
  { id: '8',    name: 'Premier League',       subtitle: 'Inglaterra',       emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', smId: 8 },
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

const POPULAR_PLAYERS: FavItem[] = [
  { id: '93392',  name: 'Lionel Messi',       subtitle: 'Inter Miami · Argentina',    emoji: '🇦🇷', smId: 93392,  image: 'https://cdn.sportmonks.com/images/soccer/players/24/93392.png' },
  { id: '85668',  name: 'Cristiano Ronaldo',  subtitle: 'Al Nassr · Portugal',        emoji: '🇵🇹', smId: 85668,  image: 'https://cdn.sportmonks.com/images/soccer/players/20/85668.png' },
  { id: '163637', name: 'Kylian Mbappé',      subtitle: 'Real Madrid · Francia',      emoji: '🇫🇷', smId: 163637, image: 'https://cdn.sportmonks.com/images/soccer/players/21/163637.png' },
  { id: '159583', name: 'Erling Haaland',     subtitle: 'Manchester City · Noruega',  emoji: '🇳🇴', smId: 159583, image: 'https://cdn.sportmonks.com/images/soccer/players/15/159583.png' },
  { id: '284909', name: 'Vinícius Júnior',    subtitle: 'Real Madrid · Brasil',       emoji: '🇧🇷', smId: 284909, image: 'https://cdn.sportmonks.com/images/soccer/players/13/284909.png' },
  { id: '316264', name: 'Jude Bellingham',    subtitle: 'Real Madrid · Inglaterra',   emoji: '🇬🇧', smId: 316264, image: 'https://cdn.sportmonks.com/images/soccer/players/24/316264.png' },
  { id: '37572',  name: 'Mohamed Salah',      subtitle: 'Liverpool · Egipto',         emoji: '🇪🇬', smId: 37572,  image: 'https://cdn.sportmonks.com/images/soccer/players/20/37572.png' },
  { id: '162396', name: 'Santiago Giménez',   subtitle: 'Feyenoord · México',         emoji: '🇲🇽', smId: 162396, image: 'https://cdn.sportmonks.com/images/soccer/players/12/162396.png' },
  { id: '370498', name: 'Lamine Yamal',       subtitle: 'Barcelona · España',         emoji: '🇪🇸', smId: 370498, image: 'https://cdn.sportmonks.com/images/soccer/players/18/370498.png' },
  { id: '153357', name: 'Pedri',              subtitle: 'Barcelona · España',         emoji: '🇪🇸', smId: 153357, image: 'https://cdn.sportmonks.com/images/soccer/players/13/153357.png' },
  { id: '110137', name: 'Raúl Jiménez',       subtitle: 'Fulham · México',            emoji: '🇲🇽', smId: 110137, image: 'https://cdn.sportmonks.com/images/soccer/players/25/110137.png' },
  { id: '163535', name: 'Julián Quiñones',    subtitle: 'América · México',           emoji: '🇲🇽', smId: 163535, image: 'https://cdn.sportmonks.com/images/soccer/players/19/163535.png' },
  { id: '85966',  name: 'Guillermo Ochoa',    subtitle: 'Salernitana · México',       emoji: '🇲🇽', smId: 85966,  image: 'https://cdn.sportmonks.com/images/soccer/players/14/85966.png' },
  { id: '37557',  name: 'Hirving Lozano',     subtitle: 'PSV · México',               emoji: '🇲🇽', smId: 37557,  image: 'https://cdn.sportmonks.com/images/soccer/players/5/37557.png' },
  { id: '159584', name: 'Florian Wirtz',      subtitle: 'Leverkusen · Alemania',      emoji: '🇩🇪', smId: 159584, image: 'https://cdn.sportmonks.com/images/soccer/players/16/159584.png' },
];

// ── Tab config ────────────────────────────────────────────────────────────────

const TABS: { id: Tab; labelKey: string; icon: string }[] = [
  { id: 'equipos',   labelKey: 'favorites.teams',   icon: '🏟' },
  { id: 'ligas',     labelKey: 'favorites.leagues', icon: '🏆' },
  { id: 'jugadores', labelKey: 'favorites.players', icon: '⚽' },
];

const SEARCH_PLACEHOLDER_KEYS: Record<Tab, string> = {
  equipos:   'favorites.searchTeams',
  ligas:     'favorites.searchLeagues',
  jugadores: 'favorites.searchPlayers',
};

const INITIAL_SUGGESTED = 10;
const LOAD_MORE_COUNT   = 10;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Two-letter abbreviation for initials fallback */
function abbrev(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Round avatar — image if available, initials fallback */
const ItemAvatar: React.FC<{
  name: string;
  emoji: string;
  image?: string;
  size?: number;
  isDark: boolean;
  isLeague?: boolean;
}> = ({ name, emoji, image, size = 46, isDark, isLeague }) => {
  const s = size;
  const radius = isLeague ? 10 : s / 2;

  if (image?.startsWith('http')) {
    return (
      <Image
        source={{ uri: image }}
        style={{ width: s, height: s, borderRadius: radius }}
        resizeMode="contain"
      />
    );
  }

  // League: show emoji flag large
  if (isLeague) {
    return (
      <View style={{
        width: s, height: s, borderRadius: radius,
        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: s * 0.52 }}>{emoji}</Text>
      </View>
    );
  }

  // Team / player: initials
  const letters = abbrev(name);
  return (
    <View style={{
      width: s, height: s, borderRadius: radius,
      backgroundColor: isDark ? 'rgba(0,224,150,0.12)' : 'rgba(0,150,100,0.10)',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{
        fontSize: s * 0.30,
        fontWeight: '800',
        color: '#00E096',
        letterSpacing: 0.5,
      }}>
        {letters}
      </Text>
    </View>
  );
};

/** Compact chip (horizontal scroll row) */
const FavChip: React.FC<{
  item: FavItem;
  onRemove: () => void;
  isDark: boolean;
  isLeague?: boolean;
}> = ({ item, onRemove, isDark, isLeague }) => (
  <TouchableOpacity
    style={[ch.chip, { backgroundColor: isDark ? 'rgba(0,224,150,0.12)' : 'rgba(0,180,120,0.12)', borderColor: 'rgba(0,224,150,0.30)' }]}
    onPress={() => { haptics.medium(); onRemove(); }}
    activeOpacity={0.75}
  >
    {/* Tiny avatar */}
    {item.image?.startsWith('http') ? (
      <Image source={{ uri: item.image }} style={{ width: 18, height: 18, borderRadius: isLeague ? 4 : 9 }} resizeMode="contain" />
    ) : isLeague ? (
      <Text style={{ fontSize: 14 }}>{item.emoji}</Text>
    ) : (
      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,224,150,0.25)', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 8, fontWeight: '800', color: '#00E096' }}>{abbrev(item.name)}</Text>
      </View>
    )}
    <Text style={[ch.name, { color: '#00E096' }]} numberOfLines={1}>{item.name}</Text>
    <Text style={[ch.x, { color: 'rgba(0,224,150,0.70)' }]}>✕</Text>
  </TouchableOpacity>
);

const ch = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1,
  },
  name: { fontSize: 12, fontWeight: '700', maxWidth: 90 },
  x:    { fontSize: 10, fontWeight: '800', marginLeft: 1 },
});

/** Section header with optional divider line */
const SectionHeader: React.FC<{
  label: string;
  count?: number;
  accent?: boolean;
  isDark: boolean;
}> = ({ label, count, accent, isDark }) => (
  <View style={[sh.row, { marginBottom: 6 }]}>
    {accent && <View style={[sh.accentBar, { backgroundColor: '#00E096' }]} />}
    <Text style={[sh.label, {
      color: accent ? '#00E096' : (isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)'),
    }]}>
      {label}
    </Text>
    {count !== undefined && (
      <View style={[sh.badge, { backgroundColor: accent ? 'rgba(0,224,150,0.15)' : (isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)') }]}>
        <Text style={[sh.badgeNum, { color: accent ? '#00E096' : (isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.40)') }]}>
          {count}
        </Text>
      </View>
    )}
    <View style={[sh.line, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)' }]} />
  </View>
);

const sh = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 16 },
  accentBar: { width: 3, height: 13, borderRadius: 2 },
  label:     { fontSize: 10, fontWeight: '800', letterSpacing: 1.0, textTransform: 'uppercase' },
  badge:     { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  badgeNum:  { fontSize: 10, fontWeight: '700' },
  line:      { flex: 1, height: 1 },
});

/** Single item row */
const ItemRow: React.FC<{
  item: FavItem;
  followed: boolean;
  canNavigate: boolean;
  isLeague: boolean;
  isDark: boolean;
  onToggle: () => void;
  onNav: () => void;
  borderColor: string;
}> = React.memo(({ item, followed, canNavigate, isLeague, isDark, onToggle, onNav, borderColor }) => (
  <View style={[
    ir.row,
    {
      backgroundColor: followed
        ? (isDark ? 'rgba(0,224,150,0.04)' : 'rgba(0,200,120,0.04)')
        : 'transparent',
      borderColor: followed
        ? 'rgba(0,224,150,0.14)'
        : borderColor,
      borderWidth: 1,
    },
  ]}>
    {/* Avatar */}
    <ItemAvatar
      name={item.name}
      emoji={item.emoji}
      image={item.image}
      size={46}
      isDark={isDark}
      isLeague={isLeague}
    />

    {/* Info — tappable for navigation */}
    <TouchableOpacity
      style={ir.info}
      onPress={onNav}
      disabled={!canNavigate}
      activeOpacity={0.7}
    >
      <Text style={[ir.name, { color: isDark ? '#FFFFFF' : '#111827' }]} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={[ir.sub, { color: isDark ? '#8E8E93' : '#6B7280' }]} numberOfLines={1}>
        {item.subtitle}
      </Text>
    </TouchableOpacity>

    {/* Chevron */}
    {canNavigate && (
      <TouchableOpacity
        onPress={onNav}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        activeOpacity={0.5}
      >
        <Text style={[ir.chevron, { color: isDark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.18)' }]}>›</Text>
      </TouchableOpacity>
    )}

    {/* Follow / Unfollow button */}
    <TouchableOpacity
      style={[
        ir.btn,
        followed
          ? { backgroundColor: isDark ? 'rgba(255,69,58,0.10)' : 'rgba(255,69,58,0.08)', borderColor: 'rgba(255,69,58,0.35)', borderWidth: 1 }
          : { backgroundColor: '#00E096' },
      ]}
      onPress={onToggle}
      activeOpacity={0.8}
    >
      <Text style={[
        ir.btnText,
        { color: followed ? '#FF453A' : '#0D0D0D' },
      ]}>
        {followed ? '✓ Siguiendo' : '+ Seguir'}
      </Text>
    </TouchableOpacity>
  </View>
));

const ir = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 9, paddingHorizontal: 12, gap: 11,
    borderRadius: 14, marginBottom: 6,
  },
  info:    { flex: 1, minWidth: 0 },
  name:    { fontSize: 14, fontWeight: '600' },
  sub:     { fontSize: 11, fontWeight: '500', marginTop: 1 },
  chevron: { fontSize: 22, fontWeight: '300', paddingHorizontal: 2 },
  btn: {
    paddingHorizontal: 11, paddingVertical: 6,
    borderRadius: 14,
  },
  btnText: { fontSize: 11, fontWeight: '700' },
});

// ═══════════════════════════════════════════════════════════════════════════════
// ── Main Screen ───────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

export const FavoritosScreen: React.FC = () => {
  const { t } = useTranslation();
  const c = useThemeColors();
  const { isDark } = useDarkMode();
  const navigation = useNavigation<NativeStackNavigationProp<FavoritosStackParamList>>();
  const {
    followedTeamIds, isFollowingTeam, toggleFollowTeam,
    followedPlayerIds, isFollowingPlayer, toggleFollowPlayer,
    followedLeagueIds, isFollowingLeague, toggleFollowLeague,
  } = useFavorites();

  const [activeTab, setActiveTab] = useState<Tab>('equipos');
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestedVisible, setSuggestedVisible] = useState(INITIAL_SUGGESTED);

  const [smTeams,   setSmTeams]   = useState<SearchableTeam[]>([]);
  const [smPlayers, setSmPlayers] = useState<SearchablePlayer[]>([]);
  const [smLeagues, setSmLeagues] = useState<SearchableLeague[]>([]);
  const [loading, setLoading]     = useState(true);

  // ── Load SportMonks enrichment data ──
  useEffect(() => {
    Promise.all([
      getSearchableTeams().then(setSmTeams).catch(() => {}),
      getSearchablePlayers().then(setSmPlayers).catch(() => {}),
    ]).finally(() => setLoading(false));
    setSmLeagues(getSearchableLeagues());
  }, []);

  // Reset visible count when tab/search changes
  useEffect(() => {
    setSuggestedVisible(INITIAL_SUGGESTED);
  }, [activeTab, searchQuery]);

  // ── Name lookup maps ──
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

  // ── Enriched items ──
  // KEY FIX: API image only overrides hardcoded if it's a valid URL.
  // Fall back to hardcoded `item.image` instead of setting undefined.
  const enrichedTeams = useMemo(() => {
    const names = new Set(POPULAR_TEAMS.map(t => normalize(t.name)));
    const popular = POPULAR_TEAMS.map(item => {
      const sm = smTeamMap.get(normalize(item.name));
      if (!sm) return item;
      const apiImage = sm.logo?.startsWith('http') ? sm.logo : undefined;
      return { ...item, smId: sm.id ?? item.smId, image: apiImage ?? item.image, seasonId: sm.seasonId };
    });
    const extras: FavItem[] = smTeams
      .filter(t => !names.has(normalize(t.name)))
      .map(t => ({
        id: String(t.id),
        name: t.name,
        subtitle: t.leagueName || '',
        emoji: abbrev(t.name),
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
      if (!sm) return item;
      const apiImage = sm.image?.startsWith('http') ? sm.image : undefined;
      return {
        ...item,
        smId: sm.id ?? item.smId,
        image: apiImage ?? item.image,
        teamName: sm.teamName,
        teamLogo: sm.teamLogo,
        jerseyNumber: sm.jerseyNumber,
        position: sm.position,
      };
    });
    const extras: FavItem[] = smPlayers
      .filter(p => !names.has(normalize(p.name)))
      .map(p => ({
        id: String(p.id),
        name: p.name,
        subtitle: [p.teamName, p.position].filter(Boolean).join(' · ') || '',
        emoji: abbrev(p.name),
        smId: p.id,
        image: p.image?.startsWith('http') ? p.image : undefined,
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
      if (!sm) return item;
      return { ...item, smId: sm.id, seasonId: sm.seasonId };
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

  // ── Effective ID helper ──
  const getEffectiveId = useCallback((item: FavItem): string =>
    item.smId ? String(item.smId) : item.id, []);

  // ── Per-tab config ──
  const tabConfig = useMemo(() => ({
    equipos: {
      items: enrichedTeams,
      isFollowing: (item: FavItem) => isFollowingTeam(getEffectiveId(item)),
      toggle: (item: FavItem) => toggleFollowTeam(getEffectiveId(item)),
      count: followedTeamIds.length,
    },
    ligas: {
      items: enrichedLeagues,
      isFollowing: (item: FavItem) => isFollowingLeague(getEffectiveId(item)),
      toggle: (item: FavItem) => toggleFollowLeague(getEffectiveId(item)),
      count: followedLeagueIds.length,
    },
    jugadores: {
      items: enrichedPlayers,
      isFollowing: (item: FavItem) => isFollowingPlayer(getEffectiveId(item)),
      toggle: (item: FavItem) => toggleFollowPlayer(getEffectiveId(item)),
      count: followedPlayerIds.length,
    },
  }), [
    enrichedTeams, enrichedLeagues, enrichedPlayers,
    followedTeamIds, followedLeagueIds, followedPlayerIds,
    isFollowingTeam, isFollowingLeague, isFollowingPlayer,
    toggleFollowTeam, toggleFollowLeague, toggleFollowPlayer,
    getEffectiveId,
  ]);

  const config = tabConfig[activeTab];
  const isLeague = activeTab === 'ligas';

  // ── Split: followed vs suggestions ──
  const { followed, suggestions } = useMemo(() => {
    const fol: FavItem[] = [];
    const sug: FavItem[] = [];
    for (const item of config.items) {
      if (config.isFollowing(item)) fol.push(item);
      else sug.push(item);
    }
    return { followed: fol, suggestions: sug };
  }, [config]);

  // ── Search (flat, no section split) ──
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = normalize(searchQuery);
    return config.items.filter(i =>
      normalize(i.name).includes(q) || normalize(i.subtitle).includes(q)
    );
  }, [config.items, searchQuery]);

  // ── Navigation ──
  const handleItemNav = useCallback((item: FavItem) => {
    if (!item.smId) return;
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

  const totalCount = followedTeamIds.length + followedPlayerIds.length + followedLeagueIds.length;

  // ── Section data for the main (non-search) list ──
  const visibleSuggestions = suggestions.slice(0, suggestedVisible);
  const remainingSuggested = suggestions.length - suggestedVisible;

  // ── Render item (shared between search and sectioned list) ──
  const renderItem = useCallback((item: FavItem) => {
    const fol = config.isFollowing(item);
    return (
      <ItemRow
        key={item.id}
        item={item}
        followed={fol}
        canNavigate={!!item.smId}
        isLeague={isLeague}
        isDark={isDark}
        onToggle={() => { haptics.medium(); config.toggle(item); }}
        onNav={() => handleItemNav(item)}
        borderColor={isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}
      />
    );
  }, [config, isLeague, isDark, handleItemNav]);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[st.safe, { backgroundColor: c.bg }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── Header ── */}
      <View style={[st.header, { borderBottomColor: c.border, backgroundColor: c.bg }]}>
        <View style={st.headerLeft}>
          <View style={[st.headerIcon, { backgroundColor: 'rgba(251,191,36,0.15)' }]}>
            <Text style={{ fontSize: 15 }}>⭐</Text>
          </View>
          <View>
            <Text style={[st.headerTitle, { color: c.textPrimary }]}>
              {t('favorites.title')}
            </Text>
            <Text style={[st.headerSub, { color: c.textSecondary }]}>
              {totalCount > 0
                ? t('favorites.selected', { count: totalCount })
                : t('favorites.subtitle')}
            </Text>
          </View>
        </View>
        {totalCount > 0 && (
          <View style={[st.headerBadge, { backgroundColor: '#fbbf24' }]}>
            <Text style={st.headerBadgeStar}>⭐</Text>
            <Text style={st.headerBadgeNum}>{totalCount}</Text>
          </View>
        )}
      </View>

      {/* ── Tabs ── */}
      <View style={st.tabBar}>
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          const cnt = tabConfig[tab.id].count;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[
                st.tab,
                { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', borderColor: c.border },
                active && { backgroundColor: c.accent, borderColor: c.accent },
              ]}
              onPress={() => { setActiveTab(tab.id); setSearchQuery(''); }}
              activeOpacity={0.7}
            >
              <Text style={[st.tabIcon, active && { opacity: 0 }]}>{tab.icon}</Text>
              <Text style={[st.tabLabel, { color: active ? '#0D0D0D' : c.textSecondary }]}>
                {t(tab.labelKey)}
              </Text>
              {cnt > 0 && (
                <View style={[
                  st.tabBadge,
                  { backgroundColor: active ? 'rgba(0,0,0,0.18)' : 'rgba(0,224,150,0.18)' },
                ]}>
                  <Text style={[st.tabBadgeNum, { color: active ? '#0D0D0D' : '#00E096' }]}>
                    {cnt}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Search ── */}
      <View style={st.searchWrap}>
        <View style={[st.searchBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', borderColor: c.border }]}>
          <Text style={[st.searchIcon, { color: c.textTertiary }]}>⌕</Text>
          <TextInput
            style={[st.searchInput, { color: c.textPrimary }]}
            placeholder={t(SEARCH_PLACEHOLDER_KEYS[activeTab])}
            placeholderTextColor={c.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[st.searchClearBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)' }]}
            >
              <Text style={[st.searchClearText, { color: c.textSecondary }]}>✕</Text>
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
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={st.scrollContent}
        >
          {/* ── SEARCH MODE ── */}
          {searchResults !== null && (
            <>
              {searchResults.length === 0 ? (
                <View style={st.emptyState}>
                  <Text style={st.emptyIcon}>🔍</Text>
                  <Text style={[st.emptyText, { color: c.textSecondary }]}>
                    Sin resultados para "{searchQuery}"
                  </Text>
                </View>
              ) : (
                <>
                  <View style={[sh.row, { paddingTop: 4, marginBottom: 10 }]}>
                    <Text style={[sh.label, { color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)' }]}>
                      {searchResults.length} resultado{searchResults.length !== 1 ? 's' : ''}
                    </Text>
                    <View style={[sh.line, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)' }]} />
                  </View>
                  {searchResults.map(item => renderItem(item))}
                </>
              )}
            </>
          )}

          {/* ── NORMAL MODE ── */}
          {searchResults === null && (
            <>
              {/* Chips: followed items for quick removal */}
              {followed.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={st.chipsScroll}
                  contentContainerStyle={st.chipsContent}
                >
                  {followed.map((item, idx) => (
                    <FavChip
                      key={`chip_${item.id}_${idx}`}
                      item={item}
                      onRemove={() => config.toggle(item)}
                      isDark={isDark}
                      isLeague={isLeague}
                    />
                  ))}
                </ScrollView>
              )}

              {/* Section: Mis seguidos */}
              {followed.length > 0 && (
                <>
                  <SectionHeader
                    label={t('favorites.myFollowed')}
                    count={followed.length}
                    accent
                    isDark={isDark}
                  />
                  {followed.map(item => renderItem(item))}
                </>
              )}

              {/* Section: Los más seguidos (suggestions) */}
              <SectionHeader
                label={followed.length > 0 ? t('favorites.suggested') : t('favorites.mostFollowed')}
                count={suggestions.length}
                isDark={isDark}
              />
              {visibleSuggestions.map(item => renderItem(item))}

              {/* Load more */}
              {remainingSuggested > 0 && (
                <TouchableOpacity
                  style={[st.showMore, { borderColor: c.border }]}
                  onPress={() => setSuggestedVisible(v => v + LOAD_MORE_COUNT)}
                  activeOpacity={0.7}
                >
                  <Text style={[st.showMoreChevron, { color: c.textTertiary }]}>▼</Text>
                  <Text style={[st.showMoreText, { color: c.textSecondary }]}>
                    Ver {Math.min(LOAD_MORE_COUNT, remainingSuggested)} más
                  </Text>
                  <Text style={[st.showMoreCount, { color: c.textTertiary }]}>
                    ({remainingSuggested} restantes)
                  </Text>
                </TouchableOpacity>
              )}

              {remainingSuggested === 0 && suggestions.length > INITIAL_SUGGESTED && (
                <Text style={[st.allLoaded, { color: c.textTertiary }]}>
                  ✓ Mostrando todos
                </Text>
              )}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  safe: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerLeft:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon:     { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  headerTitle:    { fontSize: 18, fontWeight: '800' },
  headerSub:      { fontSize: 12, fontWeight: '500', marginTop: 1 },
  headerBadge:    { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  headerBadgeStar:{ fontSize: 12, color: '#000' },
  headerBadgeNum: { fontSize: 13, fontWeight: '800', color: '#000' },

  // Tabs
  tabBar:      { flexDirection: 'row', paddingHorizontal: 16, gap: 8, paddingBottom: 12 },
  tab:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, flex: 1, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1 },
  tabIcon:     { fontSize: 13, position: 'absolute', opacity: 0 }, // hidden — kept for spacing
  tabLabel:    { fontSize: 12, fontWeight: '700' },
  tabBadge:    { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8 },
  tabBadgeNum: { fontSize: 10, fontWeight: '800' },

  // Search
  searchWrap: { paddingHorizontal: 16, marginBottom: 10 },
  searchBar:  { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 12, height: 44, borderWidth: 1, gap: 8 },
  searchIcon: { fontSize: 17 },
  searchInput:{ flex: 1, fontSize: 14, padding: 0 },
  searchClearBtn: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  searchClearText:{ fontSize: 10, fontWeight: '700' },

  // Chips row
  chipsScroll:   { maxHeight: 44, marginBottom: 2 },
  chipsContent:  { paddingHorizontal: 16, gap: 7 },

  // Show more
  showMore: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, marginTop: 10,
    borderWidth: 1, borderRadius: 14,
  },
  showMoreChevron:{ fontSize: 10 },
  showMoreText:   { fontSize: 13, fontWeight: '600' },
  showMoreCount:  { fontSize: 11, fontWeight: '400' },

  // All loaded
  allLoaded: { textAlign: 'center', fontSize: 11, paddingVertical: 16 },

  // Scroll content
  scrollContent: { paddingHorizontal: 16, paddingBottom: 100 },

  // Empty
  emptyState: { paddingTop: 60, alignItems: 'center', gap: 10 },
  emptyIcon:  { fontSize: 36 },
  emptyText:  { fontSize: 15, textAlign: 'center' },
});
