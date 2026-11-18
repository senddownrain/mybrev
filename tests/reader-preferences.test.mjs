import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'node-html-parser';
import { normalizeTextAlignment, TEXT_ALIGNMENTS } from '../src/utils/readerPreferences.js';
import { markReaderProse } from '../src/directives/readerProse.js';
import { PSALMODY_PREVIEW_HTML, PSALMODY_PREVIEW_SOURCE } from '../src/constants/psalmodyPreview.js';
import { formatPsalmHtml } from '../src/utils/liturgicalHtml.js';

test('alignment defaults to justify; a saved explicit left choice survives', () => {
  for (const value of [null, undefined, '', 'left', 'obsolete', 1, {}, 'JUSTIFY']) assert.equal(normalizeTextAlignment(value), 'justify');
  for (const alignment of TEXT_ALIGNMENTS) assert.equal(normalizeTextAlignment(alignment), alignment);
});

test('only selected Hours parts opt into reader alignment', () => {
  const base = new URL('../src/components/oraparts/', import.meta.url);
  for (const name of ['Reading', 'Lectio', 'LastPrayer']) {
    const content = readFileSync(new URL(`${name}.vue`, base), 'utf8');
    assert.match(content, /class="ora-text reader-align-office"/);
  }
  const dayTitle = readFileSync(new URL('DayTitle.vue', base), 'utf8');
  assert.match(dayTitle, /reader-align-comment/g);
  const css = readFileSync(new URL('../src/styles/main.scss', import.meta.url), 'utf8');
  assert.match(css, /\.ora-text\.reader-align-office/);
  assert.match(css, /\.day-title-comment\.reader-align-comment/);
});

test('only prose paragraphs are marked; structured and liturgical content stays intact', () => {
  const root = parse(`<div>
    <p id="prose">Звычайны абзац.</p><p id="inline">Частка <em>абзаца</em> вылучана.</p>
    <h2>Загаловак</h2><p><strong>Падзагаловак</strong></p>
    <p><em>Курсіўная рубрыка.</em></p><p style="text-align:center">Подпіс</p>
    <aside class="prayer-rubric"><p>Рубрыка</p></aside>
    <ul><li><p>Спіс</p></li></ul><table><tr><td><p>Табліца</p></td></tr></table>
    <p>Страфа<br>Другі радок</p><p><span class="prayer-speaker">К.</span> Адказ</p>
    <p>К. Адказ</p><p>Ант. Рэфрэн</p><p><a href="/bible">Спасылка</a></p>
    <p><span style="color:red">Рубрыка</span></p><p data-liturgical-reference>Лк 1</p>
    <p class="reading-acclamation">Гэта слова Божае.</p><p class="mass-comment">Рубрыка</p>
    <p class="mass-posture">Стоячы</p><p class="mass-alternative">Або</p>
    <p class="mass-response">Амэн.</p><p class="mass-spoken" id="mass">Звычайны тэкст Імшы.</p>
    <div class="psalmody-text"><p>Псальм</p></div>
    <div class="liturgical-hour-column"><p>Чытанне ў Гадзінах</p></div>
    <div class="devotional-office"><p>Малітва ў Гадзінах</p></div>
  </div>`);
  const original = root.textContent;
  markReaderProse(root);
  assert.deepEqual(root.querySelectorAll('[data-reader-prose]').map(p => p.id), ['prose', 'inline', 'mass']);
  assert.equal(root.textContent, original);
  markReaderProse(root);
  assert.equal(root.querySelectorAll('[data-reader-prose]').length, 3, 'safe to update twice');
  root.querySelector('#prose').innerHTML = 'Страфа<br>радок';
  markReaderProse(root);
  assert.equal(root.querySelector('#prose').hasAttribute('data-reader-prose'), false, 'reclassifies reused HTML');
});

test('preview is an exact, consecutive excerpt from the verified public Hours source', () => {
  const source = JSON.parse(readFileSync(new URL(`../${PSALMODY_PREVIEW_SOURCE.path}`, import.meta.url), 'utf8'))[PSALMODY_PREVIEW_SOURCE.field];
  const strophes = source.match(/<p>.*?<\/p>/gu);
  assert.equal(PSALMODY_PREVIEW_HTML, PSALMODY_PREVIEW_SOURCE.paragraphs.map(i => strophes[i]).join('\n'));
  const html = formatPsalmHtml(PSALMODY_PREVIEW_HTML);
  assert.equal(parse(html).querySelectorAll('[data-psalm-strophe]').length, 3);
  assert.equal(parse(html).querySelectorAll('.psalm-marker').length, 3);
});
