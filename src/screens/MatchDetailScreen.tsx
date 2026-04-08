import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../theme/colors';
import type { Match, MatchDetail } from '../data/mockData';
import { getMatchDetail } from '../data/mockData';

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = 'resumen' | 'alineaciones' | 'estadisticas' | 'h2h';

// ── Shared helpers ────────────────────────────────────────────────────────────
function TeamBadgeLarge({ name, logo }: { name: string; logo: string }) {
  const hue = name.charCodeAt(0) * 37 % 360;
  const bg  = `hsl(${hue}, 55%, 22%)`;
  const fg  = `hsl(${hue}, 80%, 72%)`;
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <View style={[badgeStyles.wrap, { backgroundColor: bg }]}>
      {logo.length <= 2
        ? <Text style={badgeStyles.emoji}>{logo}</Text>
        : <Text style={[badgeStyles.initials, { color: fg }]}>{initials}</Text>}
    </View>
  );
}
const badgeStyles = StyleSheet.create({
  wrap:     { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  emoji:    { fontSize: 28 },
  initials: { fontSize: 18, fontWeight: '800' },
});

// ── Event icon ────────────────────────────────────────────────────────────────
function eventIcon(type: string) {
  switch (type) {
    case 'goal':         return '⚽';
    case 'own-goal':     return '⚽';
    case 'penalty-goal': return '⚽';
    case 'penalty-miss': return '❌';
    case 'yellow':       return '🟨';
    case 'second-yellow':return '🟨';
    case 'red':          return '🟥';
    case 'sub':          return '🔄';
    case 'var':          return '📺';
    default:             return '•';
  }
}

// ── Resumen tab ───────────────────────────────────────────────────────────────
const ResumenTab: React.FC<{ match: Match; detail: MatchDetail }> = ({ match, detail }) => {
  const isHome = (team: 'home' | 'away') => team === 'home';

  return (
    <View style={tab.container}>
      {/* Venue & referee */}
      <View style={tab.infoCard}>
        <InfoRow icon="🏟️" label={`${detail.venue.name}, ${detail.venue.city}`} />
        <InfoRow icon="👔" label={`Árbitro: ${detail.referee.name} ${detail.referee.flag}`} />
        {detail.venue.attendance && (
          <InfoRow icon="👥" label={`Asistencia: ${detail.venue.attendance.toLocaleString()}`} />
        )}
        {detail.weather && (
          <InfoRow icon={detail.weather.icon} label={`${detail.weather.temp}°C · ${detail.weather.description} · 💨 ${detail.weather.wind} km/h`} />
        )}
      </View>

      {/* Timeline */}
      <Text style={tab.sectionTitle}>Eventos</Text>
      <View style={tab.timelineCard}>
        {detail.events.map((ev) => (
          <View key={ev.id} style={[tab.eventRow, isHome(ev.team) ? tab.eventHome : tab.eventAway]}>
            {/* Away side — minute on left */}
            {!isHome(ev.team) && (
              <Text style={tab.eventMinute}>{ev.minute}{ev.addedTime ? `+${ev.addedTime}` : ''}'</Text>
            )}
            <View style={[tab.eventIconWrap, isHome(ev.team) ? tab.eventIconHome : tab.eventIconAway]}>
              <Text style={tab.eventIconText}>{eventIcon(ev.type)}</Text>
            </View>
            <View style={[tab.eventInfo, isHome(ev.team) ? tab.eventInfoHome : tab.eventInfoAway]}>
              <Text style={tab.eventPlayer}>{ev.player}</Text>
              {ev.relatedPlayer && (
                <Text style={tab.eventAssist}>
                  {ev.type === 'sub' ? `↑ ${ev.relatedPlayer}` : `🅰 ${ev.relatedPlayer}`}
                </Text>
              )}
              {ev.description && <Text style={tab.eventDesc}>{ev.description}</Text>}
              {ev.xG != null && ev.type.includes('goal') && (
                <Text style={tab.eventXg}>xG {ev.xG.toFixed(2)}</Text>
              )}
            </View>
            {/* Home side — minute on right */}
            {isHome(ev.team) && (
              <Text style={tab.eventMinute}>{ev.minute}{ev.addedTime ? `+${ev.addedTime}` : ''}'</Text>
            )}
          </View>
        ))}
      </View>

      {/* Missing players */}
      {(detail.missingPlayers.home.length > 0 || detail.missingPlayers.away.length > 0) && (
        <>
          <Text style={tab.sectionTitle}>Bajas</Text>
          <View style={tab.infoCard}>
            {detail.missingPlayers.home.map((p) => (
              <View key={p.name} style={tab.missingRow}>
                <Text style={tab.missingTeam}>{match.homeTeam.shortName}</Text>
                <Text style={tab.missingName}>{p.name}</Text>
                <Text style={tab.missingReason}>{p.detail}</Text>
              </View>
            ))}
            {detail.missingPlayers.away.map((p) => (
              <View key={p.name} style={tab.missingRow}>
                <Text style={tab.missingTeam}>{match.awayTeam.shortName}</Text>
                <Text style={tab.missingName}>{p.name}</Text>
                <Text style={tab.missingReason}>{p.detail}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
};

function InfoRow({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={tab.infoRow}>
      <Text style={tab.infoIcon}>{icon}</Text>
      <Text style={tab.infoLabel}>{label}</Text>
    </View>
  );
}

// ── Alineaciones tab ──────────────────────────────────────────────────────────
const AlineacionesTab: React.FC<{ match: Match; detail: MatchDetail }> = ({ match, detail }) => {
  const [side, setSide] = useState<'home' | 'away'>('home');
  const lineup = side === 'home' ? detail.homeLineup : detail.awayLineup;
  const team   = side === 'home' ? match.homeTeam : match.awayTeam;

  // Group starters by row (y coordinate bands)
  const rows = groupByRow(lineup.starters);

  return (
    <View style={alin.container}>
      {/* Side toggle */}
      <View style={alin.toggle}>
        <TouchableOpacity
          style={[alin.toggleBtn, side === 'home' && alin.toggleBtnActive]}
          onPress={() => setSide('home')}
        >
          <Text style={[alin.toggleText, side === 'home' && alin.toggleTextActive]}>
            {match.homeTeam.shortName}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[alin.toggleBtn, side === 'away' && alin.toggleBtnActive]}
          onPress={() => setSide('away')}
        >
          <Text style={[alin.toggleText, side === 'away' && alin.toggleTextActive]}>
            {match.awayTeam.shortName}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Formation label */}
      <Text style={alin.formation}>{lineup.formation}</Text>

      {/* Pitch */}
      <View style={alin.pitch}>
        {/* Pitch markings */}
        <View style={alin.centerCircle} />
        <View style={alin.halfLine} />
        <View style={alin.penaltyBoxTop} />
        <View style={alin.penaltyBoxBottom} />
        <View style={alin.goalTop} />
        <View style={alin.goalBottom} />

        {/* Player dots grouped by row */}
        {rows.map((row, ri) => (
          <View key={ri} style={alin.pitchRow}>
            {row.map((p) => (
              <View key={p.id} style={alin.playerDot}>
                <View style={[
                  alin.dotCircle,
                  p.isCaptain && alin.dotCaptain,
                  p.isSubstituted && alin.dotSubstituted,
                  p.yellowCard && alin.dotYellow,
                  p.redCard && alin.dotRed,
                ]}>
                  <Text style={alin.dotNumber}>{p.number}</Text>
                </View>
                {p.goals ? <Text style={alin.dotGoal}>⚽</Text> : null}
                <Text style={alin.dotName} numberOfLines={1}>{p.shortName}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      {/* Coach */}
      <View style={alin.coachRow}>
        <Text style={alin.coachLabel}>Entrenador</Text>
        <Text style={alin.coachName}>{lineup.coachNationality} {lineup.coach}</Text>
      </View>

      {/* Bench */}
      <Text style={tab.sectionTitle}>Suplentes</Text>
      <View style={tab.infoCard}>
        {lineup.bench.map((p) => (
          <View key={p.id} style={alin.benchRow}>
            <View style={alin.benchNumber}>
              <Text style={alin.benchNumberText}>{p.number}</Text>
            </View>
            <Text style={alin.benchName}>{p.name}</Text>
            <Text style={alin.benchPos}>{p.positionShort}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

function groupByRow(players: MatchDetail['homeLineup']['starters']) {
  // Sort by y then x; group into rows by y buckets (±8 range)
  const sorted = [...players].sort((a, b) => a.y - b.y);
  const rows: (typeof players)[] = [];
  let currentRow: typeof players = [];
  let lastY = -99;

  for (const p of sorted) {
    if (Math.abs(p.y - lastY) > 12 && currentRow.length > 0) {
      rows.push([...currentRow].sort((a, b) => a.x - b.x));
      currentRow = [];
    }
    currentRow.push(p);
    lastY = p.y;
  }
  if (currentRow.length > 0) rows.push([...currentRow].sort((a, b) => a.x - b.x));
  return rows;
}

// ── Estadísticas tab ──────────────────────────────────────────────────────────
const EstadisticasTab: React.FC<{ match: Match; detail: MatchDetail }> = ({ match, detail }) => {
  return (
    <View style={stats.container}>
      {/* Possession highlight */}
      <View style={stats.possessionCard}>
        <Text style={stats.possLabel}>{match.homeTeam.shortName}</Text>
        {(() => {
          const poss = detail.statistics[0]?.stats.find(s => s.label === 'Posesión');
          const homeVal = poss?.home ?? 50;
          const awayVal = poss?.away ?? 50;
          return (
            <>
              <Text style={stats.possHome}>{homeVal}%</Text>
              <View style={stats.possBar}>
                <View style={[stats.possHome_, { flex: homeVal }]} />
                <View style={[stats.possAway_, { flex: awayVal }]} />
              </View>
              <Text style={stats.possAway}>{awayVal}%</Text>
            </>
          );
        })()}
        <Text style={stats.possLabel}>{match.awayTeam.shortName}</Text>
      </View>

      {detail.statistics.map((cat) => (
        <View key={cat.category}>
          <Text style={tab.sectionTitle}>{cat.category}</Text>
          <View style={tab.infoCard}>
            {cat.stats.filter(s => s.label !== 'Posesión').map((s) => {
              const max = Math.max(s.home, s.away, 1);
              const homeW = s.home / max;
              const awayW = s.away / max;
              return (
                <View key={s.label} style={stats.statRow}>
                  <Text style={stats.statValHome}>{s.home}{s.unit ?? ''}</Text>
                  <View style={stats.statBarsWrap}>
                    <Text style={stats.statLabel}>{s.label}</Text>
                    <View style={stats.statBars}>
                      <View style={stats.barHome}>
                        <View style={[stats.barFillHome, { flex: homeW, minWidth: s.home > 0 ? 4 : 0 }]} />
                        <View style={{ flex: 1 - homeW }} />
                      </View>
                      <View style={stats.barAway}>
                        <View style={{ flex: 1 - awayW }} />
                        <View style={[stats.barFillAway, { flex: awayW, minWidth: s.away > 0 ? 4 : 0 }]} />
                      </View>
                    </View>
                  </View>
                  <Text style={stats.statValAway}>{s.away}{s.unit ?? ''}</Text>
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
const H2HTab: React.FC<{ match: Match; detail: MatchDetail }> = ({ match, detail }) => {
  const { h2h } = detail;
  const homeWins = h2h.results.filter(r => r.homeScore > r.awayScore).length;
  const draws    = h2h.results.filter(r => r.homeScore === r.awayScore).length;
  const awayWins = h2h.results.filter(r => r.awayScore > r.homeScore).length;

  return (
    <View style={h2hStyles.container}>
      {/* Summary */}
      <View style={h2hStyles.summaryCard}>
        <View style={h2hStyles.summaryCol}>
          <Text style={h2hStyles.summaryNum}>{homeWins}</Text>
          <Text style={h2hStyles.summaryLabel} numberOfLines={1}>{match.homeTeam.shortName}</Text>
        </View>
        <View style={h2hStyles.summaryDivider} />
        <View style={h2hStyles.summaryCol}>
          <Text style={[h2hStyles.summaryNum, h2hStyles.drawNum]}>{draws}</Text>
          <Text style={h2hStyles.summaryLabel}>Empates</Text>
        </View>
        <View style={h2hStyles.summaryDivider} />
        <View style={h2hStyles.summaryCol}>
          <Text style={h2hStyles.summaryNum}>{awayWins}</Text>
          <Text style={h2hStyles.summaryLabel} numberOfLines={1}>{match.awayTeam.shortName}</Text>
        </View>
      </View>

      {/* Results list */}
      <Text style={tab.sectionTitle}>Últimos enfrentamientos</Text>
      <View style={tab.infoCard}>
        {h2h.results.map((r, i) => {
          const homeWon = r.homeScore > r.awayScore;
          const awayWon = r.awayScore > r.homeScore;
          const formattedDate = new Date(r.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
          return (
            <View key={i} style={h2hStyles.resultRow}>
              <View style={h2hStyles.resultLeft}>
                <Text style={h2hStyles.resultDate}>{formattedDate}</Text>
                <Text style={h2hStyles.resultComp}>{r.competition}</Text>
                <Text style={h2hStyles.resultVenue}>📍 {r.venue}</Text>
              </View>
              <View style={h2hStyles.resultScore}>
                <Text style={[h2hStyles.resultScoreText, homeWon && h2hStyles.resultWinner]}>
                  {r.homeScore}
                </Text>
                <Text style={h2hStyles.resultDash}> – </Text>
                <Text style={[h2hStyles.resultScoreText, awayWon && h2hStyles.resultWinner]}>
                  {r.awayScore}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

// ── Main screen ───────────────────────────────────────────────────────────────
export const MatchDetailScreen: React.FC<{
  match: Match;
  visible: boolean;
  onClose: () => void;
}> = ({ match, visible, onClose }) => {
  const [activeTab, setActiveTab] = useState<Tab>('resumen');
  const detail = getMatchDetail(match.id);

  const isLive     = match.status === 'live';
  const isFinished = match.status === 'finished';

  const TABS: { key: Tab; label: string }[] = [
    { key: 'resumen',      label: 'Resumen' },
    { key: 'alineaciones', label: 'Alineaciones' },
    { key: 'estadisticas', label: 'Estadísticas' },
    { key: 'h2h',          label: 'H2H' },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />

        {/* Drag handle */}
        <View style={styles.dragHandleWrap}>
          <View style={styles.dragHandle} />
        </View>

        {/* Header bar */}
        <View style={styles.headerBar}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.leagueLabel}>{match.league}</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Score hero */}
        <View style={styles.scoreHero}>
          {/* Home */}
          <View style={styles.teamCol}>
            <TeamBadgeLarge name={match.homeTeam.name} logo={match.homeTeam.logo} />
            <Text style={styles.teamName} numberOfLines={2}>{match.homeTeam.name}</Text>
          </View>

          {/* Score */}
          <View style={styles.scoreCol}>
            {match.status === 'scheduled' ? (
              <Text style={styles.scheduleTime}>{match.time}</Text>
            ) : (
              <>
                <Text style={[styles.scoreText, isLive && styles.scoreTextLive]}>
                  {match.homeScore} – {match.awayScore}
                </Text>
                {isLive && (
                  <View style={styles.livePill}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText}>{match.minute ?? match.time}'</Text>
                  </View>
                )}
                {isFinished && <Text style={styles.statusLabel}>Finalizado</Text>}
              </>
            )}
          </View>

          {/* Away */}
          <View style={styles.teamCol}>
            <TeamBadgeLarge name={match.awayTeam.name} logo={match.awayTeam.logo} />
            <Text style={styles.teamName} numberOfLines={2}>{match.awayTeam.name}</Text>
          </View>
        </View>

        {/* Tab bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBarScroll} contentContainerStyle={styles.tabBarContent}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabBtn, activeTab === t.key && styles.tabBtnActive]}
              onPress={() => setActiveTab(t.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabBtnText, activeTab === t.key && styles.tabBtnTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Content */}
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {!detail ? (
            <View style={styles.noDetail}>
              <Text style={styles.noDetailText}>Detalle del partido no disponible</Text>
            </View>
          ) : (
            <>
              {activeTab === 'resumen'      && <ResumenTab      match={match} detail={detail} />}
              {activeTab === 'alineaciones' && <AlineacionesTab match={match} detail={detail} />}
              {activeTab === 'estadisticas' && <EstadisticasTab match={match} detail={detail} />}
              {activeTab === 'h2h'          && <H2HTab          match={match} detail={detail} />}
            </>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

// ── Shared tab styles ─────────────────────────────────────────────────────────
const tab = StyleSheet.create({
  container:    { paddingHorizontal: 16, paddingTop: 4 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: colors.textTertiary,
    letterSpacing: 1, textTransform: 'uppercase',
    marginTop: 20, marginBottom: 8, paddingHorizontal: 2,
  },
  infoCard: {
    backgroundColor: colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  infoIcon:  { fontSize: 16, width: 22, textAlign: 'center' },
  infoLabel: { flex: 1, fontSize: 13, color: colors.textPrimary, fontWeight: '400' },

  // Events
  eventRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 10, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    gap: 8,
  },
  eventHome: { justifyContent: 'flex-end' },
  eventAway: { justifyContent: 'flex-start' },
  eventMinute: { fontSize: 12, fontWeight: '600', color: colors.textTertiary, minWidth: 30, textAlign: 'center', paddingTop: 2 },
  eventIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  eventIconHome: { },
  eventIconAway: { },
  eventIconText: { fontSize: 14 },
  eventInfo:     { flex: 1 },
  eventInfoHome: { alignItems: 'flex-end' },
  eventInfoAway: { alignItems: 'flex-start' },
  eventPlayer:   { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  eventAssist:   { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  eventDesc:     { fontSize: 11, color: colors.upcoming, marginTop: 1, fontStyle: 'italic' },
  eventXg:       { fontSize: 10, color: colors.accent, marginTop: 1 },

  // Missing
  missingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  missingTeam:   { fontSize: 11, fontWeight: '700', color: colors.textSecondary, width: 32 },
  missingName:   { flex: 1, fontSize: 13, color: colors.textPrimary, fontWeight: '500' },
  missingReason: { fontSize: 11, color: colors.live },
});

// ── Alineaciones styles ───────────────────────────────────────────────────────
const alin = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 4 },
  toggle: {
    flexDirection: 'row', backgroundColor: colors.surface,
    borderRadius: 10, padding: 3, marginBottom: 12,
  },
  toggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: colors.card },
  toggleText:      { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  toggleTextActive:{ color: colors.textPrimary },
  formation: {
    textAlign: 'center', fontSize: 13, fontWeight: '700',
    color: colors.textSecondary, marginBottom: 8,
  },
  pitch: {
    backgroundColor: '#1a3a1a',
    borderRadius: 12, overflow: 'hidden',
    paddingVertical: 16, paddingHorizontal: 8,
    borderWidth: 1, borderColor: '#2a4a2a',
    minHeight: 340,
    justifyContent: 'space-around',
  },
  centerCircle: {
    position: 'absolute', alignSelf: 'center',
    top: '50%', marginTop: -30,
    width: 60, height: 60, borderRadius: 30,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)',
  },
  halfLine: {
    position: 'absolute', left: 16, right: 16,
    top: '50%', height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  penaltyBoxTop: {
    position: 'absolute', alignSelf: 'center',
    top: 0, width: 120, height: 50,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)',
    borderTopWidth: 0,
  },
  penaltyBoxBottom: {
    position: 'absolute', alignSelf: 'center',
    bottom: 0, width: 120, height: 50,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)',
    borderBottomWidth: 0,
  },
  goalTop: {
    position: 'absolute', alignSelf: 'center',
    top: 0, width: 50, height: 16,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
    borderTopWidth: 0,
  },
  goalBottom: {
    position: 'absolute', alignSelf: 'center',
    bottom: 0, width: 50, height: 16,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
    borderBottomWidth: 0,
  },
  pitchRow: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', marginVertical: 4 },
  playerDot: { alignItems: 'center', width: 52, gap: 2 },
  dotCircle: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.accent + 'CC',
    alignItems: 'center', justifyContent: 'center',
  },
  dotCaptain:    { borderWidth: 2, borderColor: '#FFD700' },
  dotSubstituted:{ opacity: 0.55 },
  dotYellow:     { borderWidth: 2, borderColor: '#FFD700' },
  dotRed:        { backgroundColor: colors.live + 'CC' },
  dotNumber:     { fontSize: 11, fontWeight: '800', color: '#0D0D0D' },
  dotGoal:       { fontSize: 10, position: 'absolute', top: -4, right: 2 },
  dotName: {
    fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
  },
  coachRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 4, paddingTop: 10, paddingBottom: 4,
  },
  coachLabel: { fontSize: 11, color: colors.textSecondary },
  coachName:  { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  benchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  benchNumber: {
    width: 26, height: 26, borderRadius: 6, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  benchNumberText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  benchName:       { flex: 1, fontSize: 13, color: colors.textPrimary, fontWeight: '500' },
  benchPos:        { fontSize: 11, color: colors.textSecondary },
});

// ── Estadísticas styles ───────────────────────────────────────────────────────
const stats = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 4 },
  possessionCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border,
    padding: 14, gap: 8, marginBottom: 4,
  },
  possLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, width: 36, textAlign: 'center' },
  possHome:  { fontSize: 18, fontWeight: '800', color: colors.accent, width: 40, textAlign: 'center' },
  possAway:  { fontSize: 18, fontWeight: '800', color: colors.upcoming, width: 40, textAlign: 'center' },
  possBar:   { flex: 1, height: 8, borderRadius: 4, flexDirection: 'row', overflow: 'hidden', backgroundColor: colors.surface },
  possHome_: { backgroundColor: colors.accent, borderRadius: 4 },
  possAway_: { backgroundColor: colors.upcoming, borderRadius: 4 },
  statRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  statValHome: { fontSize: 13, fontWeight: '700', color: colors.accent, width: 38, textAlign: 'right' },
  statValAway: { fontSize: 13, fontWeight: '700', color: colors.upcoming, width: 38, textAlign: 'left' },
  statBarsWrap: { flex: 1, gap: 2 },
  statLabel: { fontSize: 11, color: colors.textSecondary, textAlign: 'center', fontWeight: '500' },
  statBars: { flexDirection: 'row', height: 6, gap: 3 },
  barHome: { flex: 1, flexDirection: 'row', borderRadius: 3, overflow: 'hidden', justifyContent: 'flex-end' },
  barAway: { flex: 1, flexDirection: 'row', borderRadius: 3, overflow: 'hidden', justifyContent: 'flex-start' },
  barFillHome: { backgroundColor: colors.accent, borderRadius: 3 },
  barFillAway: { backgroundColor: colors.upcoming, borderRadius: 3 },
});

// ── H2H styles ────────────────────────────────────────────────────────────────
const h2hStyles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 4 },
  summaryCard: {
    flexDirection: 'row', backgroundColor: colors.card,
    borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    padding: 16, marginBottom: 4,
  },
  summaryCol:     { flex: 1, alignItems: 'center', gap: 4 },
  summaryDivider: { width: 1, backgroundColor: colors.border, marginHorizontal: 8 },
  summaryNum:     { fontSize: 28, fontWeight: '800', color: colors.textPrimary },
  drawNum:        { color: colors.textSecondary },
  summaryLabel:   { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },
  resultRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    gap: 12,
  },
  resultLeft:  { flex: 1, gap: 2 },
  resultDate:  { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
  resultComp:  { fontSize: 11, color: colors.textSecondary },
  resultVenue: { fontSize: 10, color: colors.textTertiary },
  resultScore: { flexDirection: 'row', alignItems: 'center' },
  resultScoreText: { fontSize: 20, fontWeight: '800', color: colors.textSecondary },
  resultWinner:    { color: colors.textPrimary },
  resultDash:      { fontSize: 16, color: colors.textTertiary },
});

// ── Main modal styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  dragHandleWrap: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border },

  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  leagueLabel:  { fontSize: 13, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.3 },

  // Score hero
  scoreHero: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 16,
  },
  teamCol: { flex: 1, alignItems: 'center', gap: 8 },
  teamName: {
    fontSize: 13, fontWeight: '600', color: colors.textPrimary,
    textAlign: 'center', lineHeight: 17,
  },
  scoreCol: { alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  scoreText: { fontSize: 36, fontWeight: '800', color: colors.textPrimary, letterSpacing: -1 },
  scoreTextLive: { color: colors.accent },
  scheduleTime:  { fontSize: 28, fontWeight: '700', color: colors.textSecondary },
  statusLabel:   { fontSize: 11, color: colors.textTertiary, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.live + '22', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: colors.live + '44',
  },
  liveDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.live },
  liveText: { fontSize: 12, fontWeight: '700', color: colors.live },

  // Tab bar
  tabBarScroll:   { maxHeight: 44, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBarContent:  { paddingHorizontal: 12, alignItems: 'center', gap: 4 },
  tabBtn: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 8,
  },
  tabBtnActive:     { backgroundColor: colors.surfaceElevated },
  tabBtnText:       { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  tabBtnTextActive: { color: colors.textPrimary },

  scroll:        { flex: 1 },
  scrollContent: { paddingTop: 8 },

  noDetail:     { padding: 40, alignItems: 'center' },
  noDetailText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
});
