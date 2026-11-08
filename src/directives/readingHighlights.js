import { sentenceRanges } from '../utils/readingHighlights.js';

const states = new WeakMap();
const excluded = '.reading-rubric,.rubric,.liturgical-red,.reading-acclamation,.passion__role';

function cleanup(root) {
  const state = states.get(root);
  if (!state) return;
  for (const [type, listener] of state.listeners) root.removeEventListener(type, listener);
  // Restore the original Text objects: Vue still owns their identity (Passion runs).
  for (const { original, marker, fragments } of state.nodes) {
    marker.replaceWith(original);
    fragments.forEach(node => node.remove());
  }
  states.delete(root);
}

function render(root, { value }) {
  cleanup(root);
  if (!value.enabled || !value.documentKey) return;
  const state = { nodes: [], listeners: [] };
  states.set(root, state);
  const scopes = root.querySelectorAll('.section-text,.alleluia-verse');
  scopes.forEach((scope, scopeIndex) => {
    const paragraphs = scope.querySelectorAll('p');
    const blocks = paragraphs.length ? paragraphs : [scope];
    [...blocks].forEach((block, blockIndex) => {
      const walker = root.ownerDocument.createTreeWalker(block, 5);
      const nodes = [];
      let text = '';
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.nodeType === 1) {
          if (node.tagName === 'BR') text += '\n';
          continue;
        }
        if (node.parentElement.closest(excluded)) continue;
        nodes.push({ node, start: text.length });
        text += node.data;
      }
      const ranges = sentenceRanges(text);
      const keys = ranges.map(({ start, end }) => JSON.stringify([scopeIndex, blockIndex, start, text.slice(start, end)]));
      const first = new Set();
      nodes.forEach(({ node, start }) => {
        const marker = root.ownerDocument.createComment('reading sentence');
        const fragments = [];
        let offset = 0;
        ranges.forEach((range, index) => {
          const left = Math.max(0, range.start - start);
          const right = Math.min(node.length, range.end - start);
          if (right <= left) return;
          if (left > offset) fragments.push(root.ownerDocument.createTextNode(node.data.slice(offset, left)));
          const span = root.ownerDocument.createElement('span');
          const key = keys[index];
          span.dataset.readingSentence = key;
          span.className = 'reading-sentence';
          if (value.highlights[key]) span.dataset.color = value.highlights[key];
          if (value.selected.has(key)) span.classList.add('reading-sentence--selected');
          if (!first.has(key)) {
            span.tabIndex = 0;
            span.setAttribute('role', 'button');
            span.setAttribute('aria-pressed', String(value.selected.has(key)));
            span.setAttribute('aria-label', text.slice(range.start, range.end).trim());
            first.add(key);
          }
          span.textContent = node.data.slice(left, right);
          fragments.push(span);
          offset = right;
        });
        if (offset < node.length) fragments.push(root.ownerDocument.createTextNode(node.data.slice(offset)));
        node.replaceWith(marker, ...fragments);
        state.nodes.push({ original: node, marker, fragments });
      });
    });
  });
  let pointer = null;
  const listen = (type, handler) => { root.addEventListener(type, handler); state.listeners.push([type, handler]); };
  listen('pointerdown', event => { pointer = { x: event.clientX, y: event.clientY, moved: false }; });
  listen('pointermove', event => {
    if (pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 10) pointer.moved = true;
  });
  listen('pointercancel', () => { if (pointer) pointer.moved = true; });
  const select = event => {
    const sentence = event.target.closest('[data-reading-sentence]');
    if (!sentence || !root.contains(sentence)) return;
    if (event.type === 'keydown') {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
    } else if (pointer?.moved) return;
    const key = sentence.dataset.readingSentence;
    const active = root.ownerDocument.activeElement;
    const restoreFocus = active?.dataset?.readingSentence === key;
    value.onSelect(key);
    // Selection redraws only wrappers; retain keyboard focus after that redraw.
    if (restoreFocus) queueMicrotask(() => [...root.querySelectorAll('[data-reading-sentence][tabindex]')]
      .find(node => node.dataset.readingSentence === key)?.focus({ preventScroll: true }));
  };
  listen('click', select);
  listen('keydown', select);
}

export const vReadingHighlights = { mounted: render, beforeUpdate: cleanup, updated: render, beforeUnmount: cleanup };
