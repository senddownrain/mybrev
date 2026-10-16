/**
 * The publication of the seasonal Commons must be limited to the Commons this work changed (A1 of the PR #132 verification).
 * Nothing here contacts Firestore; the importer is only PLANNED (dry run, offline).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildFeastTargets, main as importFeasts, PROTECTED_TEMPLATE_IDS, scopeTemplateIds } from '../scripts/ordo/import-feasts.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const targets = buildFeastTargets();
const seasonal = targets.templates.filter((item) => item.data._seasonalVariants && Object.keys(item.data._seasonalVariants).length).map((item) => item.id).sort();

test('the allowlist is exactly the 13 Commons with seasonal data; no protected document is in it', () => {
  assert.equal(seasonal.length, 13);
  PROTECTED_TEMPLATE_IDS.forEach((id) => assert.ok(!seasonal.includes(id), id));
  assert.deepEqual(PROTECTED_TEMPLATE_IDS, ['office-for-dead', 'sunday-week-1', 'complementary-psalmody']);
  // the committed report names the same ids
  const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', 'liturgy', 'common-seasons-import-allowlist.json'), 'utf8'));
  assert.deepEqual(report.allowlist, seasonal);
  assert.equal(report.changedVsLive, 'NOT VERIFIED LIVE');
});

test('scopeTemplateIds keeps only the allowlist and refuses unknown, protected and empty lists', () => {
  const scoped = scopeTemplateIds(targets.templates, seasonal.join(','));
  assert.deepEqual(scoped.templates.map((item) => item.id).sort(), seasonal);
  assert.throws(() => scopeTemplateIds(targets.templates, 'office-for-dead'), /protected/);
  assert.throws(() => scopeTemplateIds(targets.templates, 'sunday-week-1,apostles'), /protected/);
  assert.throws(() => scopeTemplateIds(targets.templates, 'complementary-psalmody'), /protected/);
  assert.throws(() => scopeTemplateIds(targets.templates, 'no-such-common'), /unknown/);
  assert.throws(() => scopeTemplateIds(targets.templates, ' , '), /at least one/);
});

test('importer: --ids needs --only templates; the offline plan of a scoped run covers exactly the allowlist', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-import-'));
  const output = path.join(dir, 'plan.json');
  const base = ['--offline', '--output', output, '--backup-dir', path.join(dir, 'backup')];
  await assert.rejects(importFeasts([...base, '--ids', 'apostles']), /--ids requires --only templates/);
  await importFeasts([...base, '--only', 'templates', '--ids', seasonal.join(',')]);
  const plan = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(plan.mode, 'dry-run');
  assert.equal(plan.firestoreRead, false);
  assert.deepEqual(plan.plans.templates.operations.map((op) => op.id).sort(), seasonal);
  assert.equal(plan.plans.templates.counts.target, 13);
});

test('importer: a scoped run that names a protected document fails before any plan is written', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-import-'));
  const output = path.join(dir, 'plan.json');
  await assert.rejects(importFeasts(['--offline', '--output', output, '--only', 'templates', '--ids', 'office-for-dead']), /protected/);
  assert.equal(fs.existsSync(output), false);
});
