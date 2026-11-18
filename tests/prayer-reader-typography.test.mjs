import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readerCss = readFileSync(new URL('../src/styles/prayer-reading.css', import.meta.url), 'utf8');
const formVue = readFileSync(new URL('../src/components/prayers/PrayerForm.vue', import.meta.url), 'utf8');
const editorVue = readFileSync(new URL('../src/components/prayers/PrayerMarkdownEditor.vue', import.meta.url), 'utf8');

function cssBody(source, selector) {
  const start = source.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `Missing style selector: ${selector}`);
  const end = source.indexOf('}', start);
  return source.slice(start, end + 1);
}

function headingSizes(source, matchPattern) {
  const levels = [...source.matchAll(matchPattern)]
    .map(([, level, size]) => ({ level: Number(level), size: Number(size) }))
    .sort((a, b) => a.level - b.level);
  assert.equal(levels.length, 6, 'All six Markdown levels must have an explicit size');
  assert.deepEqual(levels.map(({ level }) => level), [1, 2, 3, 4, 5, 6]);
  for (let index = 1; index < levels.length; index += 1) {
    assert.ok(levels[index - 1].size > levels[index].size,
      `h${levels[index - 1].level} must be larger than h${levels[index].level}`);
  }
  return levels.map(({ size }) => size);
}

test('reader and preview rubrics remain red without vertical guides or indentation', () => {
  for (const [css, selector] of [
    [readerCss, '.prayer-text .prayer-rubric'],
    [formVue, '.prayer-preview__text :deep(.prayer-rubric)'],
  ]) {
    const block = cssBody(css, selector);
    assert.match(block, /color:\s*var\(--rubric-color\)/);
    assert.doesNotMatch(block, /border-(?:left|inline-start)|padding-(?:left|inline-start)|0\.85em/);
  }
  const editorBlock = cssBody(editorVue, "'.cm-rubric-line':");
  assert.match(editorBlock, /var\(--rubric-color\)/);
  assert.doesNotMatch(editorBlock, /borderLeft|paddingLeft/);
});

test('all six Markdown heading levels decrease and remain below the prayer title', () => {
  const readerSizes = headingSizes(readerCss,
    /\.prayer-content-area \.prayer-text h([1-6]) \{ font-size: ([\d.]+)em !important;/g);
  const previewSizes = headingSizes(formVue,
    /\.prayer-preview__text :deep\(h([1-6])\) \{ font-size: ([\d.]+)em !important;/g);
  const editorSizes = headingSizes(editorVue,
    /'\.cm-visual-heading-([1-6])': \{ fontSize: '([\d.]+)em'/g);

  assert.deepEqual(previewSizes, readerSizes);
  assert.deepEqual(editorSizes, readerSizes);
  // The reader body starts at 1.04rem. Its top internal heading must remain
  // smaller than the title's minimum 1.55rem, at every font-size multiplier.
  assert.ok(readerSizes[0] * 1.04 < 1.55);
  assert.match(readerCss, /\.prayer-content-area \.prayer-reading-header \.prayer-title/);
  assert.match(formVue, /\.prayer-preview h3 \{[^}]*font-size: calc\(1\.65rem \* var\(--font-size-multiplier, 1\)\)/);
  assert.match(editorVue, /cm-visual-heading-\$\{heading\[1\]\.length\}/);
});
