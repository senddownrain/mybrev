/**
 * Calendar layers: universal → belarus → diocese.
 *
 * A layer never copies the universal calendar. It only holds
 *   add     – new celebrations,
 *   modify  – `{ id, changes }` patches of an inherited celebration,
 *   rules   – structured effects (`suppress`, `set`),
 *   notes   – Ordo notes scoped to the layer.
 *
 * The layers are built from the calendar definitions (`definitions.js`):
 * Firestore documents when published, else the bundled snapshot. The code
 * that derives the definitions from `fixedCalendar.js` lives in `seed.js`
 * and is not part of the runtime.
 */
import { getCalendarDefinitions, layersFromDefinitions } from './definitions.js';

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
 * `dioceseLayer` is an extra diocesan layer record (tests, previews).
 */
export function buildCalendarLayers(context = {}) {
  const { base, diocese } = layersFromDefinitions(getCalendarDefinitions(), {
    country: context.country || 'BY',
    diocese: normalizeDioceseId(context.diocese),
  });
  const layers = [diocese];
  if (context.dioceseLayer && normalizeDioceseId(context.diocese)) {
    layers.push({
      id: normalizeDioceseId(context.diocese), level: 'diocese', dioceseId: normalizeDioceseId(context.diocese),
      add: [], modify: [], rules: [], notes: [], ...context.dioceseLayer,
    });
  }
  const result = applyLayers(layers, base.celebrations);
  return {
    celebrations: result.celebrations,
    appliedLayers: [...base.appliedLayers, ...result.appliedLayers],
    layerNotes: result.layerNotes,
  };
}
