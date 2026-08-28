import assert from 'node:assert/strict';
import test from 'node:test';
import { buildImportPlan } from '../scripts/import-prayer-markdown-collection.mjs';

const downloads = 'C:/Users/User/Downloads';

test('the supplied full collection produces 25 tagged Markdown prayer documents', async () => {
  const prayers = await buildImportPlan({
    archive: `${downloads}/malitvy_md_collection_full.zip`,
    marianSource: `${downloads}/malitvy_ajcou_maryjanau.md`,
  });

  assert.equal(prayers.length, 25);
  assert.equal(new Set(prayers.map((prayer) => prayer.id)).size, 25);
  assert.deepEqual(prayers[0].tags, ['На кожны дзень']);
  assert.equal(prayers[0].title, 'Малітвы на кожны дзень тыдня');
  assert.match(prayers[0].text, /- \[Нядзеля\]/);
  assert.ok(prayers.every((prayer) => prayer.textFormat === 'mybrev-markdown' && prayer.textFormatVersion === 1));
  assert.ok(prayers.every((prayer) => !prayer.text.startsWith('# ')));
});
