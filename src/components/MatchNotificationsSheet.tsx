// ── MatchNotificationsSheet ──────────────────────────────────────────────────
// Bottom sheet opened from the bell in MatchDetailScreen. Lets the user
// override per-event notification preferences for a single match without
// affecting their global settings. Includes a master "mute this match"
// toggle and a reset button to clear all per-match overrides.
//
// Storage / state lives in NotificationPrefsContext — this component just
// reads + writes via the context API.

import React from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView, Switch, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../theme/useTheme';
import {
  useNotificationPrefs,
  type MatchEventPrefKey,
  MATCH_EVENT_KEYS,
} from '../contexts/NotificationPrefsContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  matchId: string;
  /** Optional — shown as subtitle context (e.g. "Cruz Azul vs Pumas UNAM"). */
  matchLabel?: string;
}

// Map each event key to the existing top-level i18n key under `notifications.*`
// (so we don't duplicate strings). All these keys already exist in es/en.ts.
const EVENT_I18N_KEY: Record<MatchEventPrefKey, string> = {
  matchReminder: 'notifications.matchReminder',
  goals:         'notifications.goals',
  matchStart:    'notifications.matchStart',
  halftime:      'notifications.halftime',
  matchEnd:      'notifications.matchEnd',
  lineups:       'notifications.lineups',
  redCards:      'notifications.redCards',
  yellowCards:   'notifications.yellowCards',
  substitutions: 'notifications.substitutions',
  var:           'notifications.var',
};

// A simple emoji to tag each row — visual cue without needing icons.
const EVENT_EMOJI: Record<MatchEventPrefKey, string> = {
  matchReminder: '⏰',
  goals:         '⚽',
  matchStart:    '🟢',
  halftime:      '🟡',
  matchEnd:      '🏁',
  lineups:       '📋',
  redCards:      '🟥',
  yellowCards:   '🟨',
  substitutions: '🔄',
  var:           '🎥',
};

