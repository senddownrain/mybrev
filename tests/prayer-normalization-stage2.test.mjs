import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  normalizePrayerLegacyMarkdown, collectLegacyPrayerSpeakers, verifyPrayerNormalization,
} from '../src/utils/prayerLegacyFormatting.js';
import { renderPrayerMarkdown, prayerTextFields, prayerMarkdownToPlainText } from '../src/utils/prayerMarkdown.js';
import {
  buildPrayerNormalizationPlan, checkPrayerPlan, selectPrayerNormalizationPlan, writePrayerPlanUpdates, prayerPlanHash,
} from '../scripts/lib/prayer-normalization-plan.mjs';
import { applyPrayerNormalization, firestorePrayerAdapter } from '../scripts/lib/prayer-normalization-apply.mjs';
import { parsePrayerNormalizationArgs, runPrayerNormalization } from '../scripts/normalize-prayer-legacy.mjs';
import { MASS_RITUAL } from '../src/utils/massRitual.js';
import { openFirestoreSnapshot } from '../scripts/lib/firestore-snapshot.mjs';
import { buildMassDocument } from '../src/utils/massContent.js';

const fixture = JSON.parse(await fs.readFile(new URL('./fixtures/prayer-legacy-shapes.json', import.meta.url), 'utf8'));
const entry = (text, extra = {}) => ({ id: 'fixture', data: { title: 'Малітва', text, textFormat: 'mybrev-markdown', textFormatVersion: 1, ...extra } });
const snapshot = { projectId: 'demo', exportedAt: new Date().toISOString() };

test('anonymized real corpus shapes normalize without changing words, links or quotations', () => {
  for (const example of fixture.examples) {
    const result = normalizePrayerLegacyMarkdown(example.before);
    assert.equal(result.markdown, example.after, example.kind);
    assert.ok(result.preservation.passed, example.kind);
    assert.equal(normalizePrayerLegacyMarkdown(result.markdown).markdown, result.markdown, example.kind);
  }
});

test('reader recovers styled labels, full names and body emphasis without editing stored text', () => {
  const source = '**К.:** Пане, пачуй нас.\n_Н.: Амэн._\n**Усе:** Амэн.\nЦэлебрант: Пан з вамі.';
  const html = renderPrayerMarkdown(source, 'mybrev-markdown');
  assert.equal(collectLegacyPrayerSpeakers(source).length, 4);
  assert.equal((html.match(/class="prayer-speaker"/g) || []).length, 4);
  assert.match(html, /data-role="people">Н\.:<\/span> <em>Амэн\.<\/em>/);
  assert.match(html, /data-role="all">Усе:<\/span>/);
  assert.equal(prayerMarkdownToPlainText(source, 'mybrev-markdown'), 'К.: Пане, пачуй нас.\nН.: Амэн.\nУсе: Амэн.\nЦэлебрант: Пан з вамі.');
});

test('multiline emphasis and label-only dialogue preserve authored emphasis and undo-compatible source positions', () => {
  const source = '**С.: Першы радок,\nдругі радок.**\n\nК.\nПане, пачуй нас.\nН.\nАмэн.';
  const result = normalizePrayerLegacyMarkdown(source);
  assert.equal(result.markdown, 'С. **Першы радок,\nдругі радок.**\n\nК. Пане, пачуй нас.\nН. Амэн.');
  assert.ok(verifyPrayerNormalization(source, result.markdown).passed);
  assert.match(renderPrayerMarkdown(source, 'mybrev-markdown'), /<strong>Першы радок,<br>\nдругі радок\.<\/strong>/);
});

test('true quotes, fenced code, initials and named narrative never become roles or rubrics', () => {
  for (const source of ['> **С.:** Словы цытаты.', '```md\nС.: Словы прыкладу.\n:::rubric\n```', 'С. Я. Прозвішча', '**С. Імя:** _Словы апавядання._', 'С. Імя: _Словы апавядання._', 'C. Пан з вамі.']) {
    assert.equal(normalizePrayerLegacyMarkdown(source).markdown, source);
    assert.doesNotMatch(renderPrayerMarkdown(source, 'mybrev-markdown'), /prayer-speaker/);
  }
  assert.doesNotMatch(renderPrayerMarkdown('    С.: Словы прыкладу.'), /prayer-speaker/);
  assert.match(renderPrayerMarkdown('    С.: Словы прыкладу.'), /<pre><code>/);
  assert.equal(prayerTextFields('    С.: Словы прыкладу.').text, '    С.: Словы прыкладу.');
});

