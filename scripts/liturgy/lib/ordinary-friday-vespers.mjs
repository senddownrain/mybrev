import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export const TARGET = 'ordinary-w30-d6';
export const SOURCE = 'ordinary-w2-d6';
export const FEAST = '01-11-all-saints';
export const VESPER_FIELDS = Object.freeze([
  'Hymn', 'Ant1', 'Ant2', 'Ant3', 'Ps1', 'Ps2', 'Ps3', 'R', 'AntMag', 'Inter', 'Pr',
].map((suffix) => `vesper${suffix}`));
export const fingerprint = (value) => ({
  empty: typeof value !== 'string' || !value.trim(),
  bytes: Buffer.byteLength(value ?? ''),
  sha256: createHash('sha256').update(value ?? '').digest('hex'),
});

function updateTimeOf(value) {
  if (typeof value === 'string') return value;
  if (value?.__firestoreType === 'timestamp') {
    return new Date(value.seconds * 1000).toISOString().replace('.000Z', `.${String(value.nanoseconds).padStart(9, '0')}Z`);
  }
  throw new Error('Unsupported updateTime');
}

export function fridayCommit(plan, project) {
  const name = (id) => `projects/${project}/databases/(default)/documents/days/${id}`;
  return { writes: [
    ...[SOURCE, FEAST].map((id) => ({ verify: name(id), currentDocument: { updateTime: plan.preconditions[id] } })),
    { update: { name: name(TARGET), fields: Object.fromEntries(Object.entries(plan.fields).map(([k, v]) => [k, { stringValue: v }])) },
      updateMask: { fieldPaths: Object.keys(plan.fields) }, currentDocument: { updateTime: plan.preconditions[TARGET] } },
  ] };
}

/** Fail closed: only the proved All Saints contamination may be replaced. */
export function planFridayVespers(entries) {
  const get = (id) => {
    const entry = entries.find((item) => item.id === id);
    if (!entry?.data || !entry.updateTime) throw new Error(`Missing document/updateTime: ${id}`);
    return entry;
  };
  const target = get(TARGET), source = get(SOURCE), feast = get(FEAST);
  for (const [entry, week] of [[target, 30], [source, 2]]) {
    if (entry.data._periodType !== 'ordinary' || Number(entry.data._periodWeekNumber) !== week
      || Number(entry.data._dayOfWeek) !== 6) throw new Error(`Unexpected selectors: ${entry.id}`);
  }
  const fields = {};
  const comparison = VESPER_FIELDS.map((field) => {
    const first = field.replace(/^vesper/, 'vesper1');
    const before = target.data[field], after = source.data[field], proper = feast.data[first];
    if ([before, after, proper].some((value) => typeof value !== 'string' || !value.trim())) {
      throw new Error(`Missing text: ${field}`);
    }
    const changed = before !== after;
    if (changed && before !== proper) throw new Error(`Unrecognized contamination: ${field}`);
    if (changed) fields[field] = after;
    return { field, before: fingerprint(before), after: fingerprint(after), first: fingerprint(proper),
      equalsPsalter: before === after, equalsAllSaintsFirst: before === proper, changed };
  });
  return { schemaVersion: 1, target: TARGET, source: SOURCE, feast: FEAST,
    preconditions: Object.fromEntries([target, source, feast].map((entry) => [entry.id, updateTimeOf(entry.updateTime)])),
    fields, comparison,
    vesperDocuments: Object.fromEntries([target, source, feast].map((entry) => [entry.id,
      Object.fromEntries([...new Set(entries.flatMap((item) => Object.keys(item.data).filter((field) => field.startsWith('vesper'))))]
        .sort().map((field) => [field, { present: Object.hasOwn(entry.data, field), ...fingerprint(entry.data[field]) }])),
    ])),
  };
}

/** Only a previously reviewed plan can be applied; stale input aborts before writing. */
export async function applyFridayVespers(reviewed, { read, backup, commit }) {
  const entries = await read();
  const current = planFridayVespers(entries);
  if (!isDeepStrictEqual(current, reviewed)) throw new Error('Reviewed plan is stale; run a new dry-run.');
  if (!Object.keys(current.fields).length) return { updated: false };
  // Backup failure must prevent the commit.
  await backup(entries);
  await commit(current);
  const after = (await read()).find((entry) => entry.id === TARGET);
  const before = entries.find((entry) => entry.id === TARGET);
  if (!isDeepStrictEqual(after?.data, { ...before.data, ...current.fields })) {
    throw new Error('Post-write verification failed; inspect backup before any further action.');
  }
  return { updated: true, fields: Object.keys(current.fields), updateTime: after.updateTime };
}
