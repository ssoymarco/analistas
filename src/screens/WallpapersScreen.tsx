// ── WallpapersScreen — wallpapers descargables + concurso de jerseys ─────────
//
// Fase 1 del growth (11-jul-2026): grid de wallpapers de jugadores; el usuario
// puede GUARDAR el wallpaper (ViewShot + share sheet — mismos módulos nativos
// que ya usa AlineacionTab, con guard OTA para binarios viejos) y PARTICIPAR
// (❤️) en la dinámica del jersey firmado de la semana. Participar exige cuenta
// real (no invitado): cada dinámica convierte jerseys en cuentas registradas.
//
// La dinámica se ANUNCIA en redes y el ganador se elige por mérito/registro
// fuera de la app; aquí solo viven la tarjeta del premio, el enlace a la
// dinámica y los Términos (guideline 5.3.2: reglas accesibles + disclaimer
// de que Apple/Google no patrocinan).
//
// Sin comentarios en Fase 1 — el kit UGC (reportar/bloquear/moderar) que
// exige la guideline 1.2 va en Fase 2.

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal,
  ActivityIndicator, Alert, Linking, Dimensions, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import {
  collection, doc, getDocs, getDoc, setDoc, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useThemeColors } from '../theme/useTheme';
import { useDarkMode } from '../contexts/DarkModeContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { useWallpapersFeature } from '../hooks/useWallpapersFeature';
import { haptics } from '../utils/haptics';
import { captureFirestoreRejection } from '../services/sentry';

// Módulos nativos opcionales — presentes en binarios que ya comparten
// alineaciones (AlineacionTab). En binarios sin ellos, el botón Guardar se
// oculta y Participar sigue funcionando (patrón guard-OTA del app).
let ViewShot: any = null;
let Sharing: any = null;
try { ViewShot = require('react-native-view-shot').default; } catch {}
try { Sharing = require('expo-sharing'); } catch {}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CARD_W = (SCREEN_W - 16 * 2 - 12) / 2;
const CARD_H = CARD_W * (19.5 / 9); // proporción wallpaper de teléfono

interface Wallpaper {
  id: string;
  title: string;      // "Messi · Argentina"
  imageUrl: string;   // full-res
  thumbUrl?: string;  // opcional; cae a imageUrl
  likes?: number;     // mantenido por Cloud Function
  active?: boolean;
  order?: number;
}

