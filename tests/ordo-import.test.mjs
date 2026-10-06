/** Import planning: dry runs, diffs, no deletes by default. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildTargets, main as importCalendar, noteDocument, planCollection } from '../scripts/ordo/import-calendar.mjs';
import { buildFeastTargets, main as importFeasts } from '../scripts/ordo/import-feasts.mjs';

const definitions = JSON.parse(fs.readFileSync(new URL('../src/data/ordo/calendar-definitions.json', import.meta.url), 'utf8'));
const notes = JSON.parse(fs.readFileSync(new URL('../src/data/ordo/notes.json', import.meta.url), 'utf8'));

test('plan: create / update / unchanged / obsolete, never delete', () => {
  const target = [{ id: 'a', data: { x: 1 } }, { id: 'b', data: { x: 2 } }, { id: 'c', data: { x: 3 } }];
  const existing = [{ id: 'a', data: { x: 1, importedAt: 'ts' } }, { id: 'b', data: { x: 9 } }, { id: 'old', data: {} }];
  const plan = planCollection('col', target, existing);
  assert.deepEqual(plan.operations.map((item) => item.action), ['unchanged', 'update', 'create']);
  assert.deepEqual(plan.obsolete, ['old']);
  assert.deepEqual(plan.counts, { target: 3, create: 1, update: 1, unchanged: 1, set: 0, keepExisting: 0, obsolete: 1, delete: 0 });
  // Manual year overrides are never overwritten nor reported obsolete.
  const overrides = planCollection('col', target, existing, { createOnly: true });
  assert.deepEqual(overrides.operations.map((item) => item.action), ['keep-existing', 'keep-existing', 'create']);
  assert.deepEqual(overrides.obsolete, []);
  // Without a Firestore read everything is a plain `set`.
  assert.equal(planCollection('col', target, null).counts.set, 3);
});

test('calendar targets: definitions, notes without evidence, meta last', () => {
  const targets = buildTargets({ definitions, notes });
  assert.equal(targets.celebrations.length, definitions.celebrations.length);
  assert.equal(targets.notes.length, notes.notes.length);
  assert.ok(targets.notes.every((item) => !('observed' in item.data) && item.data.selector && item.data.scope));
  assert.ok(targets.notes.every((item) => ['belarus', 'diocese', 'universal'].includes(item.data.scope.level)));
  assert.deepEqual(targets.meta, { id: 'current', data: { schemaVersion: 1, revision: definitions.revision, notesRevision: notes.revision } });
  assert.deepEqual(Object.keys(noteDocument({ id: 'n', scope: {}, selector: {}, observed: [] })), ['scope', 'selector']);
});

test('dry runs write a local plan only; destructive options need a confirmation', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ordo-import-'));
  const calendar = await importCalendar(['--offline', '--output', path.join(dir, 'calendar.json')]);
  assert.equal(calendar.mode, 'dry-run');
  assert.equal(calendar.firestoreRead, false);
  assert.equal(Object.values(calendar.summary).reduce((sum, counts) => sum + counts.delete, 0), 0);
  const feasts = await importFeasts(['--offline', '--output', path.join(dir, 'feasts.json')]);
  assert.equal(feasts.mode, 'dry-run');
  assert.equal(feasts.summary.legacyCopies.delete, 0);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['calendar.json', 'feasts.json']);
  await assert.rejects(importCalendar(['--offline', '--prune']), /--confirm prune-ordo-calendar/);
  await assert.rejects(importCalendar(['--offline', '--apply']), /needs Firestore/);
  // Sparse documents in `days` break old clients; liturgicalProperTexts does not.
  await assert.rejects(importFeasts(['--apply', '--target', 'days', '--service-account', path.join(dir, 'missing.json')]), /--confirm import-sparse-feasts/);
  await assert.rejects(importFeasts(['--apply', '--service-account', path.join(dir, 'missing.json')]), /Service-account key not found/);
  await assert.rejects(importFeasts(['--offline', '--mark-obsolete']), /--target days only/);
});

test('feast targets: sparse documents, templates and the copies they replace', () => {
  const targets = buildFeastTargets();
  assert.ok(targets.templates.some((item) => item.id === 'sunday-week-1'));
  assert.ok(targets.feasts.every((item) => item.data._schema === 2 && !('_id' in item.data)));
  assert.ok(targets.legacyIds.includes('01-08-sv-alphonsus-liguori--pastors'));
  const ids = new Set(targets.feasts.map((item) => item.id));
  assert.ok(targets.legacyIds.every((id) => !ids.has(id)), 'a legacy copy is never a target');
});
