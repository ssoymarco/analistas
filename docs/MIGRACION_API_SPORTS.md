# Migración Sportmonks → API-Sports — estado y traspaso

Última actualización: 25 nov 2026. Rama de trabajo: `claude/bold-rubin-hqhclo` (parte de
`claude/pensive-franklin-4gbgin`, que contiene `feature/live-activities` + el backend nuevo).
Inventario de datos disponible: https://claude.ai/artifact/Mhi5LVy6ZiBXRwLSiRorh8

## Decisiones del dueño (no re-litigar)

- Proveedor único de fútbol: **API-Sports** (plan Pro, 7,500 llamadas/día, 300/min, vence 23-dic-2026).
  Sportmonks está cancelado. Básquet, F1, NFL y béisbol están en plan Free (100/día) — solo para desarrollo.
- Ligas: **todas** las de API-Sports, ordenadas por importancia: Liga MX > Premier > LaLiga > MLS > Champions…
  Lógica en `functions/src/shared/football/leagues.ts` (`getLeaguePopularity`, `compareLeagues`), con
  overrides por país (EE. UU. pone MLS primero). Las ~1,200 ligas no curadas van al final por heurística.
- Índice de presión: lo calculamos nosotros (`computePressureShare` en `football/mapping.ts`).
- Árbitro: solo el nombre. Clima y canales de TV: API-Sports no los tiene → ocultos.
- Notificaciones: se conservan TODAS las reglas de la rama del dueño (Modo Estadio, Modo Rival,
  "Silenciar este partido", jugador seguido, roja anulada, VAR honesto, retraso pre-partido, Live Activities).
- Forma de trabajar con el dueño: español, y en la terminal **un paso a la vez** ("no te adelantes").
  La Mac del dueño (`~/Analistas`) aún no se conecta por Remote Control: los despliegues los corre él.
  No desplegar a Firebase ni publicar a tiendas sin su permiso.

## Estado

| Pieza | Estado |
| --- | --- |
| Backend programado (`fbPollLive`, `fbSyncFixtures`, `fbSyncStandings`, `fbDailyLeagues`, `fbAdmin`) | **En producción** desde el 25-nov-2026 |
| Backend bajo demanda (`fbOnDemand`) + reglas + índices | Hecho en la rama, **sin desplegar** |
| App leyendo `fb_*` (Fase 3 completa) | Hecho en la rama, **sin publicar** |
| Migración de favoritos y topics al primer arranque | Hecho en la rama, sin publicar |
| Bug de la pestaña En Vivo (nombres de estadísticas) | Corregido |

### Backend en producción (`functions/src/football/`, proyecto `analistas-8ba26`, us-central1)

| Función | Frecuencia | Qué hace |
| --- | --- | --- |
| `fbPollLive` | cada min (1–4 lecturas según liga) | `/fixtures?live=all`, detector de cambios, pushes, detalle, Live Activities |
| `fbSyncFixtures` | cada 5 min | todos los partidos de ayer…+14 días, gate del poller, retrasos de kickoff |
| `fbSyncStandings` | cada 10 min | tablas de ligas que terminaron un partido |
| `fbDailyLeagues` | 04:17 UTC | catálogo de ligas, tablas, goleadores, índice de equipos |
| `fbAdmin` | callable (BACKFILL_TOKEN) | sync manual de fechas, catálogo, tablas |

También siguen: `onWallpaperEntryCreated`, `deliverDelayedPush`, `reportFcmToken`, `sendTestPush`.

### Backend bajo demanda (nuevo, por desplegar): `fbOnDemand`

Callable pública (`functions/src/football/on-demand.ts`). La app **lee el documento de Firestore** y solo
llama a la función si falta o ya caducó (`expiresAt`); la función vuelve a comprobar la frescura, consulta
API-Sports y guarda el documento con su TTL. Así cada dato le cuesta a API-Sports una llamada por TTL sin
importar cuántos usuarios lo abran, y la llave nunca sale del servidor.

