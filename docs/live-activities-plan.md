# Live Activities — PLAN por fases (v1)

> Estado: **PENDIENTE DE APROBACIÓN**. No se implementa nada hasta el OK del dueño.
> Spec de referencia: `docs/live-activities-spec.md`. Feature **gratis para todos** (sin premium).

## Hallazgos de investigación (evidencia)
- **`expo-widgets` (first-party) requiere SDK 57+** — en npm solo existen versiones `57.x`; el proyecto está en Expo **54.0.33**. → Descartado para v1.
- **Vía iOS elegida: `@bacons/apple-targets@4.0.7`** (peer `expo >=52` ✓): config plugin que genera el Widget Extension target fuera de `/ios`, compatible con prebuild/EAS. Requiere Xcode 16 en el builder (EAS lo tiene). El widget se escribe en **SwiftUI + ActivityKit**.
- **FCM soporta Live Activities**: `admin.messaging().send()` con `apns.live_activity_token` y header `apns-push-type: liveactivity` (start/update/end). → **No necesitamos cliente APNs propio ni key p8 nueva**; reutilizamos `firebase-admin` existente. Quirks conocidos: FCM puede exigir `aps.alert` presente y hay reportes de `apns-priority` no siempre respetado — se prueban en Fase 2 y hay fallback documentado (APNs directo con p8) si algo bloquea.
- **Pipeline actual**: notificaciones = FCM **topics** (`detect-changes.ts` → `dispatchNotifications`), sin infra por-token. `pollLivescores` corre 4 sub-polls/min y escribe `matches/{id}` con `liveClock` (`{periodStartedAt, periodMinuteOffset}`) — el mismo anchor que usa `computeLiveMinuteSeconds` en cliente.
- **Android**: notificación **ongoing** actualizada con **FCM data messages** funciona desde API 24+ (cobertura total); `Notification.ProgressStyle` / status-bar chip es exclusivo **Android 16 (API 36)** — se añade como mejora progresiva (compileSdk ya es 36).
- Cliente: hay `expo-notifications` + `@react-native-firebase/messaging`; **no** hay notifee (se decidirá en Fase 3 si hace falta).

## Decisiones (resueltas)
- **#1 Gratis para todos** (decidido por el dueño). Sin checks de `PREMIUM_ENABLED`/RevenueCat.
- **#2 Inicio v1 = botón "Seguir en vivo"** en MatchDetailScreen (visible en partidos live o por empezar; iOS 16.1+ / Android). Auto-fin al FT. Auto-inicio con push-to-start (iOS 17.2+) = Fase 5.
- **#3 Layout v1** (sin escudos remotos — WidgetKit no puede hacer fetch de red al render; escudos via App Group = Fase 5):
  - **Lock screen / notificación expandida**: `[chip color + bandera/código] MARCADOR GRANDE [código + chip color]` + línea inferior: minuto corriendo + fase (1T/MT/2T/TE/PEN/FIN) + último goleador (opcional).
  - **Dynamic Island** — compact leading: `🇲🇽 2`, trailing: `0 🇪🇨`; expanded: scoreboard completo + minuto; minimal: `2-0`.
  - Colores por selección desde `src/utils/teamColors.ts`; banderas emoji para selecciones, código FIFA para clubes.
  - **Minuto**: `Text(timerInterval:)` anclado a `periodStartedAt − periodMinuteOffset·60` (mm corriendo local, sin pushes por segundo). HT/FT/PEN = etiqueta estática. Stoppage se muestra como `45'+`/`90'+` (convención v1; el minuto exacto "45+3" llega con el próximo push de sync).
- **#4 Orden**: iOS (Fases 1–2) → Android (Fase 3) → build/release (Fase 4) → polish (Fase 5). El backend de Fase 2 nace multi-plataforma.

## Contrato de datos
**ActivityAttributes (estático):** `matchId`, `home/away {name, shortName, colorHex, flagEmoji?}`, `leagueName`.
**ContentState (dinámico):** `homeScore`, `awayScore`, `phase` (`pre|1H|HT|2H|ET|PEN|FT`), `periodStartedAt?`, `periodMinuteOffset?`, `lastEventText?` (p.ej. "⚽ Oyarzabal 36'").
Espeja `MatchDoc`/`Match` + la semántica de `computeLiveMinuteSeconds` (`src/hooks/useLiveTick.ts`).

**Firestore:** `liveActivities/{autoId}` → `{ token, matchId, platform: 'ios'|'android', createdAt, lastState?, ended? }`. Reglas: create/delete solo autenticado dueño; sin lecturas de cliente. Índice por `matchId`. TTL/cleanup de tokens > 6 h.

## Fases

### Fase 0 — Rama + esqueleto de contrato (½ día)
- Rama `feature/live-activities` (master queda intacto — hay releases 1.3.0 en revisión).
- Tipos TS del contrato (compartidos client/functions) + doc corto de payloads FCM.
- **Checkpoint**: revisión del contrato contigo.

