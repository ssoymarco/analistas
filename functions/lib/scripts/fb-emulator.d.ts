/**
 * scripts/fb-emulator.ts
 *
 * Development harness: runs the football backend against the Firestore
 * EMULATOR with real API-Sports data. It refuses to start without
 * FIRESTORE_EMULATOR_HOST, so it can never write to production, and it
 * replaces FCM and Cloud Tasks with in-memory fakes, so it can never send a
 * push to a real device.
 *
 * Setup (two terminals, from the repo root):
 *   firebase emulators:start --only firestore --project demo-analistas
 *
 *   cd functions && npm run build
 *   export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-analistas
 *   export APISPORTS_KEY=<key>          # in Claude's cloud: any value + NODE_USE_ENV_PROXY=1
 *   node lib/scripts/fb-emulator.js seed            # catalog + fixtures of yesterday/today/tomorrow
 *   node lib/scripts/fb-emulator.js poll            # one live poll (pushes are captured, not sent)
 *   node lib/scripts/fb-emulator.js ondemand '{"kind":"team","id":2287}'
 *   node lib/scripts/fb-emulator.js verify          # end-to-end checks of fbOnDemand
 */
export {};
