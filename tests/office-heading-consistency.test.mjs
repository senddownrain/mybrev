import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { markLeadingLiturgicalSubheadings } from '../src/utils/liturgicalHtml.js';
import { normalizeReadingHtml } from '../src/utils/liturgicalSourceHtml.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('short-reading and short-responsory headings use the same semantic marker', () => {
  const source = '<p><span style="color:red">Кароткае чытанне (Рым 1, 1)</span><br>Пачатак чытання.</p>'
    + '<p><span style="color:red">Кароткі рэспансорый</span></p>';
  const normalized = markLeadingLiturgicalSubheadings(normalizeReadingHtml(source));
  const labels = normalized.match(/<p[^>]*data-liturgical-heading[^>]*>/gu) || [];
  assert.equal(labels.length, 2, normalized);
  assert.match(normalized, /Пачатак чытання/u);
});

test('a mixed reading title and body must never make the entire paragraph a heading', () => {
  const source = '<p><span style="color:red">КАРОТКАЕ ЧЫТАННЕ</span><br>Тэкст чытання.</p>';
  assert.doesNotMatch(markLeadingLiturgicalSubheadings(source), /data-liturgical-heading/u);
});

test('all structural headings share typography and the psalmody typo is corrected', () => {
  const css = read('src/styles/main.scss');
  assert.match(css, /\.ora-title,\s*\.liturgical-hour-column \.ora-header,\s*\.liturgical-hour-column \.ora-text p\[data-liturgical-heading\]/u);
  assert.match(css, /--office-section-font-size/u);
  assert.match(read('src/components/oraparts/Psalms.vue'), /ПСАЛЬМОДЫЯ/u);
  assert.doesNotMatch(read('src/components/oraparts/Psalms.vue'), /ПСАЛМОДЫЯ/u);
  assert.match(read('src/components/oraparts/Magnificat.vue'), /ПЕСНЯ МАРЫІ/u);
  assert.match(read('src/components/oraparts/Benedictus.vue'), /ПЕСНЯ ЗАХАРЫІ/u);
  assert.match(read('src/components/oraparts/Nunc.vue'), /ПЕСНЯ СІМЯОНА/u);
});
