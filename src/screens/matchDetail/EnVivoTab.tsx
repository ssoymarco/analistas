// ── En Vivo / Resumen / Previa Tab ───────────────────────────────────────────
// Shared tab for live events + match info. Adapts to match status.
// Shows ALL SportMonks data: events, stats, odds, predictions, H2H,
// commentaries, TV, weather, referee, form, injuries, pressure index.
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useThemeColors } from '../../theme/useTheme';
import type { Match, MatchDetail, MatchEvent, H2HResult, TeamFormEntry, OddsMarket, MatchPrediction, MissingPlayer, PressureIndex } from '../../data/types';

// ── Event icon ────────────────────────────────────────────────────────────────
function eventEmoji(type: string): string {
  switch (type) {
    case 'goal':          return '⚽';
    case 'own-goal':      return '⚽';
    case 'penalty-goal':  return '⚽';
    case 'penalty-miss':  return '❌';
    case 'yellow':        return '🟨';
    case 'second-yellow': return '🟨🟥';
    case 'red':           return '🟥';
    case 'sub':           return '🔄';
    case 'var':           return '📺';
    default:              return '●';
  }
}

function isGoalEvent(type: string): boolean {
  return type === 'goal' || type === 'own-goal' || type === 'penalty-goal';
}

// ── Quick stats strip ─────────────────────────────────────────────────────────
const QuickStats: React.FC<{ match: Match; detail: MatchDetail }> = ({ match, detail }) => {
  const c = useThemeColors();

  const allStats = detail.statistics.flatMap(cat => cat.stats);
  const poss     = allStats.find(s => s.label === 'Posesión');
  const shots    = allStats.find(s => s.label === 'Tiros totales');
  const onTarget = allStats.find(s => s.label === 'Tiros a puerta');
  const xg       = allStats.find(s => s.label === 'xG (Goles esperados)');

  if (!poss && !shots) return null;

  const homeP = poss?.home ?? 50;
  const awayP = poss?.away ?? 50;

  return (
    <View style={[qs.card, { backgroundColor: c.card, borderColor: c.border }]}>
      {/* Possession bar */}
      <View style={qs.row}>
        <Text style={[qs.teamAbbr, { color: '#3b82f6' }]}>{match.homeTeam.shortName}</Text>
        <View style={qs.center}>
          <Text style={[qs.centerLabel, { color: c.textTertiary }]}>Posesión</Text>
          <View style={qs.possBar}>
            <View style={[qs.possHome, { flex: homeP }]} />
            <View style={[qs.possAway, { flex: awayP }]} />
          </View>
          <View style={qs.possNumbers}>
            <Text style={[qs.possNum, { color: '#3b82f6' }]}>{homeP}%</Text>
            <Text style={[qs.possNum, { color: '#f97316' }]}>{awayP}%</Text>
          </View>
        </View>
        <Text style={[qs.teamAbbr, { color: '#f97316' }]}>{match.awayTeam.shortName}</Text>
      </View>

      {/* Mini stats */}
      {[shots, onTarget, xg].filter(Boolean).map((s) => s && (
        <View key={s.label} style={[qs.miniStatRow, { borderTopColor: c.border }]}>
          <Text style={[qs.miniVal, { color: '#3b82f6' }]}>{s.type === 'percentage' ? `${s.home}%` : s.home}</Text>
          <Text style={[qs.miniLabel, { color: c.textTertiary }]}>{s.label}</Text>
          <Text style={[qs.miniVal, { color: '#f97316' }]}>{s.type === 'percentage' ? `${s.away}%` : s.away}</Text>
        </View>
      ))}
    </View>
  );
};

