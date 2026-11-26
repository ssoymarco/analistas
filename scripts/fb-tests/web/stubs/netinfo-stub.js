// Web test harness only: the sandbox has no route for NetInfo's reachability probe.
const state = { type: 'wifi', isConnected: true, isInternetReachable: true, details: {} };
const NetInfo = {
  addEventListener(cb) { setTimeout(() => cb(state), 0); return () => {}; },
  fetch: async () => state,
  refresh: async () => state,
  configure() {},
  useNetInfo: () => state,
};
module.exports = { __esModule: true, default: NetInfo, ...NetInfo };
