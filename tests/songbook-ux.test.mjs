import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parse, compileScript } from '@vue/compiler-sfc';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import {
  CHORD_LAYOUTS, TRANSPOSE_LIMIT, clampTranspose, formatTranspose,
  normalizeChordLayout, resolveChordLayout, rightLayoutFits,
} from '../src/utils/songDisplay.js';
import { transposeChordLine } from '../src/utils/songChords.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const srcUrl = (path) => new URL(`../src/${path}`, import.meta.url).href;

// Compile a real SFC for SSR and load it as a module; "@/" imports resolve to src/.
async function loadComponent(path) {
  const { descriptor } = parse(read(path), { filename: path });
  const { content } = compileScript(descriptor, {
    id: path, inlineTemplate: true, templateOptions: { ssr: true, ssrCssVars: [] },
  });
  const code = content
    .replace(/from ['"]@\/([^'"]+)['"]/g, (_, file) => `from '${srcUrl(file.endsWith('.js') ? file : `${file}.js`)}'`)
    .replace(/from ['"](vue|vue\/server-renderer|@phosphor-icons\/vue)['"]/g, (_, name) => `from '${import.meta.resolve(name)}'`);
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default;
}

// Rendered HTML without scope ids and template comments.
const render = async (component, props) => (await renderToString(createSSRApp({ render: () => h(component, props) })))
  .replace(/ data-v-[^\s>]*/g, '')
  .replace(/<!--[\s\S]*?-->/g, '');
const [SongText, SongChordControls] = await Promise.all([
  loadComponent('src/components/songs/SongText.vue'),
  loadComponent('src/components/songs/SongChordControls.vue'),
]);
const song = { text: 'Першы радок песні\n\nТрэці радок', chord: 'C G\n\nam F' };

test('song list is always compact: no toggle, no tags in rows, search and tag filter remain', () => {
  const list = read('src/views/Songs.vue');
  assert.doesNotMatch(list, /songCompactList|songs-list-container--compact|song-tags|getSongTags/);
  assert.match(list, /song-favorite-button/);
  assert.match(list, /prayer-title-text">\{\{ song\.title \}\}/);
  assert.match(list, /prayer-search-input/);
  assert.match(list, /Фільтр па тэгах/);
  assert.doesNotMatch(read('src/stores/settings.js'), /songCompactList\s*=|songCompactList,/);
  assert.match(read('src/stores/settings.js'), /localStorage\.removeItem\('songCompactList'\)/);
});

test('the separate songbook settings UI and its entry points are gone', () => {
  assert.equal(existsSync(new URL('../src/components/songs/SongSettings.vue', import.meta.url)), false);
  for (const file of ['src/views/Songs.vue', 'src/views/Settings.vue', 'src/layouts/default/Default.vue', 'src/stores/ui.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /SongSettings|songSettingsOpen|Налады спеўніка/, file);
  }
});

test('chord controls live on the song page', () => {
  const page = read('src/views/Song.vue');
  assert.match(page, /<SongChordControls v-if="hasChords" v-model:show-chords="settings\.songShowChords" v-model:layout="settings\.songChordLayout" v-model:transpose="transpose"/);
  assert.doesNotMatch(page, /v-bottom-sheet|v-dialog|Арыгінал</);
});

test('chords can be shown and hidden', async () => {
  const shown = await render(SongText, { song, showChords: true, layout: 'above' });
  const hidden = await render(SongText, { song, showChords: false, layout: 'above' });
  assert.match(shown, /class="song-chords">C G</);
  assert.doesNotMatch(hidden, /song-chords/);
  assert.match(hidden, /Першы радок песні/);
  const on = await render(SongChordControls, { showChords: true });
  const off = await render(SongChordControls, { showChords: false });
  assert.match(on, /aria-pressed="true"/);
  assert.match(off, /aria-pressed="false"/);
});

test('layout offers only "above" and "right"', async () => {
  assert.deepEqual([...CHORD_LAYOUTS], ['above', 'right']);
  const html = await render(SongChordControls, { showChords: true, layout: 'right' });
  const options = [...html.matchAll(/role="radio"[^>]*aria-label="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(options, ['Акорды над тэкстам', 'Акорды справа ад тэксту']);
  assert.match(html, /class="song-chord-layout__option--active song-chord-layout__option" aria-checked="true" aria-label="Акорды справа/);
  assert.doesNotMatch(read('src/components/songs/SongText.vue'), /left/);
});

test('stored "left" layout migrates to "right"; unknown values fall back to "above"', () => {
  assert.equal(normalizeChordLayout('left'), 'right');
  assert.equal(normalizeChordLayout('right'), 'right');
  assert.equal(normalizeChordLayout('above'), 'above');
  assert.equal(normalizeChordLayout(null), 'above');
  assert.equal(normalizeChordLayout('diagonal'), 'above');
  const store = read('src/stores/settings.js');
  assert.match(store, /songChordLayout = ref\(normalizeChordLayout\(localStorage\.getItem\('songChordLayout'\)\)\)/);
  assert.match(store, /localStorage\.setItem\('songChordLayout', songChordLayout\.value\)/);
});

test('transpose still works, within −12…+12, and resets to the original', async () => {
  assert.equal(TRANSPOSE_LIMIT, 12);
  assert.equal(clampTranspose(13), 12);
  assert.equal(clampTranspose(-40), -12);
  assert.equal(clampTranspose('3'), 3);
  assert.equal(transposeChordLine('C G', 2), 'D A');
  const html = await render(SongText, { song, showChords: true, layout: 'above', transpose: 2 });
  assert.match(html, />D A</);
  assert.match(html, />b G</);
  assert.match(await render(SongChordControls, { showChords: true, transpose: 12 }), /aria-label="Павысіць на паўтон" disabled/);
  assert.match(await render(SongChordControls, { showChords: true, transpose: -12 }), /aria-label="Панізіць на паўтон" disabled/);
  assert.doesNotMatch(read('src/views/Song.vue'), /updateSong|saveSong|transpose:/);
});

test('the control keeps the same structure and fixed-width value for every offset and state', async () => {
  const labels = Array.from({ length: 25 }, (_, index) => formatTranspose(index - 12));
  assert.equal(labels[0], '−12');
  assert.equal(labels[12], '0');
  assert.equal(labels[24], '+12');
  assert.ok(labels.every((label) => label.length <= 3));
  // Strip text, state classes and attribute values: what remains is the geometry-bearing skeleton.
  const skeleton = (html) => html
    .replace(/>[^<]*</g, '><')
    .replace(/ (aria-[a-z]+|title|disabled|style|d)(="[^"]*")?/g, '')
    .replace(/song-[a-z_-]+--(on|active|shifted) /g, '');
  const variants = await Promise.all([
    { showChords: true, transpose: 0 }, { showChords: true, transpose: 12 }, { showChords: true, transpose: -12 },
    { showChords: true, transpose: 5, layout: 'right' }, { showChords: false, transpose: 3 },
  ].map((props) => render(SongChordControls, props)));
  for (const html of variants) assert.equal(skeleton(html), skeleton(variants[0]));
  const css = read('src/components/songs/SongChordControls.vue');
  assert.match(css, /\.song-transpose__value \{\s*width: 3\.4rem;/);
  assert.match(css, /font-variant-numeric: tabular-nums/);
});

test('right layout places each chord cell beside its own lyric line', async () => {
  const html = await render(SongText, { song, showChords: true, layout: 'right' });
  assert.match(html, /class="song-text song-text--right" data-chord-layout="right"/);
  const lines = [...html.matchAll(/<div class="song-line"><div class="song-lyrics">([^<]*)<\/div><div class="song-chords">([^<]*)<\/div><\/div>/g)]
    .map(([, lyrics, chords]) => [lyrics, chords]);
  assert.deepEqual(lines, [['Першы радок песні', 'C G'], ['\u00a0', ''], ['Трэці радок', 'a F']]);
  const css = read('src/components/songs/SongText.vue');
  assert.match(css, /\.song-text--right \{ display: grid; grid-template-columns: minmax\(0, max-content\) fit-content\(38%\)/);
  assert.match(css, /\.song-text--right \.song-chords \{[^}]*grid-column: 2/);
});

test('responsive fallback renders "above" on narrow text without losing the "right" preference', () => {
  assert.equal(resolveChordLayout('right', false), 'above');
  assert.equal(resolveChordLayout('right', true), 'right');
  assert.equal(resolveChordLayout('above', true), 'above');
  assert.equal(resolveChordLayout('left', true), 'right');
  assert.equal(rightLayoutFits(310, 16.6), false); // 375px phone
  assert.equal(rightLayoutFits(700, 16.6), true); // desktop reader
  assert.equal(rightLayoutFits(700, 16.6 * 1.8), false); // desktop with the largest text
  assert.equal(rightLayoutFits(0, 16), true); // not measured yet
  const text = read('src/components/songs/SongText.vue');
  assert.match(text, /effectiveLayout = computed\(\(\) => resolveChordLayout\(props\.layout, rightFits\.value\)\)/);
  assert.doesNotMatch(text, /songChordLayout|emit\('update:layout'/);
  assert.match(read('src/views/Song.vue'), /:layout="settings\.songChordLayout"/);
});
