import assert from 'node:assert/strict';
import test from 'node:test';
import {
  htmlToPrayerMarkdown,
  prayerMarkdownToPlainText,
  renderPrayerMarkdown,
  validatePrayerMarkdown,
} from '../src/utils/prayerMarkdown.js';

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