test('only exact structural directions become rubrics; formulas and broad actor sentences remain authored', () => {
  assert.equal(normalizePrayerLegacyMarkdown('_Усе ўстаюць._').markdown, ':::rubric\n_Усе ўстаюць._\n:::');
  assert.match(renderPrayerMarkdown('_Усе ўстаюць._', 'mybrev-markdown'), /prayer-rubric/);
  for (const source of ['_Молімся:_', '_Вітай, Марыя…_', 'Народ моліцца.', 'Усемагутны Божа, народ спявае хвалу Табе.']) assert.equal(normalizePrayerLegacyMarkdown(source).markdown, source);
  const assisted = normalizePrayerLegacyMarkdown('Цэлебрант можа акрапіць дзяцей асвячанай вадой.');
  assert.equal(assisted.changed, false);
  assert.equal(assisted.assisted[0].group, 'direction-paragraph');
  assert.equal(prayerTextFields('**К.:** Пане, пачуй нас.').text, 'К. Пане, пачуй нас.');
  assert.equal(prayerTextFields('**К.:** Пане, пачуй нас.', { normalizeLegacy: false }).text, '**К.:** Пане, пачуй нас.');
});

test('confirmed legacy HTML preserves visible words, hrefs and metadata; literal/mixed/unsafe HTML cannot apply automatically', () => {
  const html = '<p><strong>С.:</strong> Пане, пачуй нас.</p><p><em>Молімся.</em> <a href="/prayer/target">Малітва</a></p>';
  const plan = buildPrayerNormalizationPlan([entry(html, { textFormat: 'html', textFormatVersion: undefined, priestOnly: true })], { snapshot });
  assert.equal(plan.stats.automaticDocuments, 1);
  const result = writePrayerPlanUpdates(plan.documents[0].before, plan.documents[0].updates);
  assert.equal(result.textFormat, 'mybrev-markdown');
  assert.match(result.text, /^С\. Пане/);
  assert.match(result.text, /\[Малітва\]\(\/prayer\/target\)/);
  assert.equal(result.priestOnly, true);
  for (const [text, extra] of [[html, {}], ['<p onclick="x">Тэкст</p>', { textFormat: 'html' }], ['<p style="color:red">Тэкст</p>', { textFormat: 'html' }]]) {
    const protectedPlan = buildPrayerNormalizationPlan([entry(text, extra)], { snapshot });
    assert.equal(protectedPlan.documents[0].updates.length, 0);
  }
  const mixed = buildPrayerNormalizationPlan([{ id: 'mixed', data: { textFormat: 'html', textVersions: { be: html, en: '<iframe>Words</iframe>' } } }], { snapshot });
  assert.equal(mixed.documents[0].updates.length, 0);
  const rubric = buildPrayerNormalizationPlan([entry('<p class="rubric"><em>Усе ўстаюць.</em> <a href="/prayer/target">Малітва</a></p>', { textFormat: 'html' })], { snapshot });
  const rubricText = rubric.documents[0].updates.find(update => update.field === 'text').after;
  assert.match(rubricText, /_Усе ўстаюць\._/);
  assert.match(rubricText, /\[Малітва\]\(\/prayer\/target\)/);
});

test('frozen plans, subset rules and precise locale updates reject unapproved paths and preserve other fields', () => {
  const data = { textVersions: { be: '**С.:** Пане, пачуй нас.', la: 'V. Dominus vobiscum.' }, title: 'Малітва', tags: ['private'], priestOnly: true };
  const plan = buildPrayerNormalizationPlan([{ id: 'fixture', data }], { snapshot });
  assert.ok(checkPrayerPlan(JSON.parse(JSON.stringify(plan))));
  const selection = selectPrayerNormalizationPlan(plan, { rules: ['speaker-label'] });
  assert.equal(selection.length, 1);
  assert.deepEqual(selection[0].updates.map(update => [update.field, update.locale]), [['textVersions', 'be']]);
  const after = writePrayerPlanUpdates(data, selection[0].updates);
  assert.equal(after.textVersions.la, data.textVersions.la);
  assert.deepEqual(after.tags, data.tags);
  assert.equal(after.priestOnly, true);
  const tampered = structuredClone(plan); tampered.documents[0].updates[0].after += ' Added words';
  assert.throws(() => checkPrayerPlan(tampered), /hash/);
  assert.throws(() => selectPrayerNormalizationPlan(plan, { rules: ['invent-role'] }), /Rule/);
  assert.throws(() => writePrayerPlanUpdates(data, [{ field: 'priestOnly', after: false }]), /Forbidden/);
  assert.throws(() => writePrayerPlanUpdates(data, [{ field: 'textVersions', locale: '__proto__', after: 'x' }]), /locale/);
  assert.deepEqual(data.textVersions, { be: '**С.:** Пане, пачуй нас.', la: 'V. Dominus vobiscum.' });
});

