import { createHash } from 'node:crypto';
import { DocumentReference, FieldValue, GeoPoint, Timestamp } from 'firebase-admin/firestore';
import { catalogError, V2_CONTENT_FIELDS } from '../../src/utils/accessSetsV2Policy.mjs';

const utf8 = (value) => Buffer.byteLength(value, 'utf8');
const validString = (value) => !/[\uD800-\uDFFF]/u.test(value);
const rejectValue = () => { throw catalogError('unsupported-firestore-value'); };
const fields = new Set(['id', ...V2_CONTENT_FIELDS]);
const VectorValue = FieldValue.vector([]).constructor;

export const catalogPayload = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => !fields.has(key)));

// Typed tuples avoid collisions with user maps and retain precise timestamps,
// references and bytes. The original SDK values are sent to Firestore unchanged.
export function encodeContentValue(value, depth = 0, insideArray = false) {
  if (depth > 20) rejectValue();
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string' && validString(value)) return value;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return ['number', 'NaN'];
    if (!Number.isFinite(value) || Object.is(value, -0)) return ['number', Object.is(value, -0) ? '-0' : String(value)];
    return value;
  }
  if (typeof value === 'bigint' && value >= -(2n ** 63n) && value < 2n ** 63n) {
    const small = Number(value);
    return Number.isSafeInteger(small) ? small : ['integer', String(value)];
  }
  if (value instanceof Date) value = Timestamp.fromDate(value);
  if (value instanceof Timestamp) {
    if (value.nanoseconds % 1000 !== 0) rejectValue(); // Firestore truncates to microseconds.
    return ['timestamp', value.seconds, value.nanoseconds];
  }
  if (value instanceof GeoPoint) return ['geopoint', value.latitude, value.longitude];
  if (value instanceof DocumentReference) return ['reference', value.formattedName];
  if (value instanceof Uint8Array) return ['bytes', Buffer.from(value).toString('base64')];
  if (value instanceof VectorValue) return ['vector', value.toArray().map((item) => encodeContentValue(item))];
  if (Array.isArray(value) && !insideArray && Object.keys(value).length === value.length) {
    return ['array', value.map((item) => encodeContentValue(item, depth + 1, true))];
  }
  if (value && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    return ['map', Object.keys(value).sort().map((key) => {
      if (!key || !validString(key) || /^__.*__$/su.test(key) || utf8(key) > 1500) rejectValue();
      return [key, encodeContentValue(value[key], depth + 1)];
    })];
  }
  return rejectValue();
}
export const catalogValueJson = (value) => JSON.stringify(encodeContentValue(value));
export const digestCatalogValue = (value) => createHash('sha256').update(catalogValueJson(value)).digest('hex');
export const catalogContentHash = (row) => digestCatalogValue(catalogPayload(row));
