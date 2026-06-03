# Modo Estadio — Arquitectura definitiva (anti-spoiler de notificaciones)

> Resultado de un panel de 12 agentes (recon externo + 4 arquitectos + crítica
> adversaria + síntesis unánime). Plan para el **próximo build** (después de que
> Apple apruebe el Build 28). NO implementado todavía.

## El problema (diagnóstico verificado)

Modo Estadio (retrasar notificaciones de eventos en vivo N min para no spoilear
lo que ves en la TV) **no funciona** hoy. Causa raíz:

- El servidor manda **push de alerta** a topics FCM. Con la app en
  background/cerrada, el **SO lo muestra de inmediato** — el JS de la app nunca
  corre, así que no hay forma client-side de retrasarlo.
- El `onMessage` de foreground programa inmediato e **ignora** `getNotificationDelay`.
- El servidor **no tiene tokens**, **no sabe quién sigue qué** (topics opacos),
  **no sincroniza el per-match**, y **no tiene datos de anónimos** (la mayoría).

### Restricciones duras (confirmadas por recon)
1. El retraso **debe** ocurrir en el servidor emitiendo un alert push a T+N.
2. **Push silencioso iOS prohibido**: no corre force-killed, throttle ~2-3/h,
   se descarta por presupuesto de batería. NSE inservible (límite 30s < 60s).
3. **Android**: data-only + WorkManager tampoco sobrevive force-stop ni da timing exacto.
4. `apns-collapse-id` **no** des-suena una notificación ya mostrada → la exclusión
   inmediata-vs-retrasada debe ser **en origen**, no por collapse.

## La solución unánime

**Topics-por-bucket-de-delay keyed POR ENTIDAD (durables) + Cloud Tasks como reloj.**

Cada clase de evento **en vivo retrasable** se divide en 4 topics por entidad
(valores de retraso DECIDIDOS: **2/5/10 min** — se eliminó el de 1 min).
NOTA: las ligas pasan a ser **display-only** (ver decisión abajo), así que NO hay
buckets de liga — los topics retrasables son **solo de equipo**:

```
team_<id>_goals_d{0,2,5,10}
team_<id>_cards_d{0,2,5,10}
team_<id>_live_d{0,2,5,10}      # halftime + matchEnd
```

Lo **pre-partido nunca lleva bucket** (siempre inmediato):
```
team_<id>_kickoff      # NUEVO: hoy team_<id>_start mezcla kickoff (inmediato)
team_<id>_lineups      #        con HT/final (retrasables) — hay que separarlo
team_<id>_reminders
league_<id>_start
```

- El cliente está suscrito a **exactamente UN bucket** por (entidad, clase):
  `_d0` si Modo Estadio OFF, `_d<N>` si ON con delay N.
- **Exclusión mutua en origen**: un device recibe O la inmediata O la retrasada,
  jamás ambas (están en topics distintos y el device sólo está en uno).
- El servidor, al detectar un evento en vivo: envía la copia `_d0` **ahora** y
  encola **3 Cloud Tasks** (d2/d5/d10) con `scheduleDelaySeconds=N*60` e id
  determinístico. Al dispararse cada task, hace el mismo `messaging.send({topic: <base>_dN})`.
- El push final es un **alert push normal** emitido por el servidor a T+N → el SO
  lo pinta con la app **force-killed** sin correr JS. ✅

### Por qué esta y no otra
- **Invariante al número de usuarios**: 4 envíos extra por evento, O(eventos×5),
  nunca O(usuarios). Respeta la filosofía del proyecto.
- **Cubre anónimos** (50-80%): la suscripción a topic sólo necesita el token FCM
  (vive en AsyncStorage), cero Firestore, cero login, cero PII.
- **Cero doble notificación**: exclusión mutua en origen.
- **Cloud Tasks** (no cola Firestore): precisión de segundos (Firestore/Cloud
  Scheduler tiene piso de 1 min = 100% error en el bucket de 1 min); exactly-once
  gratis por nombre de task (ALREADY_EXISTS); `DeleteTask` cancela el gol anulado
  por VAR; ~$0 bajo free tier.

### El torneo (4 diseños → todos apuntan al ganador)
| Diseño | Veredicto | Por qué |
|---|---|---|
| A — Bucket topics por entidad + Cloud Tasks | "fatal" sólo por per-match | **Es la base ganadora**; global perfecto |
| B — Registro de tokens por usuario | fatal | Rompe invariancia; necesita App Check (no existe); PII/spoiler dirigido. "Para hacerlo O(1) = exactamente A" |
| C — Cola Firestore + buckets | fixable | "Conserva buckets, tira la cola, usa Cloud Tasks" → recomienda A |
| D — Topics por partido | fatal | Suscripción just-in-time no sobrevive force-kill. "Usa topics durables por entidad" → recomienda A |

## DECISIONES DEL DUEÑO (tomadas — 2026-06-03)
1. **Per-match DESCARTADO.** Modo Estadio es SOLO global (toda la app). Se elimina
   el override por-partido (no podía ser spoiler-proof con app cerrada para anónimos,
   y añadía ambigüedad). Cero per-match en v1.
