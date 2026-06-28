import mobileAds from 'react-native-google-mobile-ads';
import { ADMOB_ENABLED } from '../config/features';

let _ready = false;
let _initPromise: Promise<void> | null = null;
const _listeners: Array<() => void> = [];

export function isAdsReady(): boolean {
  return _ready;
}

export function onAdsReady(cb: () => void): () => void {
  if (_ready) {
    cb();
    return () => {};
  }
  _listeners.push(cb);
  return () => {
    const i = _listeners.indexOf(cb);
    if (i >= 0) _listeners.splice(i, 1);
  };
}

export function initializeAdMob(): Promise<void> {
  if (!ADMOB_ENABLED) {
    _ready = true;
    return Promise.resolve();
  }
  if (_initPromise) return _initPromise;
  _initPromise = mobileAds()
    .initialize()
    .then(() => {})
    .catch(() => {})
    .finally(() => {
      _ready = true;
      _listeners.forEach(cb => cb());
      _listeners.length = 0;
    });
  return _initPromise;
}