export const WallpapersScreen: React.FC = () => {
  const c = useThemeColors();
  const { isDark } = useDarkMode();
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { user, isAuthenticated, isGuest } = useAuth();
  const { prize } = useWallpapersFeature();

  const [wallpapers, setWallpapers] = useState<Wallpaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Set<string>>(new Set());
  const [viewer, setViewer] = useState<Wallpaper | null>(null);
  const [saving, setSaving] = useState(false);
  const captureRef = useRef<any>(null);

  const uid = user?.id ?? null;
  const canParticipate = isAuthenticated && !isGuest;

  // ── Carga del grid + participaciones del usuario ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'wallpapers'), orderBy('order')));
        if (cancelled) return;
        const rows = snap.docs
          .map(d => ({ id: d.id, ...(d.data() as Omit<Wallpaper, 'id'>) }))
          .filter(w => w.active !== false && !!w.imageUrl);
        setWallpapers(rows);
      } catch { /* sin red — empty state */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!uid || !canParticipate || wallpapers.length === 0) return;
    let cancelled = false;
    (async () => {
      // Una lectura puntual por wallpaper (colección chica). Las rules solo
      // permiten leer el doc propio, así que no hay query por uid posible.
      const found = new Set<string>();
      await Promise.all(wallpapers.map(async w => {
        try {
          const snap = await getDoc(doc(db, 'wallpaperEntries', `${w.id}_${uid}`));
          if (snap.exists()) found.add(w.id);
        } catch { /* ignorar */ }
      }));
      if (!cancelled) setEntries(found);
    })();
    return () => { cancelled = true; };
  }, [uid, canParticipate, wallpapers]);

  // ── Participar ❤️ ──
  const participate = useCallback(async (w: Wallpaper) => {
    haptics.selection();
    if (!canParticipate) {
      Alert.alert(
        t('wallpapers.signInTitle'),
        t('wallpapers.signInBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('wallpapers.signInCta'), onPress: () => navigation.navigate('Perfil') },
        ],
      );
      return;
    }
    if (!uid || entries.has(w.id)) return;
    // Optimista — la escritura es create-once (rules), sin update posible.
    setEntries(prev => new Set(prev).add(w.id));
    setWallpapers(prev => prev.map(x => x.id === w.id ? { ...x, likes: (x.likes ?? 0) + 1 } : x));
    try {
      await setDoc(doc(db, 'wallpaperEntries', `${w.id}_${uid}`), {
        uid,
        wallpaperId: w.id,
        prizeId: prize?.id ?? null,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      captureFirestoreRejection('wallpaperEntries.create', err);
      setEntries(prev => { const n = new Set(prev); n.delete(w.id); return n; });
      setWallpapers(prev => prev.map(x => x.id === w.id ? { ...x, likes: Math.max(0, (x.likes ?? 1) - 1) } : x));
    }
  }, [canParticipate, uid, entries, prize, navigation, t]);

  // ── Guardar (captura + share sheet → "Guardar imagen") ──
  const saveWallpaper = useCallback(async () => {
    if (!ViewShot || !Sharing || !captureRef.current) return;
    setSaving(true);
    haptics.selection();
    try {
      const uri: string = await captureRef.current.capture();
      if (await Sharing.isAvailableAsync()) {
        // UTI 'public.png': sin él iOS trata el archivo como "documento PNG"
        // genérico y el share sheet NO ofrece "Guardar imagen" (solo Copiar/
        // Imprimir/AirDrop — reporte del dueño 12-jul-2026). Con el UTI
        // correcto aparecen las acciones de imagen, incluida Fotos.
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          UTI: 'public.png',
          dialogTitle: t('wallpapers.save'),
        });
      }
    } catch { /* usuario canceló el share sheet */ }
    finally { setSaving(false); }
  }, [t]);

  // ── Countdown VIVO del premio (tick 1 Hz, estilo marcador) ──
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    if (!prize?.announceAt) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [prize?.announceAt]);
  const countdown = (() => {
    if (!prize?.announceAt) return null;
    const ms = new Date(prize.announceAt).getTime() - nowTick;
    if (!Number.isFinite(ms) || ms <= 0) return null;
    return {
      d: Math.floor(ms / 86_400_000),
      h: Math.floor((ms % 86_400_000) / 3_600_000),
      m: Math.floor((ms % 3_600_000) / 60_000),
      s: Math.floor((ms % 60_000) / 1000),
    };
  })();

  const renderCard = ({ item }: { item: Wallpaper }) => {
    const joined = entries.has(item.id);
    return (
      <TouchableOpacity
        style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}
        activeOpacity={0.85}
        onPress={() => setViewer(item)}
      >
        <Image source={{ uri: item.thumbUrl || item.imageUrl }} style={s.cardImg} contentFit="cover" transition={150} />
        <View style={s.cardFooter}>
          <Text style={[s.cardTitle, { color: c.textPrimary }]} numberOfLines={1}>{item.title}</Text>
          <View style={s.likesRow}>
            <Text style={{ fontSize: 11 }}>{joined ? '❤️' : '🤍'}</Text>
            <Text style={[s.likesText, { color: c.textTertiary }]}>{item.likes ?? 0}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: c.bg }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header unificado — misma métrica que Partidos/Favoritos/Perfil */}
      <ScreenHeader
        icon="🖼️"
        iconBg="rgba(139,92,246,0.18)"
        title={t('wallpapers.title')}
      />

      <FlatList
        data={wallpapers}
        keyExtractor={w => w.id}
        renderItem={renderCard}
        numColumns={2}
        columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
        contentContainerStyle={{ paddingBottom: 32, gap: 12 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <Text style={[s.headerSub, { color: c.textSecondary }]}>{t('wallpapers.subtitle')}</Text>

            {/* Tarjeta del premio */}
            {prize && (
              <View style={[s.prizeCard, { backgroundColor: c.card, borderColor: c.accent + '55' }]}>
                <View style={s.prizeTop}>
                  {!!prize.imageUrl && (
                    <Image source={{ uri: prize.imageUrl }} style={s.prizeImg} contentFit="cover" transition={150} />
                  )}
                  <View style={s.prizeBody}>
                    <Text style={[s.prizeKicker, { color: c.accent }]}>{t('wallpapers.prizeKicker')}</Text>
                    {/* Título COMPLETO — hay espacio de sobra, nada de "Haa…" */}
                    <Text style={[s.prizeTitle, { color: c.textPrimary }]}>{prize.title}</Text>
                  </View>
                </View>

                {/* Countdown vivo estilo marcador: D · H · M · S */}
                {countdown && (
                  <View style={s.countdownRow}>
                    {([['d', countdown.d], ['h', countdown.h], ['m', countdown.m], ['s', countdown.s]] as const).map(([unit, val]) => (
                      <View key={unit} style={[s.countCell, { backgroundColor: c.surface, borderColor: c.border }]}>
                        <Text style={[s.countNum, { color: c.accent }]}>{String(val).padStart(2, '0')}</Text>
                        <Text style={[s.countUnit, { color: c.textTertiary }]}>{t(`wallpapers.unit_${unit}`)}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={s.prizeBtns}>
                  {!!prize.socialUrl && (
                    <TouchableOpacity
                      style={[s.prizeBtn, { backgroundColor: c.accent }]}
                      activeOpacity={0.85}
                      onPress={() => Linking.openURL(prize.socialUrl).catch(() => {})}
                    >
                      <Text style={s.prizeBtnText}>{t('wallpapers.seeDynamic')}</Text>
                    </TouchableOpacity>
                  )}
                  {!!prize.termsUrl && (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => Linking.openURL(prize.termsUrl).catch(() => {})}
                    >
                      <Text style={[s.termsLink, { color: c.textTertiary }]}>{t('wallpapers.terms')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingTop: 60, alignItems: 'center' }}>
              <ActivityIndicator size="large" color={c.accent} />
            </View>
          ) : (
            <View style={{ paddingTop: 60, alignItems: 'center', paddingHorizontal: 32 }}>
              <Text style={{ fontSize: 40 }}>🖼️</Text>
              <Text style={{ fontSize: 14, color: c.textSecondary, textAlign: 'center', marginTop: 8 }}>
                {t('wallpapers.empty')}
              </Text>
            </View>
          )
        }
      />

      {/* ── Viewer fullscreen ── */}
      <Modal visible={!!viewer} animationType="fade" transparent={false} onRequestClose={() => setViewer(null)}>
        {viewer && (
          <View style={[s.viewer, { backgroundColor: '#000' }]}>
            {ViewShot ? (
              <ViewShot ref={captureRef} options={{ format: 'png', quality: 1 }} style={s.viewerShot}>
                <Image source={{ uri: viewer.imageUrl }} style={s.viewerImg} contentFit="cover" />
              </ViewShot>
            ) : (
              <Image source={{ uri: viewer.imageUrl }} style={s.viewerImg} contentFit="cover" />
            )}

            {/* Cerrar */}
            <TouchableOpacity
              style={s.closeBtn}
              onPress={() => setViewer(null)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>

            {/* Acciones */}
            <View style={s.viewerActions}>
              <TouchableOpacity
                style={[
                  s.actionBtn,
                  entries.has(viewer.id)
                    ? { backgroundColor: 'rgba(0,224,150,0.25)', borderColor: c.accent }
                    : { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.3)' },
                ]}
                activeOpacity={0.85}
                onPress={() => participate(viewer)}
                disabled={entries.has(viewer.id)}
              >
                <Text style={s.actionText}>
                  {entries.has(viewer.id)
                    ? `❤️ ${t('wallpapers.participating')}`
                    : `🤍 ${t('wallpapers.participate')}`}
                </Text>
              </TouchableOpacity>

              {ViewShot && Sharing && (
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.3)' }]}
                  activeOpacity={0.85}
                  onPress={saveWallpaper}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.actionText}>⬇️ {t('wallpapers.save')}</Text>}
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </Modal>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1 },
  headerSub: { fontSize: 13, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },

  prizeCard: {
    marginHorizontal: 16, marginBottom: 16, borderRadius: 16, borderWidth: 1.5,
    overflow: 'hidden', padding: 14, gap: 12,
  },
  prizeTop: { flexDirection: 'row', gap: 12 },
  prizeImg: { width: 96, height: 108, borderRadius: 10 },
  prizeBody: { flex: 1, justifyContent: 'center', gap: 4 },
  prizeKicker: { fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  prizeTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3, lineHeight: 21 },
  countdownRow: { flexDirection: 'row', gap: 8 },
  countCell: {
    flex: 1, borderRadius: 10, borderWidth: 1,
    alignItems: 'center', paddingVertical: 8, gap: 1,
  },
  countNum: { fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  countUnit: { fontSize: 9, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  prizeBtns: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  prizeBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20 },
  prizeBtnText: { fontSize: 13, fontWeight: '800', color: '#003d2b' },
  termsLink: { fontSize: 11, textDecorationLine: 'underline' },

  card: { width: CARD_W, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  cardImg: { width: '100%', height: CARD_H },
  cardFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingVertical: 8,
  },
  cardTitle: { fontSize: 12, fontWeight: '700', flex: 1, marginRight: 6 },
  likesRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  likesText: { fontSize: 11, fontWeight: '600' },

  viewer: { flex: 1 },
  viewerShot: { ...StyleSheet.absoluteFillObject },
  viewerImg: { width: SCREEN_W, height: SCREEN_H },
  closeBtn: {
    position: 'absolute', top: Platform.OS === 'ios' ? 58 : 24, right: 20,
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  viewerActions: {
    position: 'absolute', bottom: 40, left: 20, right: 20,
    flexDirection: 'row', gap: 12,
  },
  actionBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 26, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  actionText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
