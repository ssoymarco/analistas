/**
 * wallpaper-entries.ts
 *
 * Contador de participaciones del concurso de jerseys (sección Wallpapers,
 * Fase 1 — 11-jul-2026). El cliente crea wallpaperEntries/{wallpaperId}_{uid}
 * (create-once, ver firestore.rules); este trigger incrementa
 * wallpapers/{id}.likes para que el grid muestre el contador sin exponer la
 * colección de entries (que lleva uids) a lectura pública.
 *
 * Elegir ganador (manual, para el live en redes):
 *   colección wallpaperEntries filtrada por prizeId — cada doc tiene uid,
 *   wallpaperId, prizeId y createdAt. Cruzar uid→users/{uid} para el nombre.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { admin, db } from './admin-init';
import * as logger from 'firebase-functions/logger';

export const onWallpaperEntryCreated = onDocumentCreated(
  {
    document: 'wallpaperEntries/{entryId}',
    region: 'us-central1',
    memory: '256MiB',
  },
  async (event) => {
    const data = event.data?.data();
    const wallpaperId = data?.wallpaperId as string | undefined;
    if (!wallpaperId) return;
    try {
      await db.collection('wallpapers').doc(wallpaperId).update({
        likes: admin.firestore.FieldValue.increment(1),
      });
    } catch (err) {
      // update falla si el doc del wallpaper no existe — no accionable aquí.
      logger.warn(`onWallpaperEntryCreated: no pude incrementar likes de ${wallpaperId}`, err);
    }
  },
);