| `kind` | Documento | Llamadas | TTL |
| --- | --- | --- | --- |
| `match` | `fb_matches/{id}` + `fb_match_details/{id}` (ligas sin poller, partidos viejos, alineaciones) | 1 | reglas en `shared/football/freshness.ts` |
| `matchPreview` | `fb_match_previews/{id}`: H2H, bajas, predicción + comparación, forma, estadio | 2–5 | 12 h → 45 min según cercanía; congelado al empezar |
| `day` | `fb_matches` de una fecha UTC **fuera** de la ventana ayer…+14 (resultados antiguos, partidos lejanos). Marcador en `fb_meta/day_{fecha}` | 1 por fecha | pasado: definitivo; futuro o vacío: 1 vez al día. Rango permitido: −400…+180 días |
| `team` | `fb_teams/{id}`: ficha, estadio, DT, plantilla, competencias, liga principal | 4 | 24 h |
| `teamFixtures` | `fb_team_fixtures/{id}_{temporada}`: temporada completa, todas las competencias | 1 | 6 h |
| `teamStats` | `fb_team_stats/{id}_{liga}_{temporada}` | 1 | 12 h |
| `player` | `fb_players/{id}`: perfil, estadísticas de las 2 últimas temporadas, carrera | 3 | 24 h |
| `coach` / `venue` / `league` | `fb_coaches`, `fb_venues`, `fb_leagues` (temporadas de la liga) | 1 | 7 d / 30 d / 7 d |
| `leagueFixtures` | `fb_league_fixtures/{liga}_{temporada}`: calendario (máx. 1,400 filas) | 1 | 6 h (30 d si la temporada ya terminó) |
| `standings` / `topPlayers` | los mismos `fb_standings` / `fb_topscorers` para ligas o temporadas que el sync no cubre | 1 / 3 | 3 h / 12 h |
| `search` | `fb_search/{consulta}`: equipos y jugadores | 2 | 7 d |
| `legacyPlayers` | `fb_legacy_players/{idSportmonks}`: id nuevo de un jugador seguido (apellido + fecha de nacimiento, usando el archivo `players/*`) | 1–3, una sola vez | permanente |

**Guardia de cuota**: antes de cada consulta compara lo que queda del día contra una reserva para el
poller (~3 llamadas por minuto restante + 200). Si no alcanza, sirve el documento viejo o responde
`resource-exhausted`; los marcadores en vivo y los avisos nunca se quedan sin llamadas. Además:

- deja 80 llamadas libres por minuto para el poller (el plan permite 300/min);
- peticiones iguales que llegan a la vez comparten una sola consulta al proveedor;
- un id que el proveedor no conoce se recuerda 6 h (`fb_meta/nf_*`) y no se vuelve a pagar;
- la búsqueda y la traducción de jugadores viejos son de baja prioridad (dejan 500 llamadas extra);
- cuando el presupuesto se acaba, la app espera 4 min antes de volver a pedir el detalle de un partido.

**Filas de tabla sin equipo**: API-Sports a veces devuelve una fila sin id ni escudo (visto: León, Liga MX
2026). `standings-repair.ts` identifica al equipo con la tabla anterior o con `/teams?league=&season=`
antes de guardar (1 llamada la primera vez, 0 después).

`fbDailyLeagues` ahora también escribe `fb_meta/teamIndex` (equipos de las ligas curadas, para búsqueda
instantánea) y el catálogo lleva inicio/fin de temporada (`b`, `e`).

### Colecciones y topics

Lectura pública, escritura solo servidor; formas en `functions/src/shared/football/model.ts`:
`fb_matches`, `fb_match_details`, `fb_standings`, `fb_topscorers`, `fb_meta/leagueCatalog`,
`fb_meta/teamIndex` y las de bajo demanda de la tabla anterior (`fb_legacy_players` es privada).

**Topics FCM** (`FbTopics` en `model.ts`, el cliente usa ese mismo objeto): `fb_team_{id}_{goals|cards|live}_{d0|d2|d5|d10}`,
`fb_team_{id}_{kickoff|lineups|reminders}`, `fb_team_{id}_rival_*`, `fb_player_{id}_{goals|cards|lineups}`,
`fb_mute_{matchId}`. El servidor sigue mandando los avisos inmediatos a los topics viejos
`team_{idSportmonks}_*` (dual-send, sin matchId) para builds viejas; se apaga con `FB_LEGACY_DUAL_SEND=false`.

