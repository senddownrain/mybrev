/**
 * Materialized transfers (final phase §12).
 *
 * The engine computes every transfer (`transfers.js`). For the cases that are
 * sensitive to the annual published Ordo the computed result is written into
 * `liturgicalYearOverrides` as an editable record with provenance:
 *
 *   {
 *     id: 'auto-transfer-<year>-<scope>-<celebrationId>',
 *     year, scope: 'belarus'|'diocese', dioceseId?, targetCelebrationId,
 *     action: 'move', originalDate, computedDate, effectiveDate,
 *     from, to,                    (mirror of originalDate / effectiveDate)
 *     reason, transferRule, transferCase, rankEvidence?, generator,
 *     source: 'auto-transfer', status: 'needs-review', enabled: true
 *   }
 *
 * After a manual correction: `source: 'manual'`, `status: 'confirmed'`,
 * `computedDate` stays the algorithm's date, `effectiveDate` is the user's.
 *
 * Reconciliation is idempotent:
 *   - a missing record is created;
 *   - an unchanged record is left alone (no duplicate);
 *   - a manual / confirmed record is never overwritten;
 *   - when the algorithm result changes, `computedDate` (and the effective
 *     date that follows it) is updated only while the record is
 *     `needs-review` from `auto-transfer`;
 *   - an auto record the algorithm no longer produces is reported as stale.
 *
 * Pure: no Firestore. `scripts/ordo/materialize-transfer-overrides.mjs` reads
 * the existing documents, writes the plan and (with `--apply`) the records.
 */
import { getYearPlan } from './yearPlan.js';
import { normalizeYearOverride, isTransferOverride } from './yearOverrides.js';
import { normalizeDioceseId } from './layers.js';
import { rankEvidenceOf } from '../../data/ordo/transfer-rank-evidence.js';

export const TRANSFER_DIOCESES = Object.freeze(['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno']);

/** Version of the materialization; raise when the record shape changes. */
export const TRANSFER_MATERIALIZATION_VERSION = 1;

export const TRANSFER_CASES = Object.freeze({
  'diocesan-solemnity': 'A. Уласная ўрачыстасць дыяцэзіі (ранг пацверджаны календаром)',
  'joseph-holy-week': 'B. Св. Юзаф у Вялікім тыдні',
  annunciation: 'C. Звеставанне Пана',
  'coinciding-solemnities': 'D. Супадзенне дзвюх урачыстасцяў агульнага календара',
  'impeded-solemnity': 'Урачыстасць, якой перашкаджае дзень з большым першынством',
});

const REASONS = Object.freeze({
  'joseph-anticipated-before-palm-sunday': 'St Joseph falls in Holy Week: anticipated to the Saturday before Palm Sunday (CDW 2008)',
  'annunciation-after-easter-octave': 'Annunciation impeded by Holy Week / the Easter octave: Monday after the II Sunday of Easter',
  'impeded-by-day': 'Solemnity impeded by a day of higher precedence: nearest free day (GNLYC 60)',
  'impeded-by-celebration': 'Solemnity impeded by a celebration of higher precedence: nearest free day (GNLYC 60)',
});

/** Which §12 case a computed transfer belongs to. */
export function transferCase(transfer, celebration, impeding = null) {
  if (transfer.rule === 'joseph-anticipated-before-palm-sunday') return 'joseph-holy-week';
  if (celebration?.id === 'annunciation-lord') return 'annunciation';
  if (celebration?.layer === 'diocese') return 'diocesan-solemnity';
  if (transfer.rule === 'impeded-by-celebration' && impeding?.category === 'lord') return 'coinciding-solemnities';
  return 'impeded-solemnity';
}

const scopeKey = (record) => (record.scope === 'diocese' ? normalizeDioceseId(record.dioceseId) : record.scope);

export function transferOverrideId(record) {
  return `auto-transfer-${record.year}-${scopeKey(record)}-${record.targetCelebrationId}`;
}

/** The celebration that impeded `celebrationId` on `iso` (for the reason text / case D). */
function impedingCelebration(plan, celebrationId, iso) {
  const list = (plan.byDate.get(iso) || []).filter((item) => item.celebration.id !== celebrationId && !item.transferredOut);
  return list.sort((a, b) => a.precedence - b.precedence)[0]?.celebration || null;
}

