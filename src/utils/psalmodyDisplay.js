export const normalizePsalmVerseLayout = (value) => value === 'alignedLeft' ? value : 'alternatingIndent';
export const normalizePsalmMarkerBreakMode = (value) => value === 'breakAfterMarker' ? value : 'inline';

/** Decorate only the selected psalm's strophes, keeping inline markup intact. */
export function decoratePsalmody(root, { breakAfterMarker = false, dimmedSide = null } = {}) {
  const strophes = [...root.querySelectorAll('p[data-psalm-strophe]')]
    .filter((p) => !p.hasAttribute('data-liturgical-subheading')
      && !p.hasAttribute('data-liturgical-heading')
      && !/^(?:\d+\s*)?Ант\./iu.test(p.textContent.trim()));
  strophes.forEach((p, index) => {
    p.dataset.psalmSide = index % 2 ? 'B' : 'A';
    p.setAttribute('role', 'button');
    p.setAttribute('tabindex', '0');
    p.setAttribute('aria-pressed', String(p.dataset.psalmSide === dimmedSide));
    p.setAttribute('aria-label', `Частка ${p.dataset.psalmSide}: ${p.textContent.replace(/\s+/gu, ' ').trim()}`);
    p.setAttribute('aria-description', 'Націсніце, каб зацямніць гэтую частку ва ўсёй гадзіне або аднавіць яе.');
    if (!breakAfterMarker) return;

    // Work backwards so Range boundaries remain valid even for nested spans.
    const markers = [...p.querySelectorAll('.psalm-marker')].reverse();
    for (const marker of markers) {
      const range = root.ownerDocument.createRange();
      range.setStartAfter(marker);
      range.setEnd(p, p.childNodes.length);
      if (!range.toString().trim()) continue;
      const continuation = root.ownerDocument.createElement('span');
      continuation.className = 'psalm-continuation';
      continuation.append(range.extractContents());
      // An existing line break at this exact boundary already means a new line.
      const first = continuation.firstChild;
      if (first?.nodeName === 'BR') first.remove();
      p.append(continuation);
    }
  });
  return root;
}
