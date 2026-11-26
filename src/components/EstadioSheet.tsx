// ── EstadioSheet ──────────────────────────────────────────────────────────────
// Bottom sheet opened from the 🏟️ button of a match. Modo Estadio belongs to
// that ONE match: its notifications arrive a few minutes late so they don't
// beat the TV. Two options (cable / streaming) and one button.
//
// The sheet only says "activo" once the server confirmed it (the mode is
// delivered by the server — see services/estadio.ts); while the request is in
// flight the button shows progress, and a failure is said in words.

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../theme/useTheme';
import { useDarkMode } from '../contexts/DarkModeContext';
import { useNotificationPrefs } from '../contexts/NotificationPrefsContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { useTeamsWithFamily } from '../hooks/useTeamsWithFamily';
import { ESTADIO_DELAYS, EstadioError } from '../services/estadio';
import { logEvent, ANALYTICS_EVENTS } from '../services/analytics';
import { haptics } from '../utils/haptics';

interface Props {
  visible: boolean;
  onClose: () => void;
  match: { id: string; homeTeamId?: string | null; awayTeamId?: string | null };
  /** "América vs Guadalajara" */
  matchLabel: string;
  /** The match is over: nothing left to delay. */
  finished: boolean;
  /** Tells the screen to show its toast (true = turned on). */
  onChanged?: (active: boolean, delayMin: number) => void;
}

const GREEN = '#00E096';

/** i18n key of each option's name, by its minutes. */
const OPTION_LABEL: Record<number, string> = {
  3: 'estadioMode.optionCable',
  5: 'estadioMode.optionStreaming',
};