/**
 * Transfers the pure algorithm computes for one year and diocese (stored
 * transfer overrides ignored, other year overrides applied).
 */
export function computedTransfers(year, { diocese, yearOverrides = [], dataYearOverrides = true } = {}) {
  const plan = getYearPlan(Number(year), {
    country: 'BY', diocese, yearOverrides, dataYearOverrides, ignoreTransferOverrides: true,
  });
  return plan.transfers.map((transfer) => {
    const celebration = plan.celebrations.get(transfer.celebrationId) || null;
    const impeding = transfer.rule === 'impeded-by-celebration' ? impedingCelebration(plan, transfer.celebrationId, transfer.from) : null;
    return {
      ...transfer,
      title: celebration?.title || transfer.celebrationId,
      layer: celebration?.layer || 'universal',
      ...(celebration?.dioceseId ? { dioceseId: celebration.dioceseId } : {}),
      ...(impeding ? { impededBy: impeding.id } : {}),
      transferCase: transferCase(transfer, celebration, impeding),
    };
  });
}

function recordOf(year, transfer, scope, dioceseId = null) {
  const record = {
    year: Number(year),
    scope,
    ...(scope === 'diocese' ? { dioceseId } : {}),
    targetCelebrationId: transfer.celebrationId,
    action: 'move',
    originalDate: transfer.from,
    computedDate: transfer.computedDate || transfer.to,
    effectiveDate: transfer.computedDate || transfer.to,
    from: transfer.from,
    to: transfer.computedDate || transfer.to,
    reason: `${REASONS[transfer.rule] || 'Computed transfer'}${transfer.impededBy ? ` (impeded by ${transfer.impededBy})` : ''}`,
    transferRule: transfer.rule,
    transferCase: transfer.transferCase,
    ...(transfer.transferCase === 'diocesan-solemnity'
      ? { rankEvidence: rankEvidenceOf(dioceseId || transfer.dioceseId, transfer.celebrationId) } : {}),
    source: 'auto-transfer',
    status: 'needs-review',
    enabled: true,
    generator: { kind: 'auto-transfer', version: TRANSFER_MATERIALIZATION_VERSION },
  };
  return { id: transferOverrideId(record), ...record };
}

/**
 * Target auto records for a range of years: one Belarus-wide record when
 * every diocese computes the same transfer of a non-diocesan celebration,
 * else one record per diocese.
 *
 * @param {{ years: number[], dioceses?: string[], yearOverrides?: object[], dataYearOverrides?: boolean }} options
 *   `yearOverrides`: the stored (non-transfer) overrides that shape the year.
 */
export function buildTransferOverrideTargets({
  years, dioceses = TRANSFER_DIOCESES, yearOverrides = [], dataYearOverrides = true,
}) {
  const others = yearOverrides.filter((item) => !isTransferOverride(normalizeYearOverride(item)));
  const targets = [];
  years.forEach((year) => {
    const byKey = new Map();
    dioceses.forEach((diocese) => {
      computedTransfers(year, { diocese, yearOverrides: others, dataYearOverrides }).forEach((transfer) => {
        const key = `${transfer.celebrationId}|${transfer.from}`;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push({ diocese, transfer });
      });
    });
    [...byKey.values()].forEach((entries) => {
      const first = entries[0].transfer;
      const same = entries.length === dioceses.length
        && entries.every(({ transfer }) => transfer.computedDate === first.computedDate && transfer.rule === first.rule);
      if (same && first.layer !== 'diocese' && dioceses.length === TRANSFER_DIOCESES.length) {
        targets.push(recordOf(year, first, 'belarus'));
      } else {
        entries.forEach(({ diocese, transfer }) => targets.push(recordOf(year, transfer, 'diocese', diocese)));
      }
    });
  });
  return targets.sort((a, b) => a.year - b.year || a.originalDate.localeCompare(b.originalDate) || a.id.localeCompare(b.id));
}

const sameIdentity = (a, b) => Number(a.year) === Number(b.year)
  && a.scope === b.scope
  && (a.scope !== 'diocese' || normalizeDioceseId(a.dioceseId) === normalizeDioceseId(b.dioceseId))
  && a.targetCelebrationId === b.targetCelebrationId
  && (!a.originalDate || !b.originalDate || a.originalDate === b.originalDate);

