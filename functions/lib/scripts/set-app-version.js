"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * set-app-version.ts
 *
 * One-shot script: writes (or overwrites) _meta/appVersion in Firestore.
 * Run with:
 *   cd functions && npx ts-node -e "require('./src/scripts/set-app-version.ts')"
 * or via the npm script added to package.json.
 *
 * Update latestVersion / minVersion here before each release, then re-run.
 */
const admin_init_1 = require("../admin-init");
const APP_VERSION_DOC = {
    ios: {
        latestVersion: '1.2.0',
        minVersion: '1.1.0',
        storeUrl: 'https://apps.apple.com/app/id6767097258',
    },
    android: {
        latestVersion: '1.2.0',
        minVersion: '1.1.0',
        storeUrl: 'https://play.google.com/store/apps/details?id=app.analistas',
    },
};
async function main() {
    await admin_init_1.db.collection('_meta').doc('appVersion').set(APP_VERSION_DOC);
    console.log('✅  _meta/appVersion written successfully:');
    console.log(JSON.stringify(APP_VERSION_DOC, null, 2));
    process.exit(0);
}
main().catch(err => {
    console.error('❌  Error:', err);
    process.exit(1);
});
//# sourceMappingURL=set-app-version.js.map