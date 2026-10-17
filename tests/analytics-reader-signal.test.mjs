/**
 * Reader readiness and scroll depth (B1/B2 of the PR #129 closure). DOM-free: fakes with the few members the module reads.
 * The real screens are checked in the browser by `npm run analytics:smoke`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { READER_ROOTS, findReaderContent, measureDepth, readerState, scrollParentOf } from '../src/utils/analytics/readerSignal.js';

const block = ({ text = '', loader = false, idleCardLoader = false, rect = { top: 0, bottom: 0, height: 0, width: 300 }, innerText } = {}) => ({
  textContent: text,
  innerText,
  getBoundingClientRect: () => rect,
  querySelectorAll: () => [...(loader ? [{ closest: () => null }] : []), ...(idleCardLoader ? [{ closest: (selector) => (selector === '.v-card__loader' ? {} : null) }] : [])],
  parentElement: null,
});
const win = ({ innerHeight = 800, scrollY = 0, overflowByNode = new Map(), document = { body: {}, documentElement: {} } } = {}) => ({
  innerHeight, scrollY, document, getComputedStyle: (node) => ({ overflowY: overflowByNode.get(node) || 'visible' }),
});

test('every section that is measured has a content block selector; catalogs and settings have none', () => {
  ['prayers', 'mass', 'songs', 'readings', 'hours', 'bible', 'compendium'].forEach((section) => assert.ok(READER_ROOTS[section]?.length, section));
  assert.equal(READER_ROOTS.today, undefined);
  const el = { id: 1 };
  assert.equal(findReaderContent('readings', { querySelector: (s) => (s === '.readings-content' ? el : null) }), el);
  assert.equal(findReaderContent('settings', { querySelector: () => el }), null);
});

test('readiness: a short prayer under 200 characters is ready; loader, error alert, empty and missing blocks are not', () => {
  assert.deepEqual(readerState(block({ text: 'Ойча наш, Які ёсць на нябёсах…' })), { ready: true, reason: 'ready', chars: 30 });
  assert.equal(readerState(block({ text: 'x'.repeat(5000), loader: true })).reason, 'loading-or-error');
  assert.equal(readerState(block({ text: '   \n  ' })).reason, 'empty');
  // the idle progress bar that every Vuetify card carries is not a loading state
  assert.equal(readerState(block({ text: 'Амэн.', idleCardLoader: true })).ready, true);
  assert.equal(readerState(null).reason, 'no-content-block');
  // collapsed or hidden text is left out when the browser tells (innerText), the navigation text never counts
  assert.equal(readerState(block({ text: 'a'.repeat(900), innerText: 'Амэн.' })).chars, 5);
});

test('depth uses the text block, not the document: a block that fits is fit, a tall one reports how far it has been seen', () => {
  const short = block({ text: 'x', rect: { top: 180, bottom: 480, height: 300, width: 320 } });
  assert.deepEqual(measureDepth(short, win()), { unmeasurable: false, fits: true, depth: 1 });
  const tall = block({ text: 'x', rect: { top: 120, bottom: 2120, height: 2000, width: 320 } });
  const start = measureDepth(tall, win({ innerHeight: 800 }));
  assert.equal(start.fits, false);
  assert.equal(start.depth, (800 - 120) / 2000);
  // scrolled by 1000 px: the block moved up, the viewport bottom is 1680 px into the block
  const scrolled = block({ text: 'x', rect: { top: -880, bottom: 1120, height: 2000, width: 320 } });
  assert.equal(measureDepth(scrolled, win({ innerHeight: 800, scrollY: 1000 })).depth, (800 + 880) / 2000);
  // the end of the block reached: depth 1, the footer below it is not counted
  const end = block({ text: 'x', rect: { top: -1500, bottom: 500, height: 2000, width: 320 } });
  assert.equal(measureDepth(end, win({ innerHeight: 800, scrollY: 1620 })).depth, 1);
});

test('a block that is short but starts low enough to need a scroll is not fit', () => {
  const lower = block({ text: 'x', rect: { top: 600, bottom: 1000, height: 400, width: 320 } });
  assert.equal(measureDepth(lower, win({ innerHeight: 800 })).fits, false);
});

test('nested scroller: the visible area is the scroller, not the window; the scroller is found once', () => {
  const scroller = { scrollTop: 0, scrollHeight: 3000, clientHeight: 500, getBoundingClientRect: () => ({ top: 100, bottom: 600 }), parentElement: null };
  const inner = block({ text: 'x', rect: { top: 100, bottom: 2100, height: 2000, width: 320 } });
  inner.parentElement = scroller;
  const overflowByNode = new Map([[scroller, 'auto']]);
  const w = win({ innerHeight: 800, overflowByNode });
  assert.equal(scrollParentOf(inner, w), scroller);
  const result = measureDepth(inner, w, scroller);
  assert.equal(result.fits, false);
  assert.equal(result.depth, (600 - 100) / 2000); // only the scroller's 500 px are visible, not the window's 800
  // a non-scrolling wrapper is ignored
  const wrapper = { scrollTop: 0, scrollHeight: 400, clientHeight: 400, getBoundingClientRect: () => ({ top: 0, bottom: 400 }), parentElement: null };
  inner.parentElement = wrapper;
  assert.equal(scrollParentOf(inner, win({ overflowByNode: new Map([[wrapper, 'auto']]) })), null);
});

test('degradation: a hidden block or an empty viewport is unmeasurable, never an invented depth', () => {
  assert.deepEqual(measureDepth(block({ text: 'x', rect: { top: 0, bottom: 0, height: 0, width: 0 } }), win()), { unmeasurable: true });
  assert.deepEqual(measureDepth(block({ text: 'x', rect: { top: 0, bottom: 300, height: 300, width: 300 } }), win({ innerHeight: 0 })), { unmeasurable: true });
});
