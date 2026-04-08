import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../theme/colors';
import { useDarkMode } from '../contexts/DarkModeContext';
import { useAuth } from '../contexts/AuthContext';
import { useOnboarding } from '../contexts/OnboardingContext';
import { useNotificationPrefs } from '../contexts/NotificationPrefsContext';

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map(w => w.charAt(0).toUpperCase())
    .join('');
}

// ── Menu item ─────────────────────────────────────────────────────────────────
function MenuItem({
  emoji, label, value, onPress, rightElement,
}: {
  emoji: string;
  label: string;
  value?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={styles.menuLeft}>
        <Text style={styles.menuEmoji}>{emoji}</Text>
        <Text style={styles.menuLabel}>{label}</Text>
      </View>
      <View style={styles.menuRight}>
        {value && <Text style={styles.menuValue}>{value}</Text>}
        {rightElement ?? (onPress && <Text style={styles.menuChevron}>›</Text>)}
      </View>
    </TouchableOpacity>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return <Text style={styles.sectionHeader}>{label}</Text>;
}

// ── Main screen ───────────────────────────────────────────────────────────────
export const PerfilScreen: React.FC = () => {
  const { isDark, toggleDark } = useDarkMode();
  const { user, isAuthenticated, login, logout } = useAuth();
  const { selectedTeams, selectedLeagues, resetOnboarding } = useOnboarding();
  const { prefs, togglePref } = useNotificationPrefs();

  const [streak] = useState(7);

  const displayName  = user?.name ?? 'Visitante';
  const displayEmail = user?.email ?? 'Inicia sesión para más funciones';
  const initials     = getInitials(displayName);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Text style={styles.title}>Perfil</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrapper}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            {isAuthenticated && (
              <View style={styles.levelBadge}>
                <Text style={styles.levelText}>⚽</Text>
              </View>
            )}
          </View>
          <Text style={styles.userName}>{displayName}</Text>
          <Text style={styles.userEmail}>{displayEmail}</Text>
          {!isAuthenticated && (
            <View style={styles.authButtons}>
              <TouchableOpacity style={styles.loginBtn} onPress={() => login('google')} activeOpacity={0.8}>
                <Text style={styles.loginBtnText}>Iniciar sesión</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{selectedTeams.length}</Text>
            <Text style={styles.statLabel}>Equipos</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{selectedLeagues.length}</Text>
            <Text style={styles.statLabel}>Ligas</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>🔥 {streak}</Text>
            <Text style={styles.statLabel}>Racha días</Text>
          </View>
        </View>

        {/* Apariencia */}
        <SectionHeader label="Apariencia" />
        <View style={styles.menuGroup}>
          <MenuItem
            emoji="🌙"
            label="Modo oscuro"
            rightElement={
              <Switch
                value={isDark}
                onValueChange={toggleDark}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.textPrimary}
              />
            }
          />
        </View>

        {/* Notificaciones */}
        <SectionHeader label="Notificaciones" />
        <View style={styles.menuGroup}>
          <MenuItem
            emoji="⚽"
            label="Goles"
            rightElement={
              <Switch
                value={prefs.goals}
                onValueChange={() => togglePref('goals')}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.textPrimary}
              />
            }
          />
          <MenuItem
            emoji="🏁"
            label="Inicio de partido"
            rightElement={
              <Switch
                value={prefs.matchStart}
                onValueChange={() => togglePref('matchStart')}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.textPrimary}
              />
            }
          />
          <MenuItem
            emoji="🔔"
            label="Final del partido"
            rightElement={
              <Switch
                value={prefs.matchEnd}
                onValueChange={() => togglePref('matchEnd')}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.textPrimary}
              />
            }
          />
          <MenuItem
            emoji="🟥"
            label="Tarjetas rojas"
            rightElement={
              <Switch
                value={prefs.redCards}
                onValueChange={() => togglePref('redCards')}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.textPrimary}
              />
            }
          />
        </View>

        {/* Cuenta */}
        <SectionHeader label="Cuenta" />
        <View style={styles.menuGroup}>
          <MenuItem emoji="🏟️" label="Mis equipos" value={`${selectedTeams.length} seleccionados`} onPress={() => {}} />
          <MenuItem emoji="🏆" label="Mis ligas"   value={`${selectedLeagues.length} seleccionadas`} onPress={() => {}} />
          <MenuItem emoji="🌍" label="Idioma"       value="Español"    onPress={() => {}} />
        </View>

        {/* Acerca de */}
        <SectionHeader label="Acerca de" />
        <View style={styles.menuGroup}>
          <MenuItem emoji="📱" label="Versión"            value="1.0.0" />
          <MenuItem emoji="📄" label="Términos de uso"    onPress={() => {}} />
          <MenuItem emoji="🔒" label="Privacidad"         onPress={() => {}} />
          <MenuItem emoji="💌" label="Contacto"           onPress={() => {}} />
        </View>

        {/* Sesión */}
        {isAuthenticated ? (
          <TouchableOpacity style={styles.logoutBtn} onPress={logout} activeOpacity={0.8}>
            <Text style={styles.logoutText}>Cerrar sesión</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity style={styles.resetBtn} onPress={resetOnboarding} activeOpacity={0.8}>
          <Text style={styles.resetText}>Repetir onboarding</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },

  header: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 },
  title:  { fontSize: 28, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.8 },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 16 },

  // Avatar
  avatarSection: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  avatarWrapper: { position: 'relative', marginBottom: 4 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.accent + '22',
    borderWidth: 2, borderColor: colors.accent + '44',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText:  { fontSize: 28, fontWeight: '800', color: colors.accent },
  levelBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  levelText:   { fontSize: 12 },
  userName:    { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  userEmail:   { fontSize: 13, color: colors.textSecondary },
  authButtons: { marginTop: 8 },
  loginBtn: {
    backgroundColor: colors.accent, paddingHorizontal: 28, paddingVertical: 10,
    borderRadius: 20,
  },
  loginBtnText: { fontSize: 14, fontWeight: '700', color: colors.bg },

  // Stats
  statsCard: {
    flexDirection: 'row', backgroundColor: colors.card,
    borderRadius: 16, padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: colors.border,
  },
  statItem:    { flex: 1, alignItems: 'center', gap: 4 },
  statNumber:  { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  statLabel:   { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },
  statDivider: { width: 1, backgroundColor: colors.border, marginHorizontal: 4 },

  // Section header
  sectionHeader: {
    fontSize: 11, fontWeight: '700', color: colors.textTertiary,
    letterSpacing: 1, textTransform: 'uppercase',
    marginBottom: 8, marginTop: 4,
  },

  // Menu
  menuGroup: {
    backgroundColor: colors.card, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border, marginBottom: 20, overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  menuLeft:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuEmoji:   { fontSize: 18, width: 24, textAlign: 'center' },
  menuLabel:   { fontSize: 15, color: colors.textPrimary, fontWeight: '500' },
  menuRight:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  menuValue:   { fontSize: 13, color: colors.textSecondary },
  menuChevron: { fontSize: 22, color: colors.textTertiary },

  // Buttons
  logoutBtn: {
    backgroundColor: colors.live + '18', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', marginBottom: 10,
    borderWidth: 1, borderColor: colors.live + '33',
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: colors.live },
  resetBtn: {
    borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  resetText: { fontSize: 13, color: colors.textSecondary },
});
