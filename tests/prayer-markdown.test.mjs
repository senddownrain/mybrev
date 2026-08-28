import assert from 'node:assert/strict';
import test from 'node:test';
import {
  autoFixPrayerMarkdown,
  htmlToPrayerMarkdown,
  promotePrayerRubrics,
  prayerMarkdownToPlainText,
  renderPrayerMarkdown,
  validatePrayerMarkdown,
} from '../src/utils/prayerMarkdown.js';
import { buildPrayerAutofixPlan } from '../scripts/autofix-prayer-markdown.mjs';

test('autofix repairs common Markdown and Word artifacts', () => {
  const result = autoFixPrayerMarkdown('#Загаловак\u00a0  \n\n• Першы пункт\n2)Другі пункт\n\n::: rubric\nУсе ўстаюць.');
  assert.equal(
    result.markdown,
    '# Загаловак\n\n- Першы пункт\n2. Другі пункт\n\n:::rubric\nУсе ўстаюць.\n:::',
  );
  assert.equal(result.changed, true);
  assert.deepEqual(validatePrayerMarkdown(result.markdown), []);
});

test('autofix removes orphan rubric closers and closes nested rubric blocks', () => {
  const result = autoFixPrayerMarkdown('::: \nТэкст\n\n:::rubric\nПершая\n:::rubric\nДругая\n:::');
  assert.equal(result.markdown, 'Тэкст\n\n:::rubric\nПершая\n:::\n:::rubric\nДругая\n:::');
  assert.deepEqual(validatePrayerMarkdown(result.markdown), []);
});

test('autofix attaches standalone strong markers to the enclosed text', () => {
  const result = autoFixPrayerMarkdown('Пачатак\n\n**\nВажная фраза\nна дзвюх радках\n**\n\nКанец');
  assert.equal(
    result.markdown,
    'Пачатак\n\n**Важная фраза\nна дзвюх радках**\n\nКанец',
  );
  assert.match(renderPrayerMarkdown(result.markdown), /<strong>Важная фраза<br>\nна дзвюх радках<\/strong>/);
});

test('autofix formats separate paragraphs between standalone strong markers', () => {
  const result = autoFixPrayerMarkdown('**\nПершы абзац\n\nДругі абзац\n**');
  assert.equal(result.markdown, '**Першы абзац**\n\n**Другі абзац**');
});

test('prayer autofix migration updates text fields without exposing untouched documents', () => {
  const plan = buildPrayerAutofixPlan([
    { id: 'changed', text: '**\nВажна\n**', textFormat: 'mybrev-markdown', textFormatVersion: 1 },
    { id: 'unchanged', text: 'Звычайны тэкст', textFormat: 'mybrev-markdown', textFormatVersion: 1 },
  ]);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].id, 'changed');
  assert.deepEqual(plan[0].updates, [
    { field: 'text', before: '**\nВажна\n**', after: '**Важна**' },
  ]);
});

test('prayer autofix migration repairs legacy localized text and sets its Markdown format', () => {
  const plan = buildPrayerAutofixPlan([
    { id: 'legacy', textVersions: { be: '#Загаловак' } },
  ]);
  assert.deepEqual(plan[0].updates, [
    { field: 'textVersions', before: { be: '#Загаловак' }, after: { be: '# Загаловак' } },
    { field: 'textFormat', before: undefined, after: 'mybrev-markdown' },
    { field: 'textFormatVersion', before: undefined, after: 1 },
  ]);
});

test('promotes clear liturgical directions to rubric blocks', () => {
  const result = promotePrayerRubrics('Пасля кароткага маўчання цэлебрант кажа:\n\nБожа, пачуй нас.\n\nСвятар робіць знак крыжа.');
  assert.equal(
    result.markdown,
    ':::rubric\nПасля кароткага маўчання цэлебрант кажа:\n:::\n\nБожа, пачуй нас.\n\n:::rubric\nСвятар робіць знак крыжа.\n:::',
  );
  assert.equal(result.rubricsAdded, 2);
});

