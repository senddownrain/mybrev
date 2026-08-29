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
  assert.equal(
    prayers.find((prayer) => prayer.id === 'import-02-agulny-katekhizis').source,
    '[https://catholic.by/3/lib/pray/4480-agulny-katekhizis](https://catholic.by/3/lib/pray/4480-agulny-katekhizis)',
  );
  assert.equal(
    prayers.find((prayer) => prayer.id === 'import-05-vyanochak-za-kanayuchykh-i-pamerlykh').source,
    '[https://ave-maria.by/prayers/dead/2940-vyanochak-za-kanayuchykh-i-pamerlykh](https://ave-maria.by/prayers/dead/2940-vyanochak-za-kanayuchykh-i-pamerlykh)',
  );
  assert.equal(
    prayers.find((prayer) => prayer.id === 'import-01-malitvy-na-kozhny-dzen-tydnya').source,
    '[https://catholic.by/3/lib/pray/4484-malitvy-na-kozhny-dzen-tydnya](https://catholic.by/3/lib/pray/4484-malitvy-na-kozhny-dzen-tydnya)',
  );
  assert.equal(prayers.filter((prayer) => prayer.source).length, 24);
  assert.equal(prayers.find((prayer) => prayer.id === 'import-malitvy-ajcou-maryjanau').source, '');
  assert.ok(prayers.every((prayer) => !/^>\s*Крыніца:/mu.test(prayer.text)));
});
