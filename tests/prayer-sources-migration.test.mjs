import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPrayerSourcePlan,
  extractPrayerSource,
  extractPrayerTitleSource,
} from '../scripts/migrate-prayer-sources.mjs';
import { extractEmbeddedSource } from '../scripts/import-prayer-markdown-collection.mjs';

test('extracts an explicit source note from the end of prayer Markdown', () => {
  assert.deepEqual(
    extractPrayerSource('Тэкст малітвы.\n\n_Крыніца: Рымскі Імшал._'),
    { text: 'Тэкст малітвы.', source: 'Рымскі Імшал', changed: true },
  );
});

test('extracts the imported blockquote source and removes it from the prayer text', () => {
  const url = 'https://example.com/prayer';
  assert.deepEqual(
    extractEmbeddedSource(`> Крыніца: ${url}\n\nТэкст малітвы.`),
    { text: 'Тэкст малітвы.', source: `[${url}](${url})` },
  );
});

test('does not treat ordinary attribution or a Scripture citation as a source note', () => {
  const text = 'Малітва паводле св. Яна Паўла ІІ.\n\n«Слова Божае» (Ян 1, 1).';
  assert.deepEqual(extractPrayerSource(text), { text, source: '', changed: false });
});

test('extracts an explicit author attribution from a prayer title', () => {
  assert.deepEqual(
    extractPrayerTitleSource('Малітва да Маці Божай Балеснай (Св. Бонавэнтура)'),
    {
      title: 'Малітва да Маці Божай Балеснай',
      source: 'Св. Бонавэнтура',
      changed: true,
    },
  );
});

test('moves identical localized source notes into one source field', () => {
  const plan = buildPrayerSourcePlan([{
    id: 'one',
    titleVersions: { be: 'Малітва' },
    textVersions: {
      be: 'Тэкст.\n\nКрыніца: Бог добры',
      ru: 'Текст.\n\nИсточник: Бог добры',
    },
  }]);
  assert.equal(plan.changes.length, 1);
  assert.deepEqual(plan.changes[0].updates, {
    source: 'Бог добры',
    textVersions: { be: 'Тэкст.', ru: 'Текст.' },
  });
  assert.deepEqual(plan.ambiguous, []);
});

test('reports conflicting localized sources instead of guessing', () => {
  const plan = buildPrayerSourcePlan([{
    id: 'one',
    textVersions: {
      be: 'Тэкст.\n\nКрыніца: Выданне A',
      ru: 'Текст.\n\nИсточник: Издание B',
    },
  }]);
  assert.equal(plan.changes.length, 0);
  assert.equal(plan.ambiguous.length, 1);
});
