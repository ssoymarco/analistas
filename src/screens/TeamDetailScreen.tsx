// ── Team Detail Screen ────────────────────────────────────────────────────────
// Full team profile: sticky compact header, 4 tabs (Resumen, Plantilla, Partidos, Tabla).
// Dark/Light mode responsive. Uses real SportMonks data.
import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../theme/useTheme';
import { useDarkMode } from '../contexts/DarkModeContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { useTeamDetail } from '../hooks/useTeamDetail';
import type { PartidosStackParamList } from '../navigation/AppNavigator';
import type { TeamDetailData, SquadPlayer, RecentMatch, FormEntry } from '../hooks/useTeamDetail';
import type { LeagueStanding } from '../data/types';
import { SkeletonTeamDetail } from '../components/Skeleton';
import { BackArrow, ShareIcon } from '../components/NavIcons';

type Props = NativeStackScreenProps<PartidosStackParamList, 'TeamDetail'>;
type Tab = 'resumen' | 'plantilla' | 'partidos' | 'tabla';


// ── Form badges ──────────────────────────────────────────────────────────────
const FormBadges: React.FC<{ form: FormEntry[] }> = ({ form }) => {
  const { t } = useTranslation();
  const colors = { W: '#10b981', D: '#f59e0b', L: '#ef4444' };
  const labels: Record<string, string> = {
    W: t('team.formLabels.W'),
    D: t('team.formLabels.D'),
    L: t('team.formLabels.L'),
  };
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {form.map((f, i) => (
        <View key={i} style={{
          width: 22, height: 22, borderRadius: 11,
          backgroundColor: colors[f.result],
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>{labels[f.result]}</Text>
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
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();
  const { info, recentMatches, squad } = data;

  const topPlayers = squad.filter(p => p.positionId !== 24).slice(0, 5);

  return (
    <View style={{ paddingHorizontal: 16, gap: 12 }}>
      {/* Info card */}
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[s.cardTitle, { color: c.textPrimary }]}>{t('team.info')}</Text>
        {[
          { icon: '🏟️', label: t('team.stadium'), value: info.venueName },
          ...(info.venueCapacity > 0 ? [{ icon: '💺', label: t('team.capacity'), value: info.venueCapacity.toLocaleString() }] : []),
          ...(info.founded > 0 ? [{ icon: '📅', label: t('team.founded'), value: String(info.founded) }] : []),
          ...(info.coach ? [{ icon: '👔', label: t('team.coach'), value: info.coach }] : []),
          ...(info.leagueName ? [{ icon: '🏆', label: t('team.league'), value: info.leagueName }] : []),
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
          <Text style={[s.cardTitle, { color: c.textPrimary }]}>{t('matches.recentMatches')}</Text>
          {recentMatches.filter(m => m.isFinished).slice(0, 3).map((m, i) => (
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
          <Text style={[s.cardTitle, { color: c.textPrimary }]}>{t('team.featuredPlayers')}</Text>
          {topPlayers.map((p, i) => (
            <TouchableOpacity
              key={i}
              style={[s.playerRow, { borderTopColor: c.border }]}
              activeOpacity={0.7}
              onPress={() => navigation.push('PlayerDetail', {
                playerId: p.playerId,
                playerName: p.displayName,
                playerImage: p.image,
                teamName: info.name,
                teamLogo: info.logo,
                jerseyNumber: p.number,
              })}
            >
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
            </TouchableOpacity>
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

const POSITION_GROUPS: { labelKey: string; posId: number }[] = [
  { labelKey: 'team.positions.goalkeepers', posId: 24 },
  { labelKey: 'team.positions.defenders', posId: 25 },
  { labelKey: 'team.positions.midfielders', posId: 26 },
  { labelKey: 'team.positions.forwards', posId: 27 },
];

const PlantillaTab: React.FC<{ data: TeamDetailData }> = ({ data }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();

  return (
    <View style={{ paddingHorizontal: 16, gap: 8 }}>
      {POSITION_GROUPS.map(group => {
        const players = data.squad.filter(p => p.positionId === group.posId);
        if (players.length === 0) return null;

        return (
          <View key={group.posId}>
            <Text style={[s.sectionLabel, { color: c.textTertiary }]}>{t(group.labelKey)}</Text>
            <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
              {players.map((p, i) => (
                <TouchableOpacity
                  key={p.id}
                  style={[s.squadRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}
                  activeOpacity={0.7}
                  onPress={() => navigation.push('PlayerDetail', {
                    playerId: p.playerId,
                    playerName: p.displayName,
                    playerImage: p.image,
                    teamName: data.info.name,
                    teamLogo: data.info.logo,
                    jerseyNumber: p.number,
                  })}
                >
                  {p.image ? (
                    <Image source={{ uri: p.image }} style={[s.squadNum, { backgroundColor: c.surface }]} />
                  ) : (
                    <View style={[s.squadNum, { backgroundColor: c.surface }]}>
                      <Text style={[s.squadNumText, { color: c.textPrimary }]}>{p.number}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={[s.squadName, { color: c.textPrimary }]}>{p.displayName}</Text>
                    <Text style={[s.squadMeta, { color: c.textTertiary }]}>
                      {p.age > 0 ? t('team.ageYears', { age: p.age }) : ''}
                    </Text>
                  </View>
                  {p.isCaptain && (
                    <View style={[s.captainBadge, { backgroundColor: '#fbbf24' }]}>
                      <Text style={s.captainText}>C</Text>
                    </View>
                  )}
                </TouchableOpacity>
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
// TAB: Partidos (redesigned — current, previous 3, next 3)
// ══════════════════════════════════════════════════════════════════════════════

/** Convert RecentMatch to a navigable Match object */
function recentToMatch(m: RecentMatch): import('../data/types').Match {
  return {
    id: String(m.id),
    homeTeam: { id: '0', name: m.homeName, shortName: m.homeShort, logo: m.homeLogo },
    awayTeam: { id: '0', name: m.awayName, shortName: m.awayShort, logo: m.awayLogo },
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    status: m.isFinished ? 'finished' : 'scheduled',
    time: m.isFinished ? 'FT' : 'vs',
    league: m.league,
    leagueId: '',
    date: m.date,
  };
}

function MatchFixtureCard({
  m, highlight, label, c, onPress,
}: { m: RecentMatch; highlight?: boolean; label?: string; c: any; onPress?: () => void }) {
  const resultColors: Record<string, string> = { W: '#10b981', D: '#f59e0b', L: '#ef4444' };
  return (
    <TouchableOpacity
      style={[
        s.fixtureRow,
        { backgroundColor: c.card, borderColor: highlight ? c.accent : c.border },
        highlight && { borderWidth: 1.5 },
      ]}
      activeOpacity={0.7}
      onPress={onPress}
    >
      {label && (
        <View style={{
          position: 'absolute', top: -10, left: 14,
          backgroundColor: c.accent, borderRadius: 8,
          paddingHorizontal: 8, paddingVertical: 2,
        }}>
          <Text style={{ fontSize: 9, fontWeight: '800', color: '#111', letterSpacing: 0.5 }}>{label}</Text>
        </View>
      )}
      <Text style={[s.fixtureDate, { color: c.textTertiary }]}>{m.date}</Text>
      <View style={s.fixtureTeams}>
        <View style={s.fixtureTeam}>
          {m.homeLogo.startsWith('http') ? (
            <Image source={{ uri: m.homeLogo }} style={s.fixtureLogo} />
          ) : <Text style={{ fontSize: 14 }}>⚽</Text>}
          <Text style={[s.fixtureName, { color: c.textPrimary }]} numberOfLines={1}>{m.homeShort}</Text>
        </View>
        <View style={s.fixtureScoreWrap}>
          {m.isFinished ? (
            <>
              <Text style={[s.fixtureScore, { color: c.textPrimary }]}>{m.homeScore}</Text>
              <Text style={[s.fixtureScoreSep, { color: c.textTertiary }]}> </Text>
              <Text style={[s.fixtureScore, { color: c.textPrimary }]}>{m.awayScore}</Text>
              {m.result && (
                <View style={[s.resultDotSmall, { backgroundColor: resultColors[m.result] }]} />
              )}
            </>
          ) : (
            <Text style={[s.fixtureScore, { color: c.accent, fontSize: 13 }]}>vs</Text>
          )}
        </View>
        <View style={[s.fixtureTeam, { justifyContent: 'flex-end' }]}>
          <Text style={[s.fixtureName, { color: c.textPrimary, textAlign: 'right' }]} numberOfLines={1}>{m.awayShort}</Text>
          {m.awayLogo.startsWith('http') ? (
            <Image source={{ uri: m.awayLogo }} style={s.fixtureLogo} />
          ) : <Text style={{ fontSize: 14 }}>⚽</Text>}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const PartidosTab: React.FC<{ data: TeamDetailData }> = ({ data }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();
  const [showAll, setShowAll] = useState(false);

  const goToMatch = useCallback((m: RecentMatch) => {
    navigation.push('MatchDetail', { match: recentToMatch(m) });
  }, [navigation]);

  if (data.recentMatches.length === 0) {
    return (
      <View style={{ alignItems: 'center', paddingTop: 60 }}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>📋</Text>
        <Text style={{ fontSize: 15, fontWeight: '600', color: c.textSecondary }}>{t('matches.noMatchesAvailable')}</Text>
      </View>
    );
  }

  // Split: finished (newest first) and upcoming (soonest first)
  const finishedMatches = data.recentMatches.filter(m => m.isFinished);
  const upcomingMatches = data.recentMatches
    .filter(m => !m.isFinished)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Last match = most recent finished
  const lastMatch = finishedMatches[0] ?? null;
  // Previous = older finished (chronological: oldest first so they appear top)
  const previousMatches = finishedMatches.slice(1, 4).reverse();
  // Next 3 upcoming
  const nextMatches = upcomingMatches.slice(0, 3);

  // All matches for "Ver todos" — chronological order
  const allSorted = [...data.recentMatches].sort((a, b) => a.date.localeCompare(b.date));

  if (showAll) {
    return (
      <View style={{ paddingHorizontal: 16, gap: 6 }}>
        <TouchableOpacity
          onPress={() => setShowAll(false)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingVertical: 8,
          }}
          activeOpacity={0.7}
        >
          <BackArrow color={c.accent} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: c.accent }}>{t('team.backToSummary')}</Text>
        </TouchableOpacity>
        <Text style={[s.sectionLabel, { color: c.textTertiary }]}>
          {t('team.allMatches', { count: allSorted.length })}
        </Text>
        {allSorted.map(m => (
          <MatchFixtureCard key={m.id} m={m} c={c} onPress={() => goToMatch(m)} />
        ))}
        <View style={{ height: 20 }} />
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 16, gap: 6 }}>
      {/* Previous matches (oldest first → top of list) */}
      {previousMatches.length > 0 && (
        <>
          <Text style={[s.sectionLabel, { color: c.textTertiary }]}>{t('team.previous')}</Text>
          {previousMatches.map(m => (
            <MatchFixtureCard key={m.id} m={m} c={c} onPress={() => goToMatch(m)} />
          ))}
        </>
      )}

      {/* Last match (highlighted — center) */}
      {lastMatch && (
        <>
          <Text style={[s.sectionLabel, { color: c.textTertiary, marginTop: 8 }]}>{t('team.lastMatch')}</Text>
          <MatchFixtureCard m={lastMatch} highlight c={c} label={t('team.lastMatchLabel')} onPress={() => goToMatch(lastMatch)} />
        </>
      )}

      {/* Upcoming matches (below) */}
      {nextMatches.length > 0 && (
        <>
          <Text style={[s.sectionLabel, { color: c.textTertiary, marginTop: 8 }]}>{t('matches.upcoming')}</Text>
          {nextMatches.map(m => (
            <MatchFixtureCard key={m.id} m={m} c={c} onPress={() => goToMatch(m)} />
          ))}
        </>
      )}

      {/* Ver todos button */}
      {data.recentMatches.length > 7 && (
        <TouchableOpacity
          onPress={() => setShowAll(true)}
          style={[s.verTodosBtn, { borderColor: c.border }]}
          activeOpacity={0.7}
        >
          <Text style={[s.verTodosText, { color: c.accent }]}>
            {t('team.viewAllMatches', { count: data.recentMatches.length })}
          </Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 20 }} />
    </View>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Tabla (with tappable teams + share button)
// ══════════════════════════════════════════════════════════════════════════════

const TablaTab: React.FC<{ data: TeamDetailData }> = ({ data }) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const { isDark } = useDarkMode();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();
  const tableRef = useRef<any>(null);
  const [sharing, setSharing] = useState(false);

  const handleShare = useCallback(async () => {
    if (!tableRef.current) return;
    setSharing(true);
    try {
      const uri = await captureRef(tableRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: t('team.shareStandings'),
        });
      } else {
        Alert.alert(t('common.share'), t('team.shareUnavailable'));
      }
    } catch (err) {
      console.warn('[TablaTab] share failed:', err);
    } finally {
      setSharing(false);
    }
  }, []);

  if (data.standings.length === 0) {
    return (
      <View style={{ alignItems: 'center', paddingTop: 60 }}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>🏆</Text>
        <Text style={{ fontSize: 15, fontWeight: '600', color: c.textSecondary }}>{t('team.noStandings')}</Text>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 16 }}>
      {/* Capturable table area */}
      <ViewShot ref={tableRef} options={{ format: 'png', quality: 1 }}
        style={{ backgroundColor: isDark ? '#0D0D0D' : '#fff', borderRadius: 14, overflow: 'hidden' }}
      >
        {/* Branding header for shared image */}
        <View style={{
          paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {data.info.logo?.startsWith('http') && (
              <Image source={{ uri: data.info.logo }} style={{ width: 20, height: 20, borderRadius: 10 }} />
            )}
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary }}>
              {data.info.leagueName || t('team.standingsTitle')}
            </Text>
          </View>
          <Text style={{ fontSize: 10, fontWeight: '600', color: c.textTertiary }}>Analistas App</Text>
        </View>

        <View style={[s.tableCard, { backgroundColor: c.card, borderColor: c.border }]}>
          {/* Header */}
          <View style={[s.tableHeader, { backgroundColor: c.surface }]}>
            <Text style={[s.thPos, { color: c.textTertiary }]}></Text>
            <Text style={[s.thTeam, { color: c.textTertiary }]}>{t('league.teamHeader')}</Text>
            <Text style={[s.thStat, { color: c.textTertiary }]}>J</Text>
            <Text style={[s.thStat, { color: c.textTertiary }]}>G</Text>
            <Text style={[s.thStat, { color: c.textTertiary }]}>E</Text>
            <Text style={[s.thStat, { color: c.textTertiary }]}>P</Text>
            <Text style={[s.thPts, { color: c.textTertiary }]}>PTS</Text>
          </View>
          {data.standings.map((st) => {
            const isHighlighted = st.team.id === String(data.info.id);
            const teamIdNum = Number(st.team.id);
            return (
              <TouchableOpacity
                key={`${st.position}-${st.team.id}`}
                activeOpacity={0.6}
                onPress={() => {
                  if (!isNaN(teamIdNum) && teamIdNum > 0 && teamIdNum !== data.info.id) {
                    navigation.push('TeamDetail', {
                      teamId: teamIdNum,
                      teamName: st.team.name,
                      teamLogo: st.team.logo,
                      seasonId: data.info.currentSeasonId ?? undefined,
                    });
                  }
                }}
                style={[
                  s.tableRow,
                  { borderTopColor: c.border },
                  isHighlighted && { backgroundColor: 'rgba(59,130,246,0.12)' },
                ]}
              >
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
              </TouchableOpacity>
            );
          })}
        </View>
      </ViewShot>

      {/* Share section */}
      <View style={{ alignItems: 'center', marginTop: 20, gap: 8 }}>
        <Text style={{ fontSize: 13, color: c.textTertiary, textAlign: 'center' }}>
          {t('team.shareTablePrompt')}
        </Text>
        <TouchableOpacity
          onPress={handleShare}
          disabled={sharing}
          activeOpacity={0.7}
          style={[s.shareButton, { backgroundColor: c.accent }]}
        >
          {sharing ? (
            <ActivityIndicator size="small" color="#111" />
          ) : (
            <>
              <ShareIcon color="#111" size={14} />
              <Text style={s.shareButtonText}>{t('common.share')}</Text>
            </>
          )}
        </TouchableOpacity>
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
  const { t } = useTranslation();
  const { isDark } = useDarkMode();
  const navigation = useNavigation();
  const { isFollowingTeam, toggleFollowTeam } = useFavorites();
  const [activeTab, setActiveTab] = useState<Tab>('resumen');
  const scrollY = useRef(new Animated.Value(0)).current;
  const heroHeight = useRef(0);
  const [showFixedTabs, setShowFixedTabs] = useState(false);

  const { data, loading, error } = useTeamDetail(teamId, seasonId);
  const isFollowing = isFollowingTeam(String(teamId));

  // Fade in compact header content when hero scrolls out (~120px)
  const compactOpacity = scrollY.interpolate({
    inputRange: [80, 140],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const headerBg   = c.bg;
  const hText      = isDark ? '#fff' : '#111827';
  const hTextSoft  = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(17,24,39,0.5)';
  const hBtnBg     = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)';
  const hBorderCol = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.2)';
  const hLogoBg    = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';

  const TABS: { key: Tab; label: string }[] = [
    { key: 'resumen', label: t('team.summaryTab') },
    { key: 'plantilla', label: t('team.squadTab') },
    { key: 'partidos', label: t('team.matchesTab') },
    { key: 'tabla', label: t('team.standingsTab') },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── Sticky compact header (always visible) + fixed tab bar ── */}
      <View style={[hs.stickyHeader, { backgroundColor: headerBg }]}>
        <View style={hs.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[hs.backBtn, { backgroundColor: hBtnBg }]} activeOpacity={0.7}>
            <BackArrow color={hText} />
          </TouchableOpacity>
          <Animated.View style={[hs.compactCenter, { opacity: compactOpacity }]}>
            {teamLogo?.startsWith('http') ? (
              <Image source={{ uri: teamLogo }} style={hs.compactLogo} />
            ) : null}
            <Text style={[hs.compactName, { color: hText }]} numberOfLines={1}>
              {data?.info.name ?? teamName}
            </Text>
          </Animated.View>
          <TouchableOpacity style={[hs.shareBtn, { backgroundColor: hBtnBg }]} activeOpacity={0.7}>
            <ShareIcon color={hText} />
          </TouchableOpacity>
        </View>
        {/* Fixed tab bar — inside stickyHeader so it renders above ScrollView on Android */}
        {showFixedTabs && (
          <View style={[hs.fixedTabBar, { backgroundColor: c.bg, borderBottomColor: c.border }]}>
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
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        /* stickyHeaderIndices removed — Android wraps sticky headers in a native
           container that breaks flexDirection:'row'. Tabs scroll with content for now. */
        onScroll={(e: any) => {
          const y = e.nativeEvent.contentOffset.y;
          // Drive compact header animation
          scrollY.setValue(y);
          // Toggle fixed tab bar visibility
          const threshold = heroHeight.current > 0 ? heroHeight.current - 48 : 200;
          if (y >= threshold && !showFixedTabs) setShowFixedTabs(true);
          else if (y < threshold && showFixedTabs) setShowFixedTabs(false);
        }}
        scrollEventThrottle={16}
      >
        {/* ── Hero Header (scrolls with content) ── */}
        <View
          style={[hs.hero, { backgroundColor: headerBg }]}
          onLayout={(e) => { heroHeight.current = e.nativeEvent.layout.height; }}
        >

          <View style={hs.expanded}>
            {/* League label */}
            <Text style={[hs.leagueLabel, { color: hTextSoft }]}>{data?.info.leagueName ?? ''}</Text>

            {/* Logo */}
            <View style={[hs.logoWrap, { backgroundColor: hLogoBg }]}>
              {teamLogo?.startsWith('http') ? (
                <Image source={{ uri: teamLogo }} style={hs.logo} />
              ) : (
                <View style={[hs.logo, { backgroundColor: hLogoBg, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ fontSize: 32 }}>⚽</Text>
                </View>
              )}
            </View>

            {/* Team name */}
            <Text style={[hs.teamName, { color: hText }]}>{data?.info.name ?? teamName}</Text>

            {/* City */}
            {data?.info.city ? (
              <Text style={[hs.cityText, { color: hTextSoft }]}>{data.info.city}</Text>
            ) : null}

            {/* Follow button */}
            <TouchableOpacity
              style={[hs.followBtn, { borderColor: hBorderCol }, isFollowing && { backgroundColor: hText, borderColor: hText }]}
              onPress={() => toggleFollowTeam(String(teamId))}
              activeOpacity={0.8}
            >
              <Text style={[hs.followText, { color: hText }, isFollowing && { color: isDark ? '#111' : '#fff' }]}>
                {isFollowing ? t('team.following') : t('team.follow')}
              </Text>
            </TouchableOpacity>

            {/* Stats strip: Position, Points, Form */}
            {data?.teamStanding && (
              <View style={hs.statsStrip}>
                <View style={hs.statItem}>
                  <Text style={[hs.statValue, { color: hText }]}>#{data.teamStanding.position}</Text>
                  <Text style={[hs.statLabel, { color: hTextSoft }]}>{t('team.positionLabel')}</Text>
                </View>
                <View style={hs.statItem}>
                  <Text style={[hs.statValue, { color: hText }]}>{data.teamStanding.points}</Text>
                  <Text style={[hs.statLabel, { color: hTextSoft }]}>{t('team.pointsLabel')}</Text>
                </View>
                {data.form.length > 0 && (
                  <View style={hs.statItem}>
                    <FormBadges form={data.form} />
                    <Text style={[hs.statLabel, { color: hTextSoft }]}>{t('team.formLabel')}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        {/* ── Tab bar (scrolls with content) ── */}
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

        {/* ── Tab content ── */}
        {loading ? (
          <SkeletonTeamDetail />
        ) : error && !data ? (
          <View style={{ alignItems: 'center', paddingTop: 80, gap: 10, paddingHorizontal: 20 }}>
            <Text style={{ fontSize: 40 }}>⚠️</Text>
            <Text style={{ fontSize: 15, fontWeight: '600', color: c.textSecondary }}>{t('team.errorLoading')}</Text>
            <Text style={{ fontSize: 12, color: c.textTertiary, textAlign: 'center' }}>{error}</Text>
          </View>
        ) : data ? (
          <View style={{ paddingTop: 12 }}>
            {activeTab === 'resumen' && <ResumenTab data={data} />}
            {activeTab === 'plantilla' && <PlantillaTab data={data} />}
            {activeTab === 'partidos' && <PartidosTab data={data} />}
            {activeTab === 'tabla' && <TablaTab data={data} />}
          </View>
        ) : null}
      </ScrollView>

    </SafeAreaView>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════════════════════

const hs = StyleSheet.create({
  // Sticky compact header
  stickyHeader: {
    position: 'relative',
    zIndex: 20,
  },
  hero: {
    position: 'relative',
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    height: 48,
    zIndex: 2,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  shareBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  compactCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  compactLogo: {
    width: 24, height: 24, borderRadius: 12,
  },
  compactName: {
    fontSize: 15, fontWeight: '700',
    flexShrink: 1,
  },
  expanded: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 16,
    gap: 6,
  },
  leagueLabel: {
    fontSize: 11, fontWeight: '600',
    letterSpacing: 0.3,
  },
  logoWrap: {
    width: 72, height: 72,
    borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },
  logo: { width: 56, height: 56, borderRadius: 6 },
  teamName: {
    fontSize: 20, fontWeight: '800',
    letterSpacing: -0.3,
  },
  cityText: {
    fontSize: 12,
    marginTop: -2,
  },
  followBtn: {
    paddingHorizontal: 20, paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
    marginTop: 2,
  },
  followBtnActive: {},
  followText: {
    fontSize: 12, fontWeight: '700',
  },
  followTextActive: {},
  statsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginTop: 4,
  },
  statItem: { alignItems: 'center', gap: 2 },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 9, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },

  // Tab bar (in-flow, scrolls with content)
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  // Fixed tab bar — rendered inside stickyHeader, below topBar, when scrolled past hero
  fixedTabBar: {
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
    marginBottom: 6, position: 'relative',
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

  // Ver todos
  verTodosBtn: {
    borderRadius: 12, borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  verTodosText: {
    fontSize: 14, fontWeight: '700',
  },

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

  // Share button
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 24,
    minWidth: 160,
  },
  shareButtonText: {
    fontSize: 14, fontWeight: '700', color: '#111',
  },
});
