// Modo Estadio per match, app side — runs src/services/estadio.ts in Node with
// storage in memory and the server call replaced. No emulator, no network.
//   cd scripts/fb-tests && npm install && node estadio-app.check.js
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const esbuild = require('esbuild');

const here = __dirname;
const root = path.resolve(here, '../..');
const out = path.join(here, '.build');
const stub = name => path.join(here, 'stubs', name);

const stubs = {
  name: 'stubs',
  setup(b) {
    const relative = (re, file) => b.onResolve({ filter: re }, a => (a.path.startsWith('.') ? { path: stub(file) } : null));
    b.onResolve({ filter: /^@react-native-async-storage\/async-storage$/ }, () => ({ path: stub('async-storage.ts') }));
    b.onResolve({ filter: /^@react-native-firebase\/messaging$/ }, () => ({ path: stub('messaging.ts') }));
    b.onResolve({ filter: /^react-native$/ }, () => ({ path: stub('react-native.ts') }));
    relative(/(^|\/)firebase$/, 'firebase.ts');
    relative(/(^|\/)i18n$/, 'i18n.ts');
    relative(/(^|\/)fcmInit$/, 'fcmInit.ts');
    relative(/(^|\/)sentry$/, 'sentry.ts');
    relative(/(^|\/)teamFamilies$/, 'teamFamilies.ts');
    relative(/(^|\/)NotificationPrefsContext$/, 'notificationPrefsContext.ts');
  },
};

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const outfile = path.join(out, 'estadio-app.js');
  await esbuild.build({
    entryPoints: [path.join(here, 'estadio-app.test.ts')], outfile, bundle: true, platform: 'node',
    format: 'cjs', target: 'node20', nodePaths: [path.join(root, 'node_modules')],
    logLevel: 'warning', plugins: [stubs],
  });
  const res = spawnSync(process.execPath, [outfile], { stdio: 'inherit', env: { ...process.env, FIRESTORE_EMULATOR_HOST: '127.0.0.1:1' } });
  process.exit(res.status ?? 1);
}
main().catch(err => { console.error(err); process.exit(1); });
