"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onWallpaperEntryCreated = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const admin_init_1 = require("./admin-init");
const logger = __importStar(require("firebase-functions/logger"));
exports.onWallpaperEntryCreated = (0, firestore_1.onDocumentCreated)({
    document: 'wallpaperEntries/{entryId}',
    region: 'us-central1',
    memory: '256MiB',
}, async (event) => {
    const data = event.data?.data();
    const wallpaperId = data?.wallpaperId;
    if (!wallpaperId)
        return;
    try {
        await admin_init_1.db.collection('wallpapers').doc(wallpaperId).update({
            likes: admin_init_1.admin.firestore.FieldValue.increment(1),
        });
    }
    catch (err) {
        // update falla si el doc del wallpaper no existe — no accionable aquí.
        logger.warn(`onWallpaperEntryCreated: no pude incrementar likes de ${wallpaperId}`, err);
    }
});
//# sourceMappingURL=wallpaper-entries.js.map