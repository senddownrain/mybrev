/**
 * Generated index of the fixed-feast documents (`patchs/generate-db-feasts.mjs`):
 * which document carries a celebration, its Commons and its content status.
 * Seed-time only — the runtime reads these fields from the calendar definitions.
 */
import index from '../../data/ordo/feast-content-index.json' with { type: 'json' };
import readingsStatus from '../../data/ordo/readings-status.json' with { type: 'json' };

const byIdentity = new Map();
Object.entries(index).forEach(([key, record]) => {
  const [date, place, id] = key.split('|');
  const loose = `${date}|${place}|${id}`;
  // The exact rank wins; the first document of a celebration is the fallback.
  if (!byIdentity.has(loose)) byIdentity.set(loose, record);
  byIdentity.set(key, record);
});

/** Content record of a celebration on a date (`DD.MM`) for a diocese ('' = general). */
export function feastContentOf({ id, date, place = '', rank = '' }) {
  const spot = place || '-';
  return byIdentity.get(`${date}|${spot}|${id}|${rank}`) || byIdentity.get(`${date}|${spot}|${id}`) || null;
}

/** Readings status of a celebration (`scripts/ordo/audit-readings.mjs`). */
export function readingsStatusOf(id) {
  return readingsStatus[id] || null;
}

/** Definition fields derived from a content record and the readings audit. */
export function contentFields(record, id = '') {
  const readings = readingsStatusOf(id);
  return {
    templates: record?.templates || [],
    ...(record?.defaultTemplate ? { defaultTemplate: record.defaultTemplate } : {}),
    contentStatus: { hours: record?.hours || 'day-fallback', ...(readings ? { readings: readings.readings } : {}) },
    ...(readings?.reference ? { readingsReference: readings.reference } : {}),
  };
}