2. **El botón 🏟️ del header de partido se REUSA como atajo del Modo Estadio GLOBAL.**
   Tocarlo activa/desactiva el Modo Estadio de TODA la app (no solo ese partido).
   - Cuando está ON, el ícono se ve encendido en TODOS los partidos (consistencia
     visual que enseña que es global).
   - Banner al tocar: "🏟️ Modo Estadio activado · toda la app · 5 min" / al apagar:
     "Modo Estadio desactivado · toda la app". Tooltip primera vez: "aplica a TODOS
     tus partidos, no solo a este."
   - (Opcional premium: que abra una mini-hoja con switch + selector de retraso.)
3. **Valores de retraso: 2/5/10 min** (se elimina el de 1 min — era el más impreciso
   por jitter y el mínimo de 2 min calza con el retraso típico de streaming).
   Buckets resultantes: `_d0` (inmediato) + `_d2` + `_d5` + `_d10`.

### Consecuencia: NO hay límite honesto pendiente
Al descartar el per-match, **el Modo Estadio queda 100% perfecto** (global, app
cerrada/force-killed, anónimos y registrados por igual). Ya no aplica ninguna
limitación "best-effort". El botón 🏟️ pasa a ser un atajo del mismo toggle global.

## Implementación

### Servidor (`functions/src/`)
1. `detect-changes.ts → topicsForChange()`: re-taxonomizar (bases retrasables vs
   inmediatos; **dividir `team_<id>_start` → `_kickoff` + `_live`**).
2. `detect-changes.ts → dispatchNotifications()`: por cada base retrasable, enviar
   `<base>_d0` inmediato + encolar 4 Cloud Tasks `estadio_<base>_<dedupId>_d<N>`.
3. **Idempotencia** del envío inmediato: enviar/encolar sólo tras `saveSnapshot`
   exitoso (hoy un fallo redetecta y re-manda `_d0`).
4. **NUEVO `deliver-delayed-push.ts`**: handler `onTaskDispatched` que ejecuta el
   `messaging.send()` al disparar el task.
5. **Cancelación VAR**: en `goalCancelled`, reconstruir el score pre-cancelación
   para derivar el nombre del task y `DeleteTask` los 4 buckets.
6. `index.ts`: exportar `deliverDelayedPush` + flag servidor `ESTADIO_DELAY_ENABLED`.
7. `poll-livescores.ts`: **sin cambios** (NO añadir sleep; NO sweeper).

### Cliente (`src/`)
1. `services/fcmTopics.ts`: builders con sufijo de bucket; split `teamStart→kickoff+live`;
   `reconcileSubscriptions(delayBucket)`; **desuscribir hermanos** defensivamente;
   **persistir sólo subscribes exitosos** (hoy persiste el wanted-set aunque falle).
2. `contexts/NotificationPrefsContext.tsx`: `togglePref('estadioMode')` y
   `setEstadioDelay` deben **disparar reconcile** (hoy NO lo hacen — sólo escriben
   AsyncStorage/Firestore). Exponer estado estadio para cross-provider.
3. `contexts/FavoritesContext.tsx`: pasar `delayBucket` a reconcile en los 3
   triggers (cold-start, auth-sync, **cambio-de-delay**); hook **AppState foreground**.
4. `services/fcmInit.ts`: bump `FCM_INIT_VERSION` '1'→'2' (wipe+re-suscribe limpio).
5. `services/notifications.ts`: `getNotificationDelay` queda muerto para pushes reales.
6. `screens/MatchDetailScreen.tsx`: re-etiquetar bell per-match (best-effort) o
   gate con flag `PER_MATCH_ESTADIO`.
7. `i18n/locales/es.ts` + `en.ts`: strings best-effort.

### Modelo de datos
- **Ninguna colección nueva** ni registro de tokens para el caso global.
- La cola Cloud Tasks `deliverDelayedPush` se autoprovisiona al desplegar.
- **NO** añadir buckets de `player_*` (código muerto en servidor hoy).

## Feature flags / kill switch
- **Servidor** `ESTADIO_DELAY_ENABLED` (env var): si OFF, sólo `_d0` inmediato +
  no encola. Botón de pánico (~2 min).
- **Cliente** `ESTADIO_BUCKETS_ENABLED` (Firestore `_meta/featureFlags`): si OFF,
  reconcile usa siempre `_d0`. Rollout por cohorte.
- **Cliente** `PER_MATCH_ESTADIO` (default OFF v1).
- Con ambos OFF → idéntico al sistema actual (deploy = no-op verificable).

## Rollout (orden seguro)
1. Definir la taxonomía de topics como fuente de verdad compartida (review cruzado
   cliente↔servidor de que los strings coinciden EXACTO).
2. **Servidor primero** con **dual-send** (topics legacy para builds viejos + nuevos
   `_d0`+buckets). El dual-send debe cubrir **todas** las clases divididas (incluido
   start→kickoff+live) o los builds viejos pierden HT/final.
