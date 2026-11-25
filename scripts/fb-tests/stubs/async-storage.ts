const mem = new Map<string, string>();
const AsyncStorage = {
  getItem: async (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: async (k: string, v: string) => { mem.set(k, v); },
  removeItem: async (k: string) => { mem.delete(k); },
  multiRemove: async (ks: string[]) => { ks.forEach(k => mem.delete(k)); },
  multiGet: async (ks: string[]) => ks.map(k => [k, mem.has(k) ? mem.get(k)! : null] as [string, string | null]),
  multiSet: async (kv: [string, string][]) => { kv.forEach(([k, v]) => mem.set(k, v)); },
  getAllKeys: async () => [...mem.keys()],
  clear: async () => { mem.clear(); },
  __mem: mem,
};
export default AsyncStorage;
