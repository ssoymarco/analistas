// ── Favoritos Screen ─────────────────────────────────────────────────────────
// Combined dashboard + management: users can browse, search, follow/unfollow
// teams, players, and leagues. Tapping items navigates to their detail pages.
// Two sections: "MIS SEGUIDOS" (top) → "LOS MÁS SEGUIDOS" (suggestions below).

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, FlatList, SectionList,
  PanResponder,
} from 'react-native';
import { Image } from 'expo-image';
import { haptics } from '../utils/haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useThemeColors } from '../theme/useTheme';
import { useDarkMode } from '../contexts/DarkModeContext';
import { SkeletonFavoritos } from '../components/Skeleton';
import { ScreenHeader } from '../components/ScreenHeader';
import { SearchIcon } from '../components/NavIcons';
import { SectionHeader } from '../components/SectionHeader';
import { CategoryTabs } from '../components/CategoryTabs';
import { radius, ui } from '../theme/tokens';
import { useFavorites } from '../contexts/FavoritesContext';
import {
  getSearchableTeams,
  getAllSearchableTeams,
  getSearchablePlayers,
  getSearchableLeagues,
  getAllSearchableLeagues,
  searchRemote,
  rankByQuery,
  resolveFollowedTeams,
  resolveFollowedPlayers,
  type SearchableTeam,
  type SearchablePlayer,
  type SearchableLeague,
} from '../services/football/search';
import { fbPlayerPhoto, fbTeamLogo } from '../../functions/src/shared/football/model';
import type { FavoritosStackParamList } from '../navigation/AppNavigator';
import { normalize } from '../utils/normalize';
import { translateLeagueCountry } from '../utils/nationalTeams';
import { useTranslation } from 'react-i18next';
import { isImageUri } from '../utils/imageUri';
import { useUserCountry } from '../hooks/useUserCountry';
import {
  buildOnboardingTeamGrid,
  buildOnboardingLeagueOrder,
  buildOnboardingPlayerNames,
} from '../services/onboardingGrid';
import { getCountryPreset } from '../config/countryPresets';

// ── Types ────────────────────────────────────────────────────────────────────

interface FavItem {
  id: string;
  name: string;
  subtitle: string;
  emoji: string;
  /** Numeric id of the team / league / player (opens its screen). */
  apiId?: number;
  image?: string;
  seasonId?: number;
  teamName?: string;
  teamLogo?: string;
  jerseyNumber?: number;
  position?: string;
  /** Hidden search keywords — never displayed, only matched against queries.
   *  e.g. Guadalajara → ['chivas'] so fans searching "chivas" find it. */
  searchAliases?: string[];
}

type Tab = 'equipos' | 'ligas' | 'jugadores';

// ── Popular curated lists ─────────────────────────────────────────────────────
// Ordered by global popularity. API-Sports ids.

const POPULAR_TEAMS: FavItem[] = [
  // Liga MX
  { id: '2287', name: 'América',             subtitle: 'Liga MX · México',             emoji: 'AM', apiId: 2287, image: fbTeamLogo(2287) },
  { id: '2278', name: 'Guadalajara',         subtitle: 'Liga MX · México',             emoji: 'GU', apiId: 2278, image: fbTeamLogo(2278), searchAliases: ['chivas', 'chivas de guadalajara'] },
  { id: '2279', name: 'Tigres UANL',         subtitle: 'Liga MX · México',             emoji: 'TI', apiId: 2279, image: fbTeamLogo(2279) },
  { id: '2295', name: 'Cruz Azul',           subtitle: 'Liga MX · México',             emoji: 'CA', apiId: 2295, image: fbTeamLogo(2295) },
  { id: '2282', name: 'Monterrey',           subtitle: 'Liga MX · México',             emoji: 'MO', apiId: 2282, image: fbTeamLogo(2282) },
  { id: '2286', name: 'Pumas UNAM',          subtitle: 'Liga MX · México',             emoji: 'PU', apiId: 2286, image: fbTeamLogo(2286) },
  // La Liga
  { id: '541', name: 'Real Madrid',         subtitle: 'La Liga · España',             emoji: 'RM', apiId: 541, image: fbTeamLogo(541) },
  { id: '529', name: 'FC Barcelona',        subtitle: 'La Liga · España',             emoji: 'FC', apiId: 529, image: fbTeamLogo(529) },
  // Premier League
  { id: '40', name: 'Liverpool',           subtitle: 'Premier League · Inglaterra',  emoji: 'LI', apiId: 40, image: fbTeamLogo(40) },
  { id: '50', name: 'Manchester City',     subtitle: 'Premier League · Inglaterra',  emoji: 'MC', apiId: 50, image: fbTeamLogo(50) },
  { id: '42', name: 'Arsenal',             subtitle: 'Premier League · Inglaterra',  emoji: 'AR', apiId: 42, image: fbTeamLogo(42) },
  { id: '49', name: 'Chelsea',             subtitle: 'Premier League · Inglaterra',  emoji: 'CH', apiId: 49, image: fbTeamLogo(49) },
  { id: '33', name: 'Manchester United',   subtitle: 'Premier League · Inglaterra',  emoji: 'MU', apiId: 33, image: fbTeamLogo(33) },
  { id: '47', name: 'Tottenham',           subtitle: 'Premier League · Inglaterra',  emoji: 'TO', apiId: 47, image: fbTeamLogo(47) },
  // Other Europe
  { id: '85', name: 'Paris Saint-Germain', subtitle: 'Ligue 1 · Francia',            emoji: 'PS', apiId: 85, image: fbTeamLogo(85) },
  { id: '157', name: 'Bayern München',      subtitle: 'Bundesliga · Alemania',        emoji: 'BY', apiId: 157, image: fbTeamLogo(157) },
  { id: '496', name: 'Juventus',            subtitle: 'Serie A · Italia',             emoji: 'JU', apiId: 496, image: fbTeamLogo(496) },
  { id: '489', name: 'AC Milan',            subtitle: 'Serie A · Italia',             emoji: 'AC', apiId: 489, image: fbTeamLogo(489) },
  { id: '505', name: 'Inter',               subtitle: 'Serie A · Italia',             emoji: 'IN', apiId: 505, image: fbTeamLogo(505) },
  { id: '536', name: 'Sevilla',             subtitle: 'La Liga · España',             emoji: 'SE', apiId: 536, image: fbTeamLogo(536) },
  // Americas
  { id: '451', name: 'Boca Juniors',        subtitle: 'Liga Profesional · Argentina', emoji: 'BJ', apiId: 451, image: fbTeamLogo(451) },
  { id: '435', name: 'River Plate',         subtitle: 'Liga Profesional · Argentina', emoji: 'RP', apiId: 435, image: fbTeamLogo(435) },
  { id: '127', name: 'Flamengo',            subtitle: 'Brasileirão · Brasil',         emoji: 'FL', apiId: 127, image: fbTeamLogo(127) },
  { id: '9568', name: 'Inter Miami',         subtitle: 'MLS · EUA',                    emoji: 'IM', apiId: 9568, image: fbTeamLogo(9568) },
  // Saudi
  { id: '2939', name: 'Al Nassr',            subtitle: 'Saudi Pro League · Arabia',    emoji: 'AN', apiId: 2939, image: fbTeamLogo(2939) },
  { id: '2932', name: 'Al Hilal',            subtitle: 'Saudi Pro League · Arabia',    emoji: 'AH', apiId: 2932, image: fbTeamLogo(2932) },
  // More Liga MX
  { id: '2285', name: 'Santos Laguna',       subtitle: 'Liga MX · México',             emoji: 'SL', apiId: 2285, image: fbTeamLogo(2285) },
  { id: '2281', name: 'Toluca',              subtitle: 'Liga MX · México',             emoji: 'TO', apiId: 2281, image: fbTeamLogo(2281) },
  { id: '2292', name: 'Pachuca',             subtitle: 'Liga MX · México',             emoji: 'PA', apiId: 2292, image: fbTeamLogo(2292) },
  { id: '2283', name: 'Atlas',               subtitle: 'Liga MX · México',             emoji: 'AT', apiId: 2283, image: fbTeamLogo(2283) },
];

