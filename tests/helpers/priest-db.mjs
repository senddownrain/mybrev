/** Serialized transactional store for service contract tests; no live database. */
export function memoryPriestDb(initial = {}) {
  const rows = new Map(Object.entries(initial).map(([k, v]) => [k, structuredClone(v)]));
  let queue = Promise.resolve();
  const snapshot = (path) => ({ id: path.split('/').at(-1), exists: rows.has(path), data: () => structuredClone(rows.get(path)) });
  const db = {
    rows,
    doc(path) { return { path, get: async () => snapshot(path), set: async (value, options) => { rows.set(path, options?.merge ? { ...rows.get(path), ...value } : structuredClone(value)); } }; },
    collection(path) {
      let max = Infinity;
      let after = '';
      const query = { path, orderBy() { return query; }, limit(n) { max = n; return query; }, startAfter(id) { after = id; return query; },
        async get() { return { docs: [...rows.keys()].filter((k) => k.startsWith(`${path}/`) && k.split('/').length === 2 && k.split('/')[1] > after).sort().slice(0, max).map(snapshot) }; } };
      return query;
    },
    runTransaction(fn) {
      const run = queue.then(async () => {
        const operations = [];
        const tx = { get: (ref) => ref.get(),
          set: (ref, value) => operations.push(() => rows.set(ref.path, structuredClone(value))),
          create: (ref, value) => { if (rows.has(ref.path)) throw new Error('exists'); operations.push(() => rows.set(ref.path, structuredClone(value))); },
          update: (ref, value) => operations.push(() => rows.set(ref.path, { ...rows.get(ref.path), ...structuredClone(value) })) };
        const result = await fn(tx);
        operations.forEach((f) => f());
        return result;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
  return db;
}
