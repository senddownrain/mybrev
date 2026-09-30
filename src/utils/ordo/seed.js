/**
 * Seed of the calendar definitions.
 *
 * The permanent calendar is stored as normalized definitions
 * (`liturgicalCelebrations`, `liturgicalDioceseOverrides`,
 * `liturgicalYearOverrides`; bundled snapshot
 * `src/data/ordo/calendar-definitions.json`). This module derives those
 * definitions from the material the project already had:
 *
 *   src/constants/fixedCalendar.js      fixed celebrations (+ `_place` entries)
 *   src/utils/ordo/movableFeasts.js     movable celebrations
 *   src/data/ordo/layers.js             Belarus / diocesan proper proven by the calendars
 *   src/data/ordo/year-overrides.js     one-year decisions proven by the calendars
 *
 * It is used by `scripts/ordo/build-calendar-definitions.mjs` and by tests;
 * the runtime engine never imports it.
 */
import { BELARUS_LAYER, DIOCESAN_LAYERS } from '../../data/ordo/layers.js';
import { YEAR_OVERRIDES } from '../../data/ordo/year-overrides.js';
import {
  getDiocesanFixedLayers, getUniversalFixedCelebrations, inferColor, inferProperKind,
} from './fixedCelebrations.js';
import { MOVABLE_CELEBRATIONS, getCountryRules } from './movableFeasts.js';
import { applyLayers, normalizeDioceseId } from './layers.js';
import { CALENDAR_SCHEMA_VERSION, celebrationToDefinition, dateRuleOf } from './definitions.js';

function movableCelebration(item) {
  return {
    ...item,
    date: { type: 'movable', anchor: item.anchor },
    daysRef: { source: 'dynamic', _feast: item.feastCode },
    readingsRef: { _feast: item.feastCode },
  };
}

/** Universal layer, plus the national layer entries marked `layer: 'belarus'`. */
export function buildBaseLayers(country = 'BY') {
  const countryRules = getCountryRules(country);
  const fixed = getUniversalFixedCelebrations();
  const movable = MOVABLE_CELEBRATIONS
    .filter((item) => !item.countryRule || countryRules[item.countryRule])
    .map(movableCelebration);
  const all = [...fixed, ...movable];
  const layers = [{
    id: 'universal', level: 'universal', add: all.filter((item) => item.layer === 'universal'), modify: [], rules: [], notes: [],
  }];
  if (String(country || 'BY').toUpperCase() === 'BY') {
    const data = expandDataLayer(BELARUS_LAYER, { level: 'belarus' });
    layers.push({
      id: 'belarus',
      level: 'belarus',
      add: [...all.filter((item) => item.layer === 'belarus'), ...data.add],
      modify: data.modify,
      rules: data.rules,
      notes: [],
    });
  }
  return layers;
}

const mmddToFixedDate = (mmdd) => {
  const [month, day] = String(mmdd).split('-').map(Number);
  return { month, day, key: `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}` };
};

/**
 * Expand a data layer (`src/data/ordo/layers.js`) into engine layer records.
 * Adds become full celebrations with `days`/`readings` identities; modifies
 * keep the inherited identities (the `days` documents are unchanged).
 */
export function expandDataLayer(data, { level, dioceseId = null } = {}) {
  const source = (entry) => ({ file: 'src/data/ordo/layers.js', evidence: entry.evidence || [], basis: entry.basis || '' });
  const add = (data?.add || []).map((entry) => {
    const date = mmddToFixedDate(entry.mmdd);
    const category = entry.category || 'saint';
    return {
      id: entry.id,
      title: entry.title,
      rank: entry.rank,
      category,
      layer: level,
      ...(dioceseId ? { dioceseId } : {}),
      properKind: entry.properKind || inferProperKind(entry.title),
      color: entry.color || inferColor(entry.title, category),
      date: { type: 'fixed', month: date.month, day: date.day },
      daysRef: {
        source: 'fixed', _date: date.key, _rank: entry.rank, ...(dioceseId ? { _place: dioceseId } : {}),
      },
      readingsRef: { _date: date.key },
      source: source(entry),
    };
  });
  const modify = (data?.modify || []).map((entry) => {
    const changes = {};
    if (entry.rank) changes.rank = entry.rank;
    if (entry.mmdd) {
      const date = mmddToFixedDate(entry.mmdd);
      changes.date = { type: 'fixed', month: date.month, day: date.day };
    }
    return { id: entry.id, changes, source: source(entry) };
  });
  return { add, modify, rules: [...(data?.rules || [])] };
}

/** Diocesan layer derived from `_place` fixed-calendar entries, merged with extra data. */
export function buildDiocesanLayer(dioceseId, extra = null) {
  const id = normalizeDioceseId(dioceseId);
  if (!id) return null;
  const derived = getDiocesanFixedLayers()[id] || { id, level: 'diocese', add: [], modify: [], rules: [], notes: [] };
  const data = expandDataLayer(DIOCESAN_LAYERS[id], { level: 'diocese', dioceseId: id });
  const derivedIds = new Set(derived.add.map((item) => item.id));
  const parts = [derived, { ...data, add: data.add.filter((item) => !derivedIds.has(item.id)), notes: [] }, extra || {}];
  return {
    ...derived,
    dioceseId: id,
    add: parts.flatMap((part) => part.add || []),
    modify: parts.flatMap((part) => part.modify || []),
    rules: parts.flatMap((part) => part.rules || []),
    notes: parts.flatMap((part) => part.notes || []),
  };
}

