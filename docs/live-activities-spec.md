# Live Activities (iOS) + equivalente en Android — Brief de implementación

> **Cómo usar este documento:** eres el agente que va a construir esta feature.
> **NO empieces a codear.** Primero investiga el código, luego entrega un PLAN por
> fases y espera aprobación del dueño. Lee también `MEMORY.md` (raíz del repo).

## Objetivo
Un **"partido en vivo" en la pantalla de bloqueo**: en iOS una **Live Activity**
(lock screen + Dynamic Island) y en Android su **equivalente** (notificación
continua / Live Updates), mostrando **escudos/banderas de ambos equipos,
marcador y minuto en vivo**, actualizándose en tiempo casi real mientras un
partido está en juego, y **terminando sola al final del partido**.

## Alcance / decisión de producto (YA DECIDIDA)
- **GRATIS para TODOS los usuarios, en iOS y Android.** No es una feature premium.
- **NO** la ates a `PREMIUM_ENABLED`, a RevenueCat, ni a ningún entitlement.
- El equivalente Android es **first-class**, no un extra opcional: como es gratis,
  los usuarios Android (donde premium está apagado) también deben tenerla.

## Contexto del proyecto (verifícalo leyendo, no asumas)
- **Expo SDK 54 / RN 0.83 / React 19**, dark mode, audiencia MX. Lee `MEMORY.md`.
- **Arquitectura Firestore-first**: las Cloud Functions escriben `matches/{id}`;
  el cliente lee de Firestore. Punteros:
  - Backend: `functions/src/poll-livescores.ts` (poll ~cada 15s, 4 sub-polls/min),
    `functions/src/detect-changes.ts` (detecta goles/tarjetas/estado → dispara
    push), `functions/src/mappers.ts`, `functions/src/sportmonks.ts`.
  - Cliente: `src/services/firestoreApi.ts`, `src/services/sportsApi.ts` (modelo
    `Match`: `homeScore/awayScore/minute/status/liveClock`), y **la lógica del
    minuto en vivo**: `src/hooks/useLiveTick.ts` + `computeLiveMinuteSeconds`
    (usa el anchor `liveClock` = `{periodStartedAt, periodMinuteOffset}`). La
    Live Activity **debe reflejar exactamente esta misma lógica de minuto**.
  - Notificaciones existentes: `@react-native-firebase/messaging` (FCM → APNs).
    En `app.json`: `aps-environment: production`, `UIBackgroundModes:
    [remote-notification]`. **No rompas el pipeline de notificaciones actual.**
- **Colores de equipo**: `src/utils/teamColors.ts` (código FIFA → color). Útil
  para tintar la actividad por selección.

## Estado de release actual (NO interferir)
- iOS **1.3.0** en revisión de App Store (con premium); Android **1.3.0** en
  revisión de Play (sin premium).
- Hay **3 runtimes OTA vivos** y **gating de premium por plataforma**
  (`src/config/features.ts`: `PREMIUM_ENABLED = PREMIUM_MASTER_ENABLED &&
  Platform.OS === 'ios'`). Esta feature es **nativa → build nuevo, NO OTA**;
  documenta el bump de `version` y el submit. No publiques builds ni OTA sin
  aprobación explícita.

## Hechos técnicos clave (para no equivocar el enfoque)
### iOS
- **ActivityKit + WidgetKit** (Swift/SwiftUI), iOS **16.1+**; Dynamic Island solo
  iPhone 14 Pro y posteriores. **No es OTA-able.**
- En Expo requiere un **config plugin que agregue un Widget Extension nativo**
  (evalúa `@bacons/apple-targets` u otra vía madura para SDK 54) + un **módulo
  nativo puente** para iniciar/terminar/actualizar la Activity y obtener sus
  **push tokens**, y un **build EAS de desarrollo/producción nuevo**.
- **Actualización remota**: APNs con `apns-push-type: liveactivity` al
  `pushToken` de la Activity. Para **iniciarla con la app cerrada** se necesita
  **push-to-start token (iOS 17.2+)**; si no, la inicia el cliente y el backend
  la actualiza. APNs tiene **presupuesto/límite de frecuencia** para live
  activities → **no actualices cada segundo**: haz push en cambios de
  marcador/estado + updates de minuto **throttleados**; el **segundero fino corre
  local** en el widget con `Text(timerInterval:)`, no por push.