**Quién recibe qué** (`route` en `notify.ts`): goles, fases del partido y **tarjetas rojas** llegan a
quien sigue a cualquiera de los dos equipos (regla del dueño desde el 25-nov-2026; antes la roja solo
avisaba a los seguidores del equipo del expulsado). Amarillas y cambios siguen yendo solo al equipo del
jugador. El aviso de Modo Rival por roja se omite para quien ya recibe la roja normal por seguir al otro
equipo.

**IDs viejos → nuevos**: `shared/football/legacy.ts` + `legacyTeamMap.json` (2,413 de 2,478 equipos),
`SM_TO_AF_LEAGUE` en `leagues.ts`, `legacyPlayerMap.json` (55 jugadores populares) y el `kind`
`legacyPlayers` para el resto.

**Archivo histórico de Sportmonks**: sigue en Firestore (`matches` 296k, `teams`, `players` 18.7k, etc.).
No borrar (la migración de jugadores seguidos lee `players/*`). Re-descarga con API-Sports pendiente.

## La app (Fase 3, hecha)

Capa de datos nueva en `src/services/football/` (los servicios de Sportmonks se borraron):

| Archivo | Qué hace |
| --- | --- |
| `base.ts`, `mappers.ts` | Documentos `fb_*` → tipos de `src/data/types.ts`. Puros (corren en Node). |
| `matches.ts` | Partidos del día **local** (por `timestamp`), en vivo, detalle + previa en tiempo real. |
| `leagueData.ts` | Tablas, grupos, goleadores, calendario, llaves, temporadas. |
| `rounds.ts` | Interpreta las rondas ("Apertura - Quarter-finals") y arma el bracket (Liguilla, copas). |
| `teams.ts` | Equipo, calendario, estadísticas, jugador, DT. |
| `catalog.ts` | Catálogo de ligas y temporada actual (reemplaza a `seasonResolver`). |
| `search.ts`, `popular.ts` | Búsqueda (índice local + remota, ordenada por relevancia), tablas de populares con IDs nuevos y resolución de seguidos que no están en ningún catálogo. |
| `onDemand.ts` | Cliente de `fbOnDemand` (leer doc → llamar solo si falta o caducó). |
| `legacyMigration.ts` | Migración de favoritos al primer arranque. |

Convenciones:

- **`seasonId` = id de liga × 10000 + año** (`fbSeasonKey`; Liga MX 2026 → 2622026). Así los parámetros
  de navegación y los hooks siguen recibiendo un solo número.
- `Match.startingAtUtc` conserva el formato `"YYYY-MM-DD HH:MM:SS"` (UTC); `Match.statusShort` trae el
  código de API-Sports y `Match.roundLabel` la ronda.
- Aplazado / cancelado / abandonado se muestran con la etiqueta de `utils/deadState.ts` (vía `stateId`).
- Selecciones: el código FIFA (colores y banderas) sale del nombre (`shortNameFor` en `base.ts`).
- Nombres de clubes: API-Sports escribe "Club America", "Guadalajara Chivas", "U.N.A.M. - Pumas". Para los
  clubes de `popular.ts` y toda la Liga MX la app muestra su nombre de siempre (`displayTeam` en `base.ts`).
- Ficha de equipo: un club siempre se muestra en **su liga** aunque se abra desde un partido de copa; la
  temporada que manda quien navega solo aplica si es esa misma liga (temporada anterior) o una selección.
  El calendario junta todas las etiquetas de temporada que el equipo está jugando (un club mexicano juega
  Liga MX "2026" y Concachampions "2027" en la misma primavera).
