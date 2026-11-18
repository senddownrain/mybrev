import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const store = load('src/stores/settings.js');
const screen = load('src/views/Settings.vue');
const css = load('src/styles/main.scss');
const readings = load('src/components/readings/ParsedReadingCard.vue');

test('liturgical antiphon/refrain emphasis is on by default and persists independently of sentence highlighting', () => {
  assert.match(store, /liturgicalEmphasisEnabled = ref\(localStorage\.getItem\('liturgicalEmphasisEnabled'\) !== 'false'\)/);
  assert.match(store, /watch\(liturgicalEmphasisEnabled, \(enabled\) => \{/);
  assert.match(store, /document\.documentElement\.dataset\.liturgicalEmphasis = enabled \? 'on' : 'off'/);
  assert.match(store, /localStorage\.setItem\('liturgicalEmphasisEnabled', String\(enabled\)\)/);
  assert.match(store, /immediate: true, flush: 'sync'/);
  assert.match(screen, /v-model="settings\.liturgicalEmphasisEnabled"/);
  assert.match(screen, /Вылучэнне антыфон і рэфрэнаў/);
  assert.match(store, /const readingHighlightsEnabled = ref\(/);
  assert.match(screen, /v-model="settings\.readingHighlightsEnabled"/);
});

test('plain book appearance covers Hours antiphons, intercession responses and daily reading refrains', () => {
  for (const selector of [
    '.liturgical-hour-column .ora-ant',
    '.liturgical-hour-column .ora-text .intercessions__refrain',
    '.parsed-reading .psalm-refrain',
    '.parsed-reading .alleluia-acclamation',
  ]) {
    assert.ok(css.includes('html[data-liturgical-emphasis="off"] ' + selector), selector);
  }
  assert.match(css, /background: transparent;/);
  assert.match(css, /border: 0;/);
  // The no-card mode must align flush with psalm text, without a residual indent.
  assert.match(css, /html\[data-liturgical-emphasis="off"\] \.liturgical-hour-column \.ora-ant,[\s\S]*?padding: 0;\s*margin-inline: 0;\s*text-align: left;/);
  assert.doesNotMatch(css, /padding: 0 0 0 0\.75em;/);
  assert.match(css, /color: var\(--reader-ink\);/);
  assert.match(css, /\.parsed-reading \.psalm-refrain__label/);
  assert.match(readings, /<div v-if="section\.data\.chorus" class="psalm-refrain">/);
  // The original decorative rules remain intact; only the opt-out applies the override.
  assert.match(css, /\.liturgical-hour-column \.ora-ant \{[^}]*border-left: 3px solid var\(--rubric-color\)/s);
  assert.match(readings, /border-left: 3px solid var\(--reading-visible-color\)/);
});
