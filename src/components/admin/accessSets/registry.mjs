import { ACCESS_V2, accessV2Error } from '../../../services/accessSetsV2Gateway.mjs';

export const PAGE_SIZE = 25;

const deviceFields = ['deviceName', 'label', 'status', 'client', 'platform'];
const registries = {
  sets: [ACCESS_V2.sets, ['name', 'status']],
  profiles: [ACCESS_V2.profiles, ['name', 'status', 'allowedSets', 'revision']],
  codes: [ACCESS_V2.codes, ['label', 'status', 'profileId']],
  v2: [ACCESS_V2.grants, deviceFields],
  legacy: ['priestDeviceGrants', deviceFields],
};

function readField(value) {
  if (!value) return null;
  if (typeof value.stringValue === 'string') return value.stringValue;
  if (typeof value.integerValue === 'string') return Number(value.integerValue);
  if (value.arrayValue) return (value.arrayValue.values || []).map(readField);
  return null;
}

const equality = (fieldPath, value) => ({ fieldFilter: { field: { fieldPath }, op: 'EQUAL', value } });

// The browser SDK has no field masks for lists. RunQuery applies the projection
// on the server, including for older legacy grants that may still contain proof.
export function createRegistry({ database, endpoint, headers }) {
  async function list(kind, { after, id, status } = {}) {
    const [collectionId, fields] = registries[kind];
    const key = value => ({ referenceValue: database + '/documents/' + collectionId + '/' + value });
    const structuredQuery = {
      from: [{ collectionId }],
      select: { fields: fields.map(fieldPath => ({ fieldPath })) },
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
      limit: id ? 1 : PAGE_SIZE + 1,
    };
    if (id) structuredQuery.where = equality('__name__', key(id));
    else if (status) structuredQuery.where = equality('status', { stringValue: status });
    if (after && !id) structuredQuery.startAt = { values: [key(after)], before: false };

    const requestHeaders = await headers();
    let response;
    try {
      response = await fetch(endpoint + '/v1/' + database + '/documents:runQuery', {
        method: 'POST',
        headers: { ...requestHeaders, 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ structuredQuery }),
      });
    } catch {
      throw accessV2Error('unavailable');
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const code = payload?.error?.status?.toLowerCase().replaceAll('_', '-');
      const byStatus = { 401: 'unauthenticated', 403: 'permission-denied', 429: 'resource-exhausted', 503: 'unavailable' };
      throw accessV2Error(code || byStatus[response.status] || 'registry-unavailable');
    }

    const result = await response.json();
    const rows = result.filter(entry => entry.document).map(({ document }) => ({
      id: document.name.split('/').at(-1),
      ...Object.fromEntries(fields.map(field => [field, readField(document.fields?.[field])])),
    }));
    const page = rows.slice(0, PAGE_SIZE);
    return {
      rows: id && status ? page.filter(row => row.status === status) : page,
      next: rows.length > PAGE_SIZE ? page.at(-1).id : null,
    };
  }

  async function read(kind, id) {
    return (await list(kind, { id })).rows[0] ?? null;
  }

  return { list, read };
}
