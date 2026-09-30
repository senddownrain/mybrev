/**
 * Calendar layers: universal → belarus → diocese.
 *
 * A layer never copies the universal calendar. It only holds
 *   add     – new celebrations,
 *   modify  – `{ id, changes }` patches of an inherited celebration,
 *   rules   – structured effects (`suppress`, `set`),
 *   notes   – Ordo notes scoped to the layer.
 */
import { BELARUS_LAYER, DIOCESAN_LAYERS } from '../../data/ordo/layers.js';
import {
  getDiocesanFixedLayers, getUniversalFixedCelebrations, inferColor, inferProperKind,
} from './fixedCelebrations.js';
import { MOVABLE_CELEBRATIONS, getCountryRules } from './movableFeasts.js';

export const LAYER_LEVELS = Object.freeze(['universal', 'belarus', 'diocese']);

export const DIOCESE_ALIASES = Object.freeze({
  minsk: 'minsk-mohilev',
  'minsk-mogilev': 'minsk-mohilev',
  'minsk-mohilev': 'minsk-mohilev',
  grodno: 'grodno',
  hrodna: 'grodno',
  vitebsk: 'vitebsk',
  viciebsk: 'vitebsk',
  pinsk: 'pinsk',
});

export function normalizeDioceseId(value) {
  const key = String(value || '').trim().toLowerCase();
  return key ? (DIOCESE_ALIASES[key] || key) : '';
}

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

function applyChanges(target, changes) {
  const result = { ...target };
  Object.entries(changes || {}).forEach(([key, value]) => {
    if (value === undefined) delete result[key];
    else result[key] = value;
  });
  return result;
}

/**
 * Apply layers in order. Returns the effective celebrations and an audit
 * trail per layer. Every modified celebration keeps `layerTrail`.
 */
export function applyLayers(layers, initial = new Map()) {
  const celebrations = new Map(initial);
  const appliedLayers = [];
  const layerNotes = [];
  layers.filter(Boolean).forEach((layer) => {
    const summary = { id: layer.id, level: layer.level, added: [], modified: [], suppressed: [], warnings: [] };
    (layer.add || []).forEach((item) => {
      celebrations.set(item.id, { ...item, layerTrail: [layer.id] });
      summary.added.push(item.id);
    });
    (layer.modify || []).forEach(({ id, changes }) => {
      const current = celebrations.get(id);
      if (!current) {
        summary.warnings.push(`modify: unknown celebration ${id}`);
        return;
      }
      const { level } = layer;
      const next = applyChanges({ ...current, layer: changes.layer || level }, changes);
      if (layer.dioceseId && level === 'diocese') next.dioceseId = layer.dioceseId;
      next.layerTrail = [...(current.layerTrail || []), layer.id];
      next.inheritedFrom = current.inheritedFrom || { rank: current.rank, title: current.title, layer: current.layer };
      celebrations.set(id, next);
      summary.modified.push(id);
    });
    (layer.rules || []).forEach((rule) => {
      if (rule.type === 'suppress' && celebrations.has(rule.celebrationId)) {
        celebrations.set(rule.celebrationId, { ...celebrations.get(rule.celebrationId), suppressedBy: layer.id });
        summary.suppressed.push(rule.celebrationId);
      } else if (rule.type === 'set' && celebrations.has(rule.celebrationId)) {
        celebrations.set(rule.celebrationId, applyChanges(celebrations.get(rule.celebrationId), rule.changes));
        summary.modified.push(rule.celebrationId);
      } else if (rule.type === 'warning') {
        summary.warnings.push(rule.message);
      }
    });
    (layer.notes || []).forEach((note) => layerNotes.push({
      ...note,
      scope: note.scope || { level: layer.level, ...(layer.dioceseId ? { dioceseId: layer.dioceseId } : {}) },
    }));
    appliedLayers.push(summary);
  });
  return { celebrations, appliedLayers, layerNotes };
}

/**
 * Full layered calendar for a context: `{ country, diocese, dioceseLayer? }`.
 */
export function buildCalendarLayers(context = {}) {
  const base = buildBaseLayers(context.country || 'BY');
  const diocese = context.diocese ? buildDiocesanLayer(context.diocese, context.dioceseLayer) : null;
  return applyLayers([...base, diocese]);
}
