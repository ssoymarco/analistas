# Probar la interfaz sin teléfono

La app se empaqueta para web (react-native-web) y se abre en Chromium con Playwright contra los
emuladores locales. No toca producción ni la configuración real de la app: los módulos nativos
(anuncios, FCM, compras, Sentry…) se sustituyen por stubs solo en este empaquetado y
`src/services/firebase.ts` se reemplaza por `stubs/firebase-web.ts`, que apunta a los emuladores.

Sirve para revisar pantallas y flujos con datos reales (onboarding, Partidos, detalle de partido,
liga, equipo, jugador, favoritos, búsqueda, migración de favoritos). **No** prueba lo nativo:
notificaciones push, Live Activities, anuncios, compras, inicio de sesión con Apple/Google.

## Pasos

Todo desde la raíz del repo; cada servicio en su propia terminal.

1. Emulador de Firestore (puerto 8085) con datos, como en `docs/MIGRACION_API_SPORTS.md`.
2. Emulador de Auth (puerto 9099): `firebase emulators:start --only auth --project demo-analistas`.
3. Sustituto de `fbOnDemand` (ejecuta el handler real; necesita `cd functions && npm run build`):
   `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 GCLOUD_PROJECT=demo-analistas APISPORTS_KEY=<key> node scripts/fb-tests/web/on-demand-server.js`
4. Empaquetar: `scripts/fb-tests/web/build.sh` (deja el resultado en `scripts/fb-tests/.build/web-dist`).
5. Servirlo: `python3 -m http.server 8090 --bind 127.0.0.1 -d scripts/fb-tests/.build/web-dist`
6. Manejarlo: `node scripts/fb-tests/web/run.js "tap:Empezar" "wait:2000" "shot:inicio" "vtext"`

`run.js --storage estado.json` arranca con ese AsyncStorage (por ejemplo, favoritos del proveedor
anterior para ver la migración, o el estado guardado con `dumpls:` tras completar el onboarding).
Las capturas quedan en `scripts/fb-tests/.build/shots`.

## Límites conocidos del arnés

- La barra inferior queda parcialmente recortada en web: usar `click:x,y` sobre el icono.
- `text` devuelve el texto de todas las pantallas montadas; `vtext` solo lo visible.
- El reloj de un partido en vivo no avanza si el emulador no está corriendo el poller.