- Tablas de torneos partidos (Apertura/Clausura): se muestra la mitad que se está jugando.
- **Enlaces al sitio**: todos salen de `src/config/site.ts` (dominio, correo de contacto, tiendas, página
  de descarga y página de cada liga). Una liga con página en el sitio comparte `/league/{slug}`; el resto, `/ligas`. Ojo: al 26-nov-2026
  `www.analistasapp.com` respondía error 522 de Cloudflare y `analistasapp.com` (sin www) sí cargaba, por
  eso `SITE_HOST` va sin www; cambiarlo ahí cuando www sirva el sitio.
- Fechas de listas (H2H): `formatShortDate` → "25 jul 2026" con los meses del idioma de la app.
- Días fuera de la ventana sincronizada (antes de ayer, después de +14) se piden al abrirlos (`kind: day`).
- `src/config/leagues.ts` es solo una vista del catálogo compartido (`shared/football/leagues.ts`).
- **Lista del día en dos niveles**: ligas curadas (popularidad ≥ 5) en tiempo real al abrir; el resto se
  descarga cuando el usuario llega al final, elige un filtro o el día casi no tiene ligas curadas. Si el
  índice compuesto no existe, cae a leer el día completo (nunca depende de un deploy de índices).

**Migración al primer arranque** (`DataMigrationGate` → `legacyMigration.ts` → `FavoritesContext`):

1. Antes de montar los providers traduce equipos, rivales, ligas y jugadores conocidos. Las listas con
   ids nuevos viven en **claves propias** (`analistas_fb_team_favorites`, `…_league_…`, `…_player_…`,
   `…_match_…`, `analistas_fb_rival_teams`); las claves viejas (`analistas_team_favorites`, etc.) se leen
   una vez y **no se tocan** — si hubiera que regresar a una build anterior, encuentra sus ids intactos.
   Listas + marca `analistas_fb_migration_v1` se escriben en una sola operación: una migración interrumpida
   o fallida simplemente se repite, sin traducir dos veces (438 ids valen en los dos proveedores). Si el
   teléfono no puede guardar (almacenamiento lleno), la sesión usa las listas traducidas en memoria.
   Partidos favoritos/silenciados se descartan (ids de partido no traducibles).
2. En segundo plano: se da de baja de **todos** los topics viejos (una vez) y pide al servidor los
   jugadores que no pudo traducir (si el servidor no responde, quedan en cola para el siguiente arranque;
   la cola se borra al cerrar sesión).
3. En la nube los favoritos migrados viven en **`users/{uid}.favoritesFb`**; `favorites` queda intacto
   para dispositivos con build vieja (los dos espacios de ids nunca se mezclan). Las reglas ya lo permiten.

Lo que API-Sports no tiene quedó oculto: clima, TV, ficha extendida del árbitro, estadísticas de DT,
alineaciones probables, datos curiosos.

## Lo que falta

1. **Desplegar** (lo corre el dueño, un paso a la vez), en este orden:
   1. `firebase deploy --only firestore:rules,firestore:indexes` — sin las reglas la app nueva no puede
      leer las colecciones bajo demanda ni guardar `favoritesFb`.
   2. `firebase deploy --only functions` — crea `fbOnDemand` y actualiza las programadas.
   3. Probar la app en un dispositivo (build de desarrollo / preview) contra producción.
   4. Publicar: OTA a las builds 1.4.0 (no cambió ningún módulo nativo) o build nueva; subir
      `minVersion` en `_meta/appVersion` para forzar la actualización de versiones anteriores.
2. **Probar en dispositivo**. La interfaz ya se recorrió en la nube con el arnés web
   (`scripts/fb-tests/web`, ver abajo): onboarding completo, Partidos, detalle de partido (Resumen/En Vivo,
   Previa, Alineación, Estadísticas, Clasificación), Liga (tabla, calendario, goleadores), Equipo (resumen,
   partidos, plantilla), Jugador, Favoritos, búsqueda y la migración con favoritos del proveedor anterior.
   Falta lo que solo existe en un teléfono: notificaciones push y topics reales, Live Activities, anuncios,
   compras, inicio de sesión con Apple/Google, compartir imágenes, y el aspecto final en iOS/Android.
