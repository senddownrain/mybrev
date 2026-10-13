#!/usr/bin/env node
/**
 * Offline import plan of the seasonal Commons (`liturgicalTemplates`).
 * Reads ONLY local files: the generated `patchs/db-templates` and a local
 * Firestore snapshot (`backups/firestore-snapshot`); it never contacts
 * Firestore and never writes to it.
 *
 *   node scripts/liturgy/common-seasons-import-plan.mjs [--snapshot backups/firestore-snapshot] [--out reports/liturgy/common-seasons-import-plan.json]
 *
 * The verdict is the one of the real publication validator
 * (`classifyPatch` / `validateCollection`) over the hashes of the snapshot
 * (taken as the published state) and of the generated documents.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readCollections } from '../content/build-app-bundle.mjs';
import {
  classifyPatch, describeDocuments, diffCollection, storedDocument, validateCollection, formatPatchReport, CONTENT_SCHEMA_VERSION,
} from '../content/lib/app-content.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? path.resolve(args[i + 1]) : fallback; };
const snapshotDir = option('snapshot', path.join(ROOT, 'backups', 'firestore-snapshot'));
const out = option('out', path.join(ROOT, 'reports', 'liturgy', 'common-seasons-import-plan.json'));

const templatesDir = path.join(ROOT, 'patchs', 'db-templates');
const generated = fs.readdirSync(templatesDir).filter((n) => n.endsWith('.json')).sort()
  .map((name) => { const { _id, ...data } = JSON.parse(fs.readFileSync(path.join(templatesDir, name), 'utf8')); return storedDocument(_id, data); });
const { collections } = await readCollections([snapshotDir], ['liturgicalTemplates']);
const snapshot = (collections.get('liturgicalTemplates') || []);

const bytesOf = (value) => Buffer.byteLength(JSON.stringify(value));
const flatOf = ({ _seasonalVariants, ...flat }) => flat;
const byId = new Map(snapshot.map((doc) => [doc.id, doc]));
const rows = generated.map((doc) => {
  const before = byId.get(doc.id);
  const delta = doc._seasonalVariants || null;
  const fields = delta ? Object.values(delta).reduce((total, fieldsOfSeason) => total + Object.keys(fieldsOfSeason).length, 0) : 0;
  const stripped = { ...doc }; delete stripped._seasonalVariants;
  const { updatedAt, importedAt, ...beforeFlat } = before || {};
  void updatedAt; void importedAt;
  const flatBefore = JSON.stringify(Object.fromEntries(Object.entries(beforeFlat).sort()));
  const flatAfter = JSON.stringify(Object.fromEntries(Object.entries(flatOf(stripped)).sort()));
  return {
    id: doc.id,
    status: !before ? 'new' : (JSON.stringify(Object.fromEntries(Object.entries(doc).sort())) === JSON.stringify(Object.fromEntries(Object.entries(beforeFlat).sort())) ? 'unchanged' : 'changed'),
    seasonalFields: fields,
    seasons: delta ? Object.keys(delta) : [],
    bytesBefore: before ? bytesOf(before) : 0,
    bytesAfter: bytesOf(doc),
    addedBytes: bytesOf(doc) - (before ? bytesOf(before) : 0),
    flatBaseChangedVsSnapshot: before ? flatBefore !== flatAfter : null,
    sizeVsFirestoreLimit: `${(bytesOf(doc) / 1048576 * 100).toFixed(1)}% of 1 MiB`,
  };
});
const describedBefore = describeDocuments(snapshot);
const describedAfter = describeDocuments(generated);
const diff = diffCollection('liturgicalTemplates', describedAfter, { hashes: describedBefore.hashes });
const verdict = classifyPatch([diff], { publishedSchema: CONTENT_SCHEMA_VERSION });
const invalid = validateCollection('liturgicalTemplates', generated);
const plan = {
  mode: 'offline (local snapshot only; no Firestore read, no write)',
  snapshot: path.relative(ROOT, snapshotDir),
  documents: { total: generated.length, new: rows.filter((r) => r.status === 'new').length, changed: rows.filter((r) => r.status === 'changed').length, unchanged: rows.filter((r) => r.status === 'unchanged').length },
  seasonalFields: rows.reduce((t, r) => t + r.seasonalFields, 0),
  bytes: { before: rows.reduce((t, r) => t + r.bytesBefore, 0), after: rows.reduce((t, r) => t + r.bytesAfter, 0), added: rows.reduce((t, r) => t + r.addedBytes, 0) },
  flatBaseFieldsChanged: rows.filter((r) => r.flatBaseChangedVsSnapshot).map((r) => r.id),
  validator: { invalidDocuments: invalid, verdict: verdict.verdict, reasons: verdict.reasons, collectionDiff: { added: diff.added, changed: diff.changed, removed: diff.removed, bytes: diff.bytes } },
  report: formatPatchReport([diff], verdict),
  rows,
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify({ ...plan, rows: undefined, report: undefined }, null, 2));
console.log(`\n${plan.report}`);