/** Legacy layered calendar (universal → belarus → diocese) straight from the seed sources. */
export function buildSeedCalendarLayers(context = {}) {
  const base = buildBaseLayers(context.country || 'BY');
  const diocese = context.diocese ? buildDiocesanLayer(context.diocese, context.dioceseLayer) : null;
  return applyLayers([...base, diocese]);
}

export const SEED_DIOCESES = Object.freeze(['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno']);

/** Movable anchors expressed through the declarative date DSL. */
const MOVABLE_DATE_RULES = Object.freeze({
  ashWednesday: { type: 'movable', anchor: 'easterSunday', offsetDays: -46 },
  palmSunday: { type: 'movable', anchor: 'easterSunday', offsetDays: -7 },
  easterSunday: { type: 'movable', anchor: 'easterSunday', offsetDays: 0 },
  pentecost: { type: 'movable', anchor: 'easterSunday', offsetDays: 49 },
  maryMotherChurch: { type: 'movable', anchor: 'pentecost', offsetDays: 1 },
  christTheHighPriest: { type: 'movable', anchor: 'pentecost', offsetDays: 4 },
  trinity: { type: 'movable', anchor: 'pentecost', offsetDays: 7 },
  sacredHeart: { type: 'movable', anchor: 'pentecost', offsetDays: 19 },
  immaculateHeart: { type: 'movable', anchor: 'pentecost', offsetDays: 20 },
  christKing: { type: 'movable', anchor: 'firstAdventSunday', offsetDays: -7 },
  ascension: { type: 'named', rule: 'ascension' },
  corpusChristi: { type: 'named', rule: 'corpusChristi' },
  holyFamily: { type: 'named', rule: 'holyFamily' },
  baptismOfLord: { type: 'named', rule: 'baptismOfLord' },
});

function seedDateRule(celebration) {
  if (celebration.date?.type === 'movable') {
    const rule = MOVABLE_DATE_RULES[celebration.date.anchor];
    if (!rule) throw new Error(`No date rule for movable anchor ${celebration.date.anchor}`);
    return rule;
  }
  return dateRuleOf(celebration.date);
}

const withoutUndefined = (value) => JSON.parse(JSON.stringify(value));

function overrideId(dioceseId, celebrationId) {
  return `${dioceseId}--${celebrationId}`;
}

/**
 * Normalized definitions of the whole permanent calendar.
 *
 *  - celebrations: universal and Belarus celebrations in their final state
 *    (the Belarus modifications of `src/data/ordo/layers.js` are folded in);
 *  - dioceseOverrides: only what a diocese adds, modifies or suppresses;
 *  - yearOverrides: the published one-year decisions.
 */
export function buildCalendarDefinitionsSeed({ revision = 1 } = {}) {
  const { celebrations: base } = applyLayers(buildBaseLayers('BY'));
  const celebrations = [...base.values()].map((celebration, order) => withoutUndefined({
    ...celebrationToDefinition(celebration, { dateRule: seedDateRule(celebration) }),
    scope: celebration.layer === 'belarus' ? 'belarus' : 'universal',
    order,
  }));

  const dioceseOverrides = [];
  SEED_DIOCESES.forEach((dioceseId) => {
    const layer = buildDiocesanLayer(dioceseId);
    const byId = new Map();
    let order = 0;
    (layer.add || []).forEach((celebration) => {
      byId.set(celebration.id, {
        id: overrideId(dioceseId, celebration.id),
        dioceseId,
        celebrationId: celebration.id,
        action: 'add',
        order: order++,
        ...celebrationToDefinition(celebration, { dateRule: seedDateRule(celebration), omit: ['id', 'scope'] }),
      });
    });
    (layer.modify || []).forEach(({ id, changes, source }) => {
      const { date, layer: _layer, ...rest } = changes;
      const patch = { ...rest, ...(date ? { dateRule: seedDateRule({ date }) } : {}) };
      const existing = byId.get(id);
      if (existing) {
        // A later modification of the same celebration is merged into one document.
        Object.assign(existing, patch, source ? { source: { ...(existing.source || {}), ...source } } : {});
        return;
      }
      byId.set(id, {
        id: overrideId(dioceseId, id), dioceseId, celebrationId: id, action: 'modify', order: order++, ...patch,
        ...(source ? { source } : {}),
      });
    });
    (layer.rules || []).filter((rule) => rule.type === 'suppress').forEach((rule) => {
      byId.set(rule.celebrationId, {
        id: overrideId(dioceseId, rule.celebrationId), dioceseId, celebrationId: rule.celebrationId, action: 'suppress', order: order++,
      });
    });
    dioceseOverrides.push(...[...byId.values()].map(withoutUndefined));
  });

  const yearOverrides = YEAR_OVERRIDES.map((override) => withoutUndefined({
    id: `${override.year}-${override.scope === 'diocese' ? normalizeDioceseId(override.dioceseId) : override.scope}-${override.targetCelebrationId}`,
    ...override,
    enabled: true,
  }));

  return {
    schemaVersion: CALENDAR_SCHEMA_VERSION, revision, celebrations, dioceseOverrides, yearOverrides,
  };
}
