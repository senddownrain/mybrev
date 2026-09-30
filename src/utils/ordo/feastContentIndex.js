/**
 * Generated index of the fixed-feast documents (`patchs/generate-db-feasts.mjs`):
 * which document carries a celebration, its Commons and its content status.
 * Seed-time only — the runtime reads these fields from the calendar definitions.
 */
import index from '../../data/ordo/feast-content-index.json' with { type: 'json' };

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

/** Definition fields derived from a content record. */
export function contentFields(record) {
  if (!record) return { templates: [], contentStatus: { hours: 'day-fallback' } };
  return {
    templates: record.templates || [],
    ...(record.defaultTemplate ? { defaultTemplate: record.defaultTemplate } : {}),
    contentStatus: { hours: record.hours },
  };
}
