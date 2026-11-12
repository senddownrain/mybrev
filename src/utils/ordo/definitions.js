/**
 * Calendar definitions: the permanent calendar as normalized, declarative
 * documents. Pure (no Firestore, Pinia or Vue).
 *
 *   liturgicalCelebrations/{id}        universal and Belarus celebrations
 *   liturgicalDioceseOverrides/{id}    what a diocese adds / modifies / suppresses
 *   liturgicalYearOverrides/{id}       manual one-year decisions
 *   liturgicalCalendarMeta/current     { schemaVersion, revision, publishedAt }
 *
 * Algorithms (computus, seasons, precedence, transfers) stay code. A date is
 * described by a small DSL checked against a white list; nothing stored in
 * the database is ever executed.
 *
 *   { type: 'fixed', month, day }
 *   { type: 'movable', anchor, offsetDays }        anchor ∈ MOVABLE_ANCHORS
 *   { type: 'named', rule }                        rule ∈ NAMED_DATE_RULES
 *   { type: 'last-weekday-of-month', month, isoWeekday }
 *
 * The active definitions are the bundled snapshot until a published
 * Firestore revision is applied with `setCalendarDefinitions()`.
 */
import snapshot from '../../data/ordo/calendar-definitions.json' with { type: 'json' };

export const CALENDAR_SCHEMA_VERSION = 1;

/** Anchors a `movable` rule may be counted from. */
export const MOVABLE_ANCHORS = Object.freeze(['easterSunday', 'pentecost', 'firstAdventSunday', 'christmas', 'epiphany']);

/** Dates that need a rule of their own (country rules, Sunday search). */
export const NAMED_DATE_RULES = Object.freeze(['ascension', 'corpusChristi', 'holyFamily', 'baptismOfLord']);

export const CELEBRATION_SCOPES = Object.freeze(['universal', 'belarus']);
export const DIOCESE_OVERRIDE_ACTIONS = Object.freeze(['add', 'modify', 'suppress']);
export const CELEBRATION_RANKS = Object.freeze([
  'solemnitas', 'festum', 'memoria', 'memoria-ad-libitum', 'commemoratio-defunctorum', 'dies-liturgicus',
]);
export const CELEBRATION_COLORS = Object.freeze(['albus', 'ruber', 'viridis', 'violaceus', 'rosaceus', 'niger']);

const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function validateDateRule(rule) {
  if (!rule || typeof rule !== 'object') return ['dateRule is required'];
  switch (rule.type) {
    case 'fixed':
      return isInt(rule.month, 1, 12) && isInt(rule.day, 1, DAYS_IN_MONTH[rule.month - 1])
        ? [] : ['fixed dateRule needs a valid month and day'];
    case 'movable':
      return [
        ...(MOVABLE_ANCHORS.includes(rule.anchor) ? [] : [`unknown anchor ${rule.anchor}`]),
        ...(isInt(rule.offsetDays ?? 0, -120, 120) ? [] : ['offsetDays must be an integer between -120 and 120']),
      ];
    case 'named':
      return NAMED_DATE_RULES.includes(rule.rule) ? [] : [`unknown named rule ${rule.rule}`];
    case 'last-weekday-of-month':
      return isInt(rule.month, 1, 12) && isInt(rule.isoWeekday, 1, 7) ? [] : ['last-weekday-of-month needs month and isoWeekday'];
    default:
      return [`unknown dateRule type ${rule.type}`];
  }
}

/** Engine `date` of a celebration → `dateRule` (fixed and weekday rules map 1:1). */
export function dateRuleOf(date) {
  if (date?.type === 'fixed') return { type: 'fixed', month: date.month, day: date.day };
  if (date?.type === 'last-weekday-of-month') {
    return { type: 'last-weekday-of-month', month: date.month, isoWeekday: date.isoWeekday };
  }
  if (date?.type === 'movable') {
    return NAMED_DATE_RULES.includes(date.anchor)
      ? { type: 'named', rule: date.anchor }
      : { type: 'movable', anchor: date.anchor, offsetDays: date.offsetDays || 0 };
  }
  return null;
}

/** `dateRule` → the engine's `date` (placed on a year by `yearPlan.js`). */
export function engineDateOf(rule) {
  switch (rule?.type) {
    case 'fixed': return { type: 'fixed', month: rule.month, day: rule.day };
    case 'movable': return { type: 'movable', anchor: rule.anchor, offsetDays: rule.offsetDays || 0 };
    case 'named': return { type: 'movable', anchor: rule.rule, offsetDays: 0 };
    case 'last-weekday-of-month': return { type: 'last-weekday-of-month', month: rule.month, isoWeekday: rule.isoWeekday };
    default: return null;
  }
}

