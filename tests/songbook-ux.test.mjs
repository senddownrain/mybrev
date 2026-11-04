import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parse, compileScript } from '@vue/compiler-sfc';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { chromium } from 'playwright-core';
import { compileString } from 'sass';
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
  assert.match(await render(SongChordControls, { showChords: true, transpose: 12 }), /aria-label="Павысіць на паўтон"[^>]* disabled>/);
  assert.match(await render(SongChordControls, { showChords: true, transpose: -12 }), /aria-label="Панізіць на паўтон"[^>]* disabled>/);
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
    .replace(/ (aria-[a-z]+|title|disabled|style|tabindex|d)(="[^"]*")?/g, '')
    .replace(/class="[^"]*"/g, (classes) => classes.replace(/song-[a-z_-]+--(on|active|shifted|unavailable) ?/g, '').replace(/ "$/, '"'));
  const variants = await Promise.all([
    { showChords: true, transpose: 0 }, { showChords: true, transpose: 12 }, { showChords: true, transpose: -12 },
    { showChords: true, transpose: 5, layout: 'right' }, { showChords: false, transpose: 3 },
    { showChords: true, transpose: -7, layout: 'right', layoutAvailable: false },
  ].map((props) => render(SongChordControls, props)));
  assert.match(skeleton(variants[0]), /song-chord-toggle.*song-chord-layout.*song-transpose__step.*song-transpose__value.*song-transpose__step/s);
  for (const html of variants) assert.equal(skeleton(html), skeleton(variants[0]));
  const css = read('src/components/songs/SongChordControls.vue');
  assert.match(css, /\.song-transpose__value \{\s*width: 3\.9rem;/);
  assert.match(css, /font-variant-numeric: tabular-nums/);
  // The reset mark is out of flow, so it cannot push the number or the neighbours.
  assert.match(css, /\.song-transpose__reset \{ position: absolute;/);
  assert.doesNotMatch(css, /v-if="layoutAvailable"|v-show="layoutAvailable"/);
});

test('reset to the original key is visible and labelled on the offset itself', async () => {
  const shifted = await render(SongChordControls, { showChords: true, transpose: 3 });
  const original = await render(SongChordControls, { showChords: true, transpose: 0 });
  assert.match(shifted, /class="song-transpose__value--shifted song-transpose__value" aria-label="Танальнасць \+3\. Вярнуць арыгінальную" title="Вярнуць арыгінальную танальнасць"/);
  assert.match(original, /class="song-transpose__value" aria-label="Арыгінальная танальнасць" title="Арыгінальная танальнасць"/);
  assert.match(shifted, /<svg[^>]*class="song-transpose__reset"/);
  assert.match(read('src/components/songs/SongChordControls.vue'), /\.song-transpose__value--shifted \.song-transpose__reset \{ opacity: \.7; \}/);
});

