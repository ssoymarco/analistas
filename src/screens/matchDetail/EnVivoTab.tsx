// ── En Vivo / Resumen / Previa Tab ───────────────────────────────────────────
// Shared tab for live events + match info. Adapts to match status.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors } from '../../theme/useTheme';
import type { Match, MatchDetail, MatchEvent } from '../../data/types';

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
  const shots    = allStats.find(s => s.label === 'Tiros');
  const onTarget = allStats.find(s => s.label === 'Tiros a puerta');

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
      {[shots, onTarget].filter(Boolean).map((s) => s && (
        <View key={s.label} style={[qs.miniStatRow, { borderTopColor: c.border }]}>
          <Text style={[qs.miniVal, { color: '#3b82f6' }]}>{s.home}</Text>
          <Text style={[qs.miniLabel, { color: c.textTertiary }]}>{s.label}</Text>
          <Text style={[qs.miniVal, { color: '#f97316' }]}>{s.away}</Text>
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

// ── Match info card ───────────────────────────────────────────────────────────
const MatchInfoCard: React.FC<{ match: Match; detail: MatchDetail }> = ({ match, detail }) => {
  const c = useThemeColors();

  const rows: { icon: string; text: string }[] = [
    { icon: '🏟️', text: `${detail.venue.name}${detail.venue.city ? `, ${detail.venue.city}` : ''}` },
  ];
  if (detail.venue.capacity > 0) rows.push({ icon: '💺', text: `Capacidad: ${detail.venue.capacity.toLocaleString()}` });
  if (detail.venue.attendance)   rows.push({ icon: '👥', text: `Asistencia: ${detail.venue.attendance.toLocaleString()}` });
  if (detail.referee?.name)      rows.push({ icon: '👔', text: `${detail.referee.flag ?? ''} ${detail.referee.name}` });
  if (detail.weather)            rows.push({ icon: detail.weather.icon, text: `${detail.weather.temp}°C · ${detail.weather.description}` });

  if (rows.length === 0) return null;

  return (
    <View style={[mi.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[mi.title, { color: c.textTertiary }]}>Información del partido</Text>
      {rows.map((r, i) => (
        <View key={i} style={[mi.row, { borderTopColor: c.border }]}>
          <Text style={mi.rowIcon}>{r.icon}</Text>
          <Text style={[mi.rowText, { color: c.textPrimary }]}>{r.text}</Text>
        </View>
      ))}
    </View>
  );
};

const mi = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  title: { fontSize: 10, fontWeight: '700', letterSpacing: 1, paddingHorizontal: 14, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 1 },
  rowIcon: { fontSize: 16, width: 22, textAlign: 'center' },
  rowText: { flex: 1, fontSize: 13 },
});

// ── Main tab ──────────────────────────────────────────────────────────────────
export const EnVivoTab: React.FC<{ match: Match; detail: MatchDetail }> = ({ match, detail }) => {
  const c = useThemeColors();

  // Split events into halves
  const first  = detail.events.filter(e => e.minute <= 45).sort((a, b) => a.minute - b.minute);
  const second = detail.events.filter(e => e.minute > 45).sort((a, b) => a.minute - b.minute);
  const hasEvents = detail.events.length > 0;

  return (
    <View style={{ paddingHorizontal: 16, gap: 12 }}>
      {/* Quick stats */}
      {match.status !== 'scheduled' && <QuickStats match={match} detail={detail} />}

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
