/**
 * Runs the app's football data layer in Node against the Firestore EMULATOR,
 * with the real Cloud Function code (functions/lib) answering the on-demand
 * calls in-process and real API-Sports data behind it.
 *
 *   node run.js                 # all tests
 *   node run.js logic           # one test (data-layer | migration | logic)
 *
 * Needs: the emulator running with the repo's rules, `functions` built
 * (cd functions && npm run build), the emulator seeded
 * (node functions/lib/scripts/fb-emulator.js seed) and APISPORTS_KEY.
 * Refuses to run without FIRESTORE_EMULATOR_HOST — it never touches production.
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const esbuild = require('esbuild');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Refusing to run: FIRESTORE_EMULATOR_HOST is not set (emulator-only tests).');
  process.exit(1);
}
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-analistas';

const here = __dirname;
const root = path.resolve(here, '../..');
const out = path.join(here, '.build');
const stub = name => path.join(here, 'stubs', name);

// React Native / app-shell modules the data layer imports, replaced for Node.
const stubs = {
  name: 'stubs',
  setup(b) {
    const relative = (re, file) => b.onResolve({ filter: re }, a => (a.path.startsWith('.') ? { path: stub(file) } : null));
    b.onResolve({ filter: /^@react-native-async-storage\/async-storage$/ }, () => ({ path: stub('async-storage.ts') }));
    b.onResolve({ filter: /^@react-native-firebase\/messaging$/ }, () => ({ path: stub('messaging.ts') }));
    relative(/(^|\/)firebase$/, 'firebase.ts');
    relative(/(^|\/)i18n$/, 'i18n.ts');
    relative(/(^|\/)fcmInit$/, 'fcmInit.ts');
    relative(/(^|\/)sentry$/, 'sentry.ts');
  },
};

async function main() {
  const only = process.argv[2];
  const tests = ['logic', 'data-layer', 'migration'].filter(t => !only || t === only);
  fs.mkdirSync(out, { recursive: true });
  let failed = 0;
  for (const t of tests) {
    const outfile = path.join(out, `${t}.js`);
    await esbuild.build({
      entryPoints: [path.join(here, `${t}.test.ts`)], outfile, bundle: true, platform: 'node',
      format: 'cjs', target: 'node20', nodePaths: [path.join(root, 'node_modules')],
      // The server code runs as built, with its own node_modules.
      external: [path.join(root, 'functions/lib') + '/*'],
      logLevel: 'warning', plugins: [stubs],
    });
    console.log(`\n── ${t} ──`);
    const res = spawnSync(process.execPath, [outfile], { stdio: 'inherit', env: process.env, cwd: path.join(root, 'functions') });
    if (res.status !== 0) failed++;
  }
  process.exit(failed ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
