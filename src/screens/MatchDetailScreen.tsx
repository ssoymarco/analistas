import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useThemeColors } from '../theme/useTheme';
import { useDarkMode } from '../contexts/DarkModeContext';
import { getMatchDetail } from '../data/mockData';
import type { RootStackParamList } from '../navigation/AppNavigator';
import type { Match, MatchDetail } from '../data/types';

type Props = NativeStackScreenProps<RootStackParamList, 'MatchDetail'>;

// ── Event icons ───────────────────────────────────────────────────────────────
function eventIcon(type: string): string {
  switch (type) {
    case 'goal':          return '⚽';
    case 'own-goal':      return '⚽';
    case 'penalty-goal':  return '⚽';
    case 'penalty-miss':  return '❌';
    case 'yellow':        return '🟨';
    case 'second-yellow': return '🟨';
    case 'red':           return '🟥';
    case 'sub':           return '🔄';
    case 'var':           return '📺';
    default:              return '•';
  }
}

// ── Team badge (large) ────────────────────────────────────────────────────────
function TeamBadgeLarge({ name, logo, size = 72 }: { name: string; logo: string; size?: number }) {
  const isUrl = logo.startsWith('http');
  const hue = name.charCodeAt(0) * 37 % 360;
  const bg  = `hsl(${hue}, 45%, 20%)`;
  const fg  = `hsl(${hue}, 75%, 70%)`;
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  if (isUrl) {
    return (
      <View style={[badge.wrap, { width: size, height: size, borderRadius: size * 0.22, backgroundColor: bg }]}>
        <Image source={{ uri: logo }} style={{ width: size * 0.72, height: size * 0.72 }} resizeMode="contain" />
      </View>
    );
  }
  return (
    <View style={[badge.wrap, { width: size, height: size, borderRadius: size * 0.22, backgroundColor: bg }]}>
      {logo.length <= 2
        ? <Text style={{ fontSize: size * 0.42 }}>{logo}</Text>
        : <Text style={[badge.initials, { color: fg, fontSize: size * 0.28 }]}>{initials}</Text>}
    </View>
  );
}
const badge = StyleSheet.create({
  wrap:     { alignItems: 'center', justifyContent: 'center' },
  initials: { fontWeight: '800' },
});

// ── Back arrow icon ───────────────────────────────────────────────────────────
function BackArrow({ color }: { color: string }) {
  return (
    <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', top: 4, left: 2, width: 9, height: 1.8, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '-45deg' }] }} />
      <View style={{ position: 'absolute', bottom: 4, left: 2, width: 9, height: 1.8, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '45deg' }] }} />
      <View style={{ position: 'absolute', left: 2, width: 14, height: 1.8, backgroundColor: color, borderRadius: 1 }} />
    </View>
  );
}

// ── Tab types ─────────────────────────────────────────────────────────────────
type Tab = 'envivo' | 'resumen' | 'previa' | 'alineacion' | 'estadisticas' | 'tabla';

