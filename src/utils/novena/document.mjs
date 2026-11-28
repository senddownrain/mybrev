/**
 * Shape of a stored novena document and what may leave Firestore for the app.
 * `core.mjs` (shared with Flutter) decides whether the text assembles; this
 * file only guards fields, so that nothing outside the contract is published.
 */
import { EXCLUDED, NOVENA_SCHEMA_VERSION, validateDefinition } from './core.mjs';
import { LITURGICAL_EVENTS, SCHEDULE_TYPES, isCivilDate } from './calendar.mjs';

export const NOVENA_COLLECTION = 'novenaDefinitions';
export const NOVENA_DRAFTS_COLLECTION = 'novenaDrafts';
export const NOVENA_TAG = 'Навэнна';

/** Contract 1.1: tagged «Навэнна» or titled so (one source prayer lacks the tag). */
export const isNovenaSource = (prayer) => (prayer?.tags || []).includes(NOVENA_TAG) || /^навэнна/i.test(prayer?.title || '');

/** Keys of a published document, exactly (also enforced by firestore.rules). */
export const DEFINITION_FIELDS = Object.freeze([
  'schemaVersion', 'novenaId', 'sourcePrayerId', 'title', 'contentVersion', 'durationDays', 'status',
  'trackerEnabled', 'template', 'days', 'schedule',
]);

const DIOCESES = ['minsk-mohilev', 'grodno', 'pinsk', 'vitebsk'];
const BLOCK_FIELDS = {
  section: ['type', 'prayerId', 'heading', 'occurrence'],
  prayer: ['type', 'prayerId'],
  inline: ['type', 'kind', 'text'],
  daySection: ['type'],
};
const SCHEDULE_FIELDS = {
  manual: [],
  fixedFeast: ['month', 'day', 'offsetDays'],
  fixedStart: ['month', 'day'],
  liturgical: ['event', 'offsetDays'],
};

const text = (value) => typeof value === 'string' && value.trim() !== '';
const plain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const onlyKeys = (value, keys) => Object.keys(value).every((key) => keys.includes(key));
const intIn = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

export const pickDefinition = (data) => Object.fromEntries(DEFINITION_FIELDS
  .filter((field) => data?.[field] !== undefined).map((field) => [field, data[field]]));

export function validateSchedule(schedule) {
  if (!plain(schedule)) return ['schedule'];
  const errors = [];
  const { type } = schedule;
  if (!SCHEDULE_TYPES.includes(type)) return ['schedule:type'];
  if (!onlyKeys(schedule, ['enabled', 'extraDates', 'dioceses', 'type', ...SCHEDULE_FIELDS[type]])) errors.push('schedule:fields');
  if (typeof schedule.enabled !== 'boolean') errors.push('schedule:enabled');
  if (!Array.isArray(schedule.extraDates) || !schedule.extraDates.every(isCivilDate)) errors.push('schedule:extraDates');
  if (schedule.dioceses !== undefined
    && !(Array.isArray(schedule.dioceses) && schedule.dioceses.every((id) => DIOCESES.includes(id)))) errors.push('schedule:dioceses');
  if (type === 'fixedFeast' || type === 'fixedStart') {
    // 2028 is a leap year: 29.02 is a valid rule.
    const days = intIn(schedule.month, 1, 12) ? new Date(Date.UTC(2028, schedule.month, 0)).getUTCDate() : 0;
    if (!intIn(schedule.day, 1, days)) errors.push('schedule:date');
  }
  if (type === 'liturgical' && !LITURGICAL_EVENTS.includes(schedule.event)) errors.push('schedule:event');
  if ((type === 'fixedFeast' || type === 'liturgical') && !intIn(schedule.offsetDays, -366, 366)) errors.push('schedule:offsetDays');
  return errors;
}

function blockError(block, inDay) {
  if (!plain(block) || !Object.hasOwn(BLOCK_FIELDS, block.type) || !onlyKeys(block, BLOCK_FIELDS[block.type])) return true;
  if (block.type === 'daySection') return inDay;
  if (block.type === 'inline') return !['text', 'rubric'].includes(block.kind) || !text(block.text);
  if (!text(block.prayerId)) return true;
  return block.type === 'section' && !(text(block.heading) && intIn(block.occurrence ?? 1, 1, 1000));
}

export function validateShape(data) {
  if (!plain(data)) return ['document'];
  const errors = [];
  if (!onlyKeys(data, DEFINITION_FIELDS)) errors.push('unknown-fields');
  if (data.schemaVersion !== NOVENA_SCHEMA_VERSION) errors.push('schemaVersion');
  if (!text(data.novenaId) || data.novenaId !== data.sourcePrayerId) errors.push('ids');
  if (Object.hasOwn(EXCLUDED, data.novenaId)) errors.push('excluded-from-v1');
  if (!text(data.title)) errors.push('title');
  if (!['draft', 'published'].includes(data.status)) errors.push('status');
  if (typeof data.trackerEnabled !== 'boolean') errors.push('trackerEnabled');
  if (!Array.isArray(data.template) || data.template.some((block) => blockError(block, false))) errors.push('template-blocks');
  if (!Array.isArray(data.days) || data.days.some((day) => !plain(day) || !onlyKeys(day, ['number', 'blocks'])
    || !Array.isArray(day.blocks) || day.blocks.some((block) => blockError(block, true)))) errors.push('day-blocks');
  return [...errors, ...validateSchedule(data.schedule)];
}

/** Everything that blocks publication of a definition against public prayers. */
export function publicationErrors(data, prayers) {
  const shape = validateShape(data);
  // The resolver expects well-formed blocks.
  if (shape.some((error) => ['document', 'template-blocks', 'day-blocks'].includes(error))) return shape;
  return [...new Set([...shape, ...validateDefinition(data, prayers)])];
}

/**
 * Rows of the app export: published, enabled and assembling from public
 * prayers only. `prayers` are the already filtered public prayer documents.
 * The rest is reported, never repaired.
 */
export function publicNovenaRows(rows, prayers) {
  const byId = prayers instanceof Map ? prayers : new Map(prayers.map((item) => [item.id, item]));
  const included = [];
  const excluded = [];
  for (const row of rows) {
    // `id` is the document id added by the exporter, not a stored field.
    const { id, ...data } = row;
    let errors;
    if (data.status !== 'published' || data.trackerEnabled !== true) errors = ['not-published-or-disabled'];
    else if (id !== data.novenaId) errors = ['document-id'];
    else errors = publicationErrors(data, byId);
    if (errors.length) excluded.push({ id, errors });
    else included.push(row);
  }
  return { rows: included, excluded };
}
