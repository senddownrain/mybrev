#!/usr/bin/env node
/**
 * Plan (default) or apply the import of the generated Hours content.
 *
 *   npm run ordo:import-feasts                      # dry run: read-only diff, backup, plan
 *   npm run ordo:import-feasts -- --offline         # plan without any Firestore access
 *   npm run ordo:import-feasts -- --apply                     # templates + liturgicalProperTexts
 *   npm run ordo:import-feasts -- --apply --only templates
 *   npm run ordo:import-feasts -- --apply --target days --confirm import-sparse-feasts [--mark-obsolete]
 *
 *   patchs/db-templates → liturgicalTemplates/{templateId}
 *   patchs/db-feasts    → liturgicalProperTexts/{id}   (default; sparse, `_schema: 2`)
 *                       → days/{id}                    (`--target days`: legacy collection)
 *
 * Safety:
 *  - nothing is deleted. The per-template copies a sparse document replaces
 *    (`_legacyIds`) are only listed; `--mark-obsolete` sets `_obsolete: true`
 *    on them (the runtime then ignores them), which is reversible;
 *  - `liturgicalProperTexts` is read only by the web that assembles the Office,
 *    so it is the default target; sparse documents in `days` are unreadable
 *    for clients released before the Office assembly, so `--target days`
 *    needs `--confirm import-sparse-feasts`;
 *  - after an apply the publication revisions in `liturgicalCalendarMeta/current`
 *    (`properTextsRevision`, `templatesRevision`) are bumped and the run is
 *    recorded in `reports/liturgical-firestore-migration.json`;
 *  - every run writes a plan to `reports/` and, when Firestore was read, a
 *    backup of the touched documents to `backups/ordo-feasts/`.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { planCollection } from './import-calendar.mjs';
import { recordMigration } from '../liturgy/lib/migration-report.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FEASTS_CONFIRMATION = 'import-sparse-feasts';
/** Documents that a scoped template import must never touch (not part of the seasonal Commons work). */
export const PROTECTED_TEMPLATE_IDS = Object.freeze(['office-for-dead', 'sunday-week-1', 'complementary-psalmody']);

/**
 * `--ids a,b,c` (with `--only templates`): restrict the template import to an explicit allowlist. Unknown ids, protected
 * ids and an empty list are refused; the plan, the backup and the writes then cover exactly these documents.
 */
export function scopeTemplateIds(templates, ids) {
  const wanted = [...new Set(String(ids || '').split(',').map((id) => id.trim()).filter(Boolean))];
  if (!wanted.length) throw new Error('--ids needs at least one template id');
  const known = new Set(templates.map((item) => item.id));
  const unknown = wanted.filter((id) => !known.has(id));
  if (unknown.length) throw new Error(`--ids: unknown template id(s): ${unknown.join(', ')}`);
  const protectedIds = wanted.filter((id) => PROTECTED_TEMPLATE_IDS.includes(id));
  if (protectedIds.length) throw new Error(`--ids: protected template id(s) cannot be imported by a scoped run: ${protectedIds.join(', ')}`);
  return { ids: wanted, templates: templates.filter((item) => wanted.includes(item.id)) };
}


const SERVICE_FIELDS = new Set(['importedAt']);
const isPlain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && !(typeof value.toDate === 'function') && !(typeof value.isEqual === 'function');

/**
 * Field paths (dot notation) that exist in the LIVE document but not in the generated one. `batch.set` replaces the whole
 * document, so each of them would be deleted. Only plain objects are walked; arrays and scalars are leaves. Service fields
 * written by the importer itself (`importedAt`) are ignored at the top level.
 */
export function liveOnlyPaths(live, target, prefix = '', top = true) {
  const paths = [];
  for (const key of Object.keys(live || {})) {
    if (top && SERVICE_FIELDS.has(key)) continue;
    const here = prefix ? `${prefix}.${key}` : key;
    if (!(key in (target || {}))) { paths.push(here); continue; }
    if (isPlain(live[key]) && isPlain(target[key])) paths.push(...liveOnlyPaths(live[key], target[key], here, false));
  }
  return paths;
}