### Android
- Equivalente nativo: **"Live Updates"** de **Android 16 / API 36**
  (`Notification.ProgressStyle`, notificación continua promovida) en dispositivos
  nuevos; **fallback** a **notificación ongoing actualizable** en versiones
  anteriores. Se actualiza con **FCM data messages** desde las mismas Cloud
  Functions.

### Backend (una sola capa de push para ambas plataformas)
- Registro de tokens de actividad en Firestore, p.ej.
  `liveActivityTokens/{token}` → `{ matchId, platform, userId, startedAt }`.
- El cliente registra el token al **iniciar** la actividad y lo borra al terminar.
- `detect-changes` / `poll-livescores` empuja updates (APNs `liveactivity` para
  iOS, FCM data para Android) a los tokens de ese `matchId`, y **termina** la
  actividad al FT / cuando el partido sale de "live".
- **Cuida el costo/cuota de Cloud Functions** — hace poco hubo un apagón por
  billing (ver `MEMORY.md`). Diseña updates eficientes; no metas nada que pueda
  disparar el gasto sin control.

### Contrato de datos de la actividad
Define y espeja el modelo `Match` + `computeLiveMinuteSeconds`:
- **ActivityAttributes (estático):** ids/nombres/colores de ambos equipos, liga.
- **ContentState (dinámico):** `homeScore`, `awayScore`, anchor de minuto
  (`liveClock` o equivalente para que el widget calcule el minuto), `status`
  (live/HT/FT), quizá último evento (goleador).

## Decisiones
- **#1 Gratis vs premium → RESUELTA: gratis para todos (iOS + Android).**
- **#2 Cómo inicia:** propón en el plan. Sugerido v1: botón **"Seguir en vivo"**
  en la pantalla del partido + auto-update mientras esté live + auto-fin al FT.
  (Auto-inicio al pitido inicial = fase 2, requiere push-to-start iOS 17.2+.)
- **#3 Qué se muestra** en lock screen vs Dynamic Island (compacto/expandido):
  propón el layout en el plan.
- **#4 Orden:** propón en el plan. Sugerido: **iOS primero** con la capa de
  backend/tokens ya diseñada para servir también a Android, y **Android después**.

## Proceso obligatorio
1. **Investiga** los archivos citados + la mejor vía actual de Live Activities en
   Expo SDK 54 y de Live Updates en Android 16.
2. Entrega un **PLAN por fases**: setup nativo iOS (config plugin + target), UI del
   widget, contrato de datos, flujo de tokens, cambios en Cloud Functions,
   equivalente Android, implicaciones de build/submit, riesgos, y las decisiones
   #2–#4 resueltas. **Espera aprobación.**
3. Implementa **fase por fase**, sin romper notificaciones ni el esquema
   OTA/premium-por-plataforma. **Verifica en dispositivo real** (Live Activities y
   APNs no funcionan bien en simulador). Haz checkpoints y pide validar antes de
   seguir.

## Criterios de aceptación (v1 iOS; Android análogo)
- Al tocar "Seguir en vivo" en un partido live, aparece la Live Activity en lock
  screen + Dynamic Island con equipos, marcador y minuto correctos.
- El **marcador/estado se actualiza** vía push del backend en < ~15s de un cambio
  real; el **segundero corre suave** localmente; la actividad **termina sola** al FT.
- **Gratis para todos**, sin checks de premium.
- No rompe el pipeline de notificaciones existente ni los 3 runtimes OTA. Requiere
  build nuevo (documenta el bump de `version` y el submit).

## Guardrails / gotchas
- No romper notificaciones FCM/APNs actuales ni el gating premium-por-plataforma.
- iOS: 16.1+ para Live Activity; Dynamic Island solo 14 Pro+; push-to-start 17.2+.
- Android: Live Updates solo API 36; fallback ongoing notification para el resto.
- Respeta el presupuesto de APNs live-activity: throttle de updates, segundero local.
- Nada de publicar OTA/builds ni tocar billing sin aprobación explícita.
