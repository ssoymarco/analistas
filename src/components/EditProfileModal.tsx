import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  Pressable,
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

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('') || '?';
}

export const EditProfileModal: React.FC<Props> = ({ visible, onClose }) => {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user, updateProfile, checkUsernameAvailable } = useAuth();

  const [name, setName]             = useState(user?.name ?? '');
  const [username, setUsername]     = useState(user?.username ?? '');
  const [usernameStatus, setStatus] = useState<UsernameStatus>('idle');
  const [isSaving, setIsSaving]     = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setName(user?.name ?? '');
      setUsername(user?.username ?? '');
      setStatus('idle');
      setError(null);
    }
  }, [visible, user]);

  const handleUsernameChange = useCallback((text: string) => {
    const cleaned = text.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 20);
    setUsername(cleaned);
    setError(null);

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

    setStatus('checking');
    debounceTimer.current = setTimeout(async () => {
      try {
        const available = await checkUsernameAvailable(cleaned);
        setStatus(available ? 'available' : 'taken');
      } catch {
        setStatus('idle');
      }
    }, 500);
  }, [user?.username, checkUsernameAvailable]);

  const nameChanged     = name.trim() !== '' && name.trim() !== user?.name;
  const usernameChanged = username !== user?.username;
  const usernameOk      = !usernameChanged || usernameStatus === 'available';
  const canSave         = (nameChanged || usernameChanged) && usernameOk && !isSaving;

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    setError(null);
    try {
      await updateProfile({
        displayName: nameChanged     ? name.trim() : undefined,
        username:    usernameChanged ? username    : undefined,
      });
      haptics.success();
      onClose();
    } catch (err: unknown) {
      haptics.error();
      const msg = err instanceof Error ? err.message : 'error';
      setError(msg === 'username_taken'
        ? t('editProfileModal.usernameInUse')
        : t('editProfileModal.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  const statusColor = usernameStatus === 'available' ? '#00E096'
    : (usernameStatus === 'taken' || usernameStatus === 'invalid') ? '#FF453A'
    : c.textTertiary;

  const statusText = usernameStatus === 'checking' ? '...'
    : usernameStatus === 'available' ? `✓ ${t('common.available')}`
    : usernameStatus === 'taken'     ? `✕ ${t('common.unavailable')}`
    : usernameStatus === 'invalid'   ? t('editProfileModal.usernameHint')
    : '';

  const previewName     = name.trim() || user?.name || '';
  const previewInitials = getInitials(previewName);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}
        onPress={onClose}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
      >
        <View style={{
          backgroundColor: c.card,
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: insets.bottom + 20,
        }}>
          {/* Handle */}
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.border, alignSelf: 'center', marginBottom: 24 }} />

          {/* Avatar preview */}
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <View style={{
              width: 80, height: 80, borderRadius: 40,
              backgroundColor: '#6366f1',
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 8,
            }}>
              <Text style={{ fontSize: 28, fontWeight: '900', color: '#fff' }}>{previewInitials}</Text>
            </View>
            <Text style={{ fontSize: 12, color: c.textTertiary }}>{t('editProfileModal.avatarNote')}</Text>
          </View>

          {/* Name field */}
          <Text style={{ fontSize: 12, fontWeight: '700', color: c.textTertiary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
            {t('editProfileModal.nameLabel')}
          </Text>
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: c.surface, borderRadius: 14,
            borderWidth: 1, borderColor: nameChanged ? '#6366f1' : c.border,
            paddingHorizontal: 14, marginBottom: 16,
          }}>
            <TextInput
              style={{ flex: 1, fontSize: 16, color: c.textPrimary, paddingVertical: 13 }}
              value={name}
              onChangeText={text => { setName(text); setError(null); }}
              placeholder={t('editProfileModal.namePlaceholder')}
              placeholderTextColor={c.textTertiary}
              autoCapitalize="words"
              maxLength={40}
            />
            {nameChanged && (
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#6366f1' }} />
            )}
          </View>

          {/* Username field */}
          <Text style={{ fontSize: 12, fontWeight: '700', color: c.textTertiary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
            {t('editProfileModal.usernameLabel')}
          </Text>
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: c.surface, borderRadius: 14,
            borderWidth: 1,
            borderColor: usernameStatus === 'available' ? '#00E096'
              : usernameStatus === 'taken' || usernameStatus === 'invalid' ? '#FF453A'
              : usernameChanged ? '#6366f1' : c.border,
            paddingHorizontal: 14, marginBottom: 6,
          }}>
            <Text style={{ fontSize: 16, color: c.textTertiary, marginRight: 2 }}>@</Text>
            <TextInput
              style={{ flex: 1, fontSize: 16, color: c.textPrimary, paddingVertical: 13 }}
              value={username}
              onChangeText={handleUsernameChange}
              placeholder={t('editProfileModal.usernamePlaceholder')}
              placeholderTextColor={c.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
            />
            {usernameStatus === 'checking'
              ? <ActivityIndicator size="small" color={c.textTertiary} />
              : statusText
              ? <Text style={{ fontSize: 12, fontWeight: '600', color: statusColor }}>{statusText}</Text>
              : null
            }
          </View>

          {/* Username hint */}
          <Text style={{ fontSize: 11, color: c.textTertiary, marginBottom: 4, marginLeft: 4 }}>
            {t('editProfileModal.usernameHint')}
          </Text>

          {/* Error */}
          {error && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 4, padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,69,58,0.1)' }}>
              <Text style={{ fontSize: 12, color: '#FF453A' }}>⚠️ {error}</Text>
            </View>
          )}

          {/* Save button */}
          <TouchableOpacity
            style={{
              borderRadius: 16, paddingVertical: 15,
              alignItems: 'center', marginTop: 16,
              backgroundColor: canSave ? '#00E096' : c.surface,
              borderWidth: canSave ? 0 : 1,
              borderColor: c.border,
            }}
            onPress={handleSave}
            disabled={!canSave}
            activeOpacity={0.85}
          >
            {isSaving
              ? <ActivityIndicator color="#000" />
              : <Text style={{ fontSize: 16, fontWeight: '700', color: canSave ? '#000' : c.textTertiary }}>
                  {t('common.save')}
                </Text>
            }
          </TouchableOpacity>

          {/* Cancel */}
          <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingVertical: 12 }} activeOpacity={0.7}>
            <Text style={{ fontSize: 15, color: c.textSecondary }}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};
