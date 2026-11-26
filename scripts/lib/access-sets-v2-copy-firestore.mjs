import { Firestore } from 'firebase-admin/firestore';
import { grpc } from 'google-gax';
import { catalogError } from '../../src/utils/accessSetsV2Policy.mjs';

const fail = (code) => { throw catalogError(code); };

// Canonical JSON for the Firestore Value union. JSON.stringify alone drops -0.
export function wireJson(value) {
  if (Object.is(value, -0)) return '-0.0';
  if (Array.isArray(value)) return '[' + value.map(wireJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) =>
      JSON.stringify(key) + ':' + wireJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export function wireTimestampFields(value) {
  const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(match[1] + 'Z'))) fail('invalid-wire-timestamp');
  return { seconds: String(Date.parse(match[1] + 'Z') / 1000), nanos: Number((match[2] ?? '').padEnd(9, '0')) };
}

function timestampJson(timestamp) {
  const fraction = String(timestamp.nanos).padStart(9, '0');
  return new Date(Number(timestamp.seconds) * 1000).toISOString().slice(0, 19) + '.' + fraction + 'Z';
}

const mapFields = (fields, convert) => Object.fromEntries(Object.entries(fields ?? {}).map(([key, value]) =>
  [key, convert(value)]));

// Keep the protobuf discriminant through backup, planning and commit. The
// high-level SDK can reinterpret integral doubles when writing them back.
function valueJson(proto) {
  const type = proto.valueType ?? (Object.keys(proto).length === 1 ? Object.keys(proto)[0] : undefined);
  switch (type) {
    case 'timestampValue': return { [type]: timestampJson(proto[type]) };
    case 'bytesValue': return { [type]: Buffer.from(proto[type]).toString('base64') };
    case 'doubleValue': return { [type]: Number.isFinite(proto[type]) ? proto[type] : String(proto[type]) };
    case 'nullValue': return { [type]: null };
    case 'arrayValue': return { [type]: { values: (proto[type]?.values ?? []).map(valueJson) } };
    case 'mapValue': return { [type]: { fields: mapFields(proto[type]?.fields, valueJson) } };
    case 'geoPointValue':
    case 'referenceValue':
    case 'stringValue':
    case 'booleanValue':
    case 'integerValue': return { [type]: proto[type] };
    default: return fail('invalid-firestore-protobuf-value');
  }
}

function valueProto(wire) {
  const [[type, value]] = Object.entries(wire);
  switch (type) {
    case 'timestampValue': return { [type]: wireTimestampFields(value) };
    case 'bytesValue': return { [type]: Buffer.from(value, 'base64') };
    case 'doubleValue': return { [type]: Number(value) };
    case 'nullValue': return { [type]: 'NULL_VALUE' };
    case 'arrayValue': return { [type]: { values: (value.values ?? []).map(valueProto) } };
    case 'mapValue': return { [type]: { fields: mapFields(value.fields, valueProto) } };
    default: return wire;
  }
}

function documentJson(doc) {
  if (!doc.createTime) return { name: doc.name };
  return {
    name: doc.name, fields: mapFields(doc.fields, valueJson),
    createTime: timestampJson(doc.createTime), updateTime: timestampJson(doc.updateTime),
  };
}

export function copyFirestore({ projectId, databaseId = '(default)', emulator, productionAuthorized = false }) {
  if (!/^[a-z][a-z0-9-]{3,62}$/.test(projectId) || !/^(?:\(default\)|[a-z][a-z0-9-]{3,62})$/.test(databaseId)) {
    fail('invalid-firestore-target');
  }
  if (emulator ? !projectId.startsWith('demo-') || !/^(127\.0\.0\.1|localhost):[1-9][0-9]{0,4}$/.test(emulator)
    : projectId.startsWith('demo-') || productionAuthorized !== true) fail('invalid-firestore-target');
  const database = 'projects/' + projectId + '/databases/' + databaseId;
  const root = database + '/documents';
  const [host, port] = emulator?.split(':') ?? [];
  const client = new Firestore.v1({
    projectId, fallback: false, universeDomain: 'googleapis.com',
    ...(emulator ? { servicePath: host, port: Number(port), sslCreds: grpc.credentials.createInsecure() }
      : { servicePath: 'firestore.googleapis.com' }),
  });
  const options = { timeout: 60_000, retry: null, autoPaginate: false,
    ...(emulator ? { otherArgs: { headers: { authorization: 'Bearer owner' } } } : {}) };
  const name = (path) => root + '/' + path;
  function relative(resource) {
    if (!resource?.startsWith(root + '/')) fail('unexpected-document-resource');
    return resource.slice(root.length + 1);
  }

  async function get(paths, selector = {}) {
    const request = { database, documents: paths.map(name), ...selector };
    if (selector.readTime) request.readTime = wireTimestampFields(selector.readTime);
    const docs = new Map();
    let readTime;
    let transaction;
    for await (const row of client.batchGetDocuments(request, options)) {
      if (row.transaction?.length) transaction = row.transaction;
      if (row.readTime) readTime = timestampJson(row.readTime);
      if (!row.found && !row.missing) continue; // Transaction token response.
      const path = relative(row.found?.name ?? row.missing);
      if (docs.has(path)) fail('duplicate-firestore-document');
      docs.set(path, row.found ? documentJson(row.found) : null);
    }
    if (docs.size !== paths.length || paths.some((path) => !docs.has(path))) fail('incomplete-firestore-read');
    return { docs, readTime, transaction };
  }

  async function list(path, readTime, { showMissing = false, max = 5000 } = {}) {
    const parts = path.split('/');
    const collectionId = parts.pop();
    const parent = parts.length ? name(parts.join('/')) : root;
    const request = { parent, collectionId, readTime: wireTimestampFields(readTime), showMissing, pageSize: 200 };
    const docs = [];
    const seen = new Set();
    let pageToken = '';
    do {
      const [page, , response] = await client.listDocuments({ ...request, pageToken }, options);
      for (const doc of page) {
        const docPath = relative(doc.name);
        if (docPath.slice(0, docPath.lastIndexOf('/')) !== path || seen.has(docPath)) fail('unexpected-listed-document');
        seen.add(docPath);
        docs.push(documentJson(doc));
        if (docs.length > max) fail('copy-scan-limit');
      }
      pageToken = response.nextPageToken;
    } while (pageToken);
    return docs.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  }

  function put(path, fields, before = null) {
    return { update: { name: name(path), fields: mapFields(fields, valueProto) },
      currentDocument: before ? { updateTime: wireTimestampFields(before.updateTime) } : { exists: false } };
  }
  const remove = (path, before) => ({ delete: name(path), currentDocument: { updateTime: wireTimestampFields(before.updateTime) } });
  const commit = (writes, transaction) => client.commit({ database, writes, ...(transaction ? { transaction } : {}) }, options);

  async function transact(paths, buildWrites) {
    const { transaction, docs } = await get([...new Set(paths)], { newTransaction: { readWrite: {} } });
    if (!transaction?.length) fail('missing-firestore-transaction');
    let committed = false;
    try {
      const writes = buildWrites(docs);
      const result = await commit(writes, transaction);
      committed = true;
      return result;
    } finally {
      if (!committed) await client.rollback({ database, transaction }, options).catch(() => {});
    }
  }
  return { database, relative, get, list, put, remove, commit, transact, close: () => client.close() };
}