### Fase 1 — iOS cliente (1.5–2 días)
- `app.json`: `NSSupportsLiveActivities: true` (+ frecuencia si aplica), plugin `@bacons/apple-targets`.
- `targets/live-activity/`: `expo-target.config.js` (type `widget`, frameworks SwiftUI/ActivityKit/WidgetKit) + Swift: `MatchActivityAttributes` (Codable espejo del contrato) y las vistas (lock screen + Dynamic Island compact/expanded/minimal) con `teamColors`.
- **Expo Module local** (`modules/live-activity/`, Swift): `isSupported()`, `startMatchActivity(attrs, state)`, `updateMatchActivity`, `endMatchActivity`, y **listener de pushToken** → evento a JS.
- JS: hook `useLiveActivity` + botón **"Seguir en vivo"** en MatchDetailScreen (i18n en los 7 locales) → registra token en `liveActivities`.
- **Verificación en iPhone real** (dev build de la rama): iniciar/actualizar/terminar localmente. Live Activities no es confiable en simulador.
- **Checkpoint**: demo en tu iPhone.

### Fase 2 — Backend push (1 día)
- `functions/src/live-activities.ts`: `sendLiveActivityUpdates(matchDocs)` colgado del ciclo de `poll-livescores` (tras el batch write, junto a `dispatchNotifications`).
- Envío **vía FCM** (`apns.live_activity_token`, `apns-push-type: liveactivity`, `event: update|end` + `content-state`): push **solo cuando cambia algo** (marcador, fase, rojas, anchor de período) → en juego normal ≈ 0 push/min; gol/HT/2T/FT sí empujan. `end` + dismissal al FT + limpieza de tokens.
- Android por el mismo camino: FCM **data message** al token (lo consume la Fase 3).
- Reglas Firestore + índice + TTL. Presupuesto: sin listeners nuevos; 1 query por ciclo solo si hay partidos live con tokens.
- **Prueba de los quirks FCM** en device real; si FCM bloquea (alert/priority), fallback documentado: APNs directo (p8 como Firebase Secret) — +½ día.
- **Checkpoint**: gol real/simulado actualiza tu lock screen < 15 s.

### Fase 3 — Android (1–1.5 días)
- Background handler de `@react-native-firebase/messaging` (data-only) → publica/actualiza **notificación ongoing** de marcador (expo-notifications `sticky`; si su API queda corta para updates silenciosos/ongoing, se agrega **notifee** — decisión dentro de la fase con evidencia).
- Botón "Seguir en vivo" mismo flujo (token FCM del device, `platform:'android'`). Cancelación al FT.
- **Android 16 ProgressStyle** (chip en status bar): mejora progresiva si notifee/API lo permite sin módulo nativo extra; si no → Fase 5.
- **Checkpoint**: demo en un Android real (o emulador API 36 para el chip).

### Fase 4 — Build & release (½ día + esperas)
- Módulos nativos nuevos → **runtime NUEVO: bump `version` 1.3.0 → 1.4.0** (no contaminar el runtime 1.3.0 en revisión). El dance OTA pasa a 4 runtimes temporalmente — documentar en MEMORY y planear consolidación.
- `eas build` iOS + Android del branch (tras merge aprobado) → TestFlight/internal testing → validación final en dispositivos → submit a tiendas **después** de que las 1.3.0 actuales se aprueben (no interferir). Guards: la feature degrada limpio en builds viejos (módulo ausente → botón oculto), mismo patrón que purchases/app-icon.

### Fase 5 — Polish (post-v1, opcional)
Push-to-start (auto-inicio, iOS 17.2+) para favoritos · escudos reales vía App Group · ProgressStyle nativo Android 16 · deep link fino al tocar la Activity · stoppage exacto "45+3".

## Riesgos y mitigaciones
1. **Quirks FCM liveactivity** (alert requerido, priority) → probar temprano (Fase 2); fallback APNs directo.
2. **Primer build con apple-targets puede iterar** (como pasó con dynamic-app-icon) → dev build en rama antes de cualquier build de producción; production no se toca hasta verde.
3. **Minuto en widget ≠ stoppage exacto** → convención `45'+` v1, sync por push.
4. **Costo**: FCM es gratis; sends = tokens×eventos (bajo); Functions sin invocaciones nuevas (va dentro del poll). Sin listeners.
5. **Runtime split a 4** → plan de consolidación tras adopción de 1.4.0.

## Estimación total v1 (iOS + Android)
**~4–5 días de trabajo** + esperas de build/review. Cada fase termina con demo/checkpoint y no se avanza sin validación.

## Fuentes de la investigación
- https://github.com/EvanBacon/expo-apple-targets
- https://docs.expo.dev/versions/latest/sdk/widgets/ (expo-widgets = SDK 57+)
- https://firebase.google.com/docs/cloud-messaging/customize-messages/live-activity
- https://github.com/firebase/firebase-admin-node/issues/2875 (quirks tipos FCM)
- https://developer.android.com/about/versions/16/features/progress-centric-notifications
- https://developer.android.com/develop/ui/views/notifications/live-update
- https://medium.com/inkitt-tech/live-activity-widget-in-expo-react-native-project-607df51f8a15
- https://christopher.engineering/en/blog/live-activity-with-react-native/