// ── Resumen / En vivo tab ─────────────────────────────────────────────────────
const ResumenTab: React.FC<{ match: Match; detail: MatchDetail }> = ({ match, detail }) => {
  const c = useThemeColors();
  const s = tabS(c);

  return (
    <View style={s.container}>
      {/* Venue info */}
      <View style={s.card}>
        <InfoRow icon="🏟️" label={`${detail.venue.name}, ${detail.venue.city}`} c={c} />
        {detail.venue.capacity > 0 && (
          <InfoRow icon="💺" label={`Capacidad: ${detail.venue.capacity.toLocaleString()}`} c={c} />
        )}
        {detail.venue.attendance && (
          <InfoRow icon="👥" label={`Asistencia: ${detail.venue.attendance.toLocaleString()}`} c={c} />
        )}
        {'referee' in detail && (detail as any).referee && (
          <InfoRow icon="👔" label={`Árbitro: ${(detail as any).referee.name}`} c={c} />
        )}
      </View>

      {/* Events timeline */}
      {detail.events.length > 0 && (
        <>
          <Text style={s.sectionTitle}>Cronología</Text>
          <View style={[s.card, { overflow: 'hidden' }]}>
            {/* Half separator header */}
            <View style={[s.halfSep, { backgroundColor: c.surface }]}>
              <Text style={[s.halfSepText, { color: c.textTertiary }]}>1er Tiempo</Text>
            </View>
            {detail.events.map((ev) => {
              const isHome = ev.team === 'home';
              return (
                <View key={ev.id} style={[s.eventRow, { borderBottomColor: c.border }]}>
                  {/* Home side */}
                  <View style={s.eventSide}>
                    {isHome && (
                      <>
                        <View style={s.eventInfo}>
                          <Text style={[s.eventPlayer, { color: c.textPrimary }]}>{ev.player}</Text>
                          {ev.relatedPlayer && (
                            <Text style={[s.eventAssist, { color: c.textSecondary }]}>
                              {ev.type === 'sub' ? `↓ ${ev.relatedPlayer}` : `Asistencia: ${ev.relatedPlayer}`}
                            </Text>
                          )}
                          {ev.xG != null && ev.type.includes('goal') && (
                            <Text style={[s.eventXg, { color: c.accent }]}>xG: {ev.xG.toFixed(2)}</Text>
                          )}
                        </View>
                      </>
                    )}
                  </View>

                  {/* Center: icon + minute */}
                  <View style={s.eventCenter}>
                    <View style={[s.eventIconWrap, { backgroundColor: c.surface }]}>
                      <Text style={s.eventIconText}>{eventIcon(ev.type)}</Text>
                    </View>
                    <Text style={[s.eventMinute, { color: c.textTertiary }]}>
                      {ev.minute}{ev.addedTime ? `+${ev.addedTime}` : ''}'
                    </Text>
                  </View>

                  {/* Away side */}
                  <View style={[s.eventSide, s.eventSideRight]}>
                    {!isHome && (
                      <View style={s.eventInfo}>
                        <Text style={[s.eventPlayer, { color: c.textPrimary }]}>{ev.player}</Text>
                        {ev.relatedPlayer && (
                          <Text style={[s.eventAssist, { color: c.textSecondary }]}>
                            {ev.type === 'sub' ? `↓ ${ev.relatedPlayer}` : `Asistencia: ${ev.relatedPlayer}`}
                          </Text>
                        )}
                        {ev.xG != null && ev.type.includes('goal') && (
                          <Text style={[s.eventXg, { color: c.accent }]}>xG: {ev.xG.toFixed(2)}</Text>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
};

// ── Alineaciones tab ──────────────────────────────────────────────────────────
const AlineacionesTab: React.FC<{ match: Match; detail: MatchDetail }> = ({ match, detail }) => {
  const c = useThemeColors();
  const s = tabS(c);
  const [side, setSide] = useState<'home' | 'away'>('home');
  const lineup = side === 'home' ? detail.homeLineup : detail.awayLineup;

  const rows = groupByRow(lineup.starters);

  return (
    <View style={s.container}>
      {/* Toggle */}
      <View style={[s.toggle, { backgroundColor: c.surface }]}>
        {(['home', 'away'] as const).map((sv) => {
          const team = sv === 'home' ? match.homeTeam : match.awayTeam;
          const active = side === sv;
          return (
            <TouchableOpacity
              key={sv}
              style={[s.toggleBtn, active && { backgroundColor: c.accent }]}
              onPress={() => setSide(sv)}
              activeOpacity={0.8}
            >
              <Text style={[s.toggleText, { color: active ? '#fff' : c.textSecondary }]}>
                {team.shortName}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Formation label */}
      <Text style={[s.formationLabel, { color: c.textSecondary }]}>{lineup.formation}</Text>

      {/* Pitch */}
      <View style={[s.pitch, { backgroundColor: '#2d6a4f' }]}>
        <View style={[s.pitchHalfLine, { borderColor: 'rgba(255,255,255,0.25)' }]} />
        <View style={[s.pitchCenter, { borderColor: 'rgba(255,255,255,0.25)' }]} />
        <View style={[s.pitchPenaltyTop, { borderColor: 'rgba(255,255,255,0.25)' }]} />
        <View style={[s.pitchPenaltyBot, { borderColor: 'rgba(255,255,255,0.25)' }]} />

        {rows.map((row, ri) => (
          <View key={ri} style={s.pitchRow}>
            {row.map((p) => (
              <View key={p.id} style={s.playerDot}>
                <View style={[
                  s.dotCircle,
                  { backgroundColor: side === 'home' ? '#3b82f6' : '#f97316' },
                  p.isCaptain && s.dotCaptain,
                ]}>
                  <Text style={s.dotNumber}>{p.number}</Text>
                </View>
                <Text style={s.dotName} numberOfLines={1}>{p.shortName}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      {/* Coach */}
      {lineup.coach ? (
        <View style={[s.coachRow, { borderColor: c.border }]}>
          <Text style={[s.coachLabel, { color: c.textTertiary }]}>Entrenador</Text>
          <Text style={[s.coachName, { color: c.textPrimary }]}>{lineup.coach}</Text>
        </View>
      ) : null}

      {/* Bench */}
      {lineup.bench.length > 0 && (
        <>
          <Text style={s.sectionTitle}>Suplentes</Text>
          <View style={s.card}>
            {lineup.bench.map((p) => (
              <View key={p.id} style={[s.benchRow, { borderBottomColor: c.border }]}>
                <View style={[s.benchNumber, { backgroundColor: c.surface }]}>
                  <Text style={[s.benchNumberText, { color: c.textSecondary }]}>{p.number}</Text>
                </View>
                <Text style={[s.benchName, { color: c.textPrimary }]}>{p.name}</Text>
                <Text style={[s.benchPos, { color: c.textTertiary }]}>{p.positionShort}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
};

function groupByRow(players: MatchDetail['homeLineup']['starters']) {
  const sorted = [...players].sort((a, b) => a.y - b.y);
  const rows: (typeof players)[] = [];
  let current: typeof players = [];
  let lastY = -99;
  for (const p of sorted) {
    if (Math.abs(p.y - lastY) > 12 && current.length > 0) {
      rows.push([...current].sort((a, b) => a.x - b.x));
      current = [];
    }
    current.push(p);
    lastY = p.y;
  }
  if (current.length > 0) rows.push([...current].sort((a, b) => a.x - b.x));
  return rows;
}

// ── Estadísticas tab ──────────────────────────────────────────────────────────
const EstadisticasTab: React.FC<{ match: Match; detail: MatchDetail }> = ({ match, detail }) => {
  const c = useThemeColors();
  const s = tabS(c);

  if (detail.statistics.length === 0) {
    return (
      <View style={[s.container, { alignItems: 'center', paddingTop: 60 }]}>
        <Text style={{ fontSize: 40 }}>📊</Text>
        <Text style={[s.emptyText, { color: c.textSecondary, marginTop: 12 }]}>Sin estadísticas disponibles</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {detail.statistics.map((cat) => (
        <View key={cat.category}>
          <Text style={s.sectionTitle}>{cat.category}</Text>
          <View style={s.card}>
            {cat.stats.map((st) => {
              const max = Math.max(st.home, st.away, 1);
              const homeW = st.home / max;
              const awayW = st.away / max;
              return (
                <View key={st.label} style={[s.statRow, { borderBottomColor: c.border }]}>
                  <Text style={[s.statVal, { color: '#3b82f6' }]}>{st.home}{st.unit ?? ''}</Text>
                  <View style={s.statBarsWrap}>
                    <Text style={[s.statLabel, { color: c.textSecondary }]}>{st.label}</Text>
                    <View style={s.statBars}>
                      <View style={s.barHome}>
                        <View style={{ flex: 1 - homeW }} />
                        <View style={[s.barFillHome, { flex: homeW, minWidth: st.home > 0 ? 4 : 0 }]} />
                      </View>
                      <View style={s.barAway}>
                        <View style={[s.barFillAway, { flex: awayW, minWidth: st.away > 0 ? 4 : 0 }]} />
                        <View style={{ flex: 1 - awayW }} />
                      </View>
                    </View>
                  </View>
                  <Text style={[s.statVal, { color: '#f97316' }]}>{st.away}{st.unit ?? ''}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
};

// ── H2H tab ───────────────────────────────────────────────────────────────────
const TablaTab: React.FC<{ match: Match; detail: MatchDetail }> = ({ match, detail }) => {
  const c = useThemeColors();
  const s = tabS(c);

  if (!('h2h' in detail) || !(detail as any).h2h?.results?.length) {
    return (
      <View style={[s.container, { alignItems: 'center', paddingTop: 60 }]}>
        <Text style={{ fontSize: 40 }}>🤝</Text>
        <Text style={[s.emptyText, { color: c.textSecondary, marginTop: 12 }]}>Sin historial de enfrentamientos</Text>
      </View>
    );
  }

  const { h2h } = detail as any;
  const homeWins = h2h.results.filter((r: any) => r.homeScore > r.awayScore).length;
  const draws    = h2h.results.filter((r: any) => r.homeScore === r.awayScore).length;
  const awayWins = h2h.results.filter((r: any) => r.awayScore > r.homeScore).length;

  return (
    <View style={s.container}>
      <View style={[s.h2hSummary, { backgroundColor: c.surface }]}>
        {[
          { num: homeWins, label: match.homeTeam.shortName, color: '#3b82f6' },
          { num: draws,    label: 'Empates',                color: c.textSecondary },
          { num: awayWins, label: match.awayTeam.shortName, color: '#f97316' },
        ].map((col, i) => (
          <React.Fragment key={i}>
            {i > 0 && <View style={[s.h2hDivider, { backgroundColor: c.border }]} />}
            <View style={s.h2hCol}>
              <Text style={[s.h2hNum, { color: col.color }]}>{col.num}</Text>
              <Text style={[s.h2hLabel, { color: c.textSecondary }]} numberOfLines={1}>{col.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      <Text style={s.sectionTitle}>Últimos enfrentamientos</Text>
      <View style={s.card}>
        {h2h.results.map((r: any, i: number) => {
          const hw = r.homeScore > r.awayScore;
          const aw = r.awayScore > r.homeScore;
          const date = new Date(r.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
          return (
            <View key={i} style={[s.h2hRow, { borderBottomColor: c.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.h2hDate, { color: c.textTertiary }]}>{date}</Text>
                <Text style={[s.h2hComp, { color: c.textSecondary }]}>{r.competition}</Text>
              </View>
              <Text style={[s.h2hScore, { color: hw ? '#3b82f6' : aw ? '#f97316' : c.textPrimary }]}>
                {r.homeScore} – {r.awayScore}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

// ── InfoRow helper ────────────────────────────────────────────────────────────
function InfoRow({ icon, label, c }: { icon: string; label: string; c: ReturnType<typeof useThemeColors> }) {
  const s = tabS(c);
  return (
    <View style={[s.infoRow, { borderBottomColor: c.border }]}>
      <Text style={s.infoIcon}>{icon}</Text>
      <Text style={[s.infoLabel, { color: c.textPrimary }]}>{label}</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export const MatchDetailScreen: React.FC<Props> = ({ route }) => {
  const { match } = route.params;
  const c = useThemeColors();
  const { isDark } = useDarkMode();
  const navigation = useNavigation();

  const isLive      = match.status === 'live';
  const isFinished  = match.status === 'finished';

  const defaultTab: Tab = isLive ? 'envivo' : isFinished ? 'resumen' : 'previa';
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const detail = getMatchDetail(match.id);

  const TABS: { key: Tab; label: string }[] = isLive
    ? [
        { key: 'envivo',       label: 'En vivo' },
        { key: 'estadisticas', label: 'Estadísticas' },
        { key: 'alineacion',   label: 'Alineación' },
        { key: 'tabla',        label: 'Tabla' },
      ]
    : isFinished
    ? [
        { key: 'resumen',      label: 'Resumen' },
        { key: 'estadisticas', label: 'Estadísticas' },
        { key: 'alineacion',   label: 'Alineación' },
        { key: 'tabla',        label: 'Tabla' },
      ]
    : [
        { key: 'previa',       label: 'Previa' },
        { key: 'alineacion',   label: 'Alineación' },
        { key: 'tabla',        label: 'Tabla' },
      ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── Top nav bar ── */}
      <View style={[scr.navBar, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          style={[scr.backBtn, { backgroundColor: c.surface }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <BackArrow color={c.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[scr.leagueTitle, { color: c.textPrimary }]}>{match.league}</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      {/* ── Live pill ── */}
      {isLive && (
        <View style={scr.livePillWrap}>
          <View style={scr.livePill}>
            <View style={scr.liveDot} />
            <Text style={scr.livePillText}>EN VIVO · {match.minute ?? match.time}'</Text>
          </View>
        </View>
      )}

      {/* ── Score hero ── */}
      <View style={scr.hero}>
        <View style={scr.teamCol}>
          <TeamBadgeLarge name={match.homeTeam.name} logo={match.homeTeam.logo} />
          <Text style={[scr.teamName, { color: c.textPrimary }]} numberOfLines={2}>
            {match.homeTeam.name}
          </Text>
        </View>

        <View style={scr.scoreCol}>
          {match.status === 'scheduled' ? (
            <Text style={[scr.scheduleTime, { color: c.textPrimary }]}>{match.time}</Text>
          ) : (
            <Text style={[scr.scoreText, { color: c.textPrimary }]}>
              {match.homeScore} — {match.awayScore}
            </Text>
          )}
          {isFinished && (
            <Text style={[scr.statusLabel, { color: c.textSecondary }]}>Finalizado</Text>
          )}
        </View>

        <View style={scr.teamCol}>
          <TeamBadgeLarge name={match.awayTeam.name} logo={match.awayTeam.logo} />
          <Text style={[scr.teamName, { color: c.textPrimary }]} numberOfLines={2}>
            {match.awayTeam.name}
          </Text>
        </View>
      </View>

      {/* ── Tab bar ── */}
      <View style={[scr.tabBarWrap, { borderBottomColor: c.border, backgroundColor: c.bg }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={scr.tabBar}>
          {TABS.map((t) => {
            const active = activeTab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[scr.tabBtn, active && { borderBottomColor: c.accent }]}
                onPress={() => setActiveTab(t.key)}
                activeOpacity={0.7}
              >
                <Text style={[scr.tabText, { color: active ? c.accent : c.textTertiary }]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Content ── */}
      <ScrollView
        style={{ flex: 1, backgroundColor: c.bg }}
        contentContainerStyle={{ paddingVertical: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {!detail ? (
          <View style={scr.noDetail}>
            <Text style={{ fontSize: 44 }}>📋</Text>
            <Text style={[scr.noDetailText, { color: c.textSecondary }]}>
              Detalle no disponible
            </Text>
          </View>
        ) : (
          <>
            {(activeTab === 'resumen' || activeTab === 'envivo' || activeTab === 'previa') && (
              <ResumenTab match={match} detail={detail} />
            )}
            {activeTab === 'alineacion'   && <AlineacionesTab match={match} detail={detail} />}
            {activeTab === 'estadisticas' && <EstadisticasTab match={match} detail={detail} />}
            {activeTab === 'tabla'        && <TablaTab        match={match} detail={detail} />}
          </>
        )}
        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

// ── Screen-level styles ───────────────────────────────────────────────────────
const scr = StyleSheet.create({
  navBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 0,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  leagueTitle: { fontSize: 15, fontWeight: '600' },

  livePillWrap: { alignItems: 'center', marginTop: 4 },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#7f1d1d', paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#ef4444' },
  livePillText: { fontSize: 12, fontWeight: '800', color: '#fca5a5', letterSpacing: 0.5 },

  hero: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 20,
  },
  teamCol: { flex: 1, alignItems: 'center', gap: 10 },
  teamName: { fontSize: 13, fontWeight: '600', textAlign: 'center', lineHeight: 18 },
  scoreCol: { alignItems: 'center', paddingHorizontal: 8 },
  scheduleTime: { fontSize: 28, fontWeight: '800', letterSpacing: -1 },
  scoreText:    { fontSize: 40, fontWeight: '900', letterSpacing: -2 },
  statusLabel:  { fontSize: 11, fontWeight: '500', marginTop: 4 },

  tabBarWrap: { borderBottomWidth: 1 },
  tabBar: { paddingHorizontal: 16, gap: 0 },
  tabBtn: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabText: { fontSize: 13, fontWeight: '600' },

  noDetail: { alignItems: 'center', paddingTop: 80, gap: 12 },
  noDetailText: { fontSize: 15, fontWeight: '500' },
});

// ── Dynamic tab styles (depend on theme) ─────────────────────────────────────
function tabS(c: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    container:    { paddingHorizontal: 16, paddingTop: 4 },
    emptyText:    { fontSize: 15, fontWeight: '500' },
    sectionTitle: {
      fontSize: 11, fontWeight: '700', color: c.textTertiary,
      letterSpacing: 1, textTransform: 'uppercase',
      marginTop: 20, marginBottom: 8, paddingHorizontal: 2,
    },
    card: {
      backgroundColor: c.card, borderRadius: 14,
      borderWidth: 1, borderColor: c.border, overflow: 'hidden',
    },
    infoRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 14, paddingVertical: 11,
      borderBottomWidth: 1,
    },
    infoIcon:  { fontSize: 16, width: 22, textAlign: 'center' },
    infoLabel: { flex: 1, fontSize: 13, fontWeight: '400' },

    // Events
    halfSep:     { paddingVertical: 6, alignItems: 'center' },
    halfSepText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
    eventRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 10, borderBottomWidth: 1, gap: 4,
    },
    eventSide:      { flex: 1, alignItems: 'flex-end' },
    eventSideRight: { alignItems: 'flex-start' },
    eventCenter:    { alignItems: 'center', gap: 2, width: 52 },
    eventIconWrap:  { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    eventIconText:  { fontSize: 15 },
    eventMinute:    { fontSize: 11, fontWeight: '600' },
    eventInfo:      { alignItems: 'flex-end' },
    eventPlayer:    { fontSize: 13, fontWeight: '600' },
    eventAssist:    { fontSize: 11, marginTop: 1 },
    eventXg:        { fontSize: 10, marginTop: 1, fontWeight: '600' },

    // Pitch
    toggle:     { flexDirection: 'row', borderRadius: 10, padding: 3, marginBottom: 12, gap: 2 },
    toggleBtn:  { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
    toggleText: { fontSize: 13, fontWeight: '700' },
    formationLabel: { textAlign: 'center', fontSize: 13, fontWeight: '600', marginBottom: 8 },
    pitch: {
      borderRadius: 12, overflow: 'hidden',
      height: 280, justifyContent: 'space-evenly',
      paddingVertical: 12,
    },
    pitchHalfLine:   { position: 'absolute', top: '50%', left: 16, right: 16, height: 1, borderTopWidth: 1 },
    pitchCenter:     { position: 'absolute', top: '50%', alignSelf: 'center', width: 60, height: 60, borderRadius: 30, borderWidth: 1, marginTop: -30 },
    pitchPenaltyTop: { position: 'absolute', top: 8, left: 40, right: 40, height: 40, borderWidth: 1, borderTopWidth: 0 },
    pitchPenaltyBot: { position: 'absolute', bottom: 8, left: 40, right: 40, height: 40, borderWidth: 1, borderBottomWidth: 0 },
    pitchRow:    { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' },
    playerDot:   { alignItems: 'center', width: 44, gap: 3 },
    dotCircle:   { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    dotCaptain:  { borderWidth: 2, borderColor: '#fbbf24' },
    dotNumber:   { fontSize: 10, fontWeight: '800', color: '#fff' },
    dotName:     { fontSize: 8, color: '#fff', fontWeight: '600', textAlign: 'center', maxWidth: 44 },

    coachRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 4, borderTopWidth: 1, marginTop: 8 },
    coachLabel:  { fontSize: 12, fontWeight: '500' },
    coachName:   { fontSize: 12, fontWeight: '600' },
    benchRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
    benchNumber: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    benchNumberText: { fontSize: 12, fontWeight: '700' },
    benchName:   { flex: 1, fontSize: 13, fontWeight: '500' },
    benchPos:    { fontSize: 11, fontWeight: '600' },

    // Stats
    statRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8, borderBottomWidth: 1 },
    statVal:      { width: 38, fontSize: 14, fontWeight: '700', textAlign: 'center' },
    statBarsWrap: { flex: 1, gap: 4 },
    statLabel:    { fontSize: 11, fontWeight: '600', textAlign: 'center', letterSpacing: 0.2 },
    statBars:     { flexDirection: 'row', gap: 4, height: 6 },
    barHome:      { flex: 1, flexDirection: 'row', borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgba(59,130,246,0.15)' },
    barFillHome:  { backgroundColor: '#3b82f6', borderRadius: 3 },
    barAway:      { flex: 1, flexDirection: 'row', borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgba(249,115,22,0.15)' },
    barFillAway:  { backgroundColor: '#f97316', borderRadius: 3 },

    // H2H
    h2hSummary:  { flexDirection: 'row', borderRadius: 14, padding: 16, marginBottom: 4 },
    h2hCol:      { flex: 1, alignItems: 'center', gap: 4 },
    h2hDivider:  { width: 1, marginHorizontal: 8 },
    h2hNum:      { fontSize: 28, fontWeight: '900' },
    h2hLabel:    { fontSize: 11, fontWeight: '600' },
    h2hRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
    h2hDate:     { fontSize: 11, fontWeight: '500' },
    h2hComp:     { fontSize: 11, marginTop: 2 },
    h2hScore:    { fontSize: 16, fontWeight: '800' },
  });
}