/** Existing document (`{ id, data }`) that represents a target record. */
function findExisting(target, existing) {
  return existing.find((item) => item.id === target.id)
    || existing.find((item) => item.data.action === 'move' && sameIdentity(normalizeYearOverride(item.data), target))
    || null;
}

const COMPARED = ['year', 'scope', 'dioceseId', 'targetCelebrationId', 'action', 'originalDate', 'computedDate',
  'effectiveDate', 'from', 'to', 'transferRule', 'transferCase', 'source', 'status', 'enabled'];
const comparable = (record) => JSON.stringify(COMPARED.map((key) => record[key] ?? null));

/**
 * Reconcile the target records with the existing documents.
 *
 * @param {object[]} targets   `buildTransferOverrideTargets()`
 * @param {{ id: string, data: object }[]} existing  current `liturgicalYearOverrides`
 * @param {{ years?: number[] }} [options]  years covered (for stale detection)
 * @returns {{ operations: object[], counts: object, documents: { id, data }[] }}
 *   `documents`: the collection after applying the plan (for tests / dry runs).
 */
export function planTransferOverrides(targets, existing = [], { years = null } = {}) {
  const operations = [];
  const result = new Map(existing.map((item) => [item.id, item.data]));
  const matched = new Set();
  targets.forEach((target) => {
    const found = findExisting(target, existing);
    if (!found) {
      operations.push({ id: target.id, targetId: target.id, action: 'create', record: target });
      result.set(target.id, target);
      return;
    }
    matched.add(found.id);
    const current = normalizeYearOverride(found.data);
    const autoPending = current.source === 'auto-transfer' && current.status === 'needs-review';
    if (!autoPending) {
      operations.push({
        id: found.id,
        targetId: target.id,
        action: 'keep-manual',
        ...(current.computedDate !== target.computedDate
          ? { note: 'algorithm result differs; confirmed decision kept', computedDate: target.computedDate, storedComputedDate: current.computedDate || null }
          : {}),
        effectiveDate: current.effectiveDate,
      });
      return;
    }
    const next = {
      ...found.data,
      ...target,
      id: undefined,
      // Disabled stays disabled: the administrator switched it off.
      enabled: found.data.enabled !== false,
    };
    delete next.id;
    if (comparable(normalizeYearOverride(found.data)) === comparable(next)) {
      operations.push({ id: found.id, targetId: target.id, action: 'unchanged' });
      return;
    }
    operations.push({
      id: found.id,
      targetId: target.id,
      action: 'update',
      changes: COMPARED.filter((key) => (current[key] ?? null) !== (next[key] ?? null))
        .map((key) => ({ field: key, from: current[key] ?? null, to: next[key] ?? null })),
      record: next,
    });
    result.set(found.id, next);
  });
  // Auto records of the covered years that the algorithm no longer produces.
  existing
    .filter((item) => !matched.has(item.id))
    .filter((item) => item.data.source === 'auto-transfer' && item.data.status !== 'confirmed')
    .filter((item) => !years || years.includes(Number(item.data.year)))
    .forEach((item) => operations.push({ id: item.id, action: 'stale', note: 'not produced by the algorithm any more; left untouched' }));
  const count = (action) => operations.filter((item) => item.action === action).length;
  return {
    operations,
    counts: {
      targets: targets.length,
      create: count('create'),
      update: count('update'),
      unchanged: count('unchanged'),
      keepManual: count('keep-manual'),
      stale: count('stale'),
    },
    documents: [...result.entries()].map(([id, data]) => ({ id, data })),
  };
}

/** Is a stored override an auto record still awaiting review? */
export const isPendingAutoTransfer = (override) => {
  const value = normalizeYearOverride(override);
  return value?.source === 'auto-transfer' && value.status === 'needs-review';
};

/**
 * Admin edit of a materialized transfer: the user's date becomes effective,
 * the computed date and the provenance stay.
 */
export function confirmTransferOverride(override, { effectiveDate, reason, sourceNote } = {}) {
  const current = normalizeYearOverride(override);
  const date = effectiveDate || current.effectiveDate;
  return {
    ...current,
    effectiveDate: date,
    to: date,
    computedDate: current.computedDate || current.effectiveDate,
    source: 'manual',
    status: 'confirmed',
    ...(reason ? { reason } : {}),
    ...(sourceNote ? { sourceNote } : {}),
  };
}