test('on narrow text the layout selector stays, shows the rendered layout and explains "right"', async () => {
  const html = await render(SongChordControls, { showChords: true, layout: 'right', layoutAvailable: false });
  const options = [...html.matchAll(/<button[^>]*role="radio"[^>]*>/g)].map(([tag]) => tag);
  assert.equal(options.length, 2);
  assert.match(options[0], /aria-checked="true" aria-label="Акорды над тэкстам"/);
  assert.doesNotMatch(options[0], /aria-disabled/);
  assert.match(options[1], /aria-checked="false" aria-label="Акорды справа ад тэксту" aria-disabled="true" title="Акорды справа ад тэксту: даступна на шырэйшым экране/);
  assert.match(html, /role="radiogroup"[^>]*aria-describedby="song-chord-layout-note"/);
  // One tab stop for the radio group; the unavailable option never emits a layout change.
  assert.match(options[0], /tabindex="0"/);
  assert.match(options[1], /tabindex="-1"/);
  assert.match(read('src/components/songs/SongChordControls.vue'), /if \(isUnavailable\(value\) \|\| value === shownLayout\.value\) return false;/);
});

test('songs.scss has no classes left over from the removed songbook UI', () => {
  const used = ['src/views/Songs.vue', 'src/views/Song.vue', 'src/views/admin/SongEditor.vue'].map(read).join('\n');
  const classes = new Set([...read('src/styles/songs.scss').matchAll(/\.([a-z][\w-]*)/g)].map((match) => match[1]));
  classes.delete('v-btn__content');
  for (const name of classes) assert.match(used, new RegExp(`[" ]${name}[" ]`), name);
});

test('right layout places each chord cell beside its own lyric line', async () => {
  const html = await render(SongText, { song, showChords: true, layout: 'right' });
  assert.match(html, /class="song-text song-text--right" data-chord-layout="right"/);
  const lines = [...html.matchAll(/<div class="song-line"><div class="song-lyrics">([^<]*)<\/div><div class="song-chords">([^<]*)<\/div><\/div>/g)]
    .map(([, lyrics, chords]) => [lyrics, chords]);
  assert.deepEqual(lines, [['Першы радок песні', 'C G'], ['\u00a0', ''], ['Трэці радок', 'a F']]);
  const css = read('src/components/songs/SongText.vue');
  assert.match(css, /\.song-text--right \{ display: grid; width: 100%; grid-template-columns: minmax\(0, 1fr\) minmax\(0, 34%\)/);
  assert.match(css, /\.song-text--right \.song-chords \{[^}]*grid-column: 2/);
});

test('normal phone widths retain right layout; only cramped text falls back without changing preference', () => {
  assert.equal(resolveChordLayout('right', false), 'above');
  assert.equal(resolveChordLayout('right', true), 'right');
  assert.equal(resolveChordLayout('above', true), 'above');
  assert.equal(resolveChordLayout('left', true), 'right');
  for (const width of [360, 375, 393, 430]) {
    const contentWidth = width - 32; // 16px reader padding on each side
    assert.equal(rightLayoutFits(contentWidth, 16.64), true, `${width}px phone`);
  }
  assert.equal(rightLayoutFits(200, 16.64), false); // exceptionally narrow surface
  assert.equal(rightLayoutFits(700, 16.6), true); // desktop reader
  assert.equal(rightLayoutFits(700, 16.6 * 1.8), true); // desktop still has room with large text
  assert.equal(rightLayoutFits(300, 16.6 * 1.8), false); // enlarged text on a small surface
  assert.equal(rightLayoutFits(0, 16), true); // not measured yet
  const text = read('src/components/songs/SongText.vue');
  assert.match(text, /effectiveLayout = computed\(\(\) => resolveChordLayout\(props\.layout, rightFits\.value\)\)/);
  assert.doesNotMatch(text, /songChordLayout|emit\('update:layout'/);
  assert.match(read('src/views/Song.vue'), /:layout="settings\.songChordLayout"/);
});

test('song filter contains only compact multi-select tags and keeps removal and reset controls', () => {
  const list = read('src/views/Songs.vue');
  const store = read('src/stores/songs.js');
  const filter = read('src/utils/songChords.js');
  for (const source of [list, store, filter]) assert.doesNotMatch(source, /favoritesOnly|Толькі абраныя/);
  assert.doesNotMatch(list, /<v-checkbox|<v-chip-group/);
  assert.match(list, /class="song-tag-picker" role="group" aria-label="Выбраць тэгі"/);
  assert.match(list, /v-for="tag in orderedTags"[^>]*class="song-tag-pill"[^>]*aria-pressed="tags\.includes\(tag\)"/);
  assert.match(list, /const orderedTags = computed\(\(\) => \[\.\.\.store\.allTags\]\.sort/);
  assert.match(list, /class="songs-toolbar songs-selected-tags" role="group" aria-label="Абраныя тэгі"/);
  assert.match(list, /:aria-label="`Прыбраць тэг \$\{tag\}`" @click="toggleTag\(tag\)"/);
  assert.match(list, /tags\.value = tags\.value\.includes\(tag\) \? tags\.value\.filter\(\(item\) => item !== tag\) : \[\.\.\.tags\.value, tag\]/);
  assert.match(list, /:aria-label="`Фільтр па тэгах: \$\{tags\.length\}`"/);
  assert.match(list, /<span v-if="tags\.length" class="filter-count">\{\{ tags\.length \}\}<\/span>/);
  assert.match(list, /@click="tags = \[\]">Скінуць/);
  assert.match(list, /Паказаць спевы/);
  assert.match(filter, /Number\(favorites\.includes\(b\.id\)\) - Number\(favorites\.includes\(a\.id\)\)/);
  const css = read('src/styles/songs.scss');
  assert.match(css, /\.song-tag-pill--selected/);
  assert.match(css, /var\(--devotional-soft\)/);
  assert.match(css, /\.song-tag-pill:focus-visible/);
});

const browserPath = [
  process.env.BENCHMARK_BROWSER_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
].find((path) => path && existsSync(path));

test('right chords fit and lyrics wrap on 360–430px phones without page overflow', { skip: !browserPath }, async () => {
  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const { descriptor } = parse(read('src/components/songs/SongText.vue'));
    const css = descriptor.styles[0].content;
    const { descriptor: controlDescriptor } = parse(read('src/components/songs/SongChordControls.vue'));
    const controlCss = compileString(controlDescriptor.styles[0].content).css;
    const longSong = {
      text: 'Гэта вельмі доўгі радок спеўнага тэксту, які павінен пераносіцца ў левай калонцы некалькі разоў',
      chord: 'Cmaj7(b9) D/F# Gsus4 Am7 Cmaj7(b9) D/F# Gsus4 Am7',
    };
    for (const width of [360, 375, 393, 430]) {
      await page.setViewportSize({ width, height: 800 });
      const contentWidth = width - 32;
      assert.equal(rightLayoutFits(contentWidth, 16.64), true);
      const controls = await render(SongChordControls, { showChords: true, layout: 'right', layoutAvailable: true });
      assert.match(controls, /aria-checked="true" aria-label="Акорды справа ад тэксту"/);
      assert.doesNotMatch(controls, /aria-label="Акорды справа ад тэксту" aria-disabled/);
      for (let offset = -12; offset <= 12; offset++) {
        const html = await render(SongText, { song: longSong, showChords: true, layout: 'right', transpose: offset });
        assert.match(html, /data-chord-layout="right"/, `${width}px at ${offset} semitones`);
        if (![ -12, 0, 12 ].includes(offset)) continue;
        await page.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1"><style>*, *::before, *::after { box-sizing: border-box; } body { margin: 0; } .prayer-text { width: 100%; padding: 22px 16px; overflow-x: hidden; } ${css} ${controlCss}</style>${controls}<div class="prayer-text">${html}</div>`);
        const geometry = await page.evaluate(() => {
          const root = document.querySelector('.song-text');
          const lyrics = document.querySelector('.song-lyrics');
          const chords = document.querySelector('.song-chords');
          const rightOption = document.querySelector('[aria-label="Акорды справа ад тэксту"]');
          const optionRect = rightOption.getBoundingClientRect();
          const lyricRect = lyrics.getBoundingClientRect();
          const chordRect = chords.getBoundingClientRect();
          return {
            pageWidth: document.documentElement.scrollWidth,
            rootWidth: root.clientWidth,
            rootScrollWidth: root.scrollWidth,
            lyricRight: lyricRect.right,
            lyricHeight: lyricRect.height,
            lyricLineHeight: parseFloat(getComputedStyle(lyrics).lineHeight),
            chordLeft: chordRect.left,
            chordRight: chordRect.right,
            chordScrollWidth: chords.scrollWidth,
            chordWidth: chords.clientWidth,
            optionLeft: optionRect.left,
            optionRight: optionRect.right,
            optionDisabled: rightOption.disabled || rightOption.getAttribute('aria-disabled') === 'true',
            toolbarScrollWidth: document.querySelector('.song-chord-bar').scrollWidth,
          };
        });
        assert.equal(geometry.optionDisabled, false, `${width}px: right selector is available`);
        assert.ok(geometry.optionLeft >= 0 && geometry.optionRight <= width, `${width}px: right selector is visible`);
        assert.ok(geometry.toolbarScrollWidth <= width, `${width}px: toolbar fits`);
        assert.ok(geometry.lyricRight < geometry.chordLeft, `${width}px: chords are beside lyrics`);
        assert.ok(geometry.lyricHeight > geometry.lyricLineHeight * 1.5, `${width}px: lyrics wrap`);
        assert.ok(geometry.chordScrollWidth <= geometry.chordWidth + 1, `${width}px: chords stay in their column`);
        assert.ok(geometry.rootScrollWidth <= geometry.rootWidth + 1, `${width}px: reader has no overflow`);
        assert.ok(geometry.chordRight <= width - 16 + 1, `${width}px: chords stay inside reader`);
        assert.ok(geometry.pageWidth <= width, `${width}px: page has no horizontal overflow`);
      }
    }
    await context.close();
  } finally {
    await browser.close();
  }
});


test('the pilgrim songbook name is visible in navigation, list and reader', () => {
  const nav = read('src/layouts/default/NavigationDrawer.vue');
  const list = read('src/views/Songs.vue');
  const detail = read('src/views/Song.vue');
  assert.match(nav, /title="Спеўнік" subtitle="Пілігрымковы"/);
  assert.match(list, /aria-label="Спеўнік пілігрымковы"/);
  assert.match(list, /class="prayers-page-eyebrow mt-2 mb-0">Пілігрымковы</);
  assert.match(detail, /prayer-reading-eyebrow">Спеўнік пілігрымковы</);
});
