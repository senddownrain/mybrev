/**
 * Calendar layers: universal → belarus → diocese → local.
 *
 * A layer never copies the universal calendar. It only holds
 *   add     – new celebrations,
 *   modify  – `{ id, changes }` patches of an inherited celebration,
 *   rules   – structured effects (`suppress`, `set`),
 *   notes   – Ordo notes scoped to the layer.
 */
import { LITURGICAL_RANK } from '../../constants/liturgical.js';
import { getDiocesanFixedLayers, getUniversalFixedCelebrations } from './fixedCelebrations.js';
import { MOVABLE_CELEBRATIONS, getCountryRules } from './movableFeasts.js';

export const LAYER_LEVELS = Object.freeze(['universal', 'belarus', 'diocese', 'local']);

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
    layers.push({
      id: 'belarus', level: 'belarus', add: all.filter((item) => item.layer === 'belarus'), modify: [], rules: [], notes: [],
    });
  }
  return layers;
}

/** Diocesan layer derived from `_place` fixed-calendar entries, merged with extra data. */
export function buildDiocesanLayer(dioceseId, extra = null) {
  const id = normalizeDioceseId(dioceseId);
  if (!id) return null;
  const derived = getDiocesanFixedLayers()[id] || { id, level: 'diocese', add: [], modify: [], rules: [], notes: [] };
  if (!extra) return { ...derived, dioceseId: id };
  return {
    ...derived,
    dioceseId: id,
    add: [...derived.add, ...(extra.add || [])],
    modify: [...derived.modify, ...(extra.modify || [])],
    rules: [...derived.rules, ...(extra.rules || [])],
    notes: [...derived.notes, ...(extra.notes || [])],
  };
}

/**
 * LocalChurchContext → local layer. Title, principal patron and the
 * dedication anniversary of the own church are proper solemnities (row 4);
 * in the cathedral the diocesan dedication feast is a solemnity too.
 *
 * @param {{ id?: string, titleCelebrationId?: string, patronCelebrationId?: string,
 *   dedicationDate?: string|{month:number, day:number}, isCathedral?: boolean,
 *   dedicationTitle?: string }} localChurch
 */
export function buildLocalLayer(localChurch, celebrations) {
  if (!localChurch) return null;
  const layer = { id: `local:${localChurch.id || 'church'}`, level: 'local', add: [], modify: [], rules: [], notes: [] };
  const upgrade = (celebrationId, properKind) => {
    const base = celebrations.get(celebrationId);
    if (!base) {
      layer.rules.push({ type: 'warning', message: `Unknown local celebration ${celebrationId}` });
      return;
    }
    // A solemnity of the General Calendar (row 3) already outranks row 4.
    const changes = base.rank === LITURGICAL_RANK.SOLEMNITY && base.layer === 'universal'
      ? { localRole: properKind, layer: base.layer }
      : { rank: LITURGICAL_RANK.SOLEMNITY, properKind, localRole: properKind, layer: 'local', precedence: undefined };
    layer.modify.push({ id: celebrationId, changes });
  };
  if (localChurch.titleCelebrationId) upgrade(localChurch.titleCelebrationId, 'title-own-church');
  if (localChurch.patronCelebrationId && localChurch.patronCelebrationId !== localChurch.titleCelebrationId) {
    upgrade(localChurch.patronCelebrationId, 'principal-patron-place');
  }
  if (localChurch.isCathedral) {
    [...celebrations.values()]
      .filter((item) => item.properKind === 'cathedral-dedication')
      .forEach((item) => layer.modify.push({
        id: item.id,
        changes: {
          rank: LITURGICAL_RANK.SOLEMNITY, properKind: 'dedication-own-church', localRole: 'dedication-own-church', layer: 'local',
        },
      }));
  }
  if (localChurch.dedicationDate) {
    const parts = typeof localChurch.dedicationDate === 'string'
      ? localChurch.dedicationDate.split(/[-.]/).map(Number)
      : [localChurch.dedicationDate.month, localChurch.dedicationDate.day];
    const [month, day] = typeof localChurch.dedicationDate === 'string' && localChurch.dedicationDate.includes('.')
      ? [parts[1], parts[0]]
      : parts;
    const date = `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}`;
    layer.add.push({
      id: 'local-church-dedication',
      title: localChurch.dedicationTitle || 'Гадавіна пасвячэння ўласнага касцёла',
      rank: LITURGICAL_RANK.SOLEMNITY,
      category: 'dedication',
      layer: 'local',
      properKind: 'dedication-own-church',
      localRole: 'dedication-own-church',
      color: 'albus',
      date: { type: 'fixed', month, day },
      // No fixed `days` document: the Common of the dedication of a church.
      daysRef: { source: 'template', template: 'church-dedication', _date: date },
      readingsRef: { common: 'church-dedication' },
    });
  }
  return layer;
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
      const level = layer.level === 'local' ? 'local' : layer.level;
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
 * Full layered calendar for a context:
 * `{ country, diocese, localChurch, dioceseLayer? }`.
 */
export function buildCalendarLayers(context = {}) {
  const base = buildBaseLayers(context.country || 'BY');
  const diocese = context.diocese ? buildDiocesanLayer(context.diocese, context.dioceseLayer) : null;
  const first = applyLayers([...base, diocese]);
  const local = buildLocalLayer(context.localChurch, first.celebrations);
  if (!local) return first;
  const withLocal = applyLayers([local], first.celebrations);
  return {
    celebrations: withLocal.celebrations,
    appliedLayers: [...first.appliedLayers, ...withLocal.appliedLayers],
    layerNotes: [...first.layerNotes, ...withLocal.layerNotes],
  };
}
