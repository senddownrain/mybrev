// Opt in only at reader surfaces whose content is ordinary prose. Hours and
// devotional offices never use this directive. No source content is rewritten.
const EXCLUDED = 'h1,h2,h3,h4,h5,h6,aside,blockquote,ul,ol,li,table,pre,figure,nav,button,a,'
  + '.prayer-rubric,.prayer-source,.reading-rubric,.reading-acclamation,.section-ref,'
  + '.psalmody-text,.psalm-strophe,.psalm-verse-text,.alleluia-verse,'
  + '.mass-rubric,.mass-comment,.mass-posture,.mass-alternative,.mass-response,.mass-heading,.mass-acclamation,.mass-invocation,.mass-option,'
  + '.devotional-office,.liturgical-hour-column,[data-liturgical-heading],[data-liturgical-subheading],'
  + '[data-liturgical-reference],[data-psalm-strophe],[data-reader-structure]';
const STRUCTURED = 'br,.prayer-speaker,.mass-speaker,[data-office-speaker],.passion__role,a';

export function markReaderProse(root) {
  root.querySelectorAll('p').forEach(paragraph => {
    paragraph.removeAttribute('data-reader-prose');
    if (paragraph.closest(EXCLUDED) || paragraph.querySelector(STRUCTURED)) return;
    const children = [...paragraph.childNodes].filter(node => node.nodeType !== 3 || node.textContent.trim());
    if (children.length === 1 && ['EM', 'I', 'STRONG', 'B'].includes(children[0].tagName)) return;
    // Explicitly coloured/centred legacy paragraphs are captions or rubrics.
    if (paragraph.querySelector('[style*="color"],font[color]')
      || /text-align\s*:\s*(?:center|right)/i.test(paragraph.getAttribute('style') || '')
      || /^(?:\d+\s*)?Ант\.|^[КСНДЛЦVR]\.|^(?:Рэфрэн|ККК)\s/iu.test(paragraph.textContent.trim())) return;
    if (paragraph.textContent.trim()) paragraph.setAttribute('data-reader-prose', '');
  });
}

export const vReaderProse = { mounted: markReaderProse, updated: markReaderProse };
