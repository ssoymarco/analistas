# Migración Sportmonks → API-Sports — estado y traspaso

Última actualización: 25 nov 2026. Rama: `claude/pensive-franklin-4gbgin` (contiene toda la rama
`feature/live-activities` del dueño + el backend nuevo). Inventario de datos disponible:
https://claude.ai/artifact/Mhi5LVy6ZiBXRwLSiRorh8

## Decisiones del dueño (no re-litigar)

- Proveedor único de fútbol: **API-Sports** (plan Pro, 7,500 llamadas/día, 300/min, vence 23-dic-2026).
  Sportmonks está cancelado. Básquet, F1, NFL y béisbol están en plan Free (100/día) — solo para desarrollo.
- Ligas: **todas** las de API-Sports, ordenadas por importancia: Liga MX > Premier > LaLiga > MLS > Champions…
  Lógica en `functions/src/shared/football/leagues.ts` (`getLeaguePopularity`, `compareLeagues`), con
  overrides por país (EE. UU. pone MLS primero). Las ~1,200 ligas no curadas van al final por heurística.
- Índice de presión: lo calculamos nosotros (`computePressureShare` en `football/mapping.ts`).
- Árbitro: solo el nombre. Clima y canales de TV: API-Sports no los tiene → ocultar.
- Notificaciones: se conservan TODAS las reglas de la rama del dueño (Modo Estadio, Modo Rival,
  "Silenciar este partido", jugador seguido, roja anulada, VAR honesto, retraso pre-partido, Live Activities).
- Forma de trabajar con el dueño: español, y en la terminal **un paso a la vez** ("no te adelantes").
  La Mac del dueño (`~/Analistas`) aún no se conecta por Remote Control: los despliegues los corre él.

## Estado actual (en producción desde el 25-nov-2026)

Backend en `functions/src/football/` desplegado en `analistas-8ba26` (us-central1):

| Función | Frecuencia | Qué hace |
| --- | --- | --- |
| `fbPollLive` | cada min (1–4 lecturas según liga) | `/fixtures?live=all`, detector de cambios, pushes, detalle, Live Activities |
| `fbSyncFixtures` | cada 5 min | todos los partidos de ayer…+14 días, gate del poller, retrasos de kickoff |
| `fbSyncStandings` | cada 10 min | tablas de ligas que terminaron un partido |
| `fbDailyLeagues` | 04:17 UTC | catálogo de ligas, tablas, goleadores |
| `fbAdmin` | callable (BACKFILL_TOKEN) | sync manual de fechas, catálogo, tablas |

También siguen: `onWallpaperEntryCreated`, `deliverDelayedPush` (Modo Estadio, ahora lee `fb_matches`),
`reportFcmToken`, `sendTestPush`. Las 14 funciones de Sportmonks se borraron.

**Colecciones nuevas** (lectura pública, escritura solo servidor; formas en
`functions/src/shared/football/model.ts`): `fb_matches`, `fb_match_details`, `fb_standings/{liga}_{temporada}`,
`fb_topscorers/{liga}_{temporada}`, `fb_meta/leagueCatalog`. El resto de `fb_meta` es interno.

**Topics FCM nuevos** (`FbTopics` en `model.ts`): `fb_team_{id}_{goals|cards|live}_{d0|d2|d5|d10}`,
`fb_team_{id}_{kickoff|lineups|reminders}`, `fb_team_{id}_rival_*`, `fb_player_{id}_{goals|cards|lineups}`,
`fb_mute_{matchId}`. Además el servidor manda los avisos inmediatos a los topics viejos
`team_{idSportmonks}_*` (dual-send, sin matchId) para que la app vieja reciba avisos; se apaga con
`FB_LEGACY_DUAL_SEND=false`.

**IDs viejos → nuevos**: `functions/src/shared/football/legacy.ts` + `legacyTeamMap.json`
(2,413 de 2,478 equipos de Sportmonks) y `SM_TO_AF_LEAGUE` en `leagues.ts`. Jugadores: **sin mapear aún**.

**Archivo histórico de Sportmonks**: sigue en Firestore (`matches` 296k, `teams`, `players` 18.7k, etc.).
No borrar. Re-descarga con API-Sports pendiente de decisión (cuántas temporadas).

## Lo que falta — Fase 3: la app

La app (Expo 54 / RN 0.81, versión 1.4.0 en `app.json`) **todavía lee Sportmonks**: `src/services/sportsApi.ts`
(~4.7k líneas), `src/services/sportmonks.ts` (proxy Cloudflare, ya sin token), `src/services/firestoreApi.ts`
(colecciones viejas). Hoy muestra casi nada para la mayoría de las ligas.

1. **Capa de datos nueva** que lea `fb_*` y devuelva los tipos de `src/data/types.ts` (Match, MatchDetail…).
   La app importa los archivos compartidos directo desde `functions/src/shared/football/` (sin dependencias).
   Agrupar por día LOCAL con `timestamp` (no `date`, que es UTC).
2. **Datos bajo demanda** (aún no existen en el backend): ficha de equipo y estadísticas de temporada,
   jugador (perfil + temporada), H2H, bajas, predicciones/comparación, estadio, DT, plantilla, calendario
   de temporada por liga, tablas de ligas no prioritarias. Propuesta: callable `fbOnDemand` que consulta
   API-Sports y cachea en Firestore con TTL; la app lee el doc y solo llama si falta o caducó.
3. **Migración de favoritos al primer arranque**: AsyncStorage + `users/{uid}.favorites` con `legacy.ts`;
   re-suscribir a topics `fb_*`, darse de baja de los viejos; jugadores vía mapeo en servidor.
4. **Topics y Live Activities en el cliente**: `src/services/fcmTopics.ts` → `FbTopics`; el registro de
   `liveActivities` debe guardar el matchId de API-Sports.
5. **Onboarding y búsqueda**: `countryPresets.ts`, `POPULAR_TEAMS` y logos usan IDs/URLs de Sportmonks.
6. **Bug existente**: la pestaña En Vivo busca "Tiros totales"/"Tiros a puerta"/"xG (Goles esperados)";
   los datos se llaman "Total remates"/"Remates al arco"/"Goles esperados (xG)".
7. Índices de Firestore para las consultas nuevas (p. ej. `leagueId` + `timestamp`).
8. Lanzamiento: build nueva (o OTA si los módulos nativos no cambian) + subir `minVersion` en
   `_meta/appVersion` para forzar la actualización.

Después: Fase 4 re-descarga histórica · Fase 5 sitio web con los mismos datos · Fase 6 otros deportes.

## Particularidades de API-Sports (ya resueltas en el backend)

- Los partidos terminados **desaparecen** de `live=all`; el poller los re-consulta por `ids`.
- Autogol: el evento viene con el equipo **beneficiado**; la app espera el que lo metió (se invierte en `mapEvents`).
- Cambios: `player` = sale, `assist` = entra (la app usa player = entra).
- `fixture.periods` suele venir vacío en vivo → el reloj se ancla con `elapsed`.
- No hay estado "retrasado": un retraso es un kickoff nuevo con `NS`; aplazado = `PST`.

## Cómo probar sin tocar producción

Emulador de Firestore + script que corre las funciones contra la API real y simula FCM/Cloud Tasks.
En la nube de Claude, `fetch` de Node necesita `NODE_USE_ENV_PROXY=1` (el proxy pone la llave de API-Sports).
Compilar a un directorio temporal (`npx tsc -p functions --outDir <tmp>`) — `functions/lib` está versionado.
