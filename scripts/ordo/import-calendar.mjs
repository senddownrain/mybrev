#!/usr/bin/env node
/**
 * Plan (default) or apply the import of the permanent calendar into Firestore.
 *
 *   npm run ordo:import-calendar                 # dry run: read-only diff, backup, plan
 *   npm run ordo:import-calendar -- --offline    # plan without any Firestore access
 *   npm run ordo:import-calendar -- --apply      # create / update documents
 *   npm run ordo:import-calendar -- --apply --prune --confirm prune-ordo-calendar
 *
 * Collections:
 *   liturgicalCelebrations, liturgicalDioceseOverrides   ← src/data/ordo/calendar-definitions.json
 *   liturgicalOrdoNotes                                  ← src/data/ordo/notes.json
 *   liturgicalYearOverrides                              ← seed overrides, CREATE ONLY
 *   liturgicalCalendarMeta/current                       ← written last
 *
 * Safety: nothing is deleted by default (obsolete documents are only listed);
 * manual year overrides are never overwritten; every run writes a plan to
 * `reports/` and, when Firestore was read, a backup of the current documents
 * to `backups/ordo-calendar/`. The service-account key is never printed.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PRUNE_CONFIRMATION = 'prune-ordo-calendar';

export const COLLECTIONS = Object.freeze({
  celebrations: 'liturgicalCelebrations',
  dioceseOverrides: 'liturgicalDioceseOverrides',
  notes: 'liturgicalOrdoNotes',
  yearOverrides: 'liturgicalYearOverrides',
  meta: 'liturgicalCalendarMeta',
});

const NOTE_FIELDS = ['scope', 'selector', 'category', 'tags', 'title', 'text', 'books', 'variants', 'effect', 'displayOnly',
  'classification', 'confidence', 'validFrom', 'validUntil', 'yearMarkers'];

/** Runtime part of a note: the evidence (`observed`) stays in the repository. */
export function noteDocument(note) {
  return Object.fromEntries(NOTE_FIELDS.filter((field) => note[field] !== undefined).map((field) => [field, note[field]]));
}

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
};
const METADATA_FIELDS = new Set(['importedAt', 'createdAt', 'updatedAt']);
const comparable = (data) => JSON.stringify(stable(Object.fromEntries(
  Object.entries(data || {}).filter(([key]) => !METADATA_FIELDS.has(key)),
)));

/**
 * Diff of one collection. `existing`: `[{ id, data }]` or null (not read).
 * `createOnly`: existing documents are never updated (manual year overrides).
 */
export function planCollection(collection, target, existing, { createOnly = false } = {}) {
  const current = existing ? new Map(existing.map((item) => [item.id, item.data])) : null;
  const targetIds = new Set(target.map((item) => item.id));
  const operations = target.map((item) => {
    if (!current) return { id: item.id, action: 'set' };
    if (!current.has(item.id)) return { id: item.id, action: 'create' };
    if (createOnly) return { id: item.id, action: 'keep-existing' };
    return { id: item.id, action: comparable(current.get(item.id)) === comparable(item.data) ? 'unchanged' : 'update' };
  });
  const obsolete = current ? [...current.keys()].filter((id) => !targetIds.has(id)) : [];
  const count = (action) => operations.filter((item) => item.action === action).length;
  return {
    collection,
    read: Boolean(current),
    counts: {
      target: target.length,
      create: count('create'), update: count('update'), unchanged: count('unchanged'),
      set: count('set'), keepExisting: count('keep-existing'),
      // Manual documents of a create-only collection are not obsolete.
      obsolete: createOnly ? 0 : obsolete.length,
      delete: 0,
    },
    operations,
    obsolete: createOnly ? [] : obsolete,
  };
}

/** Target documents of every collection. */
export function buildTargets({ definitions, notes }) {
  const strip = ({ id, ...data }) => ({ id, data });
  return {
    celebrations: definitions.celebrations.map(strip),
    dioceseOverrides: definitions.dioceseOverrides.map(strip),
    notes: notes.notes.map((note) => ({ id: note.id, data: noteDocument(note) })),
    yearOverrides: definitions.yearOverrides.map(strip),
    meta: {
      id: 'current',
      data: {
        schemaVersion: definitions.schemaVersion,
        revision: definitions.revision,
        notesRevision: Number(notes.revision) || 1,
      },
    },
  };
}

function parseArgs(argv) {
  const options = {
    apply: false, prune: false, offline: false, confirm: '',
    serviceAccount: path.join(ROOT, 'patchs', 'serviceAccountKey.json'),
    output: path.join(ROOT, 'reports', 'ordo-calendar-import-plan.json'),
    backupDir: path.join(ROOT, 'backups', 'ordo-calendar'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--prune') options.prune = true;
    else if (arg === '--offline') options.offline = true;
    else if (['--confirm', '--service-account', '--output', '--backup-dir'].includes(arg)) {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      const key = { '--confirm': 'confirm', '--service-account': 'serviceAccount', '--output': 'output', '--backup-dir': 'backupDir' }[arg];
      options[key] = key === 'confirm' ? value : path.resolve(value);
    } else throw new Error(`Unknown option: ${arg}`);
  }
  if (options.apply && options.offline) throw new Error('--apply needs Firestore; remove --offline.');
  if (options.prune && options.confirm !== PRUNE_CONFIRMATION) {
    throw new Error(`--prune deletes documents. Repeat with --confirm ${PRUNE_CONFIRMATION}`);
  }
  return options;
}

async function openFirestore(serviceAccountPath) {
  const [{ default: admin }, credentials] = await Promise.all([
    import('firebase-admin'), fs.promises.readFile(serviceAccountPath, 'utf8'),
  ]);
  const serviceAccount = JSON.parse(credentials);
  const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id }, `ordo-calendar-${Date.now()}`);
  return { admin, app, firestore: admin.firestore(app), projectId: serviceAccount.project_id };
}

