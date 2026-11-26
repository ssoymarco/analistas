// Web test harness only: stands in for native-only modules.
const Null = () => null;
const special = {
  __esModule: true,
  wrap: c => c,                       // Sentry.wrap(App)
  withProfiler: c => c,
  BannerAd: Null, GAMBannerAd: Null, NativeAdView: Null, NativeAsset: Null, NativeMediaView: Null,
  GoogleSigninButton: Null, AppleAuthenticationButton: Null,
  ErrorBoundary: ({ children }) => children,
  TouchEventBoundary: ({ children }) => children,
  useForeground: () => {},
};
function make(thenable) {
  const handler = {
    get(t, p) {
      if (p in special) return special[p];
      if (p === 'default') return proxy;
      if (p === 'then') return thenable ? (res, rej) => Promise.resolve(settled).then(res, rej) : undefined;
      if (p === 'catch') return () => Promise.resolve(settled);
      if (p === 'finally') return fn => Promise.resolve(settled).finally(fn);
      if (p === Symbol.toPrimitive) return () => '';
      if (p === 'prototype') return t.prototype;
      return proxy;
    },
    apply() { return proxy; },
    construct() { return proxy; },
  };
  return new Proxy(function stub() {}, handler);
}
const settled = make(false);
const proxy = make(true);
module.exports = proxy;