test('snapshot and live Timestamp encodings have stable hashes after JSON persistence', () => {
  const timestamp = { seconds: 123, nanoseconds: 456, toDate: () => new Date(123000) };
  const plan = buildPrayerNormalizationPlan([entry('С.: Пане, пачуй нас.', { createdAt: timestamp })], { snapshot });
  assert.equal(prayerPlanHash(plan.documents[0].before), plan.documents[0].beforeHash);
  assert.ok(checkPrayerPlan(JSON.parse(JSON.stringify(plan))));
});

test('version drift is rejected even if a later edit reverted the document to identical data', async () => {
  const plan = buildPrayerNormalizationPlan([{ ...entry('С.: Пане, пачуй нас.'), updateTime: 1 }], { snapshot });
  const documents = selectPrayerNormalizationPlan(plan, { rules: ['speaker-label'] });
  const adapter = fakeAdapter(documents);
  adapter.rows.get('fixture').version = 2;
  await assert.rejects(applyPrayerNormalization(documents, adapter, { planHash: 'x', persist: async () => {} }), /version changed/);
  assert.equal(adapter.writes, 0);
});

test('real SDK validates locale FieldPath and updateTime overload without any remote commit', async () => {
  const { Firestore, FieldPath, Timestamp } = await import('@google-cloud/firestore');
  const db = new Firestore({ projectId: 'demo-prayer-stage2-no-network' });
  const originalBatch = db.batch.bind(db);
  let localCommits = 0;
  db.batch = () => {
    const batch = originalBatch();
    batch.commit = async () => { localCommits += 1; return []; };
    return batch;
  };
  try {
    await firestorePrayerAdapter(db, { firestore: { FieldPath } }).commit([{ id: 'fixture', updateTime: Timestamp.fromMillis(1),
      updates: [{ field: 'textVersions', locale: 'be', value: 'Малітва', remove: false }] }]);
    assert.equal(localCommits, 1);
  } finally { await db.terminate(); }
});

function fakeAdapter(initial, { failBatch = 0, race = false, corrupt = false, commitThenFail = false } = {}) {
  const rows = new Map(initial.map(document => [document.id, { data: structuredClone(document.before), version: 1 }]));
  let writes = 0, reads = 0;
  return { rows, get writes() { return writes; },
    async read(ids) {
      reads += 1;
      if (race && reads === 2) rows.get(ids[0]).data.priestOnly = false;
      return ids.map(id => ({ id, exists: rows.has(id), data: structuredClone(rows.get(id)?.data), updateTime: rows.get(id)?.version }));
    },
    async commit(patches) {
      if (failBatch && writes + 1 === failBatch) throw new Error('Injected batch failure');
      for (const patch of patches) assert.equal(rows.get(patch.id).version, patch.updateTime);
      writes += 1;
      for (const patch of patches) {
        const row = rows.get(patch.id);
        for (const update of patch.updates) {
          const target = update.locale ? (row.data.textVersions ||= {}) : row.data;
          const key = update.locale || update.field;
          if (update.remove) delete target[key]; else target[key] = update.value;
        }
        row.version += 1;
        if (corrupt) row.data.title = 'Corrupt';
      }
      if (commitThenFail) throw new Error('Unknown commit outcome');
    },
  };
}

test('small batches create durable backup before writes, verify unchanged metadata and restore original texts', async () => {
  const plan = buildPrayerNormalizationPlan([entry('**С.:** Пане, пачуй нас.', { priestOnly: true }), { ...entry('Н.: Амэн.'), id: 'second' }], { snapshot });
  const documents = selectPrayerNormalizationPlan(plan, { rules: ['speaker-label'] });
  const adapter = fakeAdapter(documents);
  const history = [];
  const journal = await applyPrayerNormalization(documents, adapter, { planHash: 'approved-selection', batchSize: 1, persist: async value => history.push(structuredClone(value)) });
  assert.equal(history[0].status, 'prepared');
  assert.equal(history[0].backup.length, 2);
  assert.equal(journal.status, 'verified');
  assert.equal(adapter.writes, 2);
  assert.equal(adapter.rows.get('fixture').data.priestOnly, true);
  const restored = await applyPrayerNormalization(documents, adapter, { planHash: 'restore-selection', restore: true, persist: async () => {} });
  assert.equal(restored.status, 'verified');
  assert.deepEqual(adapter.rows.get('fixture').data, documents[0].before);
});

