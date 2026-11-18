import test from 'node:test';
import assert from 'node:assert/strict';
import { entryToMarkdown, escapeMd, fixLatinInCyrillic, runsToMarkdown } from '../scripts/prayer-import/lib/blocks-to-markdown.mjs';
import { prayerMarkdownToPlainText, renderPrayerMarkdown } from '../src/utils/prayerMarkdown.js';
import { block, litanyEntry, run } from './helpers/prayer-import-fixture.mjs';

test('litany: title dropped, lines kept as lines, italics, rubric block, speaker labels and prayer label', () => {
  const { markdown, stats } = entryToMarkdown(litanyEntry('e1', 'Літанія да св. Юзафа'));
  assert.equal(stats.droppedTitle, 1);
  assert.match(markdown, /^Кірые, элейсон,\n_Хрыстэ, элейсон_\.\n\nСвяты Юзафе, — _маліся за нас_\.\nАпекуне/);
  assert.match(markdown, /:::rubric\nПросьбы прамаўляе кантар\.\n:::/);
  assert.match(markdown, /К\.: Святы Юзафе,\nН\.: маліся за нас\./);
  assert.match(markdown, /\*\*Молімся\*\*: Божа/);
  assert.doesNotMatch(markdown, /^#/m);
});
test('rendered by the app renderer every word survives and no raw HTML appears', () => {
  const entry = litanyEntry('e2', 'Літанія', { extra: [block('paragraph', '<script>alert(1)</script> *зорка* [x]')] });
  const { markdown } = entryToMarkdown(entry);
  const html = renderPrayerMarkdown(markdown, 'mybrev-markdown');
  assert.doesNotMatch(html, /<script/i);
  const words = (s) => s.replace(/[*_]/g, ' ').split(/\s+/).filter(Boolean).join(' ');
  const source = words(entry.blocks.slice(1).map((b) => b.text).join(' '));
  assert.equal(words(prayerMarkdownToPlainText(markdown)).replace(/\s+/g, ' '), source);
});
test('mixed red/black block: red part becomes bold (colour is not representable in Markdown)', () => {
  const entry = litanyEntry('e3', 'Х', { extra: [block('refrain', 'Рэфрэн: Пан — святло.', { runs: [run('Рэфрэн: ', { color: '#ed008c' }), run('Пан — святло.')] })] });
  const { markdown, stats } = entryToMarkdown(entry);
  assert.match(markdown, /\*\*Рэфрэн\*\*: Пан — святло\./);
  assert.equal(stats.mixedRed, 1);
});
test('emphasis hugs the words; lone punctuation and intra-word styling do not leak markers', () => {
  assert.equal(runsToMarkdown([run('Ойча наш'), run('.', { italic: true })]), 'Ойча наш.');
  assert.equal(runsToMarkdown([run('нам'), run('а', { italic: true }), run('сціў')]), 'намасціў');
  assert.equal(runsToMarkdown([run('брата (сястру) '), run(') N.', { bold: true })]).includes('**'), true);
  assert.equal(runsToMarkdown([run(' слова ', { italic: true })]), ' _слова_ ');
});
test('escaping keeps list-like and emphasis characters literal', () => {
  assert.equal(escapeMd('1. Уступная *x* [a]', { lineStart: true }), '1. Уступная \\*x\\* \\[a\\]');
  assert.equal(escapeMd('- Просьба', { lineStart: true }), '\\- Просьба');
});
test('cross references become /prayer/<id> links only for planned targets', () => {
  const ref = { refTitle: 'Літанія да Духа', targetEntryId: 'target-1', status: 'resolved' };
  const entry = litanyEntry('e4', 'Н', { extra: [block('list_item', '3. Літанія да Духа (с. 64)', { semantic: { number: 3 } })] });
  entry.crossReferences = [ref];
  assert.match(entryToMarkdown(entry, { resolveLink: (id) => (id === 'target-1' ? 'cn_abc' : null) }).markdown, /3\. \[Літанія да Духа\]\(\/prayer\/cn_abc\)/);
  const unresolved = entryToMarkdown(entry, { resolveLink: () => null });
  assert.match(unresolved.markdown, /\(с\. 64\)/); assert.equal(unresolved.stats.unresolvedLinks, 1);
});
test('days become headings, separators a rule, Latin look-alikes in Cyrillic words are fixed', () => {
  const entry = litanyEntry('e5', 'Навэнна', { kind: 'novena', extra: [block('day', 'Першы дзень', { semantic: { level: 2 }, runs: [run('Першы дзень', { bold: true })] }), block('separator', '* * *')] });
  const { markdown } = entryToMarkdown(entry);
  assert.match(markdown, /^## Першы дзень$/m); assert.match(markdown, /^\*\*\*$/m);
  assert.equal(fixLatinInCyrillic('Найсвяцейшага Iмені Езус'), 'Найсвяцейшага Імені Езус');
  assert.equal(fixLatinInCyrillic('Rite N. VIII'), 'Rite N. VIII');
});
