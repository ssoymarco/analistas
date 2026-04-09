import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal,
  NativeSyntheticEvent, NativeScrollEvent, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useThemeColors } from '../theme/useTheme';
import type { ColorPalette } from '../theme/colors';
import { useDarkMode } from '../contexts/DarkModeContext';
import { useAuth } from '../contexts/AuthContext';
import { useOnboarding } from '../contexts/OnboardingContext';
import { useNotificationPrefs } from '../contexts/NotificationPrefsContext';

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('');
}

// ── Icon in colored circle ───────────────────────────────────────────────────
function IconCircle({ emoji, bg }: { emoji: string; bg: string }) {
  return (
    <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 16 }}>{emoji}</Text>
    </View>
  );
}

// ── Menu Row ─────────────────────────────────────────────────────────────────
function MenuRow({
  emoji, label, sublabel, iconBg, rightElement, onPress, accent, isLast, c,
}: {
  emoji: string; label: string; sublabel?: string; iconBg: string;
  rightElement?: React.ReactNode; onPress?: () => void;
  accent?: boolean; isLast?: boolean; c: ColorPalette;
}) {
  return (
    <TouchableOpacity
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
        !isLast && { borderBottomWidth: 1, borderBottomColor: c.border },
      ]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <IconCircle emoji={emoji} bg={iconBg} />
      <View style={{ flex: 1 }}>
        <Text style={[{ fontSize: 14, fontWeight: '500', color: c.textPrimary }, accent && { color: '#60a5fa', fontWeight: '600' }]}>{label}</Text>
        {sublabel && <Text style={{ fontSize: 11, color: c.textTertiary, marginTop: 1 }}>{sublabel}</Text>}
      </View>
      {rightElement ?? (
        <Text style={{ fontSize: 22, color: accent ? '#60a5fa' : c.textTertiary }}>›</Text>
      )}
    </TouchableOpacity>
  );
}

// ── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ label, c }: { label: string; c: ColorPalette }) {
  return (
    <Text style={{
      fontSize: 10, fontWeight: '700', color: c.textTertiary,
      letterSpacing: 1.5, textTransform: 'uppercase',
      marginBottom: 8, marginTop: 20, paddingHorizontal: 20,
    }}>
      {label}
    </Text>
  );
}

// ── Avatar ───────────────────────────────────────────────────────────────────
function AvatarView({ initials, size = 68 }: { initials: string; size?: number }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    }}>
      <Text style={{ fontSize: size * 0.3, fontWeight: '900', color: '#ffffff' }}>{initials}</Text>
    </View>
  );
}

// ── Promo Banner ─────────────────────────────────────────────────────────────
function PromoBanner({ onPress }: { onPress?: () => void }) {
  return (
    <TouchableOpacity
      style={{
        marginHorizontal: 16, marginTop: 20, borderRadius: 16,
        backgroundColor: '#0d2b1a', overflow: 'hidden', padding: 16,
      }}
      activeOpacity={0.9} onPress={onPress}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <View style={{
          backgroundColor: '#111', borderRadius: 8, padding: 8,
          borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 18, height: 18, borderRadius: 3, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff' }}>▼</Text>
            </View>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#ef4444', fontFamily: 'monospace', letterSpacing: 1 }}>SUPLENTE</Text>
          </View>
          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginVertical: 4 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 18, height: 18, borderRadius: 3, backgroundColor: '#22c55e', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff' }}>▲</Text>
            </View>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#4ade80', fontFamily: 'monospace', letterSpacing: 1 }}>TITULAR</Text>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{
            alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
            backgroundColor: 'rgba(251,191,36,0.2)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.25)', marginBottom: 4,
          }}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: '#fbbf24', letterSpacing: 1 }}>👑 PREMIUM</Text>
          </View>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: -0.2 }}>Es hora del cambio</Text>
          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Sal de la banca y juega con todo</Text>
        </View>
      </View>
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10,
        backgroundColor: 'rgba(34,197,94,0.2)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.3)',
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 14 }}>⚡</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Subir de nivel</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 10, fontWeight: '600', color: 'rgba(52,211,153,0.6)' }}>Ver planes</Text>
          <Text style={{ fontSize: 12, color: '#34d399' }}>→</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Custom Toggle ────────────────────────────────────────────────────────────