3. Pendientes menores: mostrar en la ficha de equipo las estadísticas de temporada (`getTeamStats`, ya
   disponible); App Check para `fbOnDemand`; apagar el dual-send cuando la build nueva esté adoptada.

Después: Fase 4 re-descarga histórica · Fase 5 sitio web con los mismos datos · Fase 6 otros deportes.

## Publicar por OTA (EAS Update)

Una actualización solo llega a las apps instaladas cuya versión coincide con `expo.version` de `app.json`
al publicar (política `appVersion`). En las tiendas conviven varias versiones (iOS 1.4.0 / 1.3.0 / 1.2.3,
Android 1.3.0 / 1.2.2…), así que cada cambio se publica una vez por plataforma y versión:

```bash
scripts/ota.sh ios 1.4.0 "mensaje"       # fija la versión, publica en la rama production y restaura app.json
DRY_RUN=1 scripts/ota.sh android 1.2.2 "mensaje"   # solo muestra lo que haría
```

Todas esas versiones comparten Expo SDK 54 / RN 0.81; los módulos nativos añadidos después de la 1.2.2
(notifee, media-library, compras, icono dinámico) se cargan con `require` protegido. No agregar imports
estáticos de módulos nativos nuevos sin una build nueva.

## Particularidades de API-Sports

- Los partidos terminados **desaparecen** de `live=all`; el poller los re-consulta por `ids`.
- Autogol: el evento viene con el equipo **beneficiado**; la app espera el que lo metió (se invierte en `mapEvents`).
- Cambios: `player` = sale, `assist` = entra (la app usa player = entra).
- `fixture.periods` suele venir vacío en vivo → el reloj se ancla con `elapsed`.
- No hay estado "retrasado": un retraso es un kickoff nuevo con `NS`; aplazado = `PST`.
- `search` solo acepta letras, números y espacios (sin acentos), mínimo 3; jugadores se buscan por apellido.
- `/predictions` ya incluye el H2H y la comparación de equipos.
- Rondas: `"Regular Season - 17"`, `"Apertura - Quarter-finals"`, `"Group Stage - 2"`, `"Round of 16"`.
  El "Play-offs" de las copas UEFA es la previa (antes de la fase de liga) y no entra al bracket.
- Tablas: una liga puede traer varias (conferencias, grupos, una general repetida); se muestran las que
  no repiten equipos. En el Mundial, "Group Stage" es el ranking de terceros.
- Muchos partidos del Mundial vienen sin id de estadio y con el nombre escrito de varias formas
  (`config/worldCupVenues.ts` empata por nombre).

## Cómo probar sin tocar producción

Todo corre contra el **emulador de Firestore** con datos reales de API-Sports; FCM y Cloud Tasks se
simulan en memoria. Los scripts se niegan a correr si falta `FIRESTORE_EMULATOR_HOST`.

```bash
# 1) Emulador (desde la raíz del repo, para que cargue firestore.rules)
firebase emulators:start --only firestore --project demo-analistas

# 2) Backend contra el emulador
cd functions && npm run build
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-analistas APISPORTS_KEY=<llave>
node lib/scripts/fb-emulator.js seed      # catálogo + partidos de ayer/hoy/mañana
node lib/scripts/fb-emulator.js poll      # un ciclo en vivo (los pushes se capturan, no se envían)
node lib/scripts/fb-emulator.js verify    # comprobaciones de fbOnDemand, caché y guardia de cuota

# 3) Capa de datos de la app (Node + emulador + el código real de la función)
cd ../scripts/fb-tests && npm install && npm test
```

**Interfaz sin teléfono**: `scripts/fb-tests/web/README.md` — empaqueta la app para web con los módulos
nativos sustituidos y la abre en Chromium contra los emuladores (así se encontraron, entre otros, la fila
de León sin id y los nombres de clubes del proveedor). No toca la configuración real de la app.

En la nube de Claude: `NODE_USE_ENV_PROXY=1` y cualquier valor en `APISPORTS_KEY` (el proxy pone la
llave). Ojo: si el emulador no encuentra `firestore.rules` permite todo — verificar en su log.