3. **Cliente** con `FCM_INIT_VERSION='2'`.
4. Verificar force-kill en iOS+Android reales (d0 inmediato, d5 a ~5 min, sin dobles, VAR).
5. Activar por cohorte (10%→50%→100%) vía flag remoto.
6. A ~90-95% de adopción (~2-3 sem), **detener dual-send legacy**.

## Plan de pruebas (clave: dispositivo REAL, app force-killed)
- Force-kill + Modo Estadio d5 → gol → llega ~5 min después. Repetir d1/d2/d10.
- Cero doble: device A (d0) y B (d5) siguen mismo equipo+liga → A inmediato 1x, B +5min 1x.
- Cambio de delay d5→d1 → device queda en d1 (no d5); fallo de red + re-foreground sana.
- Idempotencia: mockear fallo saveSnapshot → no doble `_d0` ni doble task.
- VAR: gol 1-0 → 30s → anulado → 4 tasks `..._goal_1-0_d{N}` borrados; ningún `_dN` recibe el fantasma.
- Anónimo: sin login, d2 → suscrito a `_d2` sin escribir Firestore → llega +2min force-killed.
- Pre-partido nunca se retrasa (con d10, matchStart/lineups/reminders inmediatos).
- Kill switch: `ESTADIO_DELAY_ENABLED=OFF` → <2 min todo inmediato.

## Riesgos residuales
- Per-match no spoiler-proof app-cerrada anónimos (decisión consciente; documentar).
- Precisión ≈ aproximada (jitter Cloud Tasks 1-2s + fan-out). Decir "aproximadamente N min".
- Ventana de migración: dual-send debe cubrir el split start→kickoff+live.
- Carrera kill-mid-flip: device puede quedar transitoriamente en 2 o 0 buckets hasta
  el próximo foreground (mitigado por unsubscribe-antes-de-subscribe + reconcile-on-foreground).
- Multi-dispositivo signed-in: delay es per-device; un device backgroundeado usa el
  delay viejo hasta abrirse. Documentar "el delay es por dispositivo".
- Reinstall de anónimo pierde config → onboarding debe re-ofrecer Modo Estadio.
- Los 4 valores (1/2/5/10) quedan horneados en nombres de topic (añadir un 5º = cambio de schema).

## Decisiones del dueño
RESUELTAS (ver sección "DECISIONES DEL DUEÑO" arriba):
1. ✅ Per-match → descartado (solo global).
2. ✅ Botón 🏟️ → atajo del global.
3. ✅ Valores de retraso → 2/5/10.

TAMBIÉN RESUELTAS:
4. ✅ **Multi-dispositivo**: delay por-dispositivo, aceptado, con nota en UI.
5. ✅ **Reinstall anónimo**: el onboarding re-ofrece Modo Estadio.
6. ✅ **Ligas = DISPLAY-ONLY** (resuelve la pregunta de delay de liga + arregla un bug
   de spam). Ver sección abajo.

## BUG ANEXO A ARREGLAR EN EL MISMO BUILD: ligas mandan spam de notificaciones
HALLAZGO (verificado en código 2026-06-03): hoy seguir una liga SÍ suscribe a topics
de notificación, y el servidor despacha a ellos:
- `goal` → `league_<id>_start`  (¡cada gol de la liga!)
- `matchStart` → `league_<id>_start`  (¡cada inicio!)
- `matchEnd` → `league_<id>_finals`  (¡cada final!)
Resultado: quien sigue MLS/La Liga recibe push de TODOS los goles/inicios/finales de
la liga (10-12 partidos simultáneos = spam). CONTRADICE la intención de producto:
seguir una liga es SOLO para mostrar sus partidos en pantalla; las notificaciones
vienen SOLO de equipos favoritos.
ARREGLO (mismo build, mismos archivos):
- Cliente (`fcmTopics.ts` + `FavoritesContext.tsx`): dejar de suscribir
  `subscribeLeagueTopics`/`leagueIds` en `reconcileSubscriptions`. El bump
  `FCM_INIT_VERSION='2'` limpia las suscripciones de liga ya existentes.
- Servidor (`detect-changes.ts → topicsForChange`): quitar `league_<id>_start` y
  `league_<id>_finals` de goal/matchStart/matchEnd (o dejarlos como no-op sin
  suscriptores; preferible quitarlos para limpieza).
- Las ligas siguen funcionando para DISPLAY (orden en Partidos) — eso es otra ruta,
  no toca FCM.
- Consecuencia para Modo Estadio: NO hay buckets de liga; los topics retrasables son
  solo de equipo (`team_*`).

## Ajuste UI del 🏟️ (decisión premium tomada)
El botón 🏟️ del header de partido abre una **mini-hoja (bottom sheet)** con: switch
de Modo Estadio (global) + selector de retraso 2/5/10, sin ir a Perfil. Editar
`MatchDetailScreen.tsx` para mostrar la hoja en vez de un toggle per-match.

## Esfuerzo
- **Global (perfecto)**: ~5-7 días. Servidor ~2-2.5 / Cliente ~2-2.5 (incl. refactor
  cross-provider NotificationPrefs↔Favorites que hoy no existe) / Migración+QA ~1.5.
- Per-match best-effort: +0.5 día. Per-match spoiler-proof (token-registry): +2-3 días (NO v1).
