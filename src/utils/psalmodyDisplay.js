export const PSALMODY_MODES = ['left-break', 'left-break-indent', 'alternating-stanzas'];
export const normalizePsalmodyMode = (value) => PSALMODY_MODES.includes(value) ? value : 'left-break';

// Missing legacy keys had effective defaults alternatingIndent + inline.
// With neither key present this is a new install, whose default is left-break.
export function loadPsalmodyMode(storage) {
  const saved = storage.getItem('psalmodyMode');
  if (PSALMODY_MODES.includes(saved)) return saved;
  const layout = storage.getItem('psalmVerseLayout');
  const breaks = storage.getItem('psalmMarkerBreakMode');
  if (layout === null && breaks === null) return 'left-break';
  if (layout !== 'alignedLeft') return 'alternating-stanzas';
  return breaks === 'breakAfterMarker' ? 'left-break-indent' : 'left-break';
}

/** Decorate only the selected psalm's strophes, keeping inline markup intact. */
export function decoratePsalmody(root, { mode = 'left-break', dimmedSide = null, interactive = true } = {}) {
  const strophes = [...root.querySelectorAll('p[data-psalm-strophe]')]
    .filter((p) => !p.hasAttribute('data-liturgical-subheading')
      && !p.hasAttribute('data-liturgical-heading')
      && !/^(?:\d+\s*)?Ант\./iu.test(p.textContent.trim()));
  strophes.forEach((p, index) => {
    p.dataset.psalmSide = index % 2 ? 'B' : 'A';
    if (interactive) {
      p.setAttribute('role', 'button');
      p.setAttribute('tabindex', '0');
      p.setAttribute('aria-pressed', String(p.dataset.psalmSide === dimmedSide));
      p.setAttribute('aria-label', `Частка ${p.dataset.psalmSide}: ${p.textContent.replace(/\s+/gu, ' ').trim()}`);
      p.setAttribute('aria-description', 'Націсніце, каб зацямніць гэтую частку ва ўсёй гадзіне або аднавіць яе.');
    }
    // Structural paragraphs own strophe boundaries. Only the continuous
    // stanza mode removes source line breaks inside those boundaries.
    if (mode === 'alternating-stanzas') {
      p.querySelectorAll('br').forEach((br) => br.replaceWith(root.ownerDocument.createTextNode(' ')));
      return;
    }

    // Work backwards so Range boundaries remain valid even for nested spans.
    const markers = [...p.querySelectorAll('.psalm-marker')].reverse();
    for (const marker of markers) {
      const range = root.ownerDocument.createRange();
      // Default: break AFTER both † and * (as the user's mode requests).
      // The marked † introduces the continuation and stays with its first word.
      if (marker.classList.contains('psalm-opening-flexa')) continue;
      range.setStartAfter(marker);
      range.setEnd(p, p.childNodes.length);
      if (!range.toString().trim()) continue;
      const continuation = root.ownerDocument.createElement('span');
      continuation.className = 'psalm-continuation';
      continuation.append(range.extractContents());
      // A source break immediately after this marker already starts a line.
      if (continuation.firstChild?.nodeName === 'BR') continuation.firstChild.remove();
      p.append(continuation);
    }
  });
  return root;
}
