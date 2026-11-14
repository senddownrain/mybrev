// Apply / idempotency / rollback of an approved canonical plan against the Firestore emulator only.
//   firebase emulators:exec --only firestore --project demo-rules "node --test tests/prayer-import-apply.test.mjs"
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { applyCanonPlan, loadApprovedPlan, rollbackFromBackup, selectOperations } from '../scripts/prayer-import/apply.mjs';
import { writeReports } from '../scripts/prayer-import/canon-import.mjs';
import { planCanonical } from '../scripts/prayer-import/lib/plan-canon.mjs';
import { entryToMarkdown } from '../scripts/prayer-import/lib/blocks-to-markdown.mjs';
import { corpusOf, litanyEntry, SOURCES } from './helpers/prayer-import-fixture.mjs';

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
describe('canonical import apply/rollback (emulator)', { skip: !emulator }, () => {
  assert.match(emulator, /^(127\.0\.0\.1|localhost):\d+$/, 'local emulator only');
  const db = getFirestore(initializeApp({ projectId: 'demo-rules' }, 'import-apply'));
  const dir = mkdtempSync(path.join(os.tmpdir(), 'canon-apply-'));
  const planDir = path.join(dir, 'plan'); const backupDir = path.join(dir, 'backups');
  const rightsOk = { litanies_novenas_chaplets_2024: { confirmedBy: 'owner', basis: 'test' }, rite_penance: { confirmedBy: 'owner', basis: 'test' } };
  let plan; let sha;
  const get = async (path_) => (await db.doc(path_).get());
  before(async () => {
    for (const name of ['prayers', 'priestProtectedPrayers', 'prayerDrafts', 'priestContentControl']) await db.recursiveDelete(db.collection(name));
    const entries = [
      litanyEntry('lit-new', 'Літанія да св. Антонія', { saint: 'Антоні' }),
      litanyEntry('lit-old', 'Літанія да св. Юзафа'),
      litanyEntry('rite-1', 'Парадак пакаяння', { sourceId: 'rite_penance', kind: 'ritual', status: 'partial' }),
    ];
    await db.doc('prayers/OLD1').set({ title: 'Літанія да св. Юзафа', text: entryToMarkdown(entries[1]).markdown.replace('Кірые', 'Кірые (старая рэдакцыя)'), textFormat: 'mybrev-markdown', tags: ['Літанія'], createdAt: new Date(1e12), verified: true, priestOnly: false, titleVersions: { be: 'x', ru: 'ru-title' }, textVersions: { be: 'old', ru: 'ru-text' } });
    await db.doc('priestContentControl/state').set({ version: 5, lockUid: '', updatedAt: new Date() });
    const result = planCanonical({ corpus: corpusOf(entries), sources: SOURCES, oldPrayers: [{ id: 'OLD1', ...(await get('prayers/OLD1')).data() }], categories: [] });
    sha = writeReports(planDir, result, { generatedAt: 'test', snapshot: [] });
    plan = result;
  });
  const apply = (over = {}) => applyCanonPlan({ db, FieldValue, planDir, approvedSha: sha, rights: rightsOk, backupDir, log: () => {}, ...over });

  it('refuses a wrong approval hash and a tampered plan', () => {
    assert.throws(() => loadApprovedPlan(planDir, 'f'.repeat(64)), /approve-sha/);
    const tampered = path.join(dir, 'tampered'); writeReports(tampered, plan, { generatedAt: 'x', snapshot: [] });
    writeFileSync(path.join(tampered, 'planned_operations.json'), JSON.stringify({ ...JSON.parse(JSON.stringify({ planSha256: sha, operations: [{ ...plan.operations[0], title: 'changed' }] })) }));
    assert.throws(() => loadApprovedPlan(tampered, sha), /modified/);
  });
  it('rights gate: without written confirmation public operations are skipped (drafts still allowed)', () => {
    const { run, skipped } = selectOperations(JSON.parse(JSON.stringify({ operations: plan.operations })), {}, null);
    assert.equal(run.filter((op) => op.targetCollection === 'prayers').length, 0);
    assert.ok(skipped.length >= 2); assert.ok(run.every((op) => op.targetCollection === 'prayerDrafts'));
  });
  it('apply: create + replace keep ID and old fields + closed draft; control version moves, lock released', async () => {
    const result = await apply();
    assert.equal(result.written, 3);
    const created = (await get(`prayers/${plan.operations.find((op) => op.action === 'CREATE').targetId}`)).data();
    assert.equal(created.sourceEntryId, 'lit-new'); assert.match(created.source, /Про Хрысто/); assert.equal(created.priestOnly, false);
    const replaced = (await get('prayers/OLD1')).data();
    assert.equal(replaced.sourceEntryId, 'lit-old'); assert.equal(replaced.createdAt.toMillis(), 1e12); assert.equal(replaced.verified, true);
    assert.equal(replaced.textVersions.ru, 'ru-text'); assert.equal(replaced.titleVersions.ru, 'ru-title'); assert.ok(replaced.textVersions.be.startsWith('Кірые'));
    const draft = (await get(`prayerDrafts/${plan.operations.find((op) => op.action === 'REVIEW_AMBIGUOUS').targetId}`)).data();
    assert.equal(draft.status, 'needs_review'); assert.equal(draft.reason, 'rite_scope'); assert.equal(draft.rightsStatus, 'confirmed');
    const state = (await get('priestContentControl/state')).data();
    assert.equal(state.lockUid, ''); assert.ok(state.version >= 7);
    assert.equal((await db.collection('priestProtectedPrayers').get()).size, 0);
  });
  it('apply again is a no-op (idempotent)', async () => {
    const result = await apply();
    assert.equal(result.written, 0); assert.equal(result.noop, 3);
  });
  it('a live change after the dry-run aborts without writing', async () => {
    await db.doc('prayers/OLD1').update({ text: 'edited by an administrator meanwhile' });
    const fresh = await db.collection('prayers').get(); const before = fresh.size;
    await db.doc(`prayers/${plan.operations.find((op) => op.action === 'CREATE').targetId}`).delete();
    await assert.rejects(() => apply(), /differs from the approved dry-run/);
    assert.equal((await db.collection('prayers').get()).size, before - 1);
  });
  it('rollback restores the exact earlier state (replaced fields back, created documents removed)', async () => {
    // fresh state for a clean round trip
    await db.recursiveDelete(db.collection('prayers')); await db.recursiveDelete(db.collection('prayerDrafts'));
    const original = { title: 'Літанія да св. Юзафа', text: entryToMarkdown(litanyEntry('lit-old', 'Літанія да св. Юзафа')).markdown.replace('Кірые', 'Кірые (старая рэдакцыя)'), textFormat: 'mybrev-markdown', tags: ['Літанія'], createdAt: new Date(1e12), verified: true, priestOnly: false };
    await db.doc('prayers/OLD1').set(original);
    const result = await apply();
    assert.equal(result.written, 3);
    assert.notEqual((await get('prayers/OLD1')).data().text, original.text);
    await rollbackFromBackup({ db, FieldValue, backupPath: result.backupPath, log: () => {} });
    const restored = (await get('prayers/OLD1')).data();
    assert.equal(restored.text, original.text); assert.equal(restored.title, original.title); assert.equal(restored.createdAt.toMillis(), 1e12);
    assert.equal((await db.collection('prayers').get()).size, 1); assert.equal((await db.collection('prayerDrafts').get()).size, 0);
    assert.equal((await get('priestContentControl/state')).data().lockUid, '');
  });
  it('interrupted apply keeps the lock, blocks foreign runs and is resumed idempotently by the same plan', async () => {
    await db.recursiveDelete(db.collection('prayers')); await db.recursiveDelete(db.collection('prayerDrafts'));
    await db.doc('prayers/OLD1').set({ title: 'Літанія да св. Юзафа', text: entryToMarkdown(litanyEntry('lit-old', 'Літанія да св. Юзафа')).markdown.replace('Кірые', 'Кірые (старая рэдакцыя)'), textFormat: 'mybrev-markdown', tags: ['Літанія'], createdAt: new Date(1e12) });
    await assert.rejects(() => apply({ stopAfterBatch: 1 }), /TEST interruption/);
    assert.notEqual((await get('priestContentControl/state')).data().lockUid, '');
    await assert.rejects(() => apply({ backupDir: path.join(dir, 'other-backups') }), /locked/); // a different operator without that backup
    const resumed = await apply();
    assert.equal(resumed.noop, 3);
    assert.equal((await get('priestContentControl/state')).data().lockUid, '');
  });
});