export const MatchNotificationsSheet: React.FC<Props> = ({
  visible, onClose, matchId, matchLabel,
}) => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const {
    prefs,
    isMatchMuted, toggleMatchMute,
    matchEventOverrides,
    setMatchEventOverride, clearMatchEventOverride, clearAllMatchEventOverrides,
    getEffectiveMatchEventPref,
  } = useNotificationPrefs();

  const muted = isMatchMuted(matchId);
  const overrides = matchEventOverrides[matchId] ?? {};
  const hasAnyOverride = Object.keys(overrides).length > 0;

  // Tap on a toggle row: cycle between "use global" (no override) and
  // explicit on/off. Logic: if currently matching global, set override to
  // the opposite. If currently overridden, clear the override.
  const handleToggleEvent = (key: MatchEventPrefKey) => {
    const globalValue = prefs[key];
    const overridden = overrides[key] !== undefined;
    if (overridden) {
      // If the override matches the global value, just clear it (revert).
      // Otherwise toggle to the opposite (the user is changing direction).
      if (overrides[key] === globalValue) {
        clearMatchEventOverride(matchId, key);
      } else {
        // Currently overridden to !global → toggling brings it back to global
        clearMatchEventOverride(matchId, key);
      }
    } else {
      // Not overridden → set override to opposite of global
      setMatchEventOverride(matchId, key, !globalValue);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Backdrop tap to dismiss */}
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}
        onPress={onClose}
      />

      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: c.card,
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        paddingTop: 10,
        paddingBottom: insets.bottom + 12,
        maxHeight: '88%',
      }}>
        {/* Grab handle */}
        <View style={{
          width: 36, height: 4, borderRadius: 2,
          backgroundColor: c.border, alignSelf: 'center', marginBottom: 12,
        }} />

        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: c.textPrimary }}>
            {t('notifications.matchSheet.title')}
          </Text>
          {matchLabel ? (
            <Text style={{ fontSize: 13, color: c.textSecondary, marginTop: 2 }}>
              {matchLabel}
            </Text>
          ) : null}
          <Text style={{ fontSize: 12, color: c.textTertiary, marginTop: 8, lineHeight: 17 }}>
            {t('notifications.matchSheet.subtitle')}
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 4 }}
        >
          {/* Master mute toggle */}
          <View style={{
            marginHorizontal: 16, marginTop: 12,
            borderRadius: 14, backgroundColor: c.surface,
            borderWidth: 1, borderColor: c.border,
            paddingHorizontal: 14, paddingVertical: 12,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ fontSize: 20 }}>{muted ? '🔕' : '🔔'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary }}>
                  {t('notifications.matchSheet.muteTitle')}
                </Text>
                <Text style={{ fontSize: 11, color: c.textTertiary, marginTop: 2, lineHeight: 15 }}>
                  {muted
                    ? t('notifications.matchSheet.muteHint')
                    : t('notifications.matchSheet.muteDescription')}
                </Text>
              </View>
              <Switch
                value={muted}
                onValueChange={() => toggleMatchMute(matchId)}
                trackColor={{ false: c.border, true: '#ef4444' }}
                thumbColor="#fff"
                ios_backgroundColor={c.border}
              />
            </View>
          </View>

          {/* Events section header */}
          <View style={{ paddingHorizontal: 20, marginTop: 22, marginBottom: 8 }}>
            <Text style={{
              fontSize: 11, fontWeight: '800', color: c.textTertiary,
              letterSpacing: 1.2, textTransform: 'uppercase',
            }}>
              {t('notifications.matchSheet.eventsTitle')}
            </Text>
            <Text style={{ fontSize: 11, color: c.textTertiary, marginTop: 4, lineHeight: 15 }}>
              {t('notifications.matchSheet.eventsHint')}
            </Text>
          </View>

          {/* Per-event rows */}
          <View style={{
            marginHorizontal: 16,
            borderRadius: 14, backgroundColor: c.surface,
            borderWidth: 1, borderColor: c.border,
            opacity: muted ? 0.45 : 1,
          }}>
            {MATCH_EVENT_KEYS.map((key, i) => {
              const effective = getEffectiveMatchEventPref(matchId, key);
              const overridden = overrides[key] !== undefined;
              const label = t(EVENT_I18N_KEY[key]);
              const hint = key === 'matchReminder'
                ? t('notifications.matchSheet.reminderHint', { minutes: prefs.matchReminderMinutes })
                : null;
              return (
                <View
                  key={key}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    paddingHorizontal: 14, paddingVertical: 11,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: c.border,
                  }}
                >
                  <Text style={{ fontSize: 16 }}>{EVENT_EMOJI[key]}</Text>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: c.textPrimary }}>
                        {label}
                      </Text>
                      {overridden && (
                        <View style={{
                          paddingHorizontal: 6, paddingVertical: 1,
                          borderRadius: 4,
                          backgroundColor: '#00E09622',
                        }}>
                          <Text style={{
                            fontSize: 9, fontWeight: '800',
                            color: '#00E096', letterSpacing: 0.5,
                          }}>
                            {t('notifications.matchSheet.customized').toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                    {hint && (
                      <Text style={{ fontSize: 11, color: c.textTertiary, marginTop: 2 }}>
                        {hint}
                      </Text>
                    )}
                  </View>
                  <Switch
                    value={effective}
                    onValueChange={() => handleToggleEvent(key)}
                    disabled={muted}
                    trackColor={{ false: c.border, true: c.accent }}
                    thumbColor="#fff"
                    ios_backgroundColor={c.border}
                  />
                </View>
              );
            })}
          </View>

          {/* Reset button — only meaningful when there's something to reset */}
          {(hasAnyOverride || muted) && (
            <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
              <TouchableOpacity
                onPress={() => {
                  clearAllMatchEventOverrides(matchId);
                  if (muted) toggleMatchMute(matchId);
                }}
                activeOpacity={0.7}
                style={{
                  paddingVertical: 12,
                  borderRadius: 12,
                  borderWidth: 1, borderColor: c.border,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary }}>
                  {t('notifications.matchSheet.resetButton')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {/* Done button */}
        <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.8}
            style={{
              paddingVertical: 14,
              borderRadius: 14,
              backgroundColor: c.accent,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#001A0D' }}>
              {t('notifications.matchSheet.done')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};
