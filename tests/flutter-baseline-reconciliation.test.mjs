import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { applyFlutterBaselineReconciliation } from '../scripts/liturgy/lib/flutter-baseline-reconciliation.mjs';
import { loadCoordinatedContract, valueSha256 } from '../scripts/liturgy/lib/coordinated-release.mjs';
import { describeDocuments } from '../scripts/content/lib/app-content.mjs';
import { validatePublicationPlan } from '../scripts/liturgy/lib/editorial-publication.mjs';
const root = 'docs/audits/liturgical-common-texts-2026-11/v4';
const patch = JSON.parse(zlib.gunzipSync(fs.readFileSync(root + '/flutter-baseline-reconciliation.json.gz')));
const full = JSON.parse(zlib.gunzipSync(fs.readFileSync(root + '/full-content-plan.json.gz')));
const selected = new Set(full.documents.filter(d => /^(days|liturgicalTemplates)\//u.test(d.document)).flatMap(d => d.fields.map(f => d.document + '|' + f.field)));
const contract = loadCoordinatedContract();
test('supplement preserves known Web baseline: 37 other fields + 307 bookkeeping fields; never a Firestore plan', () => {
  assert.equal(patch.scope, 'flutter-bundle-baseline-only'); assert.equal(patch.firestoreWrites, 0); assert.equal(patch.changes.length, 344);
  assert.equal(patch.changes.filter(c => c.field === 'importedAt').length, 307);
  assert.ok(patch.changes.every(c => !selected.has(c.document + '|' + c.field)));
  assert.equal(patch.summary.additionalEditorialExpansions, 0); assert.equal(patch.summary.heldWebValuesChanged, 0);
  for (const entry of patch.changes) assert.equal(entry.afterSha256, valueSha256({ present: true, value: entry.value }));
  for (const [name, described] of Object.entries(patch.before)) assert.deepEqual(described, contract.expected[name]);
  assert.throws(() => validatePublicationPlan(patch), /Unsupported offline plan/);
});
test('High Priest references use approved from-day policy; XI held responsory is copied verbatim, never expanded', () => {
  const refs = patch.changes.filter(c => c.document === 'days/feast-christthehighpriest');
  assert.equal(refs.length, 12); assert.ok(refs.every(c => c.value === 'from-day'));
  const held = patch.changes.filter(c => c.editorialHeld); assert.equal(held.length, 1);
  assert.equal(held[0].document, 'days/ordinary-w11-d1'); assert.equal(held[0].field, 'vesper1R');
  assert.equal(held[0].value, JSON.parse(fs.readFileSync('scripts/liturgy/sources/xi-sunday-first-vespers-by.json')).fields.vesper1R);
  assert.match(held[0].purpose, /without-editorial-expansion/);
  for (const entry of patch.changes.filter(c => c.document === 'days/ordinary-w11-d1')) assert.equal(entry.value, JSON.parse(fs.readFileSync('scripts/liturgy/sources/xi-sunday-first-vespers-by.json')).fields[entry.field]);
});
test('offline consumer is exact, immutable and idempotent; rejects wrong baseline and corrupted values', () => {
  const input = new Map([['days', [{ id: 'one', title: 'keep', value: 'old' }]], ['other', [{ id: 'keep', value: 'untouched' }]]]);
  const after = [{ id: 'one', title: 'keep', value: 'new' }];
  const sample = { schema: 1, scope: 'flutter-bundle-baseline-only', firestoreWrites: 0,
    before: { days: describeDocuments(input.get('days')) }, after: { days: describeDocuments(after) },
    changes: [{ document: 'days/one', field: 'value', path: ['value'], value: 'new', beforeSha256: valueSha256({ present: true, value: 'old' }), afterSha256: valueSha256({ present: true, value: 'new' }) }] };
  const output = applyFlutterBaselineReconciliation(input, sample);
  assert.deepEqual(output.get('days'), after); assert.equal(input.get('days')[0].value, 'old'); assert.deepEqual(output.get('other'), input.get('other'));
  assert.deepEqual(applyFlutterBaselineReconciliation(output, sample), output);
  const bad = structuredClone(sample); bad.changes[0].value = 'invented'; assert.throws(() => applyFlutterBaselineReconciliation(input, bad), /proof/);
  const drift = structuredClone(input); drift.get('days')[0].title = 'later edit'; assert.throws(() => applyFlutterBaselineReconciliation(drift, sample), /baseline/);
});