export const EstadioSheet: React.FC<Props> = ({ visible, onClose, match, matchLabel, finished, onChanged }) => {
  const c = useThemeColors();
  const { isDark } = useDarkMode();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { isMatchEstadio, getMatchEstadioDelay, startMatchEstadio, stopMatchEstadio } = useNotificationPrefs();

  // Notifications of a match come from following one of its teams (or having
  // one as a rival). Without that there is nothing to delay — say so.
  const { followedTeamIds, isRivalTeam } = useFavorites();
  const followedWithYouth = useTeamsWithFamily(followedTeamIds);
  const sides = [match.homeTeamId, match.awayTeamId].filter((id): id is string => !!id).map(String);
  const getsPushes = sides.length === 0 || sides.some(id => followedWithYouth.includes(id) || isRivalTeam(id));

  const active = isMatchEstadio(match.id);
  const currentDelay = getMatchEstadioDelay(match.id);
  const [picked, setPicked] = useState<number>(currentDelay);
  const [busy, setBusy] = useState<false | 'start' | 'stop'>(false);
  const [error, setError] = useState<string | null>(null);

  // Each time the sheet opens it starts from what is in force.
  useEffect(() => {
    if (visible) {
      setPicked((ESTADIO_DELAYS as readonly number[]).includes(currentDelay) ? currentDelay : ESTADIO_DELAYS[0]);
      setError(null);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // On green surfaces the brand green is too light to read in light mode.
  const greenText = isDark ? GREEN : '#046148';
  const greenBorder = isDark ? GREEN : '#00B378';
  const secondary = isDark ? c.textSecondary : '#4b5563';
  const tertiary = isDark ? '#9ca3af' : '#6b7280';

  const messageFor = (err: unknown): string => {
    const code = err instanceof EstadioError ? err.code : 'failed';
    if (code === 'no-push') return t('estadioMode.errorNoPush');
    if (code === 'match-finished') return t('estadioMode.finishedNote');
    return t('estadioMode.errorGeneric');
  };

  const start = async (delayMin: number) => {
    if (busy) return;
    haptics.medium();
    setBusy('start');
    setError(null);
    try {
      await startMatchEstadio(match, delayMin);
      logEvent(ANALYTICS_EVENTS.STADIUM_MODE_TOGGLE, { enabled: true, delay_min: delayMin, source: 'match' });
      onChanged?.(true, delayMin);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (busy) return;
    haptics.medium();
    setBusy('stop');
    setError(null);
    try {
      await stopMatchEstadio(match.id);
      logEvent(ANALYTICS_EVENTS.STADIUM_MODE_TOGGLE, { enabled: false, source: 'match' });
      onChanged?.(false, 0);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  // Tapping an option: before activating it only selects; once active it
  // changes the delay right away.
  const pick = (delayMin: number) => {
    if (busy) return;
    haptics.selection();
    setPicked(delayMin);
    if (active && delayMin !== currentDelay) start(delayMin);
  };

  const shownDelay = active ? currentDelay : picked;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.4)' }} onPress={onClose} />

      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: c.card,
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        paddingTop: 10, paddingHorizontal: 20, paddingBottom: insets.bottom + 20,
        gap: 16,
      }}>
        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.16)', alignSelf: 'center' }} />

        {/* Title */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{
            width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
            backgroundColor: active ? 'rgba(0,224,150,0.16)' : (isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'),
          }}>
            <Text style={{ fontSize: 20 }}>🏟️</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: c.textPrimary }}>{t('estadioMode.title')}</Text>
            <Text style={{ fontSize: 13, color: secondary }} numberOfLines={2}>
              {t('estadioMode.matchScope', { match: matchLabel })}
            </Text>
          </View>
          {active && (
            <View style={{ backgroundColor: GREEN, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: '#04130d' }}>{t('estadioMode.activeBadge')}</Text>
            </View>
          )}
        </View>

        {/* What it does / what is in force */}
        {active ? (
          <View style={{
            borderRadius: 14, padding: 14, gap: 4,
            backgroundColor: isDark ? 'rgba(0,224,150,0.10)' : 'rgba(0,224,150,0.12)',
            borderWidth: 1, borderColor: isDark ? 'rgba(0,224,150,0.30)' : greenBorder,
          }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary }}>
              {t('estadioMode.activeTitle', { min: currentDelay })}
            </Text>
            <Text style={{ fontSize: 12, lineHeight: 17, color: isDark ? c.textSecondary : '#374151' }}>
              {t('estadioMode.activeDetail')}
            </Text>
          </View>
        ) : (
          <Text style={{ fontSize: 13, lineHeight: 19, color: secondary }}>{t('estadioMode.matchDescription')}</Text>
        )}

        {/* Options */}
        <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: tertiary }}>
          {(active ? t('estadioMode.delayLabel') : t('estadioMode.howWatching')).toUpperCase()}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {ESTADIO_DELAYS.map(min => {
            const selected = shownDelay === min;
            return (
              <TouchableOpacity
                key={min}
                onPress={() => pick(min)}
                disabled={!!busy || finished}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={{
                  flex: 1, height: 68, borderRadius: 14, paddingHorizontal: 14, justifyContent: 'center', gap: 4,
                  backgroundColor: selected ? 'rgba(0,224,150,0.14)' : c.surface,
                  borderWidth: selected ? 1.5 : 1,
                  borderColor: selected ? greenBorder : (isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)'),
                  opacity: finished ? 0.5 : 1,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: c.textPrimary }}>{t(OPTION_LABEL[min])}</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: selected ? greenText : tertiary }}>
                  {t('estadioMode.minutes', { min })}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Bumped from a notification ("me spoileó"): neither option matches. */}
        {active && !(ESTADIO_DELAYS as readonly number[]).includes(currentDelay) && (
          <Text style={{ fontSize: 12, color: tertiary, marginTop: -8 }}>{t('estadioMode.bumpedNote', { min: currentDelay })}</Text>
        )}

        {!getsPushes && !finished && (
          <Text style={{ fontSize: 12, lineHeight: 17, color: isDark ? '#fbbf24' : '#92400e' }}>{t('estadioMode.notFollowingNote')}</Text>
        )}

        {error && (
          <Text style={{ fontSize: 13, lineHeight: 18, color: isDark ? '#fca5a5' : '#b91c1c' }}>{error}</Text>
        )}

        {/* Main button */}
        {active ? (
          <TouchableOpacity
            onPress={stop}
            disabled={!!busy}
            activeOpacity={0.7}
            style={{
              height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: isDark ? 'rgba(248,113,113,0.45)' : 'rgba(220,38,38,0.45)',
            }}
          >
            {busy
              ? <ActivityIndicator color={isDark ? '#fca5a5' : '#b91c1c'} />
              : <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? '#fca5a5' : '#b91c1c' }}>{t('estadioMode.deactivateMatch')}</Text>}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => start(picked)}
            disabled={!!busy || finished}
            activeOpacity={0.8}
            style={{
              height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
              backgroundColor: GREEN, opacity: finished ? 0.4 : 1,
            }}
          >
            {busy
              ? <ActivityIndicator color="#04130d" />
              : <Text style={{ fontSize: 16, fontWeight: '800', color: '#04130d' }}>{t('estadioMode.activateMatch')}</Text>}
          </TouchableOpacity>
        )}

        <Text style={{ fontSize: 12, color: tertiary, textAlign: 'center' }}>
          {finished && !active ? t('estadioMode.finishedNote') : t('estadioMode.autoOffNote')}
        </Text>
      </View>
    </Modal>
  );
};
