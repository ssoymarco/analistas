// ── useWallpapersFeature — sección Wallpapers + concurso de jerseys ─────────
//
// Fase 1 del growth de jerseys firmados (11-jul-2026). La sección REEMPLAZA
// la pestaña Noticias vía interruptor remoto — mismo patrón que el
// PromoBanner: apagar/encender sin OTA, y Noticias puede reactivarse después.
//
// Doc de control `_meta/wallpapers`:
//   {
//     enabled: boolean,           // muestra el tab Wallpapers en vez de Noticias
//     prize: {
//       id: string,               // cambia por dinámica (p.ej. 'messi-final-2026')
//       title: string,            // "Jersey de Messi FIRMADO"
//       imageUrl: string,         // foto del jersey
//       announceAt: string,       // ISO — fecha del anuncio del ganador (live)
//       socialUrl: string,        // link a la dinámica en redes
//       termsUrl: string,         // términos y condiciones (disclaimer Apple/Google)
//     } | null,
//   }
//
// El flag se espeja en AsyncStorage para que el tab correcto aparezca desde el
// PRIMER frame en arranques posteriores (sin parpadeo Noticias→Wallpapers).

import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';

export interface WallpaperPrize {
  id: string;
  title: string;
  imageUrl: string;
  announceAt: string;
  socialUrl: string;
  termsUrl: string;
}

export interface WallpapersConfig {
  enabled: boolean;
  prize: WallpaperPrize | null;
  /** Vista previa privada: uids que ven la sección aunque enabled=false.
   *  Permite al dueño validar la versión final en su device antes del
   *  encendido público — sin TestFlight (los OTA llegan a todos). */
  previewUids?: string[];
}

const STORAGE_KEY = 'wallpapers_config_v1';

let cached: WallpapersConfig | null = null;
const listeners = new Set<(c: WallpapersConfig) => void>();

function notify(c: WallpapersConfig) {
  cached = c;
  listeners.forEach(l => l(c));
}

async function loadConfig(): Promise<void> {
  // 1. Espejo local — instantáneo, evita el parpadeo del tab.
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw && !cached) notify(JSON.parse(raw) as WallpapersConfig);
  } catch { /* espejo corrupto — Firestore lo repuebla */ }

  // 2. Firestore — fuente de verdad.
  try {
    const snap = await getDoc(doc(db, '_meta', 'wallpapers'));
    const d = snap.data();
    const config: WallpapersConfig = {
      enabled: d?.enabled === true,
      prize: d?.prize && typeof d.prize === 'object' ? (d.prize as WallpaperPrize) : null,
      previewUids: Array.isArray(d?.previewUids) ? (d.previewUids as string[]) : [],
    };
    notify(config);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config)).catch(() => {});
  } catch {
    // Sin red — se queda el espejo (o el default apagado).
  }
}

let loadKicked = false;

/** Config de la sección Wallpapers (remota, con espejo local).
 *  `enabled` ya viene resuelto: público O usuario en previewUids. */
export function useWallpapersFeature(): WallpapersConfig {
  const { user } = useAuth();
  const [config, setConfig] = useState<WallpapersConfig>(
    cached ?? { enabled: false, prize: null },
  );

  useEffect(() => {
    listeners.add(setConfig);
    if (cached) setConfig(cached);
    if (!loadKicked) {
      loadKicked = true;
      loadConfig();
    }
    return () => { listeners.delete(setConfig); };
  }, []);

  const uid = user?.id ?? null;
  const previewOn = !!uid && (config.previewUids ?? []).includes(uid);
  return { ...config, enabled: config.enabled || previewOn };
}