const POPULAR_LEAGUES: FavItem[] = [
  { id: '262', name: 'Liga MX',              subtitle: 'México',           emoji: '🇲🇽', apiId: 262,  searchAliases: ['ligamx', 'liga mexicana', 'apertura', 'clausura'] },
  { id: '39', name: 'Premier League',       subtitle: 'Inglaterra',       emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', apiId: 39,    searchAliases: ['epl', 'liga inglesa'] },
  { id: '140', name: 'La Liga',              subtitle: 'España',           emoji: '🇪🇸', apiId: 140,  searchAliases: ['laliga', 'liga espanola', 'liga española'] },
  { id: '135', name: 'Serie A',              subtitle: 'Italia',           emoji: '🇮🇹', apiId: 135 },
  { id: '78', name: 'Bundesliga',           subtitle: 'Alemania',         emoji: '🇩🇪', apiId: 78 },
  { id: '61', name: 'Ligue 1',              subtitle: 'Francia',          emoji: '🇫🇷', apiId: 61 },
  { id: '71', name: 'Brasileirão',          subtitle: 'Brasil',           emoji: '🇧🇷', apiId: 71 },
  { id: '253', name: 'MLS',                  subtitle: 'EUA / Canadá',     emoji: '🇺🇸', apiId: 253 },
  { id: '128', name: 'Liga Profesional',     subtitle: 'Argentina',        emoji: '🇦🇷', apiId: 128 },
  { id: '13', name: 'Copa Libertadores',    subtitle: 'Sudamérica',       emoji: '🏆', apiId: 13 },
  { id: '16', name: 'CONCACAF Champions',   subtitle: 'CONCACAF',         emoji: '🏆', apiId: 16 },
  { id: '88', name: 'Eredivisie',           subtitle: 'Países Bajos',     emoji: '🇳🇱', apiId: 88 },
  { id: '94', name: 'Liga Portugal',        subtitle: 'Portugal',         emoji: '🇵🇹', apiId: 94 },
  { id: '307', name: 'Saudi Pro League',     subtitle: 'Arabia Saudita',   emoji: '🇸🇦', apiId: 307 },
  { id: '239', name: 'Liga BetPlay',         subtitle: 'Colombia',         emoji: '🇨🇴', apiId: 239 },
  { id: '203', name: 'Süper Lig',            subtitle: 'Turquía',          emoji: '🇹🇷', apiId: 203 },
  { id: '673', name: 'Liga MX Femenil',      subtitle: 'México',           emoji: '🇲🇽', apiId: 673 },
  { id: '265', name: 'Primera División',     subtitle: 'Chile',            emoji: '🇨🇱', apiId: 265 },
  { id: '98', name: 'J1 League',            subtitle: 'Japón',            emoji: '🇯🇵', apiId: 98 },
  { id: '10', name: 'Amistosos',            subtitle: 'Internacional',    emoji: '🌍', apiId: 10 },
];

// Curated list of globally-followed players (API-Sports player ids; the photo
// comes from the media CDN by id). The club in the subtitle is refreshed from
// live data when available.
const POPULAR_PLAYERS: FavItem[] = [
  // ── Global TOP ─────────────────────────────────────────────────────────────
  { id: '154', name: 'Lionel Messi',           subtitle: 'Inter Miami · Argentina',                    emoji: '🇦🇷', apiId: 154, image: fbPlayerPhoto(154) },
  { id: '874', name: 'Cristiano Ronaldo',      subtitle: 'Al Nassr · Portugal',                        emoji: '🇵🇹', apiId: 874, image: fbPlayerPhoto(874) },
  { id: '278', name: 'Kylian Mbappé',          subtitle: 'Real Madrid · Francia',                      emoji: '🇫🇷', apiId: 278, image: fbPlayerPhoto(278) },
  { id: '1100', name: 'Erling Haaland',         subtitle: 'Manchester City · Noruega',                  emoji: '🇳🇴', apiId: 1100, image: fbPlayerPhoto(1100) },
  { id: '762', name: 'Vinícius Júnior',        subtitle: 'Real Madrid · Brasil',                       emoji: '🇧🇷', apiId: 762, image: fbPlayerPhoto(762) },
  { id: '276', name: 'Neymar Jr',              subtitle: 'Santos · Brasil',                            emoji: '🇧🇷', apiId: 276, image: fbPlayerPhoto(276) },
  { id: '306', name: 'Mohamed Salah',          subtitle: 'Liverpool · Egipto',                         emoji: '🇪🇬', apiId: 306, image: fbPlayerPhoto(306) },
  { id: '521', name: 'Robert Lewandowski',     subtitle: 'Barcelona · Polonia',                        emoji: '🇵🇱', apiId: 521, image: fbPlayerPhoto(521) },
  { id: '629', name: 'Kevin De Bruyne',        subtitle: 'Manchester City · Bélgica',                  emoji: '🇧🇪', apiId: 629, image: fbPlayerPhoto(629) },
  { id: '754', name: 'Luka Modrić',            subtitle: 'AC Milan · Croacia',                         emoji: '🇭🇷', apiId: 754, image: fbPlayerPhoto(754) },
  { id: '386828', name: 'Lamine Yamal',           subtitle: 'Barcelona · España',                         emoji: '🇪🇸', apiId: 386828, image: fbPlayerPhoto(386828) },
  { id: '133609', name: 'Pedri',                  subtitle: 'Barcelona · España',                         emoji: '🇪🇸', apiId: 133609, image: fbPlayerPhoto(133609) },
  { id: '129718', name: 'Jude Bellingham',        subtitle: 'Real Madrid · Inglaterra',                   emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', apiId: 129718, image: fbPlayerPhoto(129718) },
  { id: '44', name: 'Rodri',                  subtitle: 'Manchester City · España',                   emoji: '🇪🇸', apiId: 44, image: fbPlayerPhoto(44) },
  { id: '759', name: 'Karim Benzema',          subtitle: 'Al-Ittihad · Francia',                       emoji: '🇫🇷', apiId: 759, image: fbPlayerPhoto(759) },
  { id: '631', name: 'Phil Foden',             subtitle: 'Manchester City · Inglaterra',               emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', apiId: 631, image: fbPlayerPhoto(631) },
  { id: '203224', name: 'Florian Wirtz',          subtitle: 'Liverpool · Alemania',                       emoji: '🇩🇪', apiId: 203224, image: fbPlayerPhoto(203224) },
  { id: '1496', name: 'Raphinha',               subtitle: 'Barcelona · Brasil',                         emoji: '🇧🇷', apiId: 1496, image: fbPlayerPhoto(1496) },
  { id: '636', name: 'Bernardo Silva',         subtitle: 'Manchester City · Portugal',                 emoji: '🇵🇹', apiId: 636, image: fbPlayerPhoto(636) },
  { id: '1460', name: 'Bukayo Saka',            subtitle: 'Arsenal · Inglaterra',                       emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', apiId: 1460, image: fbPlayerPhoto(1460) },
  { id: '567', name: 'Rúben Dias',             subtitle: 'Manchester City · Portugal',                 emoji: '🇵🇹', apiId: 567, image: fbPlayerPhoto(567) },
  { id: '290', name: 'Virgil van Dijk',        subtitle: 'Liverpool · Países Bajos',                   emoji: '🇳🇱', apiId: 290, image: fbPlayerPhoto(290) },
  { id: '283', name: 'Trent Alexander-Arnold', subtitle: 'Real Madrid · Inglaterra',                   emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', apiId: 283, image: fbPlayerPhoto(283) },
  { id: '2489', name: 'Luis Díaz',              subtitle: 'Bayern Múnich · Colombia',                   emoji: '🇨🇴', apiId: 2489, image: fbPlayerPhoto(2489) },
  { id: '30415', name: 'Dušan Vlahović',         subtitle: 'Juventus · Serbia',                          emoji: '🇷🇸', apiId: 30415, image: fbPlayerPhoto(30415) },
  { id: '296667', name: 'Gavi',                   subtitle: 'Barcelona · España',                         emoji: '🇪🇸', apiId: 296667, image: fbPlayerPhoto(296667) },
  { id: '756', name: 'Federico Valverde',      subtitle: 'Real Madrid · Uruguay',                      emoji: '🇺🇾', apiId: 756, image: fbPlayerPhoto(756) },
  { id: '909', name: 'Marcus Rashford',        subtitle: 'Barcelona · Inglaterra',                     emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', apiId: 909, image: fbPlayerPhoto(909) },
  { id: '56', name: 'Antoine Griezmann',      subtitle: 'Atlético Madrid · Francia',                  emoji: '🇫🇷', apiId: 56, image: fbPlayerPhoto(56) },
  { id: '184', name: 'Harry Kane',             subtitle: 'Bayern Múnich · Inglaterra',                 emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', apiId: 184, image: fbPlayerPhoto(184) },
  { id: '284324', name: 'Alejandro Garnacho',     subtitle: 'Chelsea · Argentina',                        emoji: '🇦🇷', apiId: 284324, image: fbPlayerPhoto(284324) },
  { id: '183799', name: 'Nico Williams',          subtitle: 'Athletic Club · España',                     emoji: '🇪🇸', apiId: 183799, image: fbPlayerPhoto(183799) },
  { id: '2676', name: 'Rúben Neves',            subtitle: 'Al-Hilal · Portugal',                        emoji: '🇵🇹', apiId: 2676, image: fbPlayerPhoto(2676) },
  { id: '128384', name: 'Vitinha',                subtitle: 'PSG · Portugal',                             emoji: '🇵🇹', apiId: 128384, image: fbPlayerPhoto(128384) },
  { id: '2413', name: 'Richarlison',            subtitle: 'Tottenham · Brasil',                         emoji: '🇧🇷', apiId: 2413, image: fbPlayerPhoto(2413) },
  { id: '51617', name: 'Darwin Núñez',           subtitle: 'Al-Hilal · Uruguay',                         emoji: '🇺🇾', apiId: 51617, image: fbPlayerPhoto(51617) },
  { id: '247', name: 'Cody Gakpo',             subtitle: 'Liverpool · Países Bajos',                   emoji: '🇳🇱', apiId: 247, image: fbPlayerPhoto(247) },
  { id: '483', name: 'Khvicha Kvaratskhelia',  subtitle: 'PSG · Georgia',                              emoji: '🇬🇪', apiId: 483, image: fbPlayerPhoto(483) },
  { id: '2780', name: 'Victor Osimhen',         subtitle: 'Galatasaray · Nigeria',                      emoji: '🇳🇬', apiId: 2780, image: fbPlayerPhoto(2780) },
  { id: '9', name: 'Achraf Hakimi',          subtitle: 'PSG · Marruecos',                            emoji: '🇲🇦', apiId: 9, image: fbPlayerPhoto(9) },
  { id: '153', name: 'Ousmane Dembélé',        subtitle: 'PSG · Francia',                              emoji: '🇫🇷', apiId: 153, image: fbPlayerPhoto(153) },
  { id: '21393', name: 'Serhou Guirassy',        subtitle: 'Borussia Dortmund · Guinea',                 emoji: '🇬🇳', apiId: 21393, image: fbPlayerPhoto(21393) },
  { id: '8489', name: 'Jonathan David',         subtitle: 'Juventus · Canadá',                          emoji: '🇨🇦', apiId: 8489, image: fbPlayerPhoto(8489) },
  { id: '36902', name: 'Tijjani Reijnders',      subtitle: 'Manchester City · Países Bajos',             emoji: '🇳🇱', apiId: 36902, image: fbPlayerPhoto(36902) },
  { id: '336657', name: 'Warren Zaïre-Emery',     subtitle: 'PSG · Francia',                              emoji: '🇫🇷', apiId: 336657, image: fbPlayerPhoto(336657) },
  { id: '377122', name: 'Endrick',                subtitle: 'Real Madrid · Brasil',                       emoji: '🇧🇷', apiId: 377122, image: fbPlayerPhoto(377122) },
  { id: '396623', name: 'Pau Cubarsí',            subtitle: 'Barcelona · España',                         emoji: '🇪🇸', apiId: 396623, image: fbPlayerPhoto(396623) },
  { id: '342970', name: 'Leny Yoro',              subtitle: 'Manchester United · Francia',                emoji: '🇫🇷', apiId: 342970, image: fbPlayerPhoto(342970) },
  { id: '270510', name: 'Mathys Tel',             subtitle: 'Tottenham · Francia',                        emoji: '🇫🇷', apiId: 270510, image: fbPlayerPhoto(270510) },
  { id: '161928', name: 'Alejandro Balde',        subtitle: 'Barcelona · España',                         emoji: '🇪🇸', apiId: 161928, image: fbPlayerPhoto(161928) },
  // ── México stars ───────────────────────────────────────────────────────────
  { id: '94562', name: 'Santiago Giménez',       subtitle: 'AC Milan · México',                          emoji: '🇲🇽', apiId: 94562, image: fbPlayerPhoto(94562) },
  { id: '2887', name: 'Raúl Jiménez',           subtitle: 'Fulham · México',                            emoji: '🇲🇽', apiId: 2887, image: fbPlayerPhoto(2887) },
  { id: '35532', name: 'Julián Quiñones',        subtitle: 'Al-Qadsiah · México',                        emoji: '🇲🇽', apiId: 35532, image: fbPlayerPhoto(35532) },
  { id: '2098', name: 'Guillermo Ochoa',        subtitle: 'AVS · México',                               emoji: '🇲🇽', apiId: 2098, image: fbPlayerPhoto(2098) },
  { id: '248', name: 'Hirving Lozano',         subtitle: 'San Diego FC · México',                      emoji: '🇲🇽', apiId: 248, image: fbPlayerPhoto(248) },
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

const EMPTY_MESSAGE_KEYS: Record<Tab, string> = {
  equipos:   'favorites.emptyTeams',
  ligas:     'favorites.emptyLeagues',
  jugadores: 'favorites.emptyPlayers',
};

const INITIAL_SUGGESTED = 10;
const LOAD_MORE_COUNT   = 10;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Two-letter abbreviation for initials fallback */
function abbrev(name: string | null | undefined): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/**
 * Remove duplicate items keeping the first occurrence.
 * Deduplicates by BOTH numeric apiId AND string id so that React key
 * collisions (e.g. two entries with item.id='85668') are impossible.
 */
function deduplicateItems(items: FavItem[]): FavItem[] {
  const seenEids   = new Set<string>(); // numeric apiId or string id
  const seenStrIds = new Set<string>(); // raw string id (used as React key)
  return items.filter(item => {
    const eid = item.apiId ? String(item.apiId) : item.id;
    if (seenEids.has(eid) || seenStrIds.has(item.id)) return false;
    seenEids.add(eid);
    seenStrIds.add(item.id);
    return true;
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Round avatar — image if available, initials/emoji fallback on error.
 *  Always wrapped in a tinted container so logos with white backgrounds
 *  (Premier League flag, DFB Pokal, etc.) don't clash against the dark theme. */
const ItemAvatar: React.FC<{
  name: string;
  emoji: string;
  image?: string;
  size?: number;
  isDark: boolean;
  isLeague?: boolean;
  isPlayer?: boolean;
}> = ({ name, emoji, image, size = 40, isDark, isLeague, isPlayer }) => {
  const [imgFailed, setImgFailed] = React.useState(false);
  const s = size;
  // Players → circle, Leagues → rounded-rect (9), Teams → rounded-rect (8)
  const radius = isLeague ? 9 : (isPlayer ? s / 2 : 8);

  // Unified container tint — works for image logos, league flags and initials
  const containerBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  if (isImageUri(image) && !imgFailed) {
    return (
      <View style={{
        width: s, height: s, borderRadius: radius,
        backgroundColor: containerBg,
        alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        <Image
          source={{ uri: image }}
          style={{ width: s * 0.86, height: s * 0.86, borderRadius: isPlayer ? s / 2 : radius - 1 }}
          contentFit="contain"
          recyclingKey={image}
          onError={() => setImgFailed(true)}
        />
      </View>
    );
  }

  // League: show emoji flag inside the same container
  if (isLeague) {
    return (
      <View style={{
        width: s, height: s, borderRadius: radius,
        backgroundColor: containerBg,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: s * 0.52 }}>{emoji}</Text>
      </View>
    );
  }

  // Team / player: initials on accent tint
  const letters = abbrev(name);
  return (
    <View style={{
      width: s, height: s, borderRadius: radius,
      backgroundColor: isDark ? 'rgba(0,224,150,0.12)' : 'rgba(0,150,100,0.10)',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{
        fontSize: s * 0.32,
        fontWeight: '800',
        color: '#00E096',
        letterSpacing: 0.5,
      }}>
        {letters}
      </Text>
    </View>
  );
};


/** Friendly card shown when the user hasn't followed anything in the current
 *  tab yet — invites them to explore the suggestions below. */
const EmptyFollowedCard: React.FC<{ message: string; isDark: boolean }> = ({ message, isDark }) => (
  <View style={[ef.card, {
    backgroundColor: isDark ? 'rgba(0,224,150,0.06)' : 'rgba(0,200,120,0.06)',
    borderColor: 'rgba(0,224,150,0.22)',
  }]}>
    <Text style={ef.emoji}>⭐</Text>
    <Text style={[ef.text, { color: isDark ? '#FFFFFF' : '#111827' }]}>{message}</Text>
    <Text style={ef.arrow}>↓</Text>
  </View>
);

const ef = StyleSheet.create({
  card: {
    marginTop: 16, marginBottom: 4,
    paddingVertical: 16, paddingHorizontal: 16,
    borderRadius: 14, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  emoji: { fontSize: 24 },
  text:  { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  arrow: { fontSize: 18, color: '#00E096', fontWeight: '800' },
});

/** Single item row — compact, fixed-width follow button, no chevron.
 *
 *  Followed state uses accent green (positive "action already taken") instead
 *  of red (which read as a destructive "delete this" cue). Tap still toggles.
 *  The whole row is tappable for navigation; the chevron has been removed
 *  since it duplicated the affordance and added visual noise. */
const ItemRow: React.FC<{
  item: FavItem;
  followed: boolean;
  canNavigate: boolean;
  isLeague: boolean;
  isPlayer: boolean;
  isDark: boolean;
  onToggle: () => void;
  onNav: () => void;
  borderColor: string;
}> = React.memo(({ item, followed, canNavigate, isLeague, isPlayer, isDark, onToggle, onNav, borderColor }) => (
  <TouchableOpacity
    activeOpacity={canNavigate ? 0.7 : 1}
    onPress={canNavigate ? onNav : undefined}
    disabled={!canNavigate}
    style={[
      ir.row,
      {
        backgroundColor: followed
          ? (isDark ? 'rgba(0,224,150,0.05)' : 'rgba(0,200,120,0.05)')
          : 'transparent',
        borderColor: followed ? 'rgba(0,224,150,0.20)' : borderColor,
        borderWidth: 1,
      },
    ]}
  >
    {/* Avatar */}
    <ItemAvatar
      name={item.name}
      emoji={item.emoji}
      image={item.image}
      size={40}
      isDark={isDark}
      isLeague={isLeague}
      isPlayer={isPlayer}
    />

    {/* Info */}
    <View style={ir.info}>
      <Text style={[ir.name, { color: isDark ? '#FFFFFF' : '#111827' }]} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={[ir.sub, { color: isDark ? '#8E8E93' : '#6B7280' }]} numberOfLines={1}>
        {item.subtitle}
      </Text>
    </View>

    {/* Follow / Unfollow button — fixed width so columns line up */}
    <TouchableOpacity
      style={[
        ir.btn,
        followed
          ? {
              backgroundColor: isDark ? 'rgba(0,224,150,0.10)' : 'rgba(0,200,120,0.10)',
              borderColor: 'rgba(0,224,150,0.35)',
              borderWidth: 1,
            }
          : { backgroundColor: '#00E096' },
      ]}
      onPress={onToggle}
      activeOpacity={0.8}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
    >
      <Text
        style={[ir.btnText, { color: followed ? '#00E096' : '#0D0D0D' }]}
        numberOfLines={1}
      >
        {followed ? '✓ Siguiendo' : '+ Seguir'}
      </Text>
    </TouchableOpacity>
  </TouchableOpacity>
));

const ir = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 7, paddingHorizontal: 11, gap: 11,
    borderRadius: 12, marginBottom: 5,
  },
  info:    { flex: 1, minWidth: 0 },
  name:    { fontSize: 14, fontWeight: '600' },
  sub:     { fontSize: 11, fontWeight: '500', marginTop: 1 },
  btn: {
    minWidth: 96,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
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

  // Region + language drive the same country-aware ordering as the onboarding
  // grid — Mexican users see México + Liga MX first, Argentine users see
  // Argentina + Liga Profesional first, etc. Falls back to a sensible default
  // ordering before the IP-based country resolves.
  const { country, language } = useUserCountry();

  const [activeTab, setActiveTab] = useState<Tab>('equipos');
  const [searchQuery, setSearchQuery] = useState('');

  // ── Swipe entre tabs (Equipos ↔ Ligas ↔ Jugadores) ──
  // Mismo patrón que MatchDetail/LeagueDetail; al cambiar limpia la búsqueda
  // igual que el tap en CategoryTabs.
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const tabSwipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderRelease: (_, g) => {
        const dir = g.dx <= -55 ? 1 : g.dx >= 55 ? -1 : 0;
        if (!dir) return;
        const keys: Tab[] = ['equipos', 'ligas', 'jugadores'];
        const next = keys.indexOf(activeTabRef.current) + dir;
        if (next >= 0 && next < keys.length) {
          setActiveTab(keys[next]);
          setSearchQuery('');
          setDebouncedQuery('');
        }
      },
    }),
  ).current;
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [suggestedVisible, setSuggestedVisible] = useState(INITIAL_SUGGESTED);

  const [smTeams,   setSmTeams]   = useState<SearchableTeam[]>([]);
  const [smPlayers, setSmPlayers] = useState<SearchablePlayer[]>([]);
  const [smLeagues, setSmLeagues] = useState<SearchableLeague[]>([]);
  const [loading, setLoading]     = useState(true);
  const [teamIndexLoaded, setTeamIndexLoaded] = useState(false);

  // ── Load the searchable lists ──
  useEffect(() => {
    // Phase 1: the curated popular teams and players — instant, no network.
    Promise.all([
      getSearchableTeams().then(setSmTeams).catch(() => {}),
      getSearchablePlayers().then(setSmPlayers).catch(() => {}),
    ]).finally(() => setLoading(false));

    setSmLeagues(getSearchableLeagues());

    // Phase 2: every team of the curated leagues (one cached Firestore read),
    // so a followed club outside the popular list still shows in MIS SEGUIDOS.
    getAllSearchableTeams()
      .then(full => { setSmTeams(prev => (full.length > prev.length ? full : prev)); })
      .catch(() => {})
      .finally(() => setTeamIndexLoaded(true));
  }, []);

  // ── Follows the lists above don't include ──
  // A lower-league club, a squad player followed from his page, a follow
  // carried over from the previous data source: without their name and picture
  // they would be missing from MIS SEGUIDOS (and impossible to unfollow here).
  const smTeamIdsKey = useMemo(() => smTeams.map(t => t.id).join(','), [smTeams]);
  useEffect(() => {
    if (!teamIndexLoaded) return;
    const known = new Set(smTeams.map(t => String(t.id)));
    const missing = followedTeamIds.filter(id => !known.has(String(id)));
    if (!missing.length) return;
    let cancelled = false;
    resolveFollowedTeams(missing.map(String)).then(found => {
      if (cancelled || !found.length) return;
      setSmTeams(prev => {
        const ids = new Set(prev.map(t => t.id));
        const extras = found.filter(t => !ids.has(t.id));
        return extras.length ? [...prev, ...extras] : prev;
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [teamIndexLoaded, followedTeamIds, smTeamIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Followed leagues outside the curated list come from the full catalog.
  useEffect(() => {
    const known = new Set(smLeagues.map(l => String(l.id)));
    const missing = new Set(followedLeagueIds.map(String).filter(id => !known.has(id)));
    if (!missing.size || !smLeagues.length) return;
    let cancelled = false;
    getAllSearchableLeagues().then(all => {
      if (cancelled) return;
      const extras = all.filter(l => missing.has(String(l.id)));
      if (extras.length) setSmLeagues(prev => [...prev, ...extras.filter(l => !prev.some(p => p.id === l.id))]);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [followedLeagueIds, smLeagues.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const smPlayerIdsKey = useMemo(() => smPlayers.map(p => p.id).join(','), [smPlayers]);
  useEffect(() => {
    if (loading) return;
    const known = new Set(smPlayers.map(p => String(p.id)));
    const missing = followedPlayerIds.filter(id => !known.has(String(id)));
    if (!missing.length) return;
    let cancelled = false;
    resolveFollowedPlayers(missing.map(String)).then(found => {
      if (cancelled || !found.length) return;
      setSmPlayers(prev => {
        const ids = new Set(prev.map(p => p.id));
        const extras = found.filter(p => !ids.has(p.id));
        return extras.length ? [...prev, ...extras] : prev;
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [loading, followedPlayerIds, smPlayerIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Remote search ──
  // Any club or player beyond the local lists: the backend searches the full
  // database and the answers join the same lists the tabs filter.
  useEffect(() => {
    if (activeTab === 'ligas' || debouncedQuery.trim().length < 3) return;
    let cancelled = false;
    searchRemote(debouncedQuery).then(res => {
      if (cancelled) return;
      if (res.teams.length) {
        setSmTeams(prev => {
          const ids = new Set(prev.map(t => t.id));
          const extras = res.teams.filter(t => !ids.has(t.id));
          return extras.length ? [...prev, ...extras] : prev;
        });
      }
      if (res.players.length) {
        setSmPlayers(prev => {
          const ids = new Set(prev.map(p => p.id));
          const extras = res.players.filter(p => !ids.has(p.id));
          return extras.length ? [...prev, ...extras] : prev;
        });
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [debouncedQuery, activeTab]);

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

  // ID-based lookup — used first in enrichment to avoid name collisions
  // (e.g. Guadalajara MX id=427 vs. Guadalajara ES id=85668).
  const smTeamById = useMemo(() => {
    const m = new Map<number, SearchableTeam>();
    smTeams.forEach(t => m.set(t.id, t));
    return m;
  }, [smTeams]);

  const smPlayerMap = useMemo(() => {
    const m = new Map<string, SearchablePlayer>();
    smPlayers.forEach(p => {
      const key = normalize(p.name);
      const existing = m.get(key);
      if (!existing) {
        m.set(key, p);
        return;
      }
      // Prefer the entry that has a real HTTP image over one that doesn't.
      // This prevents Phase 2 squad entries (often have empty image_path) from
      // overwriting Phase 1 entries that already have a verified real photo URL.
      const existingHasImg = isImageUri(existing.image);
      const newHasImg      = isImageUri(p.image);
      if (newHasImg && !existingHasImg) {
        m.set(key, p);
      }
    });
    return m;
  }, [smPlayers]);

  const smLeagueMap = useMemo(() => {
    const m = new Map<string, SearchableLeague>();
    smLeagues.forEach(l => m.set(normalize(l.name), l));
    return m;
  }, [smLeagues]);

  // ── Enriched items ──
  // The base list is built from the SAME country-aware grid the onboarding
  // uses (buildOnboardingTeamGrid). This:
  //   • Includes national teams from POPULAR_NATIONAL_TEAMS — without this,
  //     a user who picked "México" in onboarding never saw México appear in
  //     MIS SEGUIDOS because the screen's local POPULAR_TEAMS hardcode only
  //     had clubs.
  //   • Orders entries by relevance to the user's country (national team
  //     first, then local clubs, then mixed globals), matching what the
  //     user saw during onboarding.
  //   • Preserves the hardcoded "Liga MX · México" style subtitles for the
  //     30 teams we maintain locally, falling back to leagueName for the
  //     other entries.
  const popularTeamMeta = useMemo(() => {
    const m = new Map<string, { subtitle: string; emoji: string; searchAliases?: string[] }>();
    for (const t of POPULAR_TEAMS) {
      const meta = { subtitle: t.subtitle, emoji: t.emoji, searchAliases: t.searchAliases };
      if (t.apiId) m.set(String(t.apiId), meta);
      m.set(t.id, meta);
    }
    return m;
  }, []);

  const enrichedTeams = useMemo(() => {
    // Country-aware ordering — same source the onboarding picker uses
    const ordered = buildOnboardingTeamGrid(country, language);

    const baseItems: FavItem[] = ordered.map(st => {
      const id = String(st.id);
      const pretty = popularTeamMeta.get(id);
      const isNational = st.leagueName === 'Selección Nacional';
      return {
        id,
        name: st.name,
        subtitle: pretty?.subtitle ?? (isNational ? 'Selección Nacional' : (st.leagueName || '')),
        emoji: pretty?.emoji ?? (isNational ? '🏳️' : abbrev(st.name)),
        apiId: st.id,
        image: isImageUri(st.logo) ? st.logo : undefined,
        seasonId: st.seasonId,
        searchAliases: pretty?.searchAliases,
      };
    });

    // Enrich with the loaded team index (logo, seasonId).
    // Prefer ID lookup so teams with the same name in different leagues
    // (e.g. Guadalajara MX id=427 vs. Guadalajara ES id=85668) always
    // resolve to the correct team.
    const enriched = baseItems.map(item => {
      const sm = (item.apiId ? smTeamById.get(item.apiId) : undefined)
        ?? smTeamMap.get(normalize(item.name));
      if (!sm) return item;
      const apiImage = isImageUri(sm.logo) ? sm.logo : undefined;
      return {
        ...item,
        apiId:     item.apiId ?? sm.id,
        image:    apiImage ?? item.image,
        seasonId: sm.seasonId ?? item.seasonId,
      };
    });

    // Tail: any other loaded team not in our ordered set (long tail for search)
    const seenNames = new Set(enriched.map(t => normalize(t.name)));
    const extras: FavItem[] = smTeams
      .filter(t => !seenNames.has(normalize(t.name)))
      .map(t => ({
        id: String(t.id),
        name: t.name,
        subtitle: t.leagueName || '',
        emoji: abbrev(t.name),
        apiId: t.id,
        image: isImageUri(t.logo) ? t.logo : undefined,
        seasonId: t.seasonId,
      }));

    return deduplicateItems([...enriched, ...extras]);
  }, [country, language, popularTeamMeta, smTeamMap, smTeams]);

  // ── Players: split into popular (suggestions) vs all (search index) ──
  // Popular = curated 15 globally top players (Messi, Ronaldo, etc.) → shown as suggestions.
  // All = popular + Phase 2 squad data (~750 players from popular team rosters) → search only.
  // This prevents the suggestions list from being flooded with squad players (e.g. all of
  // América's roster), while still allowing the user to search for any squad player by name.
  //
  // Order: SAME country-aware ordering the onboarding picker uses
  // (buildOnboardingPlayerNames). Mexican user lands on Santi Giménez +
  // Raúl Jiménez first, then Messi/CR7/Mbappé/Haaland; Argentine sees Messi
  // first; Brazilian sees Vini Jr / Neymar first; etc. Anything in
  // POPULAR_PLAYERS that the country-aware function doesn't surface is
  // appended at the end so we never drop a player from the suggestions.
  const enrichedPopularPlayers = useMemo(() => {
    // Build a lookup of POPULAR_PLAYERS by normalized name for O(1) reorder
    const playerByName = new Map<string, FavItem>();
    POPULAR_PLAYERS.forEach(item => {
      playerByName.set(normalize(item.name), item);
    });

    // Pull country-ordered names from the same function as the onboarding
    const orderedNames = buildOnboardingPlayerNames(country, language);

    // Project ordered names → FavItems (preserving local hardcoded metadata)
    const ordered: FavItem[] = [];
    const usedKeys = new Set<string>();
    for (const name of orderedNames) {
      const key = normalize(name);
      const item = playerByName.get(key);
      if (item && !usedKeys.has(key)) {
        ordered.push(item);
        usedKeys.add(key);
      }
    }

    // Defensive tail: any POPULAR_PLAYERS not surfaced by buildOnboardingPlayerNames
    // get appended at the end so we never silently drop a curated player.
    for (const item of POPULAR_PLAYERS) {
      const key = normalize(item.name);
      if (!usedKeys.has(key)) {
        ordered.push(item);
        usedKeys.add(key);
      }
    }

    // Enrich with loaded player data (current club, image, jersey)
    return ordered.map(item => {
      const sm = smPlayerMap.get(normalize(item.name));
      if (!sm) return item;
      // API-verified image only; do NOT fall back to hardcoded CDN path.
      const apiImage = isImageUri(sm.image) ? sm.image : undefined;
      // Replace the hardcoded "Club · Country" subtitle with a fresh
      // "{API-club} · {country-from-hardcoded-subtitle}" so transfers don't
      // leave stale team names visible (e.g. KdB moved Man City → Napoli).
      // The country is the part AFTER the last " · " in the original subtitle.
      const playerNationality = item.subtitle.includes(' · ')
        ? item.subtitle.split(' · ').pop() ?? ''
        : item.subtitle;
      const subtitle = sm.teamName
        ? `${sm.teamName} · ${playerNationality}`
        : item.subtitle;
      return {
        ...item,
        subtitle,
        apiId: (sm.id && sm.id > 0) ? sm.id : item.apiId,
        image: apiImage ?? item.image,
        teamName: sm.teamName,
        teamLogo: sm.teamLogo,
        jerseyNumber: sm.jerseyNumber,
        position: sm.position,
      };
    });
  }, [country, language, smPlayerMap]);

  const enrichedAllPlayers = useMemo(() => {
    const names = new Set(POPULAR_PLAYERS.map(p => normalize(p.name)));
    const extras: FavItem[] = smPlayers
      .filter(p => !names.has(normalize(p.name)))
      .map(p => ({
        id: String(p.id),
        name: p.name,
        // Show "Team · League" (e.g. "América · Liga MX") for squad players.
        subtitle: [p.teamName, p.leagueName || p.position].filter(Boolean).join(' · ') || '',
        emoji: abbrev(p.name),
        apiId: p.id,
        image: isImageUri(p.image) ? p.image : undefined,
        teamName: p.teamName,
        teamLogo: p.teamLogo,
        jerseyNumber: p.jerseyNumber,
        position: p.position,
      }));
    return deduplicateItems([...enrichedPopularPlayers, ...extras]);
  }, [enrichedPopularPlayers, smPlayers]);

  const enrichedLeagues = useMemo(() => {
    // Reorder POPULAR_LEAGUES so the country's preferred leagues come first.
    // buildOnboardingLeagueOrder returns the same order used by the onboarding
    // Competiciones screen — so a Mexican user lands on Mundial 2026 + Liga MX
    // + Champions League first, an Argentine on Mundial 2026 + Liga Profesional
    // first, etc. Anything not in the preset keeps its original config order.
    const { order: leagueOrder } = buildOnboardingLeagueOrder(country, language);
    const orderMap = new Map<number, number>();
    leagueOrder.forEach((id, idx) => orderMap.set(id, idx));

    const sortedPopular = [...POPULAR_LEAGUES].sort((a, b) => {
      const ai = orderMap.get(Number(a.apiId ?? a.id)) ?? Number.MAX_SAFE_INTEGER;
      const bi = orderMap.get(Number(b.apiId ?? b.id)) ?? Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });

    const names = new Set(sortedPopular.map(l => normalize(l.name)));
    const popular = sortedPopular.map(item => {
      const sm = smLeagueMap.get(normalize(item.name));
      if (!sm) return item;
      const apiImage = isImageUri(sm.image) ? sm.image : undefined;
      return { ...item, apiId: sm.id ?? item.apiId, seasonId: sm.seasonId, image: apiImage ?? item.image };
    });
    const extras: FavItem[] = smLeagues
      .filter(l => !names.has(normalize(l.name)))
      .map(l => ({
        id: String(l.id),
        name: l.name,
        subtitle: l.country ? translateLeagueCountry(l.country) : '',
        emoji: l.flag || '🏆',
        apiId: l.id,
        image: isImageUri(l.image) ? l.image : undefined,
        seasonId: l.seasonId,
      }));
    return deduplicateItems([...popular, ...extras]);
  }, [country, language, smLeagueMap, smLeagues]);

  // ── Effective ID helper ──
  // The id a follow is stored under: always the item's numeric id as a string.
  const getEffectiveId = useCallback((item: FavItem): string => item.id, []);

  // ── Per-tab config ──
  // `items`       → list shown as suggestions (popular only for jugadores)
  // `searchItems` → full searchable index (popular + squad data for jugadores).
  //                 Also used to compute `followed` so squad-followed players still appear.
  const tabConfig = useMemo(() => ({
    equipos: {
      items: enrichedTeams,
      searchItems: enrichedTeams,
      isFollowing: (item: FavItem) => isFollowingTeam(getEffectiveId(item)),
      toggle: (item: FavItem) => toggleFollowTeam(getEffectiveId(item)),
      count: enrichedTeams.filter(t => isFollowingTeam(getEffectiveId(t))).length,
    },
    ligas: {
      items: enrichedLeagues,
      searchItems: enrichedLeagues,
      isFollowing: (item: FavItem) => isFollowingLeague(getEffectiveId(item)),
      toggle: (item: FavItem) => toggleFollowLeague(getEffectiveId(item)),
      count: enrichedLeagues.filter(l => isFollowingLeague(getEffectiveId(l))).length,
    },
    jugadores: {
      items: enrichedPopularPlayers,        // suggestions: only the curated 15 TOP players
      searchItems: enrichedAllPlayers,      // search & followed: popular + squad data (~750)
      isFollowing: (item: FavItem) => isFollowingPlayer(getEffectiveId(item)),
      toggle: (item: FavItem) => toggleFollowPlayer(getEffectiveId(item)),
      count: enrichedAllPlayers.filter(p => isFollowingPlayer(getEffectiveId(p))).length,
    },
  }), [
    enrichedTeams, enrichedLeagues,
    enrichedPopularPlayers, enrichedAllPlayers,
    followedTeamIds, followedLeagueIds, followedPlayerIds,
    isFollowingTeam, isFollowingLeague, isFollowingPlayer,
    toggleFollowTeam, toggleFollowLeague, toggleFollowPlayer,
    getEffectiveId,
  ]);

  const config = tabConfig[activeTab];
  const isLeague = activeTab === 'ligas';
  const isPlayer = activeTab === 'jugadores';

  // ── Split: followed vs suggestions ──
  // Followed comes from `searchItems` (full index) — so a player followed via search
  // (e.g. Lichnovsky) still appears in "Mis seguidos".
  // Suggestions come from `items` (curated only) — so we don't flood the screen with
  // 750+ squad players from Phase 2 data.
  const { followed, suggestions } = useMemo(() => {
    const fol = config.searchItems.filter(item => config.isFollowing(item));
    const sug = config.items.filter(item => !config.isFollowing(item));
    return { followed: fol, suggestions: sug };
  }, [config]);

  // ── Search (flat, no section split) ──
  // Uses `searchItems` (full index) so users can find any player by name —
  // including squad players that aren't in the curated suggestion list.
  const searchResults = useMemo(() => {
    if (!debouncedQuery.trim()) return null;
    const q = normalize(debouncedQuery);
    return rankByQuery(config.searchItems.filter(i =>
      normalize(i.name).includes(q) ||
      normalize(i.subtitle).includes(q) ||
      (i.searchAliases?.some(a => normalize(a).includes(q)) ?? false)
    ), debouncedQuery, i => [i.name, ...(i.searchAliases ?? [])].join(' '));
  }, [config.searchItems, debouncedQuery]);

  // ── Navigation ──
  const handleItemNav = useCallback((item: FavItem) => {
    if (!item.apiId) return;
    if (activeTab === 'equipos') {
      navigation.navigate('TeamDetail', {
        teamId: item.apiId,
        teamName: item.name,
        teamLogo: item.image || item.emoji,
        seasonId: item.seasonId,
      });
    } else if (activeTab === 'ligas') {
      navigation.navigate('LeagueDetail', {
        leagueId: item.apiId,
        leagueName: item.name,
        leagueLogo: item.emoji,
        seasonId: item.seasonId,
      });
    } else {
      navigation.navigate('PlayerDetail', {
        playerId: item.apiId,
        playerName: item.name,
        playerImage: item.image,
        teamName: item.teamName,
        teamLogo: item.teamLogo,
        jerseyNumber: item.jerseyNumber,
      });
    }
  }, [activeTab, navigation]);

  const totalCount = tabConfig.equipos.count + tabConfig.ligas.count + tabConfig.jugadores.count;

  // ── Section data for the main (non-search) list ──
  const visibleSuggestions = suggestions.slice(0, suggestedVisible);
  const remainingSuggested = suggestions.length - suggestedVisible;

  // ── Render item (shared between search and sectioned list) ──
  // keyPrefix ensures sibling keys are unique across sections ('f_', 's_', 'q_').
  const renderItem = useCallback((item: FavItem, keyPrefix: string) => {
    const fol = config.isFollowing(item);
    return (
      <ItemRow
        key={`${keyPrefix}${item.apiId ?? item.id}`}
        item={item}
        followed={fol}
        canNavigate={!!item.apiId}
        isLeague={isLeague}
        isPlayer={isPlayer}
        isDark={isDark}
        onToggle={() => { haptics.medium(); config.toggle(item); }}
        onNav={() => handleItemNav(item)}
        borderColor={isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}
      />
    );
  }, [config, isLeague, isPlayer, isDark, handleItemNav]);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[st.safe, { backgroundColor: c.bg }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── Header ── unified (see ScreenHeader) */}
      <ScreenHeader
        icon="⭐"
        iconBg="rgba(251,191,36,0.15)"
        title={t('favorites.title')}
        right={
          totalCount > 0 ? (
            <View style={st.headerCountPill}>
              <Text style={st.headerCountNum}>{totalCount}</Text>
              <Text style={st.headerCountStar}>⭐</Text>
            </View>
          ) : undefined
        }
      />

      {/* ── Tabs ── unified CategoryTabs (see CategoryTabs.tsx) */}
      <CategoryTabs<Tab>
        tabs={TABS.map(tab => ({
          key: tab.id,
          label: t(tab.labelKey),
          emoji: tab.icon,
          badge: tabConfig[tab.id].count,
        }))}
        activeKey={activeTab}
        onChange={(key) => { setActiveTab(key); setSearchQuery(''); setDebouncedQuery(''); }}
        layout="fill"
      />

      {/* ── Search ── */}
      <View style={st.searchWrap}>
        <View style={[st.searchBar, { backgroundColor: c.surface, borderColor: c.border }]}>
          <SearchIcon color={c.textTertiary} size={16} />
          <TextInput
            style={[st.searchInput, { color: c.textPrimary }]}
            placeholder={t(SEARCH_PLACEHOLDER_KEYS[activeTab])}
            placeholderTextColor={c.textTertiary}
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
              searchDebounceRef.current = setTimeout(() => setDebouncedQuery(text), 250);
            }}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => { setSearchQuery(''); setDebouncedQuery(''); }}
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
          {...tabSwipe.panHandlers}
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
                  <SectionHeader
                    label={`${searchResults.length} resultado${searchResults.length !== 1 ? 's' : ''}`}
                    line
                    paddingHorizontal={0}
                    marginTop={4}
                    marginBottom={10}
                  />
                  {searchResults.map(item => renderItem(item, 'q_'))}
                </>
              )}
            </>
          )}

          {/* ── NORMAL MODE ── */}
          {searchResults === null && (
            <>
              {/* Section: Mis seguidos (or empty-state card guiding the user) */}
              {followed.length > 0 ? (
                <>
                  <SectionHeader
                    icon="⭐"
                    label={t('favorites.myFollowed')}
                    count={followed.length}
                    accent
                    line
                    paddingHorizontal={0}
                    marginTop={16}
                    marginBottom={6}
                  />
                  {followed.map(item => renderItem(item, 'f_'))}
                </>
              ) : (
                <EmptyFollowedCard
                  message={t(EMPTY_MESSAGE_KEYS[activeTab])}
                  isDark={isDark}
                />
              )}

              {/* Section: Los más seguidos (suggestions) */}
              <SectionHeader
                label={followed.length > 0 ? t('favorites.suggested') : t('favorites.mostFollowed')}
                count={suggestions.length}
                line
                paddingHorizontal={0}
                marginTop={16}
                marginBottom={6}
              />
              {visibleSuggestions.map(item => renderItem(item, 's_'))}

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

  // Compact stat pill mirroring the Partidos streak pill — same proportions,
  // accent tint matches the favourites identity (gold).
  headerCountPill:  {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: 'rgba(251,191,36,0.15)',
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12,
  },
  headerCountNum:   { fontSize: 14, fontWeight: '800', color: '#fbbf24' },
  headerCountStar:  { fontSize: 14 },

  // Search
  searchWrap: { paddingHorizontal: 16, marginBottom: 10 },
  searchBar:  { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, paddingHorizontal: 12, height: ui.searchBarHeight, borderWidth: 1, gap: 8 },
  searchInput:{ flex: 1, fontSize: 14, padding: 0 },
  searchClearBtn: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  searchClearText:{ fontSize: 10, fontWeight: '700' },

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
  emptyIcon:  { fontSize: 48 },
  emptyText:  { fontSize: 15, textAlign: 'center' },
});