async function readCollection(firestore, name) {
  const snapshot = await firestore.collection(name).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
}

async function commitInBatches(firestore, writes, size = 400) {
  for (let index = 0; index < writes.length; index += size) {
    const batch = firestore.batch();
    writes.slice(index, index + size).forEach((write) => write(batch));
    await batch.commit();
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const definitions = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ordo/calendar-definitions.json'), 'utf8'));
  const notes = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ordo/notes.json'), 'utf8'));
  const targets = buildTargets({ definitions, notes });

  let connection = null;
  let existing = null;
  if (!options.offline) {
    if (!fs.existsSync(options.serviceAccount)) {
      if (options.apply) throw new Error('Service-account key not found; cannot apply.');
      console.log('No service-account key: planning without reading Firestore (same as --offline).');
    } else {
      connection = await openFirestore(options.serviceAccount);
    }
  }

  try {
    if (connection) {
      const names = ['celebrations', 'dioceseOverrides', 'notes', 'yearOverrides'];
      const lists = await Promise.all(names.map((key) => readCollection(connection.firestore, COLLECTIONS[key])));
      const meta = await connection.firestore.collection(COLLECTIONS.meta).doc('current').get();
      existing = { ...Object.fromEntries(names.map((key, index) => [key, lists[index]])), meta: meta.exists ? meta.data() : null };
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.mkdirSync(options.backupDir, { recursive: true });
      const backupPath = path.join(options.backupDir, `${stamp}.json`);
      fs.writeFileSync(backupPath, `${JSON.stringify({ projectId: connection.projectId, takenAt: new Date().toISOString(), ...existing }, null, 1)}\n`);
      console.log(`backup: ${path.relative(ROOT, backupPath)}`);
    }

    const plans = {
      celebrations: planCollection(COLLECTIONS.celebrations, targets.celebrations, existing?.celebrations || null),
      dioceseOverrides: planCollection(COLLECTIONS.dioceseOverrides, targets.dioceseOverrides, existing?.dioceseOverrides || null),
      notes: planCollection(COLLECTIONS.notes, targets.notes, existing?.notes || null),
      yearOverrides: planCollection(COLLECTIONS.yearOverrides, targets.yearOverrides, existing?.yearOverrides || null, { createOnly: true }),
    };
    if (options.prune) Object.values(plans).forEach((plan) => { plan.counts.delete = plan.obsolete.length; });
    const report = {
      generatedAt: new Date().toISOString(),
      mode: options.apply ? 'apply' : 'dry-run',
      projectId: connection?.projectId || null,
      firestoreRead: Boolean(existing),
      policy: 'create/update only; obsolete documents are deleted only with --prune --confirm; year overrides are create-only; meta is written last',
      meta: { current: existing?.meta || null, target: targets.meta.data },
      summary: Object.fromEntries(Object.entries(plans).map(([key, plan]) => [key, plan.counts])),
      plans,
    };
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, `${JSON.stringify(report, null, 1)}\n`);
    console.log(JSON.stringify(report.summary, null, 1));
    console.log(`plan: ${path.relative(ROOT, options.output)}`);

    if (!options.apply) {
      console.log('Dry run only. Nothing was written to Firestore.');
      return report;
    }

    const { firestore, admin } = connection;
    const importedAt = admin.firestore.FieldValue.serverTimestamp();
    const writes = [];
    Object.entries(plans).forEach(([key, plan]) => {
      const byId = new Map(targets[key].map((item) => [item.id, item.data]));
      plan.operations.filter((item) => ['create', 'update', 'set'].includes(item.action)).forEach((item) => {
        writes.push((batch) => batch.set(firestore.collection(plan.collection).doc(item.id), { ...byId.get(item.id), importedAt }));
      });
      if (options.prune) {
        plan.obsolete.forEach((id) => writes.push((batch) => batch.delete(firestore.collection(plan.collection).doc(id))));
      }
    });
    await commitInBatches(firestore, writes);
    // merge: the other publication revisions (properTextsRevision, templatesRevision) stay.
    await firestore.collection(COLLECTIONS.meta).doc('current').set({ ...targets.meta.data, publishedAt: importedAt }, { merge: true });
    const result = { written: writes.length, meta: targets.meta.data };
    fs.writeFileSync(options.output.replace(/\.json$/, '-result.json'), `${JSON.stringify(result, null, 1)}\n`);
    console.log(JSON.stringify(result));
    return report;
  } finally {
    if (connection) await connection.app.delete();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
