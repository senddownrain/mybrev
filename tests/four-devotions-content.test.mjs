import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prepareFourDevotions, validateContent } from '../scripts/validate-four-devotions.mjs';

test('four liturgical PDF extracts pass offline Markdown structure and SHA checks', async () => {
  const report = await prepareFourDevotions();
  assert.equal(report.mode, 'OFFLINE_DRY_RUN');
  assert.equal(report.writesPerformed, 0);
  assert.equal(report.snapshotChecked, false);
  assert.equal(report.candidates.length, 4);
  assert.deepEqual(report.candidates.map(({ decision }) => decision), Array(4).fill('PENDING_SNAPSHOT'));
  assert.ok(report.candidates.every(({ errors }) => errors.length === 0));
  assert.ok(report.blockers.some((value) => value.includes('No local snapshot')));
  assert.equal(new Set(report.candidates.map(({ id }) => id)).size, 4);
});

test('validator rejects unsafe / malformed rubrics, missing stations and H1 duplicates', () => {
  const errors = validateContent('# Duplicate title\n\n:::rubric\n:::rubric\n:::\n## Heading\n', 'devotion-euharystychnaja-pracesija');
  assert.ok(errors.some((message) => message.includes('nested rubric')));
  assert.ok(errors.some((message) => message.includes('redundant title')));
  assert.ok(errors.some((message) => message.includes('Першы прыпынак')));
});

test('validator rejects reversed procession stations', () => {
  const text = ['Другі', 'Першы', 'Трэці', 'Чацвёрты'].map((name) => `## ${name} прыпынак\n`).join('\n');
  assert.ok(validateContent(text, 'devotion-euharystychnaja-pracesija').some((error) => error.includes('in order')));
});

test('snapshot comparison finds exact and partial duplicates under different titles and IDs', async (t) => {
  const snapshotPath = await mkdtemp(path.join(tmpdir(), 'four-devotions-'));
  t.after(() => rm(snapshotPath, { recursive: true, force: true }));
  const { candidates: [first, second, third] } = await prepareFourDevotions();
  const excerpt = third.proposed.text.split('\n').filter((line) => line.length >= 160).slice(0, 2).join('\n\n');
  const collections = {};
  const rows = {
    prayers: [
      { id: second.id, data: second.proposed },
      { id: 'public-excerpt', data: { ...third.proposed, title: 'Скарочаны тэкст', text: excerpt } },
    ],
    priestProtectedPrayers: [{ id: 'copied', data: { ...first.proposed, title: 'Іншая назва', priestOnly: true } }],
    prayerCategories: [{ id: 'devotions', data: { name: 'Набажэнствы', tags: ['Набажэнства'] } }],
    priestProtectedCategories: [],
  };
  for (const [collectionPath, documents] of Object.entries(rows)) {
    const file = `${collectionPath}.json`;
    collections[collectionPath] = { file, documentCount: documents.length };
    await writeFile(path.join(snapshotPath, file), JSON.stringify({ schemaVersion: 1, collectionPath, documents }));
  }
  await writeFile(path.join(snapshotPath, 'manifest.json'), JSON.stringify({ schemaVersion: 1, collections }));
  const plan = await prepareFourDevotions({ snapshotPath });
  assert.deepEqual(plan.candidates.map(({ decision }) => decision), [
    'DUPLICATE_REVIEW', 'ALREADY_EXISTS', 'DUPLICATE_REVIEW', 'CREATE_CANDIDATE',
  ]);
  assert.equal(plan.candidates[0].existing[0].collection, 'priestProtectedPrayers');
  assert.equal(plan.candidates[2].existing[0].sharedParagraphs, 2);
});
