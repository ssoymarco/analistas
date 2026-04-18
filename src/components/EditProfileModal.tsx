/**
 * EditProfileModal.tsx
 *
 * Bottom-sheet modal to edit display name and @username.
 * Shows inline availability check with debounce.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  StyleSheet, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../theme/useTheme';
import { useAuth } from '../contexts/AuthContext';
import { haptics } from '../utils/haptics';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export const EditProfileModal: React.FC<Props> = ({ visible, onClose }) => {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user, updateProfile, checkUsernameAvailable } = useAuth();

  const [name, setName]               = useState(user?.name ?? '');
  const [username, setUsername]       = useState(user?.username ?? '');
  const [usernameStatus, setStatus]   = useState<UsernameStatus>('idle');
  const [isSaving, setIsSaving]       = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset fields when modal opens
  useEffect(() => {
    if (visible) {
      setName(user?.name ?? '');
      setUsername(user?.username ?? '');
      setStatus('idle');
      setError(null);
    }
  }, [visible, user]);

  // Debounced username availability check
  const handleUsernameChange = useCallback((text: string) => {
    const cleaned = text.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 20);
    setUsername(cleaned);
    setStatus('checking');

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (!cleaned || cleaned === user?.username) {
      setStatus('idle');
      return;
    }

    const validRegex = /^[a-z0-9][a-z0-9._]{1,18}[a-z0-9]$/;
    if (!validRegex.test(cleaned)) {
      setStatus('invalid');
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      try {
        const available = await checkUsernameAvailable(cleaned);
        setStatus(available ? 'available' : 'taken');
      } catch {
        setStatus('idle');
      }
    }, 500);
  }, [user?.username, checkUsernameAvailable]);

  const canSave =
    (name.trim() !== '' && name.trim() !== user?.name) ||
    (username !== user?.username && (usernameStatus === 'available' || username === user?.username));

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    setError(null);
    try {
      await updateProfile({
        displayName: name.trim() !== user?.name ? name.trim() : undefined,
        username:    username !== user?.username ? username : undefined,
      });
      haptics.success();
      onClose();
    } catch (err: unknown) {
      haptics.error();
      const msg = err instanceof Error ? err.message : 'error';
      setError(msg === 'username_taken' ? t('editProfileModal.usernameInUse') : t('editProfileModal.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  const statusColor = () => {
    if (usernameStatus === 'available') return '#00E096';
    if (usernameStatus === 'taken' || usernameStatus === 'invalid') return '#FF453A';
    return c.textTertiary;
  };

  const statusText = () => {
    if (usernameStatus === 'checking') return '...';
    if (usernameStatus === 'available') return t('common.available');
    if (usernameStatus === 'taken') return t('common.unavailable');
    if (usernameStatus === 'invalid') return t('editProfileModal.usernameHint');
    return '';
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.kvContainer}
      >
        <View style={[s.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + 16 }]}>

          {/* Handle */}
          <View style={[s.handle, { backgroundColor: c.border }]} />

          {/* Title */}
          <Text style={[s.title, { color: c.textPrimary }]}>{t('editProfileModal.title')}</Text>

          {/* Name field */}
          <Text style={[s.label, { color: c.textSecondary }]}>{t('editProfileModal.nameLabel')}</Text>
          <TextInput
            style={[s.input, { backgroundColor: c.card, color: c.textPrimary, borderColor: c.border }]}
            value={name}
            onChangeText={setName}
            placeholder={t('editProfileModal.namePlaceholder')}
            placeholderTextColor={c.textTertiary}
            autoCapitalize="words"
            maxLength={40}
          />

          {/* Username field */}
          <Text style={[s.label, { color: c.textSecondary }]}>{t('editProfileModal.usernameLabel')}</Text>
          <View style={[s.usernameRow, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[s.atSign, { color: c.textTertiary }]}>@</Text>
            <TextInput
              style={[s.usernameInput, { color: c.textPrimary }]}
              value={username}
              onChangeText={handleUsernameChange}
              placeholder={t('editProfileModal.usernamePlaceholder')}
              placeholderTextColor={c.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
            />
            {usernameStatus === 'checking' && (
              <ActivityIndicator size="small" color={c.textTertiary} style={{ marginRight: 12 }} />
            )}
          </View>
          {statusText() ? (
            <Text style={[s.statusText, { color: statusColor() }]}>{statusText()}</Text>
          ) : null}

          {/* Error */}
          {error && <Text style={[s.errorText, { color: '#FF453A' }]}>{error}</Text>}

          {/* Save button */}
          <TouchableOpacity
            style={[
              s.saveBtn,
              { backgroundColor: canSave && !isSaving ? '#00E096' : c.border },
            ]}
            onPress={handleSave}
            disabled={!canSave || isSaving}
            activeOpacity={0.85}
          >
            {isSaving
              ? <ActivityIndicator color="#000" />
              : <Text style={[s.saveBtnText, { color: canSave ? '#000' : c.textTertiary }]}>{t('common.save')}</Text>
            }
          </TouchableOpacity>

          {/* Cancel */}
          <TouchableOpacity onPress={onClose} style={s.cancelBtn} activeOpacity={0.7}>
            <Text style={[s.cancelText, { color: c.textSecondary }]}>{t('common.cancel')}</Text>
          </TouchableOpacity>

        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop:      { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  kvContainer:   { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  title:  { fontSize: 18, fontWeight: '700', marginBottom: 24 },
  label:  { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 4 },
  input: {
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, marginBottom: 4,
  },
  usernameRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: 1, marginBottom: 4,
  },
  atSign:        { fontSize: 16, paddingLeft: 14, paddingRight: 4 },
  usernameInput: { flex: 1, paddingVertical: 12, paddingRight: 14, fontSize: 16 },
  statusText:    { fontSize: 12, marginBottom: 8, marginLeft: 4 },
  errorText:     { fontSize: 13, marginBottom: 8, marginLeft: 4 },
  saveBtn: {
    borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginTop: 16, marginBottom: 8,
  },
  saveBtnText:   { fontSize: 16, fontWeight: '700' },
  cancelBtn:     { alignItems: 'center', paddingVertical: 10 },
  cancelText:    { fontSize: 15 },
});