export function validateCelebrationDefinition(doc) {
  const errors = [];
  if (!doc?.id || typeof doc.id !== 'string') errors.push('id is required');
  if (!doc?.title) errors.push('title is required');
  if (!CELEBRATION_SCOPES.includes(doc?.scope)) errors.push('scope must be universal or belarus');
  if (!CELEBRATION_RANKS.includes(doc?.rank)) errors.push(`unknown rank ${doc?.rank}`);
  if (doc?.color && !CELEBRATION_COLORS.includes(doc.color)) errors.push(`unknown color ${doc.color}`);
  errors.push(...validateDateRule(doc?.dateRule));
  if (doc?.templates && !Array.isArray(doc.templates)) errors.push('templates must be an array');
  if (doc?.defaultTemplate && !(doc.templates || []).includes(doc.defaultTemplate)) errors.push('defaultTemplate must be one of templates');
  return errors;
}

export function validateDioceseOverride(doc) {
  const errors = [];
  if (!doc?.dioceseId) errors.push('dioceseId is required');
  if (!doc?.celebrationId) errors.push('celebrationId is required');
  if (!DIOCESE_OVERRIDE_ACTIONS.includes(doc?.action)) errors.push(`unknown action ${doc?.action}`);
  if (doc?.rank && !CELEBRATION_RANKS.includes(doc.rank)) errors.push(`unknown rank ${doc.rank}`);
  if (doc?.color && !CELEBRATION_COLORS.includes(doc.color)) errors.push(`unknown color ${doc.color}`);
  if (doc?.action === 'add') {
    if (!doc.title) errors.push('add needs a title');
    if (!doc.rank) errors.push('add needs a rank');
    errors.push(...validateDateRule(doc.dateRule));
  } else if (doc?.dateRule) {
    errors.push(...validateDateRule(doc.dateRule));
  }
  return errors;
}

/** Fields that describe the document itself, not the celebration. */
const DOCUMENT_FIELDS = new Set(['scope', 'order', 'enabled', 'dateRule', 'dioceseId', 'celebrationId', 'action', 'id', 'updatedAt', 'createdAt']);

/** Engine celebration → definition document. */
export function celebrationToDefinition(celebration, { dateRule = dateRuleOf(celebration.date), omit = [] } = {}) {
  const {
    date: _date, layer, layerTrail: _trail, inheritedFrom: _inherited, anchor: _anchor, dioceseId: _diocese, ...rest
  } = celebration;
  const doc = { ...rest, scope: layer === 'belarus' ? 'belarus' : 'universal', dateRule, enabled: true };
  omit.forEach((key) => delete doc[key]);
  return doc;
}

function celebrationFields(doc) {
  return Object.fromEntries(Object.entries(doc).filter(([key]) => !DOCUMENT_FIELDS.has(key)));
}

/** Definition document → engine celebration. */
export function definitionToCelebration(doc) {
  return { id: doc.id, ...celebrationFields(doc), layer: doc.scope, date: engineDateOf(doc.dateRule) };
}

