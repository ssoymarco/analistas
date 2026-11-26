// Web test harness only: react-native-view-shot renders its children as is.
const React = require('react');
const ViewShot = React.forwardRef(function ViewShot(props, ref) {
  React.useImperativeHandle(ref, () => ({ capture: async () => '' }));
  return props.children ?? null;
});
module.exports = { __esModule: true, default: ViewShot, captureRef: async () => '', captureScreen: async () => '' };
