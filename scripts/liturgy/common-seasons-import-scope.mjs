#!/usr/bin/env node
/**
 * Scope of a future publication of the seasonal Commons: the allowlist of template ids, and the three DIFFERENT
 * comparisons that must not be confused. Reads local files and git only; never contacts Firestore.
 *
 *   node scripts/liturgy/common-seasons-import-scope.mjs [--base origin/main] [--snapshot <dir>]
 *
 *   allowlist           templates that carry seasonal data (`_seasonalVariants`) = what this work changed in the Commons
 *   changedVsMain       git: db-templates files that differ from the merge-base with `--base`
 *   changedVsSnapshot   hash comparison with a LOCAL snapshot (an OLD copy, not production)
 *   changedVsLive       NOT VERIFIED LIVE (needs read access to production and the quota; never simulated here)
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readCollections } from '../content/build-app-bundle.mjs';
import { describeDocuments, storedDocument } from '../content/lib/app-content.mjs';
import { PROTECTED_TEMPLATE_IDS } from '../ordo/import-feasts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const base = option('base', 'origin/main');
const snapshotDir = path.resolve(option('snapshot', path.join(ROOT, 'backups', 'firestore-snapshot')));
const out = path.join(ROOT, 'reports', 'liturgy', 'common-seasons-import-allowlist.json');

const dir = path.join(ROOT, 'patchs', 'db-templates');
const generated = fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort().map((n) => JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')));
const allowlist = generated.filter((doc) => doc._seasonalVariants && Object.keys(doc._seasonalVariants).length).map((doc) => doc._id).sort();

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
let changedVsMain = null;
try {
  const mergeBase = git('merge-base', 'HEAD', base);
  changedVsMain = [...new Set(git('diff', '--name-only', mergeBase, 'HEAD', '--', 'patchs/db-templates').split('\n').filter(Boolean).map((f) => path.basename(f, '.json')))].sort();
} catch { /* no base ref available */ }

let changedVsSnapshot = null;
try {
  const { collections } = await readCollections([snapshotDir], ['liturgicalTemplates']);
  const snapshot = new Map((collections.get('liturgicalTemplates') || []).map((d) => [d.id, d]));
  const target = generated.map(({ _id, ...data }) => storedDocument(_id, data));
  const hashes = describeDocuments(target).hashes;
  const before = describeDocuments([...snapshot.values()]).hashes;
  changedVsSnapshot = target.filter((doc) => hashes[doc.id] !== before[doc.id]).map((doc) => doc.id).sort();
} catch { /* snapshot not available */ }

const report = {
  generatedAt: new Date().toISOString(),
  allowlist,
  protectedNeverTouched: PROTECTED_TEMPLATE_IDS,
  changedVsMain,
  changedVsSnapshot: { note: 'a LOCAL snapshot is an old copy, not production', ids: changedVsSnapshot, notInAllowlist: (changedVsSnapshot || []).filter((id) => !allowlist.includes(id)) },
  changedVsLive: 'NOT VERIFIED LIVE',
  dryRunCommand: `npm run ordo:import-feasts -- --only templates --ids ${allowlist.join(',')}`,
  applyCommand: 'NOT RUN: needs separate owner permission; same command plus --apply',
};
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
