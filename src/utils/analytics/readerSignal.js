/**
 * Reader readiness and scroll depth of the text that is ACTUALLY on screen (test builds only, nothing is sent).
 *
 * Why not the document: the app scrolls the window, but the document also holds the navigation, the footer and the
 * paddings of the shell, and a loader or a «not found» page can be long enough to look like a text. The text of a
 * material is one DOM block per section (the same blocks the views render only after the data arrived), so:
 *
 *   readiness  = that block exists, shows no loader / alert and holds visible text (no length threshold: a short prayer
 *                is a reading; a loader, an error and «not found» never create the block);
 *   depth      = how much of THAT block has been in the viewport of its own scroller (the window, or the nearest
 *                scrollable ancestor when there is one), not the document height.
 *
 * Everything here is pure and takes the document/window as arguments, so it is unit-tested with fakes. The only DOM reads
 * are one `getBoundingClientRect` of the block (and of its scroller) per measurement; no tree walks on scroll.
 */

/** The element that holds the text of a section (class names of the real views). */
export const READER_ROOTS = Object.freeze({
  prayers: ['.prayer-reading-surface'],
  mass: ['.prayer-reading-surface'],
  songs: ['.prayer-reading-surface'],
  readings: ['.readings-content'],
  hours: ['.liturgical-hour-column'],
  bible: ['.bible-reader'],
  compendium: ['.compendium-part-outline'],
});

/**
 * While one of these is inside the block the text is not final: loader, skeleton or an error alert. Every Vuetify card
 * carries an idle `.v-card__loader` progress bar; it is not a loading state.
 */
const NOT_FINAL = '.v-progress-circular, .v-progress-linear, .v-skeleton-loader, .v-alert';
const isIdleCardLoader = (node) => Boolean(node.closest?.('.v-card__loader'));

export function findReaderContent(section, doc) {
  for (const selector of READER_ROOTS[section] || []) {
    const element = doc.querySelector(selector);
    if (element) return element;
  }
  return null;
}

/** @returns {{ ready: boolean, reason: string, chars: number }} */
export function readerState(element) {
  if (!element) return { ready: false, reason: 'no-content-block', chars: 0 };
  if ([...element.querySelectorAll(NOT_FINAL)].some((node) => !isIdleCardLoader(node))) return { ready: false, reason: 'loading-or-error', chars: 0 };
  // innerText leaves out what is not rendered (collapsed blocks, display:none); textContent is the fallback
  const text = String((typeof element.innerText === 'string' ? element.innerText : element.textContent) || '');
  const chars = text.replace(/\s+/g, ' ').trim().length;
  return chars > 0 ? { ready: true, reason: 'ready', chars } : { ready: false, reason: 'empty', chars: 0 };
}

/** Nearest ancestor that really scrolls vertically (null: the window scrolls). */
export function scrollParentOf(element, win) {
  const doc = win.document;
  for (let node = element?.parentElement; node && node !== doc.body && node !== doc.documentElement; node = node.parentElement) {
    const overflow = win.getComputedStyle(node).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') && node.scrollHeight > node.clientHeight + 1) return node;
  }
  return null;
}

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/**
 * @returns {{ unmeasurable: true } | { unmeasurable: false, fits: boolean, depth: number }}
 * `fits`: the whole block is visible from the top of its scroller without scrolling.
 * `depth`: share of the block that has reached the bottom edge of the visible area (0..1).
 */
export function measureDepth(element, win, scroller = null) {
  const rect = element.getBoundingClientRect();
  if (!(rect.height > 0) || !(rect.width > 0)) return { unmeasurable: true };
  const view = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: win.innerHeight };
  const top = Math.max(view.top, 0);
  const bottom = Math.min(view.bottom, win.innerHeight);
  if (!(bottom > top)) return { unmeasurable: true };
  const offset = scroller ? scroller.scrollTop : (win.scrollY || 0);
  const fits = (rect.bottom - top) + offset <= (bottom - top) + 2;
  return { unmeasurable: false, fits, depth: clamp01((bottom - rect.top) / rect.height) };
}
