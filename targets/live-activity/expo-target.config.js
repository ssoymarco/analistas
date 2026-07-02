/**
 * Widget Extension target para la Live Activity de partidos.
 * Procesado por @bacons/apple-targets en `expo prebuild` (CNG) — el código
 * Swift vive aquí (targets/live-activity/) y se linkea al proyecto Xcode
 * generado sin tocar /ios.
 *
 * deploymentTarget 16.2: ActivityKit estable. El módulo puente
 * (modules/expo-live-activity) hace gating #available(iOS 16.2, *) en runtime,
 * así el APP sigue soportando iOS < 16.2 (la feature simplemente no aparece).
 */
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'AnalistasLiveActivity',
  deploymentTarget: '16.2',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
  // App Group compartido con el app: el módulo escribe los escudos aquí y el
  // widget los lee (WidgetKit no puede hacer red). Debe coincidir con
  // app.json → ios.entitlements['com.apple.security.application-groups'].
  entitlements: {
    'com.apple.security.application-groups': ['group.app.analistas'],
  },
};
