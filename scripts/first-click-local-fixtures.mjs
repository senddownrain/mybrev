/** Local-only diagnostic build. No emulator, credentials, or Firestore writes. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { build, preview } from 'vite';

const root = process.cwd();
const outDir = '.cache/first-click-dist';
const documents = new Map();
const sources = [];
function add(file, collection = 'days', explicitId) {
  const text = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(text);
  const id = explicitId || data._id || path.basename(file, '.json');
  documents.set(`${collection}/${id}`, data);
  sources.push({ file, collection, id, sha256: createHash('sha256').update(text).digest('hex') });
}
add('patchs/json/ordinary-w5-d1-fixed-day.json');
for (const name of fs.readdirSync('patchs/feasts').filter((s) => s.endsWith('.json'))) add(`patchs/feasts/${name}`);
for (const name of fs.readdirSync('patchs/feasts/common-texts').filter((s) => s.endsWith('.json') && s !== 'manifest.json')) {
  add(`patchs/feasts/common-texts/${name}`, 'liturgicalTemplates');
}
// The saved Common also represents the canonical Office for the Dead document.
add('patchs/feasts/common-texts/office-for-dead.json', 'days', 'office-for-dead');
fs.mkdirSync('reports/performance', { recursive: true });
fs.writeFileSync('reports/performance/first-click-fixture-inventory.json', JSON.stringify({
  snapshotAvailable: fs.existsSync('backups/firestore-snapshot/manifest.json'),
  fixedDate: '2026-02-08T12:00:00.000Z', sources,
  limitations: 'Repository fixtures, not a production snapshot. Unrepresented collections are empty. SDK reads use a local fixture adapter; public content IndexedDB and UI remain real. No full prayer corpus or Firestore persistence read timing is represented.',
}, null, 2) + '\n');

// Override inherited production settings for this process only.
Object.assign(process.env, {
  VITE_FIREBASE_API_KEY: 'local-diagnostic-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-first-click.invalid',
  VITE_FIREBASE_PROJECT_ID: 'demo-first-click',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-first-click.invalid',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789',
  VITE_FIREBASE_APP_ID: '1:123456789:web:localdiagnostics',
  VITE_FIREBASE_MEASUREMENT_ID: '', VITE_FIREBASE_DATABASE_URL: '',
  VITE_ANALYTICS_LOCAL: 'false',
});
const realSdk = path.join(root, 'node_modules/firebase/firestore/dist/esm/index.esm.js');
const virtual = '\0first-click-fixture-firestore';
const source = `
export * from ${JSON.stringify(realSdk)};
import * as sdk from ${JSON.stringify(realSdk)};
export function initializeFirestore(...args) {
  const db = sdk.initializeFirestore(...args);
  sdk.disableNetwork(db); // local persistence may initialize; no network access
  return db;
}
async function read(ref, single) {
  const q = ref._query;
  const body = single ? { path: ref.path } : {
    collection: q?.path?.canonicalString() || ref.path,
    filters: (q?.filters || []).map(f => ({field: f.field.canonicalString(), op: f.op, value: f.value})),
  };
  const response = await fetch('http://127.0.0.1:4174/fixture', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  if (!response.ok) throw new Error('Fixture read failed: ' + response.status);
  const values = await response.json();
  const metadata = {fromCache:false, hasPendingWrites:false};
  const snap = ([path, data]) => ({ id:path.split('/').at(-1), data:()=>data, exists:()=>data!==null, metadata });
  return single ? snap([ref.path, values[0]?.[1] ?? null]) : {docs:values.map(snap), empty:values.length===0, size:values.length, metadata};
}
export const getDoc = ref => read(ref, true);
export const getDocFromCache = getDoc;
export const getDocFromServer = getDoc;
export const getDocs = ref => read(ref, false);
export const getDocsFromCache = getDocs;
export const getDocsFromServer = getDocs;
const forbidden = () => { throw new Error('Firestore mutation forbidden in first-click diagnostics'); };
export const setDoc = forbidden, updateDoc = forbidden, deleteDoc = forbidden, addDoc = forbidden, writeBatch = forbidden, runTransaction = forbidden;
export const onSnapshot = forbidden;
`;
if (process.env.FIRST_CLICK_SKIP_BUILD !== '1') await build({
  plugins: [{ name: 'first-click-local-fixtures', enforce: 'pre',
    resolveId(id) { if (id === 'firebase/firestore') return virtual; },
    load(id) { if (id === virtual) return source; },
  }],
  build: { outDir, emptyOutDir: true },
});
const counts = {};
const fixtureServer = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:4173');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  if (req.method !== 'POST' || req.url !== '/fixture') { res.writeHead(404).end(); return; }
  try {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const query = JSON.parse(raw);
    counts[query.path || query.collection] = (counts[query.path || query.collection] || 0) + 1;
    const decode = v => v.stringValue ?? (v.integerValue !== undefined ? Number(v.integerValue) : v.booleanValue ?? v.doubleValue ?? null);
    const rows = [...documents].filter(([key, data]) => {
      if (query.path) return key === query.path;
      if (key.slice(0, key.lastIndexOf('/')) !== query.collection) return false;
      return (query.filters || []).every(f => {
        const value = f.field.split('.').reduce((obj, k) => obj?.[k], data);
        if (f.op === '==') return value === decode(f.value);
        throw new Error('Unsupported fixture filter ' + f.op);
      });
    });
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(rows));
  } catch (error) { console.error(error.message); res.writeHead(500).end(); }
});
await new Promise(resolve => fixtureServer.listen(4174, '127.0.0.1', resolve));
const server = await preview({ build: { outDir }, preview: { host: '127.0.0.1', port: 4173, strictPort: true } });
console.log('FIRST_CLICK_LOCAL_READY: http://127.0.0.1:4173; fixture documents: ' + documents.size);
async function stop() {
  fs.writeFileSync('reports/performance/first-click-fixture-requests.json', JSON.stringify(counts, null, 2) + '\n');
  await server.httpServer.close(); fixtureServer.close(); process.exit();
}
process.on('SIGTERM', stop); process.on('SIGINT', stop);
