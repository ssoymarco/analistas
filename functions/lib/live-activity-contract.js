"use strict";
// ── Live Activity — contrato de datos (lado BACKEND) ─────────────────────────
//
// ESPEJO EXACTO de src/data/liveActivityContract.ts (cliente). Igual que el
// mirroring de getLiveClockAnchor (mappers.ts ↔ sportsApi.ts): cualquier cambio
// aquí debe replicarse en el cliente Y en los structs Codable de
// targets/live-activity/*.swift — el widget decodifica `content-state` JSON con
// estas keys literales.
//
// Spec: docs/live-activities-spec.md · Plan: docs/live-activities-plan.md
Object.defineProperty(exports, "__esModule", { value: true });
exports.LIVE_ACTIVITY_CONTRACT_V2 = void 0;
/** Versión del contrato que entiende el widget instalado (la reporta el módulo
 *  nativo; los binarios anteriores al rediseño no la reportan → 1). */
exports.LIVE_ACTIVITY_CONTRACT_V2 = 2;
//# sourceMappingURL=live-activity-contract.js.map