const qs = StyleSheet.create({
  card: {
    borderRadius: 14, borderWidth: 1, marginBottom: 8, overflow: 'hidden',
    paddingTop: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  teamAbbr: { fontSize: 13, fontWeight: '800', width: 36 },
  center: { flex: 1, alignItems: 'center', gap: 6 },
  centerLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
  possBar: { flexDirection: 'row', height: 6, width: '100%', borderRadius: 3, overflow: 'hidden' },
  possHome: { backgroundColor: '#3b82f6' },
  possAway: { backgroundColor: '#f97316' },
  possNumbers: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  possNum: { fontSize: 12, fontWeight: '700' },
  miniStatRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1 },
  miniVal: { width: 36, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  miniLabel: { flex: 1, fontSize: 11, fontWeight: '500', textAlign: 'center' },
});

// ── Single event row ──────────────────────────────────────────────────────────
const EventRow: React.FC<{ event: MatchEvent; match: Match }> = ({ event, match }) => {
  const c = useThemeColors();
  const isHome = event.team === 'home';
  const isGoal = isGoalEvent(event.type);
  const minuteStr = `${event.minute}${event.addedTime ? `+${event.addedTime}` : ''}'`;

  return (
    <View style={[ev.row, { borderBottomColor: c.border }]}>
      {/* Home side */}
      <View style={ev.side}>
        {isHome && (
          <View style={ev.infoHome}>
            <Text style={[ev.player, { color: c.textPrimary }, isGoal && ev.playerGoal]}>{event.player}</Text>
            {event.relatedPlayer && (
              <Text style={[ev.sub, { color: c.textSecondary }]}>
                {event.type === 'sub' ? `↓ ${event.relatedPlayer}` : `Asistencia: ${event.relatedPlayer}`}
              </Text>
            )}
            {event.xG != null && isGoal && (
              <Text style={ev.xg}>xG: {event.xG.toFixed(2)}</Text>
            )}
          </View>
        )}
      </View>

      {/* Center: icon + minute */}
      <View style={ev.center}>
        <View style={[ev.iconWrap, { backgroundColor: c.surface }]}>
          <Text style={ev.icon}>{eventEmoji(event.type)}</Text>
        </View>
        <Text style={[ev.minute, { color: c.textTertiary }]}>{minuteStr}</Text>
      </View>

      {/* Away side */}
      <View style={ev.side}>
        {!isHome && (
          <View style={ev.infoAway}>
            <Text style={[ev.player, { color: c.textPrimary }, isGoal && ev.playerGoal]}>{event.player}</Text>
            {event.relatedPlayer && (
              <Text style={[ev.sub, { color: c.textSecondary }]}>
                {event.type === 'sub' ? `↓ ${event.relatedPlayer}` : `Asistencia: ${event.relatedPlayer}`}
              </Text>
            )}
            {event.xG != null && isGoal && (
              <Text style={ev.xg}>xG: {event.xG.toFixed(2)}</Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
};

const ev = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  side: { flex: 1, minHeight: 36 },
  infoHome: { alignItems: 'flex-end', paddingRight: 4 },
  infoAway: { alignItems: 'flex-start', paddingLeft: 4 },
  player: { fontSize: 13, fontWeight: '500' },
  playerGoal: { fontWeight: '700' },
  sub: { fontSize: 11, marginTop: 1 },
  xg: { fontSize: 10, marginTop: 1, color: '#10b981', fontWeight: '600' },
  center: { alignItems: 'center', gap: 3, width: 54 },
  iconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 15 },
  minute: { fontSize: 10, fontWeight: '700' },
});

// ── Result info banner ───────────────────────────────────────────────────────
const ResultBanner: React.FC<{ resultInfo: string }> = ({ resultInfo }) => {
  const c = useThemeColors();
  return (
    <View style={[rb.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={rb.icon}>📋</Text>
      <Text style={[rb.text, { color: c.textPrimary }]}>{resultInfo}</Text>
    </View>
  );
};
const rb = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  icon: { fontSize: 16 },
  text: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 18 },
});

// ── H2H section ──────────────────────────────────────────────────────────────
const H2HSection: React.FC<{ h2h: MatchDetail['h2h']; match: Match }> = ({ h2h, match }) => {
  const c = useThemeColors();
  const [showAll, setShowAll] = useState(false);

  if (!h2h.results || h2h.results.length === 0) return null;

  const displayed = showAll ? h2h.results : h2h.results.slice(0, 5);

  // Count wins
  let homeWins = 0, awayWins = 0, draws = 0;
  for (const r of h2h.results) {
    if (r.homeScore > r.awayScore) homeWins++;
    else if (r.awayScore > r.homeScore) awayWins++;
    else draws++;
  }

  return (
    <View style={[h2s.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[h2s.title, { color: c.textTertiary }]}>HISTORIAL (H2H)</Text>

      {/* Summary strip */}
      <View style={[h2s.summary, { borderBottomColor: c.border }]}>
        <View style={h2s.summaryItem}>
          <Text style={[h2s.summaryVal, { color: '#3b82f6' }]}>{homeWins}</Text>
          <Text style={[h2s.summaryLabel, { color: c.textTertiary }]}>{match.homeTeam.shortName}</Text>
        </View>
        <View style={h2s.summaryItem}>
          <Text style={[h2s.summaryVal, { color: c.textSecondary }]}>{draws}</Text>
          <Text style={[h2s.summaryLabel, { color: c.textTertiary }]}>Empates</Text>
        </View>
        <View style={h2s.summaryItem}>
          <Text style={[h2s.summaryVal, { color: '#f97316' }]}>{awayWins}</Text>
          <Text style={[h2s.summaryLabel, { color: c.textTertiary }]}>{match.awayTeam.shortName}</Text>
        </View>
      </View>

      {/* Results list */}
      {displayed.map((r, i) => (
        <View key={i} style={[h2s.resultRow, { borderBottomColor: c.border }]}>
          <Text style={[h2s.date, { color: c.textTertiary }]}>{r.date}</Text>
          <Text style={[h2s.score, { color: c.textPrimary }]}>{r.homeScore} - {r.awayScore}</Text>
          <Text style={[h2s.comp, { color: c.textTertiary }]} numberOfLines={1}>{r.competition}</Text>
        </View>
      ))}

      {h2h.results.length > 5 && (
        <TouchableOpacity onPress={() => setShowAll(!showAll)} style={h2s.showMore}>
          <Text style={[h2s.showMoreText, { color: c.accent }]}>
            {showAll ? 'Ver menos' : `Ver todos (${h2h.results.length})`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const h2s = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 8 },
  title: { fontSize: 10, fontWeight: '700', letterSpacing: 1, paddingHorizontal: 14, paddingVertical: 10 },
  summary: { flexDirection: 'row', paddingHorizontal: 14, paddingBottom: 12, borderBottomWidth: 1 },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryVal: { fontSize: 20, fontWeight: '800' },
  summaryLabel: { fontSize: 10, fontWeight: '600' },
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, gap: 8 },
  date: { fontSize: 11, fontWeight: '500', width: 80 },
  score: { fontSize: 14, fontWeight: '700', width: 50, textAlign: 'center' },
  comp: { flex: 1, fontSize: 11, textAlign: 'right' },
  showMore: { paddingVertical: 10, alignItems: 'center' },
  showMoreText: { fontSize: 12, fontWeight: '600' },
});

// ── Commentaries section ─────────────────────────────────────────────────────
const CommentariesSection: React.FC<{ commentaries: NonNullable<MatchDetail['commentaries']> }> = ({ commentaries }) => {
  const c = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const displayed = expanded ? commentaries : commentaries.slice(0, 5);

  return (
    <View style={[cs.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[cs.title, { color: c.textTertiary }]}>COMENTARIOS EN VIVO</Text>
      {displayed.map((cm, i) => {
        const minStr = cm.minute != null ? `${cm.minute}${cm.extraMinute ? `+${cm.extraMinute}` : ''}'` : '';
        return (
          <View key={i} style={[cs.row, { borderTopColor: c.border }]}>
            {minStr ? (
              <Text style={[cs.minute, { color: cm.important ? c.accent : c.textTertiary }]}>{minStr}</Text>
            ) : (
              <Text style={[cs.minute, { color: c.textTertiary }]}>--</Text>
            )}
            <Text style={[cs.comment, { color: c.textPrimary }, cm.important && { fontWeight: '600' }]}>{cm.comment}</Text>
          </View>
        );
      })}
      {commentaries.length > 5 && (
        <TouchableOpacity onPress={() => setExpanded(!expanded)} style={cs.showMore}>
          <Text style={[cs.showMoreText, { color: c.accent }]}>
            {expanded ? 'Ver menos' : `Ver todos (${commentaries.length})`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const cs = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 8 },
  title: { fontSize: 10, fontWeight: '700', letterSpacing: 1, paddingHorizontal: 14, paddingVertical: 10 },
  row: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, gap: 10 },
  minute: { fontSize: 11, fontWeight: '700', width: 38, textAlign: 'center' },
  comment: { flex: 1, fontSize: 12, lineHeight: 17 },
  showMore: { paddingVertical: 10, alignItems: 'center' },
  showMoreText: { fontSize: 12, fontWeight: '600' },
});

// ── TV Stations section ──────────────────────────────────────────────────────
const TVStationsRow: React.FC<{ stations: NonNullable<MatchDetail['tvStations']> }> = ({ stations }) => {
  const c = useThemeColors();
  return (
    <View style={[tv.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={tv.header}>
        <Text style={tv.icon}>📺</Text>
        <Text style={[tv.title, { color: c.textTertiary }]}>DÓNDE VER</Text>
      </View>
      <View style={tv.list}>
        {stations.map((s, i) => (
          <View key={i} style={[tv.badge, { backgroundColor: c.surface }]}>
            <Text style={[tv.badgeText, { color: c.textPrimary }]}>{s.name}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const tv = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 8, padding: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  icon: { fontSize: 16 },
  title: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  badgeText: { fontSize: 12, fontWeight: '600' },
});

// ── Odds section ─────────────────────────────────────────────────────────────
const OddsSection: React.FC<{ odds: OddsMarket[]; match: Match }> = ({ odds, match }) => {
  const c = useThemeColors();
  if (!odds || odds.length === 0) return null;

  return (
    <View style={[od.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[od.title, { color: c.textTertiary }]}>CUOTAS</Text>
      {odds.slice(0, 4).map((market, mi) => (
        <View key={mi} style={[od.marketRow, { borderTopColor: c.border }]}>
          <Text style={[od.marketName, { color: c.textSecondary }]}>{market.name}</Text>
          <View style={od.optionsRow}>
            {market.options.map((opt, oi) => (
              <View key={oi} style={[od.optionBadge, { backgroundColor: c.surface }]}>
                <Text style={[od.optionLabel, { color: c.textTertiary }]}>{opt.label}</Text>
                <Text style={[od.optionValue, { color: c.textPrimary }]}>{opt.value.toFixed(2)}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
};

const od = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 8 },
  title: { fontSize: 10, fontWeight: '700', letterSpacing: 1, paddingHorizontal: 14, paddingVertical: 10 },
  marketRow: { paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, gap: 8 },
  marketName: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  optionsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  optionBadge: { flex: 1, minWidth: 60, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 8, alignItems: 'center', gap: 2 },
  optionLabel: { fontSize: 9, fontWeight: '600' },
  optionValue: { fontSize: 14, fontWeight: '800' },
});

// ── Predictions section ──────────────────────────────────────────────────────
const PredictionsSection: React.FC<{ predictions: MatchPrediction[]; match: Match }> = ({ predictions, match }) => {
  const c = useThemeColors();
  if (!predictions || predictions.length === 0) return null;

  return (
    <View style={[pr.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={pr.header}>
        <Text style={pr.headerIcon}>🤖</Text>
        <Text style={[pr.title, { color: c.textTertiary }]}>PREDICCIONES</Text>
      </View>
      {predictions.slice(0, 4).map((pred, i) => (
        <View key={i} style={[pr.row, { borderTopColor: c.border }]}>
          <Text style={[pr.type, { color: c.textSecondary }]}>{pred.type}</Text>
          <View style={pr.barRow}>
            {pred.homeWin != null && (
              <>
                <View style={pr.barItem}>
                  <Text style={[pr.barLabel, { color: '#3b82f6' }]}>{match.homeTeam.shortName}</Text>
                  <View style={[pr.barTrack, { backgroundColor: c.surface }]}>
                    <View style={[pr.barFill, { width: `${pred.homeWin}%`, backgroundColor: '#3b82f6' }]} />
                  </View>
                  <Text style={[pr.barPct, { color: '#3b82f6' }]}>{pred.homeWin}%</Text>
                </View>
                {pred.draw != null && (
                  <View style={pr.barItem}>
                    <Text style={[pr.barLabel, { color: c.textTertiary }]}>Empate</Text>
                    <View style={[pr.barTrack, { backgroundColor: c.surface }]}>
                      <View style={[pr.barFill, { width: `${pred.draw}%`, backgroundColor: c.textTertiary }]} />
                    </View>
                    <Text style={[pr.barPct, { color: c.textTertiary }]}>{pred.draw}%</Text>
                  </View>
                )}
                <View style={pr.barItem}>
                  <Text style={[pr.barLabel, { color: '#f97316' }]}>{match.awayTeam.shortName}</Text>
                  <View style={[pr.barTrack, { backgroundColor: c.surface }]}>
                    <View style={[pr.barFill, { width: `${pred.awayWin ?? 0}%` as const, backgroundColor: '#f97316' }]} />
                  </View>
                  <Text style={[pr.barPct, { color: '#f97316' }]}>{pred.awayWin ?? 0}%</Text>
                </View>
              </>
            )}
            {pred.yes != null && (
              <>
                <View style={pr.barItem}>
                  <Text style={[pr.barLabel, { color: '#10b981' }]}>Si</Text>
                  <View style={[pr.barTrack, { backgroundColor: c.surface }]}>
                    <View style={[pr.barFill, { width: `${pred.yes ?? 0}%` as const, backgroundColor: '#10b981' }]} />
                  </View>
                  <Text style={[pr.barPct, { color: '#10b981' }]}>{pred.yes}%</Text>
                </View>
                <View style={pr.barItem}>
                  <Text style={[pr.barLabel, { color: '#ef4444' }]}>No</Text>
                  <View style={[pr.barTrack, { backgroundColor: c.surface }]}>
                    <View style={[pr.barFill, { width: `${pred.no ?? 0}%` as const, backgroundColor: '#ef4444' }]} />
                  </View>
                  <Text style={[pr.barPct, { color: '#ef4444' }]}>{pred.no}%</Text>
                </View>
              </>
            )}
          </View>
        </View>
      ))}
    </View>
  );
};

const pr = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  headerIcon: { fontSize: 16 },
  title: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  row: { paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, gap: 6 },
  type: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  barRow: { gap: 6 },
  barItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { fontSize: 10, fontWeight: '700', width: 40 },
  barTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  barPct: { fontSize: 11, fontWeight: '700', width: 36, textAlign: 'right' },
});

// ── Pressure Index section ───────────────────────────────────────────────────
const PressureSection: React.FC<{ pressure: PressureIndex; match: Match }> = ({ pressure, match }) => {
  const c = useThemeColors();

  return (
    <View style={[pi.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={pi.header}>
        <Text style={pi.icon}>🔥</Text>
        <Text style={[pi.title, { color: c.textTertiary }]}>ÍNDICE DE PRESIÓN</Text>
      </View>
      <View style={[pi.body, { borderTopColor: c.border }]}>
        <View style={pi.row}>
          <Text style={[pi.teamName, { color: '#3b82f6' }]}>{match.homeTeam.shortName}</Text>
          <View style={pi.barContainer}>
            <View style={[pi.barBg, { backgroundColor: c.surface }]}>
              <View style={[pi.barHome, { width: `${pressure.home}%` }]} />
            </View>
          </View>
          <Text style={[pi.teamName, { color: '#f97316', textAlign: 'right' }]}>{match.awayTeam.shortName}</Text>
        </View>
        <View style={pi.valuesRow}>
          <Text style={[pi.value, { color: '#3b82f6' }]}>{pressure.home}%</Text>
          <Text style={[pi.label, { color: c.textTertiary }]}>Dominio</Text>
          <Text style={[pi.value, { color: '#f97316', textAlign: 'right' }]}>{pressure.away}%</Text>
        </View>
        <View style={pi.statsRow}>
          <View style={pi.statItem}>
            <Text style={[pi.statVal, { color: '#3b82f6' }]}>{pressure.homeAttacks}</Text>
            <Text style={[pi.statLabel, { color: c.textTertiary }]}>Tiros</Text>
            <Text style={[pi.statVal, { color: '#f97316' }]}>{pressure.awayAttacks}</Text>
          </View>
          <View style={[pi.statDivider, { backgroundColor: c.border }]} />
          <View style={pi.statItem}>
            <Text style={[pi.statVal, { color: '#3b82f6' }]}>{pressure.homeDangerousAttacks}</Text>
            <Text style={[pi.statLabel, { color: c.textTertiary }]}>Córners</Text>
            <Text style={[pi.statVal, { color: '#f97316' }]}>{pressure.awayDangerousAttacks}</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const pi = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  icon: { fontSize: 16 },
  title: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  body: { paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  teamName: { fontSize: 12, fontWeight: '800', width: 40 },
  barContainer: { flex: 1 },
  barBg: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barHome: { height: 8, backgroundColor: '#3b82f6', borderRadius: 4 },
  valuesRow: { flexDirection: 'row', alignItems: 'center' },
  value: { flex: 1, fontSize: 16, fontWeight: '800' },
  label: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  statItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  statVal: { fontSize: 13, fontWeight: '700' },
  statLabel: { fontSize: 10, fontWeight: '500' },
  statDivider: { width: 1, height: 20 },
});

// ── Team Form section ────────────────────────────────────────────────────────
const FormSection: React.FC<{ homeForm?: TeamFormEntry[]; awayForm?: TeamFormEntry[]; match: Match }> = ({ homeForm, awayForm, match }) => {
  const c = useThemeColors();
  if ((!homeForm || homeForm.length === 0) && (!awayForm || awayForm.length === 0)) return null;

  const resultColor = (r: 'W' | 'D' | 'L') =>
    r === 'W' ? '#10b981' : r === 'L' ? '#ef4444' : '#f59e0b';

  const renderForm = (form: TeamFormEntry[], teamName: string, color: string) => (
    <View style={fm.teamBlock}>
      <Text style={[fm.teamLabel, { color }]}>{teamName}</Text>
      <View style={fm.badges}>
        {form.slice(0, 5).map((f, i) => (
          <View key={i} style={[fm.badge, { backgroundColor: resultColor(f.result) }]}>
            <Text style={fm.badgeText}>{f.result}</Text>
          </View>
        ))}
      </View>
      {form.slice(0, 3).map((f, i) => (
        <View key={i} style={[fm.matchRow, { borderTopColor: c.border }]}>
          <Text style={[fm.matchResult, { color: resultColor(f.result) }]}>{f.result}</Text>
          <Text style={[fm.matchScore, { color: c.textPrimary }]}>{f.goalsFor}-{f.goalsAgainst}</Text>
          <Text style={[fm.matchOpponent, { color: c.textSecondary }]} numberOfLines={1}>
            {f.isHome ? 'vs' : '@'} {f.opponent}
          </Text>
          <Text style={[fm.matchDate, { color: c.textTertiary }]}>{f.date.slice(5)}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <View style={[fm.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[fm.title, { color: c.textTertiary }]}>FORMA RECIENTE</Text>
      <View style={fm.body}>
        {homeForm && homeForm.length > 0 && renderForm(homeForm, match.homeTeam.shortName, '#3b82f6')}
        {awayForm && awayForm.length > 0 && renderForm(awayForm, match.awayTeam.shortName, '#f97316')}
      </View>
    </View>
  );
};

const fm = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 8 },
  title: { fontSize: 10, fontWeight: '700', letterSpacing: 1, paddingHorizontal: 14, paddingVertical: 10 },
  body: { paddingHorizontal: 14, paddingBottom: 12, gap: 14 },
  teamBlock: { gap: 6 },
  teamLabel: { fontSize: 12, fontWeight: '800' },
  badges: { flexDirection: 'row', gap: 4 },
  badge: { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  matchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, gap: 8 },
  matchResult: { fontSize: 11, fontWeight: '800', width: 18 },
  matchScore: { fontSize: 12, fontWeight: '700', width: 30 },
  matchOpponent: { flex: 1, fontSize: 11 },
  matchDate: { fontSize: 10, fontWeight: '500' },
});

// ── Injuries & Suspensions section ───────────────────────────────────────────
const InjuriesSection: React.FC<{ home: MissingPlayer[]; away: MissingPlayer[]; match: Match }> = ({ home, away, match }) => {
  const c = useThemeColors();
  if (home.length === 0 && away.length === 0) return null;

  const reasonIcon = (r: string) =>
    r === 'injury' ? '🏥' : r === 'suspension' ? '🟥' : r === 'international' ? '🌍' : '❓';

  const renderList = (players: MissingPlayer[], teamName: string, color: string) => (
    <View style={inj.teamBlock}>
      <Text style={[inj.teamLabel, { color }]}>{teamName}</Text>
      {players.map((p, i) => (
        <View key={i} style={[inj.playerRow, { borderTopColor: c.border }]}>
          <Text style={inj.reasonIcon}>{reasonIcon(p.reason)}</Text>
          <Text style={[inj.playerName, { color: c.textPrimary }]}>{p.name}</Text>
          <Text style={[inj.detail, { color: c.textTertiary }]}>{p.detail}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <View style={[inj.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={inj.header}>
        <Text style={inj.headerIcon}>🏥</Text>
        <Text style={[inj.title, { color: c.textTertiary }]}>BAJAS Y SANCIONES</Text>
      </View>
      <View style={inj.body}>
        {home.length > 0 && renderList(home, match.homeTeam.shortName, '#3b82f6')}
        {away.length > 0 && renderList(away, match.awayTeam.shortName, '#f97316')}
      </View>
    </View>
  );
};

const inj = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  headerIcon: { fontSize: 16 },
  title: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  body: { paddingHorizontal: 14, paddingBottom: 12, gap: 12 },
  teamBlock: { gap: 4 },
  teamLabel: { fontSize: 12, fontWeight: '800', marginBottom: 2 },
  playerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, gap: 8 },
  reasonIcon: { fontSize: 14, width: 20, textAlign: 'center' },
  playerName: { flex: 1, fontSize: 12, fontWeight: '500' },
  detail: { fontSize: 10 },
});

// ── Match info card ───────────────────────────────────────────────────────────
const MatchInfoCard: React.FC<{ match: Match; detail: MatchDetail }> = ({ match, detail }) => {
  const c = useThemeColors();

  const rows: { icon: string; label: string; text: string }[] = [];

  // Venue
  rows.push({ icon: '🏟️', label: 'Estadio', text: `${detail.venue.name}${detail.venue.city ? `, ${detail.venue.city}` : ''}` });
  if (detail.venue.capacity > 0) rows.push({ icon: '💺', label: 'Capacidad', text: detail.venue.capacity.toLocaleString() });
  if (detail.venue.attendance)   rows.push({ icon: '👥', label: 'Asistencia', text: detail.venue.attendance.toLocaleString() });
  if (detail.venue.surface)      rows.push({ icon: '🌱', label: 'Superficie', text: detail.venue.surface === 'grass' ? 'Césped natural' : detail.venue.surface });

  // Referee
  if (detail.referee?.name)      rows.push({ icon: '👔', label: 'Árbitro', text: detail.referee.name });
  if (detail.assistantReferees && detail.assistantReferees.length > 0) {
    rows.push({ icon: '🏁', label: 'Asistentes', text: detail.assistantReferees.join(', ') });
  }
  if (detail.fourthOfficial)     rows.push({ icon: '4️⃣', label: '4to Oficial', text: detail.fourthOfficial });

  // Weather
  if (detail.weather) {
    const w = detail.weather;
    rows.push({ icon: w.icon, label: 'Clima', text: `${w.temp}°C · ${w.description}` });
    if (w.wind > 0) rows.push({ icon: '💨', label: 'Viento', text: `${w.wind} km/h` });
    if (w.humidity > 0) rows.push({ icon: '💧', label: 'Humedad', text: `${w.humidity}%` });
  }

  // Kick-off time
  if (match.startingAtUtc) {
    try {
      const dt = new Date(match.startingAtUtc.replace(' ', 'T') + 'Z');
      const dateStr = dt.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const timeStr = dt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
      rows.push({ icon: '📅', label: 'Fecha', text: dateStr });
      rows.push({ icon: '⏰', label: 'Hora', text: timeStr + ' (local)' });
    } catch {}
  }

  if (rows.length === 0) return null;

  return (
    <View style={[mi.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[mi.title, { color: c.textTertiary }]}>INFORMACIÓN DEL PARTIDO</Text>
      {rows.map((r, i) => (
        <View key={i} style={[mi.row, { borderTopColor: c.border }]}>
          <Text style={mi.rowIcon}>{r.icon}</Text>
          <View style={mi.rowContent}>
            <Text style={[mi.rowLabel, { color: c.textTertiary }]}>{r.label}</Text>
            <Text style={[mi.rowText, { color: c.textPrimary }]}>{r.text}</Text>
          </View>
        </View>
      ))}
    </View>
  );
};

const mi = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 8 },
  title: { fontSize: 10, fontWeight: '700', letterSpacing: 1, paddingHorizontal: 14, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 1 },
  rowIcon: { fontSize: 16, width: 22, textAlign: 'center' },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 10, fontWeight: '600', marginBottom: 1 },
  rowText: { fontSize: 13 },
});

// ── Main tab ──────────────────────────────────────────────────────────────────
export const EnVivoTab: React.FC<{ match: Match; detail: MatchDetail }> = ({ match, detail }) => {
  const c = useThemeColors();

  // Split events into halves
  const first  = detail.events.filter(e => e.minute <= 45).sort((a, b) => a.minute - b.minute);
  const second = detail.events.filter(e => e.minute > 45).sort((a, b) => a.minute - b.minute);
  const hasEvents = detail.events.length > 0;

  const hasMissing = (detail.missingPlayers?.home?.length ?? 0) > 0 || (detail.missingPlayers?.away?.length ?? 0) > 0;

  return (
    <View style={{ paddingHorizontal: 16, gap: 12 }}>
      {/* Result info banner (finished matches) */}
      {detail.resultInfo && match.status === 'finished' && (
        <ResultBanner resultInfo={detail.resultInfo} />
      )}

      {/* Quick stats */}
      {match.status !== 'scheduled' && <QuickStats match={match} detail={detail} />}

      {/* Pressure Index (live + finished) */}
      {detail.pressureIndex && match.status !== 'scheduled' && (
        <PressureSection pressure={detail.pressureIndex} match={match} />
      )}

      {/* TV stations (especially for scheduled/live) */}
      {detail.tvStations && detail.tvStations.length > 0 && (
        <TVStationsRow stations={detail.tvStations} />
      )}

      {/* Odds (pre-match + live) */}
      {detail.odds && detail.odds.length > 0 && (
        <OddsSection odds={detail.odds} match={match} />
      )}

      {/* Predictions (pre-match) */}
      {detail.predictions && detail.predictions.length > 0 && (
        <PredictionsSection predictions={detail.predictions} match={match} />
      )}

      {/* Events timeline */}
      {hasEvents && (
        <View style={[tl.card, { backgroundColor: c.card, borderColor: c.border }]}>
          {/* Team headers */}
          <View style={[tl.teamsHeader, { borderBottomColor: c.border }]}>
            <Text style={[tl.teamLabel, { color: '#3b82f6' }]}>{match.homeTeam.shortName}</Text>
            <Text style={[tl.cronLabel, { color: c.textTertiary }]}>Cronología</Text>
            <Text style={[tl.teamLabel, { color: '#f97316', textAlign: 'right' }]}>{match.awayTeam.shortName}</Text>
          </View>

          {/* First half */}
          {first.length > 0 && (
            <>
              <View style={[tl.halfSep, { backgroundColor: c.surface }]}>
                <Text style={[tl.halfSepText, { color: c.textTertiary }]}>1er Tiempo</Text>
              </View>
              {first.map(e => <EventRow key={e.id} event={e} match={match} />)}
            </>
          )}

          {/* Half time separator */}
          {first.length > 0 && second.length > 0 && (
            <View style={[tl.halfSep, { backgroundColor: c.surface }]}>
              <Text style={[tl.halfSepText, { color: c.textTertiary }]}>2do Tiempo</Text>
            </View>
          )}

          {/* Second half */}
          {second.map(e => <EventRow key={e.id} event={e} match={match} />)}
        </View>
      )}

      {!hasEvents && match.status === 'scheduled' && (
        <View style={[tl.emptyCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={{ fontSize: 32 }}>📋</Text>
          <Text style={[tl.emptyText, { color: c.textSecondary }]}>
            El partido aún no ha comenzado
          </Text>
          <Text style={[tl.emptySubText, { color: c.textTertiary }]}>
            La cronología de eventos aparecerá aquí en tiempo real
          </Text>
        </View>
      )}

      {!hasEvents && match.status !== 'scheduled' && (
        <View style={[tl.emptyCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={{ fontSize: 32 }}>⚽</Text>
          <Text style={[tl.emptyText, { color: c.textSecondary }]}>
            Sin eventos disponibles
          </Text>
        </View>
      )}

      {/* Live commentaries */}
      {detail.commentaries && detail.commentaries.length > 0 && (
        <CommentariesSection commentaries={detail.commentaries} />
      )}

      {/* Team recent form */}
      {(detail.homeForm || detail.awayForm) && (
        <FormSection homeForm={detail.homeForm} awayForm={detail.awayForm} match={match} />
      )}

      {/* Injuries & Suspensions */}
      {hasMissing && (
        <InjuriesSection home={detail.missingPlayers!.home} away={detail.missingPlayers!.away} match={match} />
      )}

      {/* H2H history */}
      {detail.h2h && detail.h2h.results.length > 0 && (
        <H2HSection h2h={detail.h2h} match={match} />
      )}

      {/* Match info */}
      <MatchInfoCard match={match} detail={detail} />

      <View style={{ height: 8 }} />
    </View>
  );
};

const tl = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  teamsHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  teamLabel: { flex: 1, fontSize: 12, fontWeight: '800' },
  cronLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  halfSep: { paddingVertical: 7, alignItems: 'center' },
  halfSepText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  emptyCard: { borderRadius: 14, borderWidth: 1, padding: 32, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  emptySubText: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