test('does not promote speaker labels, spoken lines, quotations, or litany responses', () => {
  const source = 'Святар:\n\nЦ.: Молімся: Божа, пачуй нас.\n\n_«Пан кажа: любіце адзін аднаго»_\n\n– _змілуйся над намі._';
  assert.deepEqual(promotePrayerRubrics(source), { markdown: source, changed: false, rubricsAdded: 0 });
});

test('prayer autofix migration can include action-direction rubric promotion', () => {
  const plan = buildPrayerAutofixPlan([
    { id: 'rubrics', text: 'Святар кажа:\n\nПамолімся.', textFormat: 'mybrev-markdown', textFormatVersion: 1 },
  ], { rubrics: true });
  assert.deepEqual(plan[0].updates, [
    { field: 'text', before: 'Святар кажа:\n\nПамолімся.', after: ':::rubric\nСвятар кажа:\n:::\n\nПамолімся.' },
  ]);
});

test('renders CommonMark and the MyBrev rubric block', () => {
  const html = renderPrayerMarkdown('**Памолімся.**\n\n:::rubric\nУсе ўстаюць.\n:::');
  assert.match(html, /<strong>Памолімся\.<\/strong>/);
  assert.match(html, /<aside class="prayer-rubric">/);
  assert.match(html, /<p>Усе ўстаюць\.<\/p>/);
});

test('preserves intentional single line breaks in litanies', () => {
  const html = renderPrayerMarkdown('Кірые, элейсон,\n_Хрыстэ, элейсон._');
  assert.match(html, /Кірые, элейсон,<br>\n<em>Хрыстэ, элейсон\.<\/em>/);
});

test('does not execute raw HTML from prayer source', () => {
  const html = renderPrayerMarkdown('<script>alert(1)</script>');
  assert.doesNotMatch(html, /<script>/);
  assert.equal(html, '');
});

test('converts legacy rich HTML and standalone emphasis to Markdown rubrics', () => {
  const markdown = htmlToPrayerMarkdown('<h2>Раздзел</h2><p><em>Усе ўстаюць.</em></p><p><strong>Памолімся.</strong></p>');
  assert.equal(markdown, '## Раздзел\n\n:::rubric\nУсе ўстаюць.\n:::\n\n**Памолімся.**');
});

test('keeps emphasized list items inside the CommonMark list', () => {
  const markdown = htmlToPrayerMarkdown('<ol><li><p><em>Ойча наш…</em></p></li></ol>');
  assert.equal(markdown, '1.  _Ойча наш…_');
  assert.deepEqual(validatePrayerMarkdown(markdown), []);
});

test('can promote inline legacy emphasis to rubric blocks for Mass orders', () => {
  const markdown = htmlToPrayerMarkdown(
    '<p>Пан з вамі.<em>Народ адказвае:</em>І з духам тваім.</p>',
    { emphasisAsRubric: true },
  );
  assert.equal(markdown, 'Пан з вамі.\n\n:::rubric\nНарод адказвае:\n:::\n\nІ з духам тваім.');
  assert.deepEqual(validatePrayerMarkdown(markdown), []);
});

test('validates paired rubric markers', () => {
  assert.deepEqual(validatePrayerMarkdown(':::rubric\nУсе ўстаюць.\n:::'), []);
  assert.equal(validatePrayerMarkdown(':::rubric\nУсе ўстаюць.').length, 1);
});

test('drops empty legacy headings', () => {
  assert.doesNotMatch(htmlToPrayerMarkdown('<h3><br></h3><p>Тэкст</p>'), /^###\s*$/m);
});

test('creates clean text for search and copying', () => {
  assert.equal(
    prayerMarkdownToPlainText('## Раздзел\n\n:::rubric\nУсе ўстаюць.\n:::\n\n**Памолімся.**'),
    'Раздзел\n\nУсе ўстаюць.\n\nПамолімся.',
  );
});