const byOrder = (a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || String(a.id).localeCompare(String(b.id));

/**
 * Normalize raw documents (bundled or from Firestore): drop disabled and
 * invalid ones, keep a stable order. Invalid documents are reported, never
 * thrown: a broken edit must not take the calendar down.
 */
export function normalizeCalendarDefinitions(raw = {}) {
  const warnings = [];
  const keep = (list, validate, label) => (Array.isArray(list) ? list : [])
    .filter((doc) => doc && doc.enabled !== false)
    .filter((doc) => {
      const errors = validate(doc);
      if (errors.length) warnings.push(`${label} ${doc.id || '?'}: ${errors.join('; ')}`);
      return !errors.length;
    })
    .sort(byOrder);
  return {
    schemaVersion: Number(raw.schemaVersion) || CALENDAR_SCHEMA_VERSION,
    revision: Number(raw.revision) || 0,
    ...(raw.publishedAt ? { publishedAt: raw.publishedAt } : {}),
    // Use the approved Belarusian spelling even if an older Firestore
    // publication still carries the previous title for this stable ID.
    celebrations: keep(raw.celebrations, validateCelebrationDefinition, 'celebration')
      .map((doc) => doc.id === 'sv-juan-diego' ? { ...doc, title: 'Св. Хуана Дыега Куаўтлатаацына' } : doc),
    dioceseOverrides: keep(raw.dioceseOverrides, validateDioceseOverride, 'dioceseOverride'),
    yearOverrides: (Array.isArray(raw.yearOverrides) ? raw.yearOverrides : []).map((item) => ({ ...item })),
    warnings,
  };
}

const BUNDLED = normalizeCalendarDefinitions(snapshot);
let active = BUNDLED;
let epoch = 0;
const listeners = new Set();

export const getBundledCalendarDefinitions = () => BUNDLED;
export const getCalendarDefinitions = () => active;

/** Changes whenever the active definitions change; part of every engine cache key. */
export const getDefinitionsEpoch = () => epoch;

export function onCalendarDefinitionsChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Replace the active definitions (`null` → back to the bundled snapshot).
 * A partial object only replaces the collections it carries, so the year
 * overrides can be refreshed without re-reading the whole calendar.
 */
export function setCalendarDefinitions(raw) {
  if (!raw) {
    active = BUNDLED;
  } else {
    if (raw.schemaVersion !== undefined && Number(raw.schemaVersion) !== CALENDAR_SCHEMA_VERSION) return active;
    if (raw.revision !== undefined && Number(raw.revision) < active.revision) return active;
    const next = normalizeCalendarDefinitions({
      schemaVersion: raw.schemaVersion ?? active.schemaVersion,
      revision: raw.revision ?? active.revision,
      publishedAt: raw.publishedAt ?? active.publishedAt,
      celebrations: raw.celebrations ?? active.celebrations,
      dioceseOverrides: raw.dioceseOverrides ?? active.dioceseOverrides,
      yearOverrides: raw.yearOverrides ?? active.yearOverrides,
    });
    if (next.warnings.length || !next.celebrations.length) return active;
    active = next;
  }
  epoch += 1;
  listeners.forEach((listener) => listener(active));
  return active;
}

function overrideToLayerRecords(override) {
  const fields = celebrationFields(override);
  if (override.action === 'add') {
    return {
      add: {
        id: override.celebrationId,
        ...fields,
        layer: 'diocese',
        dioceseId: override.dioceseId,
        date: engineDateOf(override.dateRule),
      },
    };
  }
  if (override.action === 'modify') {
    const { source, ...changes } = fields;
    if (override.dateRule) changes.date = engineDateOf(override.dateRule);
    return { modify: { id: override.celebrationId, changes, ...(source ? { source } : {}) } };
  }
  return { rule: { type: 'suppress', celebrationId: override.celebrationId } };
}

/**
 * Definitions → engine layers for a context.
 *  - `base`: `{ celebrations: Map, appliedLayers }` of the universal and
 *    (for Belarus) national celebrations, in definition order;
 *  - `diocese`: the diocesan layer record for `applyLayers`, or null.
 */
export function layersFromDefinitions(definitions, { country = 'BY', diocese = '' } = {}) {
  const isBelarus = String(country || 'BY').toUpperCase() === 'BY';
  const celebrations = new Map();
  const summaries = {
    universal: { id: 'universal', level: 'universal', added: [], modified: [], suppressed: [], warnings: [] },
    belarus: { id: 'belarus', level: 'belarus', added: [], modified: [], suppressed: [], warnings: [] },
  };
  definitions.celebrations.forEach((doc) => {
    if (doc.scope === 'belarus' && !isBelarus) return;
    celebrations.set(doc.id, { ...definitionToCelebration(doc), layerTrail: [doc.scope] });
    summaries[doc.scope].added.push(doc.id);
  });
  const appliedLayers = [summaries.universal, ...(isBelarus ? [summaries.belarus] : [])];

  let dioceseLayer = null;
  if (diocese && isBelarus) {
    dioceseLayer = { id: diocese, level: 'diocese', dioceseId: diocese, add: [], modify: [], rules: [], notes: [] };
    definitions.dioceseOverrides
      .filter((override) => override.dioceseId === diocese)
      .forEach((override) => {
        const record = overrideToLayerRecords(override);
        if (record.add) dioceseLayer.add.push(record.add);
        if (record.modify) dioceseLayer.modify.push(record.modify);
        if (record.rule) dioceseLayer.rules.push(record.rule);
      });
  }
  return { base: { celebrations, appliedLayers }, diocese: dioceseLayer };
}