const stableJson = (value) => JSON.stringify(value, (key, item) => (isPlain(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item));

/** Created / changed top-level and nested leaf paths between a live and a generated document. */
export function changedPaths(live, target, prefix = '') {
  const created = [];
  const changed = [];
  for (const key of Object.keys(target || {})) {
    const here = prefix ? `${prefix}.${key}` : key;
    if (!(key in (live || {}))) { created.push(here); continue; }
    if (isPlain(live[key]) && isPlain(target[key])) {
      const inner = changedPaths(live[key], target[key], here);
      created.push(...inner.created); changed.push(...inner.changed);
    } else if (stableJson(live[key]) !== stableJson(target[key])) changed.push(here);
  }
  return { created, changed };
}

/** Per-document contract of a scoped import: what is created, changed and — dangerous — deleted by a full `set`. */
export function diffScopedTemplates(targets, liveById) {
  return targets.map(({ id, data }) => {
    const live = liveById.get(id);
    if (!live) return { id, status: 'create', created: ['(whole document)'], changed: [], liveOnly: [] };
    const { created, changed } = changedPaths(live, data);
    const liveOnly = liveOnlyPaths(live, data);
    return { id, status: created.length || changed.length || liveOnly.length ? 'update' : 'unchanged', created, changed, liveOnly };
  });
}

/** Refuses a scoped apply while any document would lose a field that exists only in production. No override flag. */
export function assertScopedApplySafe(diff) {
  const blocked = diff.filter((item) => item.liveOnly.length);
  if (blocked.length) {
    const list = blocked.map((item) => `${item.id}: ${item.liveOnly.slice(0, 6).join(', ')}${item.liveOnly.length > 6 ? ` … (+${item.liveOnly.length - 6})` : ''}`).join('; ');
    throw new Error(`Refusing to apply: a full document write would delete fields that exist only in Firestore (${list}). Decide per field with the owner; there is no override flag.`);
  }
}

/**
 * Reads exactly what a scoped template import needs: the allowlisted `liturgicalTemplates/{id}` documents (one getAll) and
 * `liturgicalCalendarMeta/current` (the revision to bump). No collection scan, no `liturgicalProperTexts`, no `days`.
 * `reads` lists every request, so the report can state the number of documents requested.
 */
export async function readScopedState({ firestore, templates }) {
  const reads = [];
  const refs = templates.map((item) => firestore.collection('liturgicalTemplates').doc(item.id));
  const snaps = await firestore.getAll(...refs);
  reads.push({ collection: 'liturgicalTemplates', documentsRequested: refs.length, via: 'getAll(allowlist)' });
  const live = snaps.filter((doc) => doc.exists).map((doc) => ({ id: doc.id, data: doc.data() }));
  const metaSnap = await firestore.collection('liturgicalCalendarMeta').doc('current').get();
  reads.push({ collection: 'liturgicalCalendarMeta', documentsRequested: 1, via: 'doc(current).get()' });
  return { templates: live, days: [], meta: metaSnap.exists ? metaSnap.data() : null, reads };
}

const TARGET_COLLECTIONS = Object.freeze({ 'proper-texts': 'liturgicalProperTexts', days: 'days' });

const readDir = (dir) => fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort()
  .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));

/** Firestore body of a generated document (`_id` is the document id). */
export function documentOf({ _id, ...data }) {
  return { id: _id, data };
}

export function buildFeastTargets(root = ROOT) {
  const feasts = readDir(path.join(root, 'patchs', 'db-feasts'));
  return {
    templates: readDir(path.join(root, 'patchs', 'db-templates')).map(documentOf),
    // `_legacyIds` stays on the document: the Flutter app hides the former
    // per-template copies a sparse document replaces.
    feasts: feasts.map(documentOf),
    legacyIds: [...new Set(feasts.flatMap((doc) => (doc._legacyIds || []).filter((id) => id !== doc._id)))].sort(),
  };
}

