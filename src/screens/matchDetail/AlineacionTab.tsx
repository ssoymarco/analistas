import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useThemeColors } from '../../theme/useTheme';
import type { Match, MatchDetail, LineupPlayer } from '../../data/types';

// ── Dynamic imports for ViewShot + Sharing ────────────────────────────────────
let ViewShot: any = null;
let Sharing: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ViewShot = require('react-native-view-shot').default;
} catch (_) {
  // package not available — sharing will be silently disabled
}

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Sharing = require('expo-sharing');
} catch (_) {
  // package not available
}

// ── Constants ─────────────────────────────────────────────────────────────────
const HOME_COLOR = '#3b82f6';
const AWAY_COLOR = '#f97316';
const PITCH_COLOR = '#1a6b3c';
const PITCH_LINE_COLOR = 'rgba(255,255,255,0.25)';
const CAPTAIN_BORDER = '#fbbf24';
const YELLOW_TINT = 'rgba(251,191,36,0.55)';
const RED_TINT = 'rgba(239,68,68,0.70)';
const PLAYER_DOT_SIZE = 26;

// ── Sub-components ────────────────────────────────────────────────────────────

interface PlayerDotProps {
  player: LineupPlayer;
  team: 'home' | 'away';
}

const PlayerDot: React.FC<PlayerDotProps> = ({ player, team }) => {
  const baseColor = team === 'home' ? HOME_COLOR : AWAY_COLOR;

  // Tint override for cards (applied as background, on top of base)
  let bgColor = baseColor;
  if (player.redCard) bgColor = RED_TINT;
  else if (player.yellowCard) bgColor = YELLOW_TINT;

  const captainBorder = player.isCaptain
    ? { borderWidth: 2, borderColor: CAPTAIN_BORDER }
    : {};

  // Position mapping:
  //   home: x → left%, y (0-100) → top 0-50% of pitch
  //   away: x → left%, y (0-100) → bottom 0-50% of pitch (GK at y≈5 → bottom≈2.5%)
  const posStyle =
    team === 'home'
      ? { left: `${player.x}%` as any, top: `${player.y / 2}%` as any }
      : { left: `${player.x}%` as any, bottom: `${player.y / 2}%` as any };

  return (
    <View style={[styles.playerWrapper, posStyle]}>
      <View
        style={[
          styles.playerDot,
          { backgroundColor: bgColor },
          captainBorder,
        ]}
      >
        <Text style={styles.playerNumber}>{player.number}</Text>
      </View>
      <Text style={styles.playerName} numberOfLines={1}>
        {player.shortName}
      </Text>
    </View>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

export const AlineacionTab: React.FC<{ match: Match; detail: MatchDetail }> = ({
  match,
  detail,
}) => {
  const c = useThemeColors();
  const pitchRef = useRef<any>(null);

  const homeStarters = detail.homeLineup.starters ?? [];
  const awayStarters = detail.awayLineup.starters ?? [];
  const homeBench = (detail.homeLineup.bench ?? []).slice(0, 7);
  const awayBench = (detail.awayLineup.bench ?? []).slice(0, 7);

  const hasLineups = homeStarters.length > 0 || awayStarters.length > 0;

  const handleShare = async () => {
    try {
      if (!ViewShot || !pitchRef.current?.capture) return;
      const uri: string = await pitchRef.current.capture();
      if (!Sharing) return;
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Compartir alineación',
        });
      }
    } catch (err) {
      // silently handle — sharing may not be supported on this platform
    }
  };

  const PitchSection = () => {
    const pitchContent = (
      <View style={styles.pitch}>
        {/* ── Pitch markings ─────────────────────────────────────────── */}
        {/* Half-way line */}
        <View style={styles.halfwayLine} />
        {/* Center circle */}
        <View style={styles.centerCircle} />
        {/* Top penalty area */}
        <View style={styles.topPenaltyArea} />
        {/* Bottom penalty area */}
        <View style={styles.bottomPenaltyArea} />

        {/* ── Players ────────────────────────────────────────────────── */}
        {homeStarters.map((p) => (
          <PlayerDot key={`home-${p.id}`} player={p} team="home" />
        ))}
        {awayStarters.map((p) => (
          <PlayerDot key={`away-${p.id}`} player={p} team="away" />
        ))}
      </View>
    );

    if (ViewShot) {
      return (
        <ViewShot
          ref={pitchRef}
          options={{ format: 'png', quality: 1.0 }}
        >
          {pitchContent}
        </ViewShot>
      );
    }
    return pitchContent;
  };

  return (
    <View style={styles.content}>
      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!hasLineups ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: c.textTertiary }]}>
            Sin alineaciones disponibles
          </Text>
        </View>
      ) : (
        <>
          {/* ── Pitch ──────────────────────────────────────────────────────── */}
          <PitchSection />

          {/* ── Formation + Coach row ─────────────────────────────────────── */}
          <View style={styles.formationRow}>
            <Text style={[styles.formationText, { color: c.textTertiary }]}>
              {detail.homeLineup.formation}
              {detail.homeLineup.coach ? ` · ${detail.homeLineup.coach}` : ''}
            </Text>
            <Text style={[styles.formationText, { color: c.textTertiary }]}>
              {detail.awayLineup.formation}
              {detail.awayLineup.coach ? ` · ${detail.awayLineup.coach}` : ''}
            </Text>
          </View>

          {/* ── Bench ──────────────────────────────────────────────────────── */}
          {(homeBench.length > 0 || awayBench.length > 0) && (
            <View style={[styles.benchSection, { backgroundColor: c.surface }]}>
              {/* Header */}
              <View style={styles.benchHeaderRow}>
                <Text
                  style={[styles.benchTeamHeader, { color: c.textSecondary }]}
                  numberOfLines={1}
                >
                  {match.homeTeam.shortName}
                </Text>
                <Text
                  style={[
                    styles.benchTeamHeader,
                    styles.benchTeamHeaderRight,
                    { color: c.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {match.awayTeam.shortName}
                </Text>
              </View>

              {/* Rows */}
              {Array.from({
                length: Math.max(homeBench.length, awayBench.length),
              }).map((_, i) => {
                const hp = homeBench[i];
                const ap = awayBench[i];
                return (
                  <View
                    key={i}
                    style={[
                      styles.benchRow,
                      i % 2 === 0 && { backgroundColor: c.card },
                    ]}
                  >
                    {/* Home bench player */}
                    <View style={styles.benchPlayerCell}>
                      {hp ? (
                        <>
                          <View
                            style={[
                              styles.benchNumber,
                              { backgroundColor: HOME_COLOR },
                            ]}
                          >
                            <Text style={styles.benchNumberText}>
                              {hp.number}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.benchPlayerName,
                              { color: c.textPrimary },
                            ]}
                            numberOfLines={1}
                          >
                            {hp.shortName}
                          </Text>
                          <Text
                            style={[
                              styles.benchPos,
                              { color: c.textTertiary },
                            ]}
                          >
                            {hp.positionShort}
                          </Text>
                        </>
                      ) : null}
                    </View>

                    {/* Divider */}
                    <View
                      style={[
                        styles.benchDivider,
                        { backgroundColor: c.border },
                      ]}
                    />

                    {/* Away bench player */}
                    <View
                      style={[styles.benchPlayerCell, styles.benchPlayerCellRight]}
                    >
                      {ap ? (
                        <>
                          <Text
                            style={[
                              styles.benchPos,
                              { color: c.textTertiary },
                            ]}
                          >
                            {ap.positionShort}
                          </Text>
                          <Text
                            style={[
                              styles.benchPlayerName,
                              styles.benchPlayerNameRight,
                              { color: c.textPrimary },
                            ]}
                            numberOfLines={1}
                          >
                            {ap.shortName}
                          </Text>
                          <View
                            style={[
                              styles.benchNumber,
                              { backgroundColor: AWAY_COLOR },
                            ]}
                          >
                            <Text style={styles.benchNumberText}>
                              {ap.number}
                            </Text>
                          </View>
                        </>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* ── Share button ───────────────────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.shareButton, { backgroundColor: c.accent }]}
            onPress={handleShare}
            activeOpacity={0.82}
          >
            <Text style={styles.shareButtonText}>COMPARTIR</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 12,
  },

  // ── Empty ────────────────────────────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '500',
  },

  // ── Pitch ────────────────────────────────────────────────────────────────
  pitch: {
    height: 340,
    borderRadius: 12,
    backgroundColor: PITCH_COLOR,
    overflow: 'hidden',
    position: 'relative',
  },

  // ── Pitch markings ───────────────────────────────────────────────────────
  halfwayLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 1.5,
    backgroundColor: PITCH_LINE_COLOR,
  },
  centerCircle: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 1.5,
    borderColor: PITCH_LINE_COLOR,
    // Center horizontally and vertically around the half-way line
    left: '50%',
    top: '50%',
    marginLeft: -35,
    marginTop: -35,
    backgroundColor: 'transparent',
  },
  topPenaltyArea: {
    position: 'absolute',
    top: 12,
    left: 50,
    right: 50,
    height: 52,
    borderWidth: 1.5,
    borderColor: PITCH_LINE_COLOR,
    borderTopWidth: 0,
    backgroundColor: 'transparent',
  },
  bottomPenaltyArea: {
    position: 'absolute',
    bottom: 12,
    left: 50,
    right: 50,
    height: 52,
    borderWidth: 1.5,
    borderColor: PITCH_LINE_COLOR,
    borderBottomWidth: 0,
    backgroundColor: 'transparent',
  },

  // ── Player dot ───────────────────────────────────────────────────────────
  playerWrapper: {
    position: 'absolute',
    alignItems: 'center',
    // Offset so the dot is centered on the coordinate, not top-left
    marginLeft: -(PLAYER_DOT_SIZE / 2),
    marginTop: -(PLAYER_DOT_SIZE / 2),
  },
  playerDot: {
    width: PLAYER_DOT_SIZE,
    height: PLAYER_DOT_SIZE,
    borderRadius: PLAYER_DOT_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerNumber: {
    fontSize: 9,
    color: '#ffffff',
    fontWeight: '800',
  },
  playerName: {
    fontSize: 7,
    color: '#ffffff',
    fontWeight: '600',
    maxWidth: 40,
    textAlign: 'center',
    marginTop: 2,
  },

  // ── Formation row ────────────────────────────────────────────────────────
  formationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  formationText: {
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
    textAlign: 'center',
  },

  // ── Bench ────────────────────────────────────────────────────────────────
  benchSection: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 4,
  },
  benchHeaderRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  benchTeamHeader: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  benchTeamHeaderRight: {
    textAlign: 'right',
  },
  benchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    minHeight: 36,
  },
  benchPlayerCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  benchPlayerCellRight: {
    justifyContent: 'flex-end',
  },
  benchNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benchNumberText: {
    fontSize: 9,
    color: '#ffffff',
    fontWeight: '700',
  },
  benchPlayerName: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  benchPlayerNameRight: {
    textAlign: 'right',
  },
  benchPos: {
    fontSize: 10,
    fontWeight: '400',
  },
  benchDivider: {
    width: 1,
    height: 24,
    marginHorizontal: 8,
  },

  // ── Share button ─────────────────────────────────────────────────────────
  shareButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  shareButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 1,
  },
});
