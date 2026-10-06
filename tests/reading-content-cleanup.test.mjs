import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectReadingText } from '../src/utils/readingTextNormalization.js';
import { formatResponsorialPsalmHtml } from '../src/utils/responsorialPsalmHtml.js';
import { buildReadingParagraphPlan } from '../scripts/cleanup-reading-paragraphs.mjs';

const poem = [
  'Заспяваю прыяцелю майму',
  'песню сябра майго пра вінаграднік ягоны:',
  'Мой сябра меў вінаграднік',
  'на ўрадлівай гары.',
  'Ён ускапаў яго і ачысціў яго ад камення,',
  'і пасадзіў у ім адборную вінаградную лазу,',
  'і пабудаваў вежу пасярод яго,',
  'і давіла вычасаў у ім.',
];

test('short poetic lines lose only the accidental blank line and stay idempotent', () => {
  const result = inspectReadingText(poem.join('\n\n'));
  assert.equal(result.kind, 'change');
  assert.equal(result.value, poem.join('\n'));
  assert.equal(inspectReadingText(result.value).kind, 'unchanged');
});

test('a prose introduction keeps its paragraph before a run of poetic lines', () => {
  const introduction = 'У ранейшыя часы прыніжана была зямля Забулонава і зямля Нэфталіева, але ў будучыні праслаўлены будзе прыморскі шлях, зямля за Ярданам, Галілея язычнікаў.';
  const source = [introduction, ...poem].join('\n\n');
  const result = inspectReadingText(source);
  assert.equal(result.kind, 'change');
  assert.equal(result.value, `${introduction}\n\n${poem.join('\n')}`);
  assert.equal(inspectReadingText(result.value).kind, 'unchanged');
});

test('mixed prose and real paragraphs are left for review', () => {
  const text = ['У тыя дні:', ...poem.slice(0, 7), 'A long paragraph. '.repeat(12)].join('\n\n');
  assert.equal(inspectReadingText(text).kind, 'review');
  assert.equal(inspectReadingText('Першы абзац.\n\nДругі абзац.').kind, 'unchanged');
});

test('plan examines every reading and gospel without changing uncertain fields', () => {
  const plan = buildReadingParagraphPlan([{ id: 'example', reading1: { text: poem.join('\n\n') },
    reading2: { text: 'Першы.\n\nДругі.' }, gospel: { text: 'У той час:\n\nДоўгая проза.' } }]);
  assert.deepEqual(plan.changes.map((entry) => entry.section), ['reading1']);
  assert.equal(plan.review.length, 0);
});

test('responsorial psalm gets verse breaks and rubric spans without empty lines', () => {
  const html = formatResponsorialPsalmHtml('<p>9. Лаза, * прагнаў язычнікаў.12. Яна расла. 13. Наступны † радок, * яшчэ.14. Канец.</p>');
  assert.match(html, /<span class="psalm-marker">\*<\/span><br>прагнаў/u);
  assert.match(html, /язычнікаў\.<br>12\./u);
  assert.match(html, /расла\.<br>13\./u);
  assert.match(html, /яшчэ\.<br>14\./u);
  assert.match(html, /<span class="psalm-marker">†<\/span>/u);
  assert.doesNotMatch(html, /<br><br>/u);
});

test('psalm formatting leaves HTML attributes intact', () => {
  assert.equal(formatResponsorialPsalmHtml('<span data-verse="12.*">9. Слова</span>'),
    '<span data-verse="12.*">9. Слова</span>');
});

test('plain psalm text and existing cadence breaks remain well formed', () => {
  assert.equal(formatResponsorialPsalmHtml('<p>9. Слова. 12. Яна.</p>'),
    '<p>9. Слова.<br>12. Яна.</p>');
  assert.equal(formatResponsorialPsalmHtml('<p>9. Слова, *<br>12. Яна, * яшчэ † тэкст.</p>'),
    '<p>9. Слова, <span class="psalm-marker">*</span><br>12. Яна, <span class="psalm-marker">*</span><br>яшчэ <span class="psalm-marker">†</span> тэкст.</p>');
});