test('full-document drift, a race and post-write corruption are refused; partial batches resume safely', async () => {
  const plan = buildPrayerNormalizationPlan([entry('С.: Пане, пачуй нас.'), { ...entry('Н.: Амэн.'), id: 'second' }], { snapshot });
  const documents = selectPrayerNormalizationPlan(plan, { rules: ['speaker-label'] });
  const adapter = fakeAdapter(documents, { failBatch: 2 });
  let journal;
  await assert.rejects(applyPrayerNormalization(documents, adapter, { planHash: 'selection', batchSize: 1, persist: async value => { journal = structuredClone(value); } }), /batch failure/);
  assert.equal(journal.completed.length, 1);
  const stable = fakeAdapter(documents);
  stable.rows.set('fixture', structuredClone(adapter.rows.get('fixture')));
  await applyPrayerNormalization(documents, stable, { planHash: 'selection', journal, persist: async () => {} });
  assert.equal(stable.writes, 1);
  const drift = fakeAdapter(documents); drift.rows.get('fixture').data.priestOnly = true;
  await assert.rejects(applyPrayerNormalization(documents, drift, { planHash: 'x', persist: async () => {} }), /drift/);
  assert.equal(drift.writes, 0);
  const raced = fakeAdapter(documents, { race: true });
  await assert.rejects(applyPrayerNormalization(documents, raced, { planHash: 'x', persist: async () => {} }), /after preflight/);
  assert.equal(raced.writes, 0);
  const corrupt = fakeAdapter(documents, { corrupt: true });
  await assert.rejects(applyPrayerNormalization(documents, corrupt, { planHash: 'x', persist: async () => {} }), /verification/);
});

test('an interrupted batch with unknown commit outcome is reconciled before resume or further writes', async () => {
  const plan = buildPrayerNormalizationPlan([entry('С.: Пане, пачуй нас.')], { snapshot });
  const documents = selectPrayerNormalizationPlan(plan, { rules: ['speaker-label'] });
  const interrupted = fakeAdapter(documents, { commitThenFail: true });
  let journal;
  await assert.rejects(applyPrayerNormalization(documents, interrupted, { planHash: 'selection', persist: async value => { journal = structuredClone(value); } }), /Unknown commit/);
  assert.equal(journal.inFlight.length, 1);
  const resumed = fakeAdapter(documents); resumed.rows.set('fixture', interrupted.rows.get('fixture'));
  const result = await applyPrayerNormalization(documents, resumed, { planHash: 'selection', journal, persist: async () => {} });
  assert.equal(result.status, 'verified');
  assert.equal(resumed.writes, 0);
});

test('Mass fields are not migrated without parity; parser output remains stable in all three languages', () => {
  for (const variant of MASS_RITUAL.variants) {
    const source = '## Уступныя абрады\n\nС.: Пан з вамі.\nН.: І з духам тваім.';
    const before = buildMassDocument(source, variant, 'mybrev-markdown');
    const plan = buildPrayerNormalizationPlan([{ id: variant.prayerId, data: entry(source).data }], { snapshot });
    assert.equal(plan.documents[0].updates.length, 0);
    assert.deepEqual(buildMassDocument(plan.documents[0].before.text, variant, 'mybrev-markdown'), before);
  }
});

test('CLI rejects missing approvals and unknown switches before importing Firebase', async () => {
  assert.throws(() => parsePrayerNormalizationArgs(['--rule']), /Missing/);
  assert.throws(() => parsePrayerNormalizationArgs(['--approve-group', 'x']), /Unknown/);
  await assert.rejects(runPrayerNormalization(['--apply']), /requires a frozen plan/);
  await assert.rejects(runPrayerNormalization([]), /Specify --snapshot/);
});

test('optional real local corpus is idempotent and preserves every automatic proposal; authentic Angelus section is quoted', { skip: !process.env.PRAYER_NORMALIZATION_SNAPSHOT }, async () => {
  const source = await openFirestoreSnapshot(process.env.PRAYER_NORMALIZATION_SNAPSHOT);
  const entries = await source.collectionEntries('prayers');
  const plan = buildPrayerNormalizationPlan(entries, { snapshot: source.manifest, categories: await source.collection('prayerCategories') || [] });
  assert.equal(plan.stats.documents, entries.length);
  for (const document of plan.documents) for (const field of document.updates.filter(field => field.field === 'text' || field.field === 'textVersions')) {
    assert.ok(verifyPrayerNormalization(field.before, field.after).passed);
    assert.equal(normalizePrayerLegacyMarkdown(field.after).changed, false);
    assert.equal(prayerPlanHash(document.before), document.beforeHash);
  }
  const compound = entries.find(entry => /### Анёл Панскі/.test(entry.data.text || ''));
  if (compound) {
    const rendered = renderPrayerMarkdown(compound.data.text, 'mybrev-markdown');
    assert.match(rendered, /<blockquote>/);
    assert.match(rendered, /class="prayer-speaker" data-role="priest">С\.:<\/span>/);
  }
});