function CustomToggle({ value, onToggle, activeColor, icon }: {
  value: boolean; onToggle: () => void; activeColor: string; icon?: string;
}) {
  return (
    <TouchableOpacity
      style={{
        width: 48, height: 28, borderRadius: 14, justifyContent: 'center',
        backgroundColor: value ? activeColor : 'rgba(128,128,128,0.25)',
      }}
      onPress={onToggle} activeOpacity={0.8}
    >
      <View style={{
        width: 22, height: 22, borderRadius: 11, backgroundColor: '#ffffff',
        alignItems: 'center', justifyContent: 'center',
        transform: [{ translateX: value ? 22 : 3 }],
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
      }}>
        {icon ? <Text style={{ fontSize: 10 }}>{icon}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export const PerfilScreen: React.FC = () => {
  const c = useThemeColors();
  const { isDark, toggleDark } = useDarkMode();
  const { user, isAuthenticated, login, logout } = useAuth();
  const { resetOnboarding } = useOnboarding();

  const [streak] = useState(7);
  const [showNameInHeader, setShowNameInHeader] = useState(false);
  const [timeFormat, setTimeFormat] = useState<'24h' | '12h'>('24h');
  const [momiosEnabled, setMomiosEnabled] = useState(true);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);

  const displayName  = user?.name ?? 'Visitante';
  const displayEmail = user?.email ?? '';
  const displayUsername = isAuthenticated
    ? '@' + (user?.name?.toLowerCase().replace(/\s+/g, '.') ?? 'analista')
    : '';
  const initials = getInitials(displayName);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setShowNameInHeader(e.nativeEvent.contentOffset.y > 90);
  }, []);

  const handleLogout = () => {
    setLogoutModalVisible(false);
    logout();
    resetOnboarding();
  };

  // User card background slightly different from main bg
  const userCardBg = isDark ? '#161b27' : '#ffffff';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── Header ── */}
      <View style={{
        paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
        borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.bg,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{
            width: 32, height: 32, borderRadius: 10,
            backgroundColor: 'rgba(168,85,247,0.15)',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 14 }}>👤</Text>
          </View>
          <Text style={{ fontSize: 18, fontWeight: '800', color: c.textPrimary }}>Perfil</Text>
          {showNameInHeader && isAuthenticated && (
            <>
              <Text style={{ fontSize: 15, color: c.textTertiary }}> · </Text>
              <Text style={{ fontSize: 15, fontWeight: '600', color: c.textPrimary, maxWidth: 140 }} numberOfLines={1}>{displayName}</Text>
            </>
          )}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {/* ── User Card ── */}
        <View style={{
          backgroundColor: userCardBg, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16,
          borderBottomWidth: 1, borderBottomColor: c.border,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
            <View style={{ position: 'relative', flexShrink: 0 }}>
              <AvatarView initials={initials} size={68} />
              {isAuthenticated && (
                <View style={{
                  position: 'absolute', bottom: -2, right: -2,
                  width: 20, height: 20, borderRadius: 10,
                  backgroundColor: '#10b981', borderWidth: 2, borderColor: userCardBg,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 8, fontWeight: '900', color: '#fff' }}>✓</Text>
                </View>
              )}
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: c.textPrimary }}>{displayName}</Text>
              {isAuthenticated && (
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#60a5fa', marginTop: 1 }}>{displayUsername}</Text>
              )}
              {!isAuthenticated && (
                <Text style={{ fontSize: 13, color: c.textSecondary, marginTop: 2 }}>Inicia sesión para más funciones</Text>
              )}

              {isAuthenticated && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: 'rgba(245,158,11,0.1)',
                    borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)',
                    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12,
                  }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#f59e0b' }}>🛡️ Nivel: Suplente</Text>
                  </View>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                    borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12,
                  }}>
                    <Text style={{ fontSize: 9, color: c.textTertiary }}>G Google</Text>
                  </View>
                </View>
              )}

              {isAuthenticated && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
                  <Text style={{ fontSize: 10, color: c.textTertiary }}>📅 Analistas · Miembro desde Marzo 2026</Text>
                </View>
              )}
            </View>

            {isAuthenticated && (
              <TouchableOpacity style={{
                width: 36, height: 36, borderRadius: 12,
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                alignItems: 'center', justifyContent: 'center', marginTop: 2,
              }} activeOpacity={0.7}>
                <Text style={{ fontSize: 14 }}>✏️</Text>
              </TouchableOpacity>
            )}
          </View>

          {!isAuthenticated && (
            <TouchableOpacity
              style={{ backgroundColor: c.accent, paddingHorizontal: 28, paddingVertical: 11, borderRadius: 20, alignSelf: 'center', marginTop: 12 }}
              onPress={() => login('google')} activeOpacity={0.8}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Iniciar sesión</Text>
            </TouchableOpacity>
          )}

          {/* Streak pill */}
          <TouchableOpacity style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: c.bg, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, marginTop: 16,
          }} activeOpacity={0.8}>
            <Text style={{ fontSize: 14 }}>🔥</Text>
            <Text style={{ fontSize: 12, color: c.textTertiary }}>Racha activa</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#fb923c' }}>{streak} días 🔥</Text>
              <Text style={{ fontSize: 18, color: c.textTertiary }}>›</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Stats ── */}
        <View style={{
          flexDirection: 'row', backgroundColor: c.card,
          borderRadius: 16, marginHorizontal: 16, marginTop: 16,
          borderWidth: isDark ? 0 : 1, borderColor: c.border, overflow: 'hidden',
        }}>
          {[
            { icon: '⭐', value: '5', label: 'Favoritos', color: '#facc15' },
            { icon: '👁', value: '128', label: 'Partidos vistos', color: '#60a5fa' },
            { icon: '📖', value: '23', label: 'Noticias leídas', color: '#a78bfa' },
          ].map((stat, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <View style={{ width: 1, backgroundColor: c.border, marginVertical: 12 }} />}
              <View style={{ flex: 1, alignItems: 'center', paddingVertical: 16 }}>
                <Text style={{ fontSize: 18, marginBottom: 4 }}>{stat.icon}</Text>
                <Text style={{ fontSize: 20, fontWeight: '900', color: stat.color }}>{stat.value}</Text>
                <Text style={{ fontSize: 10, color: c.textTertiary, marginTop: 2, textAlign: 'center' }}>{stat.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* ── Guest Banner ── */}
        {!isAuthenticated && (
          <TouchableOpacity style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            marginHorizontal: 16, marginTop: 16, borderRadius: 16,
            paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#1d4ed8',
          }} activeOpacity={0.9} onPress={() => login('google')}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 20 }}>👤</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Estás en modo visitante</Text>
              <Text style={{ fontSize: 12, color: '#bfdbfe', marginTop: 2 }}>Crea una cuenta para guardar tu progreso</Text>
            </View>
            <View style={{ backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#1d4ed8' }}>Registrarse</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ── Ajustes ── */}
        <SectionHeader label="Ajustes" c={c} />
        <View style={{ backgroundColor: c.card, borderRadius: 16, marginHorizontal: 16, overflow: 'hidden', borderWidth: isDark ? 0 : 1, borderColor: c.border }}>
          <MenuRow c={c} emoji="🔔" label="Notificaciones" iconBg="rgba(249,115,22,0.15)" />
          <MenuRow c={c}
            emoji={isDark ? '🌙' : '☀️'}
            label="Apariencia"
            sublabel={isDark ? 'Modo oscuro' : 'Modo claro'}
            iconBg={isDark ? 'rgba(99,102,241,0.15)' : 'rgba(234,179,8,0.15)'}
            rightElement={
              <CustomToggle value={isDark} onToggle={toggleDark} activeColor={isDark ? '#6366f1' : '#eab308'} icon={isDark ? '🌙' : '☀️'} />
            }
          />
          <MenuRow c={c}
            emoji="🕐" label="Formato de hora"
            sublabel={timeFormat === '24h' ? '14:30' : '2:30 PM'}
            iconBg="rgba(6,182,212,0.15)"
            rightElement={
              <TouchableOpacity
                style={{
                  paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
                  backgroundColor: 'rgba(6,182,212,0.15)', borderWidth: 1, borderColor: 'rgba(6,182,212,0.2)',
                }}
                onPress={() => setTimeFormat(f => f === '24h' ? '12h' : '24h')} activeOpacity={0.7}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#06b6d4' }}>{timeFormat}</Text>
              </TouchableOpacity>
            }
          />
          <MenuRow c={c} emoji="📱" label="Ícono de la app" sublabel="Exclusivo para titulares" iconBg="rgba(168,85,247,0.15)" />
          <MenuRow c={c} emoji="🎁" label="Canjea un código" iconBg="rgba(236,72,153,0.15)" />
          <MenuRow c={c} emoji="👥" label="Invitar amigos" sublabel="Comparte Analistas" iconBg="rgba(99,102,241,0.15)" />
          <MenuRow c={c}
            emoji="📊" label="Momios"
            sublabel={momiosEnabled ? 'Contenido de apuestas visible' : 'Contenido de apuestas oculto'}
            iconBg="rgba(16,185,129,0.15)"
            rightElement={
              <CustomToggle value={momiosEnabled} onToggle={() => setMomiosEnabled(v => !v)} activeColor="#10b981" icon={momiosEnabled ? '📊' : '🔒'} />
            }
          />
          <MenuRow c={c} emoji="🗑️" label="Borrar caché" sublabel="Liberar espacio" iconBg="rgba(239,68,68,0.1)" isLast />
        </View>

        {/* ── Promo Banner ── */}
        <PromoBanner />

        {/* ── Información ── */}
        <SectionHeader label="Información" c={c} />
        <View style={{ backgroundColor: c.card, borderRadius: 16, marginHorizontal: 16, overflow: 'hidden', borderWidth: isDark ? 0 : 1, borderColor: c.border }}>
          <MenuRow c={c} emoji="ℹ️" label="Sobre Analistas" sublabel="Conoce la app" iconBg="rgba(59,130,246,0.15)" />
          <MenuRow c={c} emoji="⭐" label="Califica la app" sublabel="Ayúdanos con tu opinión" iconBg="rgba(234,179,8,0.15)" />
          <MenuRow c={c} emoji="❓" label="Centro de ayuda" iconBg="rgba(14,165,233,0.15)" />
          <MenuRow c={c} emoji="✉️" label="Contáctanos" iconBg="rgba(20,184,166,0.15)" />
          <MenuRow c={c} emoji="🛡️" label="Política de privacidad" iconBg="rgba(34,197,94,0.15)" />
          <MenuRow c={c} emoji="📄" label="Términos y condiciones" iconBg="rgba(107,114,128,0.15)" />
          <MenuRow c={c} emoji="🌐" label="Idioma · Language" sublabel="🇪🇸 Español" iconBg="rgba(59,130,246,0.15)" accent isLast />
        </View>

        {/* ── Cerrar sesión ── */}
        <View style={{ backgroundColor: c.card, borderRadius: 16, marginHorizontal: 16, marginTop: 16, overflow: 'hidden', borderWidth: isDark ? 0 : 1, borderColor: c.border }}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 }}
            activeOpacity={0.7}
            onPress={() => isAuthenticated ? setLogoutModalVisible(true) : logout()}
          >
            <IconCircle emoji="→" bg="rgba(239,68,68,0.1)" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#ef4444' }}>{isAuthenticated ? 'Cerrar sesión' : 'Salir'}</Text>
              {isAuthenticated && displayEmail ? (
                <Text style={{ fontSize: 11, color: c.textTertiary, marginTop: 1 }}>{displayEmail}</Text>
              ) : null}
            </View>
            <Text style={{ fontSize: 22, color: 'rgba(239,68,68,0.5)' }}>›</Text>
          </TouchableOpacity>
        </View>

        {/* ── Footer ── */}
        <View style={{ alignItems: 'center', marginTop: 24, gap: 2 }}>
          <Text style={{ fontSize: 12, color: c.textTertiary, fontWeight: '500' }}>⚽ Analistas</Text>
          <Text style={{ fontSize: 10, color: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }}>Versión 1.0.0 · © 2026</Text>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Logout Confirm Modal ── */}
      <Modal visible={logoutModalVisible} transparent animationType="fade" onRequestClose={() => setLogoutModalVisible(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 16 }} activeOpacity={1} onPress={() => setLogoutModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={{
            backgroundColor: c.card, borderRadius: 24,
            paddingTop: 24, paddingBottom: 20, paddingHorizontal: 20,
            width: '100%', maxWidth: 340, alignItems: 'center',
          }}>
            <View style={{
              width: 56, height: 56, borderRadius: 16,
              backgroundColor: 'rgba(239,68,68,0.1)',
              alignItems: 'center', justifyContent: 'center', marginBottom: 12,
            }}>
              <Text style={{ fontSize: 24 }}>🚪</Text>
            </View>
            <Text style={{ fontSize: 17, fontWeight: '700', color: c.textPrimary, textAlign: 'center' }}>¿Cerrar sesión?</Text>
            <Text style={{ fontSize: 12, color: c.textTertiary, textAlign: 'center', marginTop: 8, lineHeight: 18, paddingHorizontal: 8 }}>
              Cerrarás la sesión de {displayName}. Podrás volver a entrar cuando quieras.
            </Text>
            <TouchableOpacity
              style={{ width: '100%', backgroundColor: '#ef4444', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 16 }}
              onPress={handleLogout} activeOpacity={0.8}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Sí, cerrar sesión</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                width: '100%', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                borderRadius: 16, paddingVertical: 12, alignItems: 'center', marginTop: 8,
              }}
              onPress={() => setLogoutModalVisible(false)} activeOpacity={0.8}
            >
              <Text style={{ fontSize: 14, fontWeight: '500', color: c.textTertiary }}>Cancelar</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};
