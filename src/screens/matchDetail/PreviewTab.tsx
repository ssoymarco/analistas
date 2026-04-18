// ── PreviewTab ────────────────────────────────────────────────────────────────
// Shown for scheduled matches. Countdown is in the MatchDetailScreen header.
// Order: User polls → AI Predictions → H2H → Form → Missing players → Match info
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../theme/useTheme';
import type { Match, MatchDetail, TeamFormEntry, MissingPlayer } from '../../data/types';
import { PredictionsCarousel, AIPredictionsSection } from './EnVivoTab';

// ── Design tokens ─────────────────────────────────────────────────────────────
const HOME_COLOR = '#3b82f6';
const AWAY_COLOR = '#f97316';
const W_COLOR    = '#10b981';
const D_COLOR    = '#f59e0b';
const L_COLOR    = '#ef4444';

// ── Sub-components ────────────────────────────────────────────────────────────
// NOTE: Countdown is now shown in the MatchDetailScreen header (below VS),
// so there is no CountdownCard here.
// PredictionsCarousel and AIPredictionsSection are imported from EnVivoTab.

/**
 * 3. MatchInfoCard — Venue + Referee + Weather unified in one card.
 * Three compact rows separated by hairline dividers: no wasted whitespace.
 */
function MatchInfoCard({ match, detail }: { match: Match; detail: MatchDetail }) {
  const { t } = useTranslation();
  const c = useThemeColors();

  const hasVenue   = !!detail.venue?.name;
  const hasReferee = !!detail.referee?.name;
  const hasWeather = !!detail.weather;

  if (!hasVenue && !hasReferee && !hasWeather) return null;

  const rs = detail.refereeStats;

  // Rows to render (only include data that exists)
  const rows: React.ReactNode[] = [];

  if (hasVenue) {
    const { name, city, surface, capacity } = detail.venue!;
    const meta = [city, surface, capacity > 0 ? t('preview.capacity', { count: capacity.toLocaleString() }) : '']
      .filter(Boolean)
      .join(' · ');
    rows.push(
      <View key="venue" style={styles.infoRow}>
        <Text style={styles.infoRowIcon}>🏟️</Text>
        <View style={styles.infoRowBody}>
          <Text style={[styles.infoRowLabel, { color: c.textTertiary }]}>{t('preview.stadium').toUpperCase()}</Text>
          <Text style={[styles.infoRowMain, { color: c.textPrimary }]}>{name}</Text>
          {!!meta && <Text style={[styles.infoRowSub, { color: c.textSecondary }]}>{meta}</Text>}
        </View>
      </View>
    );
  }

  if (hasReferee) {
    const { name, nationality, flag } = detail.referee!;
    rows.push(
      <View key="referee" style={styles.infoRow}>
        <Text style={styles.infoRowIcon}>⚖️</Text>
        <View style={styles.infoRowBody}>
          <Text style={[styles.infoRowLabel, { color: c.textTertiary }]}>{t('preview.referee').toUpperCase()}</Text>
          <View style={styles.infoRowNameLine}>
            <Text style={[styles.infoRowMain, { color: c.textPrimary }]}>{name}</Text>
            {!!flag && <Text style={styles.infoRowFlag}>{flag}</Text>}
          </View>
          {rs && (
            <View style={styles.infoRefStats}>
              <Text style={[styles.infoRefStat, { color: c.textSecondary }]}>🟡 {rs.yellowCardsPerMatch.toFixed(1)}</Text>
              <Text style={[styles.infoRefDot, { color: c.textTertiary }]}> · </Text>
              <Text style={[styles.infoRefStat, { color: c.textSecondary }]}>🔴 {rs.redCardsPerMatch.toFixed(1)}</Text>
              <Text style={[styles.infoRefDot, { color: c.textTertiary }]}> · </Text>
              <Text style={[styles.infoRefStat, { color: c.textSecondary }]}>🦵 {rs.foulsPerMatch.toFixed(0)}</Text>
              <Text style={[styles.infoRefDot, { color: c.textTertiary }]}> · </Text>
              <Text style={[styles.infoRefStat, { color: c.textSecondary }]}>⚽ {rs.penaltiesPerMatch.toFixed(1)}</Text>
              <Text style={[styles.infoRefDot, { color: c.textTertiary }]}> /partido</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  if (hasWeather) {
    const { icon, temp, description, wind, humidity } = detail.weather!;
    rows.push(
      <View key="weather" style={styles.infoRow}>
        <Text style={styles.infoRowIcon}>{icon}</Text>
        <View style={styles.infoRowBody}>
          <Text style={[styles.infoRowLabel, { color: c.textTertiary }]}>{t('preview.weather').toUpperCase()}</Text>
          <View style={styles.infoRowNameLine}>
            <Text style={[styles.infoRowMain, { color: c.textPrimary }]}>{temp}°</Text>
            <Text style={[styles.infoRowSub, { color: c.textSecondary, marginLeft: 6 }]}>{description}</Text>
          </View>
          <Text style={[styles.infoRowSub, { color: c.textTertiary }]}>
            {t('preview.wind', { speed: wind })} · {t('preview.humidity', { pct: humidity })}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border, padding: 0 }]}>
      {rows.map((row, i) => (
        <React.Fragment key={i}>
          {i > 0 && <View style={[styles.infoRowDivider, { backgroundColor: c.border }]} />}
          {row}
        </React.Fragment>
      ))}
    </View>
  );
}

/** 6. H2HCard */
function H2HCard({
  match,
  detail,
}: {
  match: Match;
  detail: MatchDetail;
}) {
  const { t } = useTranslation();
  const c = useThemeColors();

  const results = detail.h2h?.results;
  if (!results || results.length === 0) return null;

  // Compute summary from ALL results
  let homeWins = 0, draws = 0, awayWins = 0;
  for (const r of results) {
    if (r.homeScore > r.awayScore) homeWins++;
    else if (r.homeScore < r.awayScore) awayWins++;
    else draws++;
  }
  const total = results.length;

  // Show last 5
  const last5 = results.slice(0, 5);

  // Bar proportions
  const hwPct  = total > 0 ? (homeWins / total) * 100 : 33;
  const drawPct = total > 0 ? (draws    / total) * 100 : 34;
  const awPct  = total > 0 ? (awayWins  / total) * 100 : 33;

  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[styles.cardTitle, { color: c.textPrimary }]}>
        {t('preview.h2h')}
      </Text>
      <Text style={[styles.h2hSubtitle, { color: c.textSecondary }]}>
        {t('preview.h2hOf', { count: total })}
      </Text>

      {/* Summary bar */}
      <View style={styles.h2hSummaryRow}>
        <Text style={[styles.h2hSummaryLabel, { color: HOME_COLOR }]}>
          {homeWins} {t('preview.wins')}
        </Text>
        <Text style={[styles.h2hSummaryLabel, { color: '#6b7280' }]}>
          {draws} {t('preview.draws')}
        </Text>
        <Text style={[styles.h2hSummaryLabel, { color: AWAY_COLOR }]}>
          {awayWins} {t('preview.wins')}
        </Text>
      </View>
      <View style={styles.h2hBar}>
        {hwPct > 0 && (
          <View style={[styles.h2hBarSeg, { flex: hwPct, backgroundColor: HOME_COLOR }]} />
        )}
        {drawPct > 0 && (
          <View style={[styles.h2hBarSeg, { flex: drawPct, backgroundColor: '#6b7280' }]} />
        )}
        {awPct > 0 && (
          <View style={[styles.h2hBarSeg, { flex: awPct, backgroundColor: AWAY_COLOR }]} />
        )}
      </View>

      {/* Team names above/below bar */}
      <View style={styles.h2hTeamRow}>
        <Text style={[styles.h2hTeam, { color: HOME_COLOR }]} numberOfLines={1}>
          {match.homeTeam.shortName}
        </Text>
        <Text style={[styles.h2hTeam, { color: AWAY_COLOR }]} numberOfLines={1}>
          {match.awayTeam.shortName}
        </Text>
      </View>

      {/* Individual match rows */}
      <View style={[styles.h2hDivider, { backgroundColor: c.border }]} />
      {last5.map((r, i) => {
        const homeWon = r.homeScore > r.awayScore;
        const awayWon = r.homeScore < r.awayScore;
        return (
          <View
            key={i}
            style={[
              styles.h2hMatchRow,
              i < last5.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border },
            ]}
          >
            <Text style={[styles.h2hMatchDate, { color: c.textTertiary }]} numberOfLines={1}>
              {r.date}
            </Text>
            <View style={styles.h2hScoreWrap}>
              <Text
                style={[
                  styles.h2hScore,
                  { color: homeWon ? HOME_COLOR : awayWon ? c.textSecondary : c.textSecondary },
                ]}
              >
                {r.homeScore}
              </Text>
              <Text style={[styles.h2hDash, { color: c.textTertiary }]}> – </Text>
              <Text
                style={[
                  styles.h2hScore,
                  { color: awayWon ? AWAY_COLOR : homeWon ? c.textSecondary : c.textSecondary },
                ]}
              >
                {r.awayScore}
              </Text>
            </View>
            <Text
              style={[styles.h2hCompetition, { color: c.textTertiary }]}
              numberOfLines={1}
            >
              {r.competition}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** 7. FormCard */
function FormCard({
  match,
  detail,
}: {
  match: Match;
  detail: MatchDetail;
}) {
  const { t } = useTranslation();
  const c = useThemeColors();

  if (!detail.homeForm && !detail.awayForm) return null;

  const homeForm = (detail.homeForm ?? []).slice(0, 5);
  const awayForm = (detail.awayForm ?? []).slice(0, 5);

  const calcPoints = (form: TeamFormEntry[]) =>
    form.reduce((acc, f) => acc + (f.result === 'W' ? 3 : f.result === 'D' ? 1 : 0), 0);

  const resultColor = (r: 'W' | 'D' | 'L') => {
    if (r === 'W') return W_COLOR;
    if (r === 'D') return D_COLOR;
    return L_COLOR;
  };

  const renderTeamForm = (name: string, form: TeamFormEntry[], isHome: boolean) => {
    const pts = calcPoints(form);
    return (
      <View style={styles.formTeamBlock}>
        <Text
          style={[styles.formTeamName, { color: isHome ? HOME_COLOR : AWAY_COLOR }]}
          numberOfLines={1}
        >
          {name}
        </Text>
        <View style={styles.formDots}>
          {form.map((f, i) => (
            <View
              key={i}
              style={[styles.formDot, { backgroundColor: resultColor(f.result) }]}
            >
              <Text style={styles.formDotText}>{f.result}</Text>
            </View>
          ))}
        </View>
        <Text style={[styles.formPoints, { color: c.textSecondary }]}>
          {t('preview.formPoints', { pts })}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[styles.cardTitle, { color: c.textPrimary }]}>
        {t('preview.form')}
      </Text>
      <View style={styles.formRow}>
        {homeForm.length > 0 && renderTeamForm(match.homeTeam.shortName, homeForm, true)}
        {awayForm.length > 0 && (
          <>
            <View style={[styles.formDivider, { backgroundColor: c.border }]} />
            {renderTeamForm(match.awayTeam.shortName, awayForm, false)}
          </>
        )}
      </View>
    </View>
  );
}

/** 8. MissingPlayersCard */
function MissingPlayersCard({
  match,
  detail,
}: {
  match: Match;
  detail: MatchDetail;
}) {
  const { t } = useTranslation();
  const c = useThemeColors();

  const home = detail.missingPlayers?.home ?? [];
  const away = detail.missingPlayers?.away ?? [];
  if (home.length === 0 && away.length === 0) return null;

  const reasonEmoji = (reason: MissingPlayer['reason']) => {
    switch (reason) {
      case 'injury':       return '🤕';
      case 'suspension':   return '🟥';
      case 'international': return '🌍';
      default:             return '❓';
    }
  };

  const renderPlayer = (p: MissingPlayer, i: number) => (
    <View key={i} style={styles.missingPlayer}>
      <Text style={styles.missingEmoji}>{reasonEmoji(p.reason)}</Text>
      <Text style={[styles.missingName, { color: c.textPrimary }]} numberOfLines={1}>
        {p.name}
      </Text>
    </View>
  );

  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[styles.cardTitle, { color: c.textPrimary }]}>
        {t('preview.injuries')}
      </Text>
      <View style={styles.missingColumns}>
        {/* Home column */}
        <View style={styles.missingCol}>
          <Text style={[styles.missingTeam, { color: HOME_COLOR }]} numberOfLines={1}>
            {match.homeTeam.shortName}
          </Text>
          {home.length === 0 ? (
            <Text style={[styles.missingNone, { color: c.textTertiary }]}>—</Text>
          ) : (
            home.map(renderPlayer)
          )}
        </View>
        {/* Divider */}
        <View style={[styles.missingColDivider, { backgroundColor: c.border }]} />
        {/* Away column */}
        <View style={styles.missingCol}>
          <Text style={[styles.missingTeam, { color: AWAY_COLOR }]} numberOfLines={1}>
            {match.awayTeam.shortName}
          </Text>
          {away.length === 0 ? (
            <Text style={[styles.missingNone, { color: c.textTertiary }]}>—</Text>
          ) : (
            away.map(renderPlayer)
          )}
        </View>
      </View>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
// NOTE: No ScrollView here — MatchDetailScreen wraps everything in
// Animated.ScrollView. Adding a nested ScrollView breaks header animation.
export const PreviewTab: React.FC<{ match: Match; detail: MatchDetail }> = ({
  match,
  detail,
}) => {
  return (
    <View style={styles.container}>
      {/* User polls — interactive, most engaging first */}
      <PredictionsCarousel match={match} />
      {/* AI predictions — rich multi-type card */}
      <AIPredictionsSection predictions={detail.predictions ?? []} match={match} />
      <H2HCard            match={match} detail={detail} />
      <FormCard           match={match} detail={detail} />
      <MissingPlayersCard match={match} detail={detail} />
      {/* Match logistics last — least critical info */}
      <MatchInfoCard      match={match} detail={detail} />
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 8,
  },

  // ── Shared card ─────────────────────────────────────────────────────────────
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 16,
    marginBottom: 0,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  // ── MatchInfoCard (unified Venue + Referee + Weather) — compact/secondary ────
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  infoRowIcon: {
    fontSize: 15,
    marginTop: 1,
  },
  infoRowBody: {
    flex: 1,
    gap: 1,
  },
  infoRowLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 1,
  },
  infoRowMain: {
    fontSize: 13,
    fontWeight: '600',
  },
  infoRowSub: {
    fontSize: 11,
    fontWeight: '400',
  },
  infoRowNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
  },
  infoRowFlag: {
    fontSize: 13,
  },
  infoRefStats: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 3,
  },
  infoRefStat: {
    fontSize: 11,
    fontWeight: '500',
  },
  infoRefDot: {
    fontSize: 11,
  },
  infoRowDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 39, // aligned after icon column
  },

  // ── H2HCard ──────────────────────────────────────────────────────────────────
  h2hSubtitle: {
    fontSize: 12,
    marginTop: -8,
    marginBottom: 12,
  },
  h2hSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  h2hSummaryLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  h2hBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  h2hBarSeg: {
    height: 8,
  },
  h2hTeamRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  h2hTeam: {
    fontSize: 11,
    fontWeight: '600',
  },
  h2hDivider: {
    height: 1,
    marginBottom: 8,
  },
  h2hMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  h2hMatchDate: {
    fontSize: 11,
    width: 70,
  },
  h2hScoreWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  h2hScore: {
    fontSize: 15,
    fontWeight: '700',
    minWidth: 16,
    textAlign: 'center',
  },
  h2hDash: {
    fontSize: 14,
  },
  h2hCompetition: {
    fontSize: 11,
    flex: 1,
    textAlign: 'right',
  },

  // ── FormCard ─────────────────────────────────────────────────────────────────
  formRow: {
    flexDirection: 'row',
    gap: 0,
  },
  formTeamBlock: {
    flex: 1,
    gap: 6,
  },
  formTeamName: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  formDots: {
    flexDirection: 'row',
    gap: 4,
  },
  formDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formDotText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  formPoints: {
    fontSize: 11,
    fontWeight: '500',
  },
  formDivider: {
    width: 1,
    marginHorizontal: 12,
  },

  // ── MissingPlayersCard ───────────────────────────────────────────────────────
  missingColumns: {
    flexDirection: 'row',
    gap: 0,
    marginTop: 4,
  },
  missingCol: {
    flex: 1,
    gap: 6,
  },
  missingColDivider: {
    width: 1,
    marginHorizontal: 12,
  },
  missingTeam: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  missingPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  missingEmoji: {
    fontSize: 14,
  },
  missingName: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  missingNone: {
    fontSize: 13,
  },
});
