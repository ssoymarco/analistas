import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../theme/colors';

const MenuItem = ({
  label,
  value,
  showArrow = true,
}: {
  label: string;
  value?: string;
  showArrow?: boolean;
}) => (
  <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
    <Text style={styles.menuLabel}>{label}</Text>
    <View style={styles.menuRight}>
      {value && <Text style={styles.menuValue}>{value}</Text>}
      {showArrow && <Text style={styles.menuArrow}>›</Text>}
    </View>
  </TouchableOpacity>
);

export const PerfilScreen: React.FC = () => {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <Text style={styles.title}>Perfil</Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>AN</Text>
          </View>
          <Text style={styles.userName}>Analista FC</Text>
          <Text style={styles.userEmail}>analista@futbol.mx</Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>47</Text>
            <Text style={styles.statLabel}>Favoritos</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>12</Text>
            <Text style={styles.statLabel}>Alertas</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>🔥 7</Text>
            <Text style={styles.statLabel}>Racha días</Text>
          </View>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PREFERENCIAS</Text>
          <View style={styles.menuGroup}>
            <MenuItem label="Ligas favoritas" value="5 ligas" />
            <View style={styles.itemDivider} />
            <MenuItem label="Notificaciones" value="Activadas" />
            <View style={styles.itemDivider} />
            <MenuItem label="Idioma" value="Español" />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CUENTA</Text>
          <View style={styles.menuGroup}>
            <MenuItem label="Editar perfil" />
            <View style={styles.itemDivider} />
            <MenuItem label="Privacidad" />
            <View style={styles.itemDivider} />
            <MenuItem label="Acerca de Analistas" />
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButton} activeOpacity={0.8}>
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.8,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 20,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accent + '30',
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.accent,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.4,
  },
  userEmail: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.4,
  },
  statLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textTertiary,
    letterSpacing: 1,
    paddingHorizontal: 4,
  },
  menuGroup: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuLabel: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  menuRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  menuValue: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  menuArrow: {
    fontSize: 20,
    color: colors.textTertiary,
    lineHeight: 22,
  },
  itemDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
  },
  logoutButton: {
    backgroundColor: colors.live + '15',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.live + '40',
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.live,
  },
});
