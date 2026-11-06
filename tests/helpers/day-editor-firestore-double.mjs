// Browser-only Firestore test double. All persistence goes to the local Vite
// middleware; this module cannot contact Firebase or use production credentials.
export const collection = (_db, path) => ({ path, kind: 'collection' });
export const doc = (db, path, id) => ({ path: id ? `${path}/${id}` : `${db.path}/${path || 'new-test-document'}`, id: id || path || 'new-test-document' });
export const where = (field, op, value) => ({ field, op, value });
export const query = (ref, ...filters) => ({ ...ref, filters });
const snapshot = (path, data) => ({ id: path.split('/').at(-1), exists: () => data !== null,
  data: () => data, metadata: { fromCache: false, hasPendingWrites: false } });
async function request(body) {
  const res = await fetch('/__editor_test_db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error);
  return result;
}
export const getDoc = async (ref) => snapshot(ref.path, await request({ op: 'get', path: ref.path }));
export const getDocFromServer = getDoc;
export const getDocFromCache = getDoc;
export const getDocs = async (ref) => ({ docs: (await request({ op: 'query', ...ref })).map(([path, data]) => snapshot(path, data)), metadata: { fromCache: false, hasPendingWrites: false } });
export const getDocsFromCache = getDocs;
export const deleteField = () => ({ __delete: true });
export function writeBatch() {
  const writes = [];
  return {
    set: (ref, payload) => writes.push({ op: 'set', path: ref.path, payload }),
    update: (ref, payload) => writes.push({ op: 'update', path: ref.path, payload }),
    commit: () => request({ op: 'commit', writes }),
  };
}
