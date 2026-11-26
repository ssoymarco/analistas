// ── NotificationSettingsScreen ──────────────────────────────────────────────
// Global notification preferences. The settings here decide WHICH events the
// user receives a push for; the per-match bell (MatchBell) only decides if a
// specific match is silenced or respects these globals.
//
// State lives in NotificationPrefsContext (AsyncStorage + Firestore sync).
// ────────────────────────────────────────────────────────────────────────────

import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { haptics } from '../utils/haptics';
import { useThemeColors } from '../theme/useTheme';
import { useDarkMode } from '../contexts/DarkModeContext';
import { useNotificationPrefs, type NotificationPrefs } from '../contexts/NotificationPrefsContext';
import { SectionHeader } from '../components/SectionHeader';
import { MODO_RIVAL_ENABLED } from '../config/features';
import { radius } from '../theme/tokens';

// ── Pill picker options ────────────────────────────────────────────────────
/** Minutes-before-kickoff offered by the pre-match reminder picker. */
const MATCH_REMINDER_OPTIONS = [5, 15, 30] as const;

// ── Row primitives ─────────────────────────────────────────────────────────

interface ToggleRowProps {
  icon: string;
  label: string;
  description?: string;
  value: boolean;
  onValueChange: () => void;
  c: ReturnType<typeof useThemeColors>;
  isLast?: boolean;
}

interface DelayPickerProps {
  label: string;
  options: readonly number[];
  value: number;
  onChange: (minutes: number) => void;
  /** Label key used to format each pill — defaults to `notifications.minutes`
   *  which renders "5 min", "15 min", etc. Override to e.g. show "X min antes"
   *  when the same picker is reused in a different context. */
  formatKey?: string;
  c: ReturnType<typeof useThemeColors>;
}

