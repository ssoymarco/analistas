// Web test harness only: react-native-web's InteractionManager waits on JS-driven
// looping animations forever; run deferred tasks right away instead.
const IM = {
  Events: { interactionStart: 'interactionStart', interactionComplete: 'interactionComplete' },
  runAfterInteractions(task) {
    let cancelled = false;
    const run = () => { if (!cancelled && task) (typeof task === 'function' ? task() : task.gen && task.gen()); };
    const t = setTimeout(run, 0);
    const p = Promise.resolve();
    return { then: p.then.bind(p), done: p.then.bind(p), cancel() { cancelled = true; clearTimeout(t); } };
  },
  createInteractionHandle() { return 1; },
  clearInteractionHandle() {},
  addListener() { return { remove() {} }; },
  setDeadline() {},
};
module.exports = IM;
module.exports.default = IM;
module.exports.__esModule = true;
