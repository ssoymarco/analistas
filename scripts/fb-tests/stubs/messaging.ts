export const calls: Array<{ op: 'sub' | 'unsub'; topic: string }> = [];
const api = {
  subscribeToTopic: async (topic: string) => { calls.push({ op: 'sub', topic }); },
  unsubscribeFromTopic: async (topic: string) => { calls.push({ op: 'unsub', topic }); },
};
export default function messaging() { return api; }