const DelayPicker: React.FC<DelayPickerProps> = ({ label, options, value, onChange, formatKey = 'notifications.minutes', c }) => {
  const { t } = useTranslation();
  return (
    <View style={[s.card, s.delayCard, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[s.delayLabel, { color: c.textSecondary }]}>{label}</Text>
      <View style={s.delayRow}>
        {options.map(minutes => {
          const active = value === minutes;
          return (
            <Pressable
              key={minutes}
              onPress={() => { haptics.selection(); onChange(minutes); }}
              style={({ pressed }) => [
                s.delayPill,
                {
                  backgroundColor: active ? c.accent : c.surface,
                  borderColor: active ? c.accent : c.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={[
                s.delayPillText,
                { color: active ? '#fff' : c.textPrimary },
              ]}>
                {t(formatKey, { count: minutes })}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const ToggleRow: React.FC<ToggleRowProps> = ({ icon, label, description, value, onValueChange, c, isLast }) => (
  <View style={[s.row, { borderBottomColor: c.border, borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth }]}>
    <View style={[s.iconChip, { backgroundColor: c.surface }]}>
      <Text style={s.iconChar}>{icon}</Text>
    </View>
    <View style={s.rowText}>
      <Text style={[s.rowLabel, { color: c.textPrimary }]}>{label}</Text>
      {description && <Text style={[s.rowDescription, { color: c.textSecondary }]}>{description}</Text>}
    </View>
    <Switch
      value={value}
      onValueChange={() => { haptics.selection(); onValueChange(); }}
      trackColor={{ false: c.border, true: c.accent }}
      thumbColor="#fff"
      ios_backgroundColor={c.border}
    />
  </View>
);

// ── Screen ─────────────────────────────────────────────────────────────────

export const NotificationSettingsScreen: React.FC = () => {
  const { t } = useTranslation();
  const c = useThemeColors();
  const { isDark } = useDarkMode();
  const navigation = useNavigation();
  const { prefs, togglePref, updatePrefs, setMatchReminderMinutes } = useNotificationPrefs();

  const handleClose = useCallback(() => { haptics.light(); navigation.goBack(); }, [navigation]);

  type ToggleKey = Parameters<typeof togglePref>[0];
  const toggle = useCallback((key: ToggleKey) => () => togglePref(key), [togglePref]);

  // ── Toggles agrupados a la granularidad REAL de los topics FCM ────────────
  // El servidor solo distingue 6 clases por equipo; prometer más fino que eso
  // era mentirle al usuario (los pushes de background no se pueden filtrar).
  // "Tarjetas" = topic team_X_cards (amarillas Y rojas viajan juntas).
  const cardsOn = prefs.yellowCards || prefs.redCards;
  const toggleCards = useCallback(() => {
    const next = !(prefs.yellowCards || prefs.redCards);
    updatePrefs({ yellowCards: next, redCards: next });
  }, [prefs.yellowCards, prefs.redCards, updatePrefs]);
  // "Desarrollo y final" = topic team_X_live (MT, 2ºT, final, cambios,
  // prórroga, penales y suspensión viajan juntos).
  const flowOn = prefs.halftime || prefs.matchEnd || prefs.substitutions;
  const toggleFlow = useCallback(() => {
    const next = !(prefs.halftime || prefs.matchEnd || prefs.substitutions);
    updatePrefs({ halftime: next, matchEnd: next, substitutions: next, var: next });
  }, [prefs.halftime, prefs.matchEnd, prefs.substitutions, updatePrefs]);

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: c.bg }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[s.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={handleClose} hitSlop={12} activeOpacity={0.7}>
          <Text style={[s.headerBack, { color: c.accent }]}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: c.textPrimary }]}>{t('notifications.title')}</Text>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Intro */}
        <View style={[s.introCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[s.introTitle, { color: c.textPrimary }]}>{t('notifications.introTitle')}</Text>
          <Text style={[s.introBody, { color: c.textSecondary }]}>{t('notifications.introBody')}</Text>
        </View>

        {/* Master switch — "Recibir notificaciones".
            Phrased positively so the toggle ON state means "yes, send me alerts"
            (consistent with all the per-event toggles below). When OFF the
            notification dispatcher early-exits regardless of the rest. */}
        <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <ToggleRow
            icon="🔔"
            label={t('notifications.notificationsEnabled')}
            description={t('notifications.notificationsEnabledDescription')}
            value={prefs.notificationsEnabled}
            onValueChange={toggle('notificationsEnabled')}
            c={c}
            isLast
          />
        </View>

        {/* Before the match — pre-kickoff reminder */}
        <SectionHeader label={t('notifications.sectionBeforeMatch')} />
        <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <ToggleRow
            icon="⏰"
            label={t('notifications.matchReminder')}
            description={t('notifications.matchReminderDescription')}
            value={prefs.matchReminder}
            onValueChange={toggle('matchReminder')}
            c={c}
            isLast
          />
        </View>
        {prefs.matchReminder && (
          <DelayPicker
            label={t('notifications.matchReminderDelayLabel')}
            options={MATCH_REMINDER_OPTIONS}
            value={prefs.matchReminderMinutes}
            onChange={setMatchReminderMinutes}
            c={c}
          />
        )}

        {/* In-match events — agrupados a la granularidad real de los topics
            FCM (6 clases por equipo). Ver auditoría 10 jul 2026. */}
        <SectionHeader label={t('notifications.sectionEvents')} />
        <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <ToggleRow icon="⚽" label={t('notifications.goals')} description={t('notifications.goalsDescription')} value={prefs.goals} onValueChange={toggle('goals')} c={c} />
          <ToggleRow icon="🟨" label={t('notifications.cards')} description={t('notifications.cardsDescription')} value={cardsOn} onValueChange={toggleCards} c={c} />
          <ToggleRow icon="🔄" label={t('notifications.matchFlow')} description={t('notifications.matchFlowDescription')} value={flowOn} onValueChange={toggleFlow} c={c} isLast />
        </View>

        {/* Match state */}
        <SectionHeader label={t('notifications.sectionMatchState')} />
        <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <ToggleRow icon="🏁" label={t('notifications.matchStart')} value={prefs.matchStart} onValueChange={toggle('matchStart')} c={c} />
          <ToggleRow icon="📋" label={t('notifications.lineups')} description={t('notifications.lineupsDescription')} value={prefs.lineups} onValueChange={toggle('lineups')} c={c} isLast />
        </View>

        {/* Modo Estadio ya no vive aquí: se activa en cada partido (🏟️ en la
            pantalla del partido, o manteniendo presionado un aviso). */}

        {/* Modo Rival */}
        {MODO_RIVAL_ENABLED && (
          <>
            <SectionHeader label={t('notifications.sectionRival')} />
            <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <ToggleRow
                icon="😈"
                label={t('notifications.rivalResult')}
                description={t('notifications.rivalResultDescription')}
                value={prefs.rivalResult}
                onValueChange={toggle('rivalResult')}
                c={c}
              />
              <ToggleRow
                icon="🟥"
                label={t('notifications.rivalRedCard')}
                value={prefs.rivalRedCard}
                onValueChange={toggle('rivalRedCard')}
                c={c}
              />
              <ToggleRow
                icon="🥅"
                label={t('notifications.rivalPenMiss')}
                value={prefs.rivalPenMiss}
                onValueChange={toggle('rivalPenMiss')}
                c={c}
                isLast
              />
            </View>
          </>
        )}

        {/* Footer note */}
        <Text style={[s.footnote, { color: c.textTertiary }]}>{t('notifications.footnote')}</Text>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBack: { fontSize: 15, fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  headerSpacer: { width: 50 },

  scroll: { flex: 1 },
  scrollContent: { paddingTop: 8 },

  introCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  introTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  introBody: { fontSize: 12, lineHeight: 17 },

  card: {
    marginHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: 20,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  iconChip: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChar: { fontSize: 16 },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 14, fontWeight: '600' },
  rowDescription: { fontSize: 12, marginTop: 2, lineHeight: 16 },

  delayCard: { marginTop: -12, padding: 14 },
  delayLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 10, textTransform: 'uppercase' },
  delayRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  delayPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  delayPillText: { fontSize: 13, fontWeight: '700' },

  footnote: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: 32,
    marginTop: 4,
  },
});