function parseArgs(argv) {
  const options = {
    apply: false, offline: false, markObsolete: false, confirm: '', only: '', ids: '', target: 'proper-texts',
    serviceAccount: path.join(ROOT, 'patchs', 'serviceAccountKey.json'),
    output: path.join(ROOT, 'reports', 'ordo-feasts-import-plan.json'),
    backupDir: path.join(ROOT, 'backups', 'ordo-feasts'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--offline') options.offline = true;
    else if (arg === '--mark-obsolete') options.markObsolete = true;
    else if (['--confirm', '--only', '--ids', '--target', '--service-account', '--output', '--backup-dir'].includes(arg)) {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      const key = {
        '--confirm': 'confirm', '--only': 'only', '--ids': 'ids', '--target': 'target', '--service-account': 'serviceAccount', '--output': 'output', '--backup-dir': 'backupDir',
      }[arg];
      options[key] = ['confirm', 'only', 'ids', 'target'].includes(key) ? value : path.resolve(value);
    } else throw new Error(`Unknown option: ${arg}`);
  }
  if (options.only && !['templates', 'feasts'].includes(options.only)) throw new Error('--only takes templates or feasts');
  if (options.ids && options.only !== 'templates') throw new Error('--ids requires --only templates');
  if (options.apply && options.offline) throw new Error('--apply needs Firestore; remove --offline.');
  if (!TARGET_COLLECTIONS[options.target]) throw new Error('--target takes proper-texts or days');
  if (options.markObsolete && options.target !== 'days') throw new Error('--mark-obsolete applies to --target days only');
  const writesFeasts = options.apply && options.only !== 'templates' && options.target === 'days';
  if (writesFeasts && options.confirm !== FEASTS_CONFIRMATION) {
    throw new Error(`Sparse days documents break clients released before the Office assembly. Repeat with --confirm ${FEASTS_CONFIRMATION} (or --only templates).`);
  }
  return options;
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const options = parseArgs(argv);
  const targets = buildFeastTargets();
  if (options.ids) targets.templates = scopeTemplateIds(targets.templates, options.ids).templates;
  const feastsCollection = TARGET_COLLECTIONS[options.target];
  let connection = null;
  if (deps.connect && !options.offline) {
    connection = await deps.connect(); // tests: a mock Firestore, never the network
  } else if (!options.offline && fs.existsSync(options.serviceAccount)) {
    const [{ default: admin }, credentials] = await Promise.all([
      import('firebase-admin'), fs.promises.readFile(options.serviceAccount, 'utf8'),
    ]);
    const serviceAccount = JSON.parse(credentials);
    const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id }, `ordo-feasts-${Date.now()}`);
    connection = { admin, app, firestore: admin.firestore(app), projectId: serviceAccount.project_id };
  } else if (options.apply) {
    throw new Error('Service-account key not found; cannot apply.');
  } else if (!options.offline) {
    console.log('No service-account key: planning without reading Firestore (same as --offline).');
  }

  try {
    let existing = null;
    if (connection) {
      const { firestore } = connection;
      if (options.ids) {
        // Scoped template import: only the allowlisted documents and the meta document are read (see readScopedState).
        existing = await readScopedState({ firestore, templates: targets.templates });
      } else {
        const templates = (await firestore.collection('liturgicalTemplates').get()).docs.map((doc) => ({ id: doc.id, data: doc.data() }));
        // Only the documents this import touches are read: targets and legacy copies.
        const ids = [...targets.feasts.map((item) => item.id), ...(options.target === 'days' ? targets.legacyIds : [])];
        const days = [];
        for (let index = 0; index < ids.length; index += 300) {
          const snapshots = await firestore.getAll(...ids.slice(index, index + 300).map((id) => firestore.collection(feastsCollection).doc(id)));
          snapshots.filter((doc) => doc.exists).forEach((doc) => days.push({ id: doc.id, data: doc.data() }));
        }
        const meta = await firestore.collection('liturgicalCalendarMeta').doc('current').get();
        existing = { templates, days, meta: meta.exists ? meta.data() : null };
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.mkdirSync(options.backupDir, { recursive: true });
      const backupPath = path.join(options.backupDir, `${stamp}.json`);
      fs.writeFileSync(backupPath, `${JSON.stringify({ projectId: connection.projectId, takenAt: new Date().toISOString(), scope: options.ids ? targets.templates.map((item) => item.id) : 'all', ...existing }, null, 1)}\n`);
      console.log(`backup: ${path.relative(ROOT, backupPath)}`);
    }

    const legacy = new Set(targets.legacyIds);
    const existingTargets = existing ? existing.days.filter((doc) => !legacy.has(doc.id)) : null;
    const liveLegacy = existing ? existing.days.filter((doc) => legacy.has(doc.id)) : null;
    const plans = {
      templates: planCollection('liturgicalTemplates', targets.templates, existing?.templates || null),
      // Only target ids were read, so nothing else can be reported obsolete.
      feasts: options.ids ? planCollection(feastsCollection, [], []) : planCollection(feastsCollection, targets.feasts, existingTargets),
    };
    const scopedDiff = options.ids && existing ? diffScopedTemplates(targets.templates, new Map(existing.templates.map((item) => [item.id, item.data]))) : null;
    const obsolete = options.ids ? [] : liveLegacy
      ? liveLegacy.map((doc) => ({ id: doc.id, alreadyObsolete: doc.data._obsolete === true }))
      : targets.legacyIds.map((id) => ({ id, alreadyObsolete: null }));
    const report = {
      generatedAt: new Date().toISOString(),
      mode: options.apply ? 'apply' : 'dry-run',
      projectId: connection?.projectId || null,
      firestoreRead: Boolean(existing),
      scope: options.ids ? { ids: targets.templates.map((item) => item.id), reads: existing?.reads || [], documentsRequested: (existing?.reads || []).reduce((sum, item) => sum + item.documentsRequested, 0), note: 'documents requested by the script; the billed reads are known only from the Firebase console', liveDiff: scopedDiff, applyBlockedBy: scopedDiff ? scopedDiff.filter((item) => item.liveOnly.length).map((item) => item.id) : [] } : null,
      feastsCollection,
      policy: 'create/update only; legacy per-template copies are never deleted, optionally marked _obsolete',
      summary: {
        templates: plans.templates.counts,
        feasts: plans.feasts.counts,
        legacyCopies: { listed: obsolete.length, markObsolete: options.markObsolete ? obsolete.filter((item) => !item.alreadyObsolete).length : 0, delete: 0 },
      },
      plans,
      legacyCopies: obsolete,
    };
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, `${JSON.stringify(report, null, 1)}\n`);
    console.log(JSON.stringify(report.summary, null, 1));
    console.log(`plan: ${path.relative(ROOT, options.output)}`);
    const record = (mode, extra = {}) => {
      const counts = (plan) => plan.counts;
      if (options.only !== 'feasts') recordMigration(deps.recordRoot || ROOT, { collection: 'liturgicalTemplates', mode, ...counts(plans.templates), ...extra.templates });
      if (options.only !== 'templates') recordMigration(deps.recordRoot || ROOT, { collection: feastsCollection, mode, ...counts(plans.feasts), ...extra.feasts });
    };
    if (!options.apply) {
      if (existing) record('dry-run'); // an offline plan is not a migration run
      console.log('Dry run only. Nothing was written to Firestore.');
      return report;
    }

    if (scopedDiff) assertScopedApplySafe(scopedDiff);
    const { firestore, admin } = connection;
    const importedAt = admin.firestore.FieldValue.serverTimestamp();
    const writes = [];
    const push = (plan, list, collection) => {
      const byId = new Map(list.map((item) => [item.id, item.data]));
      plan.operations.filter((item) => ['create', 'update', 'set'].includes(item.action))
        .forEach((item) => writes.push((batch) => batch.set(firestore.collection(collection).doc(item.id), { ...byId.get(item.id), importedAt })));
    };
    if (options.only !== 'feasts') push(plans.templates, targets.templates, 'liturgicalTemplates');
    if (options.only !== 'templates') {
      push(plans.feasts, targets.feasts, feastsCollection);
      if (options.markObsolete) {
        obsolete.filter((item) => !item.alreadyObsolete).forEach((item) => writes.push((batch) => batch.update(
          firestore.collection('days').doc(item.id), { _obsolete: true, _obsoleteReason: 'replaced-by-sparse-document', _obsoleteAt: importedAt },
        )));
      }
    }
    // Publication revisions: clients and audits see that the source changed.
    const before = existing?.meta || {};
    const changed = (plan) => plan.operations.some((item) => ['create', 'update', 'set'].includes(item.action));
    const revisions = {};
    if (options.only !== 'feasts' && changed(plans.templates)) revisions.templatesRevision = Number(before.templatesRevision || 0) + 1;
    if (options.only !== 'templates' && options.target === 'proper-texts' && changed(plans.feasts)) {
      revisions.properTextsRevision = Number(before.properTextsRevision || 0) + 1;
    }
    if (Object.keys(revisions).length) {
      writes.push((batch) => batch.set(firestore.collection('liturgicalCalendarMeta').doc('current'), revisions, { merge: true }));
    }
    if (options.ids) {
      const allowed = new Set(targets.templates.map((item) => item.id));
      const touched = plans.templates.operations.filter((op) => ['create', 'update', 'set'].includes(op.action)).map((op) => op.id);
      if (touched.some((id) => !allowed.has(id) || PROTECTED_TEMPLATE_IDS.includes(id))) throw new Error('Refusing to apply: the write set leaves the allowlist.');
    }
    const failures = [];
    let committed = 0;
    for (let index = 0; index < writes.length; index += 200) {
      const batch = firestore.batch();
      const slice = writes.slice(index, index + 200);
      slice.forEach((write) => write(batch));
      try { await batch.commit(); committed += slice.length; } catch (error) { failures.push(String(error.message || error)); break; }
    }
    record('apply', {
      templates: { revisionBefore: before.templatesRevision ?? null, revisionAfter: revisions.templatesRevision ?? before.templatesRevision ?? null, failures },
      feasts: { revisionBefore: before.properTextsRevision ?? null, revisionAfter: revisions.properTextsRevision ?? before.properTextsRevision ?? null, failures },
    });
    if (failures.length) throw new Error(`Import failed after ${committed} writes: ${failures[0]}`);
    const result = { written: committed, revisions };
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
