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
export declare const onWallpaperEntryCreated: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").QueryDocumentSnapshot | undefined, {
    entryId: string;
}>>;
