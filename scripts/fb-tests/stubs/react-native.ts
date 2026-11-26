// Only what the plain (non-UI) services read.
export const Platform = { OS: 'ios' as 'ios' | 'android', select: <T,>(o: { ios?: T; default?: T }) => o.ios ?? o.default };
export const AppState = { currentState: 'active', addEventListener: () => ({ remove: () => {} }) };
