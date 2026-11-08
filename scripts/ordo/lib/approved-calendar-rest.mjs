/** Narrow Firestore REST adapter. Credentials/JWT remain in memory; no automatic retries. */
import https from 'node:https';
import { createSign } from 'node:crypto';
import { HttpsProxyAgent } from 'https-proxy-agent';

export const RELEASE_PROJECT = 'ibreviaryby';
export const RELEASE_COLLECTIONS = ['liturgicalCalendarMeta', 'liturgicalCelebrations', 'liturgicalDioceseOverrides', 'liturgicalYearOverrides'];
const root = `https://firestore.googleapis.com/v1/projects/${RELEASE_PROJECT}/databases/(default)/documents`;

export function decodeFirestoreValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) { const n = Number(v.integerValue); if (!Number.isSafeInteger(n)) throw Error('Unsafe integer'); return n; }
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeFirestoreValue);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decodeFirestoreValue(x)]));
  throw Error('Unsupported scoped calendar value');
}
export function encodeFirestoreValue(v) {
  if (v === null) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number' && Number.isFinite(v)) return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeFirestoreValue) } };
  if (v && typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encodeFirestoreValue(x)])) } };
  throw Error('Unsupported calendar write value');
}
export function decodedDocument(d) {
  return { id: d.name.split('/').at(-1), data: Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, decodeFirestoreValue(v)])), updateTime: d.updateTime };
}

export function createApprovedRest({ projectId = RELEASE_PROJECT, allowCommit = false } = {}) {
  if (projectId !== RELEASE_PROJECT || process.env.VITE_FIREBASE_PROJECT_ID !== RELEASE_PROJECT) throw Error('Project mismatch');
  let credential;
  try { credential = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64 || '', 'base64').toString('utf8')); }
  catch { throw Error('Invalid service-account credential; value omitted'); }
  if (credential.type !== 'service_account' || credential.project_id !== RELEASE_PROJECT) throw Error('Service-account project mismatch');
  const b64 = v => Buffer.from(JSON.stringify(v)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const message = `${b64({ alg: 'RS256', typ: 'JWT', kid: credential.private_key_id })}.${b64({ iss: credential.client_email, sub: credential.client_email, aud: 'https://firestore.googleapis.com/', iat: now, exp: now + 900 })}`;
  const signer = createSign('RSA-SHA256'); signer.update(message);
  const token = `${message}.${signer.sign(credential.private_key, 'base64url')}`;
  delete credential.private_key;
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
  const ledger = [];
  let commits = 0;
  async function request(resource, { body, transaction } = {}) {
    const read = resource === '/liturgicalCalendarMeta/current' || RELEASE_COLLECTIONS.slice(1).some(c => resource === `/${c}`);
    const control = [':beginTransaction', ':commit', ':rollback'].includes(resource);
    if (!read && !control) throw Error('Resource outside calendar scope');
    if (resource === ':commit' && (!allowCommit || commits++ !== 0)) throw Error('Commit disabled or already attempted');
    if (ledger.length >= 40) throw Error('Request budget exceeded');
    const url = new URL(root + resource);
    if (read && resource !== '/liturgicalCalendarMeta/current') url.searchParams.set('pageSize', '500');
    if (transaction) url.searchParams.set('transaction', transaction);
    const bytes = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    const row = { method: body === undefined ? 'GET' : 'POST', resource, startedAt: new Date().toISOString() };
    ledger.push(row);
    return new Promise((resolve, reject) => {
      const req = https.request(url, { agent, method: row.method, headers: {
        Authorization: `Bearer ${token}`, ...(bytes ? { 'Content-Type': 'application/json', 'Content-Length': bytes.length } : {}),
      } }, res => {
        const chunks = []; let size = 0;
        res.on('data', chunk => { size += chunk.length; if (size > 8 * 1024 * 1024) req.destroy(Error('Response bound exceeded')); else chunks.push(chunk); });
        res.on('end', () => {
          row.status = res.statusCode; row.responseBytes = size;
          let value; try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { reject(Error(`Invalid response ${row.status}`)); return; }
          if (res.statusCode < 200 || res.statusCode >= 300) { reject(Error(`Firestore HTTP ${res.statusCode}: ${value.error?.status || 'REQUEST_FAILED'} (${resource})`)); return; }
          resolve(value);
        });
      });
      req.setTimeout(25000, () => req.destroy(Error('Request timeout; no retry')));
      req.on('error', () => reject(Error(`Transport failed (${resource}); no retry; reconcile read-only before another attempt`)));
      if (bytes) req.write(bytes); req.end();
    });
  }
  return {
    ledger,
    async capture({ transaction } = {}) {
      const meta = await request('/liturgicalCalendarMeta/current', { transaction });
      const collections = { liturgicalCalendarMeta: [decodedDocument(meta)] };
      for (const collection of RELEASE_COLLECTIONS.slice(1)) {
        const result = await request(`/${collection}`, { transaction });
        if (result.nextPageToken) throw Error('Unexpected collection exceeds explicit one-page bound');
        collections[collection] = (result.documents || []).map(decodedDocument);
      }
      const after = await request('/liturgicalCalendarMeta/current', { transaction });
      if (after.updateTime !== meta.updateTime) throw Error('Metadata changed during capture');
      return { projectId, collections, capturedAt: new Date().toISOString() };
    },
    async begin() { return (await request(':beginTransaction', { body: { options: { readWrite: {} } } })).transaction; },
    async commit(writes, transaction) {
      if (!transaction || !Array.isArray(writes) || writes.length !== 71) throw Error('Invalid sealed transaction');
      for (const write of writes) {
        const documentPath = write.update?.name?.slice(root.replace('https://firestore.googleapis.com/v1/', '').length + 1);
        const [collection, id, extra] = (documentPath || '').split('/');
        if (!write.update?.name?.startsWith(root.replace('https://firestore.googleapis.com/v1/', '') + '/')
          || documentPath === 'liturgicalDioceseOverrides/grodno--our-lady-trakai'
          || !RELEASE_COLLECTIONS.includes(collection) || !id || extra || write.delete || write.transform
          || !write.currentDocument || (collection === 'liturgicalCalendarMeta' && id !== 'current')) throw Error('Write outside calendar scope');
      }
      return request(':commit', { body: { writes, transaction } });
    },
    async release(transaction) { return request(':rollback', { body: { transaction } }); },
  };
}
