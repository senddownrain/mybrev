/**
 * Select a complete hymn from the legacy Common of Pastors without editing
 * the underlying liturgical text (also handles already-published Firestore data).
 *
 * Two stored layouts are recognized, nothing else:
 *  1. the base text: four <hr> sections: shared opening; mutually exclusive
 *     Pope / bishop / presbyter stanza; shared conclusion; independent hymn for
 *     several pastors. The separators are inside <p> elements in the original HTML.
 *  2. the seasonal variants (`_seasonalVariants.*`, Advent/Christmas/Lent/Easter):
 *     the same hymn flattened into one <p> without <hr>, the five headings
 *     («Пра аднаго пастыра», «Пра Папу», «Пра біскупа», «Пра прэзбітэра»,
 *     «Пра некалькіх пастыраў») standing alone on their own lines.
 */
const TITLES = Object.freeze({
  pope: 'Пра Папу',
  bishop: 'Пра біскупа',
  priest: 'Пра прэзбітэра',
  many: 'Пра некалькіх пастыраў',
});
const KINDS = ['pope', 'bishop', 'priest', 'many'];

export function pastorKindFromTitle(title) {
  const value = String(title || '').toLocaleLowerCase('be').replace(/<[^>]*>/g, ' ');
  const boundary = '[\\s,;().]';
  const has = (word) => new RegExp('(?:^|' + boundary + ')(?:' + word + ')(?=$|' + boundary + ')', 'iu').test(value);
  if (has('пастыраў|біскупаў|папаў|прэзбітэраў|святароў')) return 'many';
  if (has('папа|папы|папу|папе|папам')) return 'pope';
  if (has('біскуп|біскупа|біскупу|біскупам')) return 'bishop';
  if (has('прэзбітэр|прэзбітэра|прэзбітэру|святар|святара|святару')) return 'priest';
  return ''; // No guessed rank from the person's name.
}

function paragraphs(section) {
  return section.replace(/<\/p>/gi, '\n').replace(/<p\b[^>]*>/gi, '')
    .split(/\n+/).map((line) => line.trim()).filter(Boolean);
}

function withoutRubric(line) {
  return line.replace(/^.*?<br\s*\/?>/is, '')
    .replace(/(?:<br\s*\/?>\s*)+$/gi, '').trim();
}

function paragraph(line) {
  return '<p>' + line.replace(/(?:<br\s*\/?>\s*)+$/gi, '').trim() + '</p>';
}

function hrContent(source) {
  if (!/<hr\b/i.test(source)) return null;
  const parts = source.split(/<hr\s*\/?>/gi);
  if (parts.length !== 4) return null;
  const [opening, middle, ending, plural] = parts.map(paragraphs);
  if (!opening.length || middle.length !== 3 || !ending.length || !plural.length) return null;
  const first = withoutRubric(opening[0]);
  const middles = middle.map(withoutRubric);
  const manyFirst = withoutRubric(plural[0]);
  if (!first || !manyFirst || middles.some((part) => !part)) return null;
  return {
    pope: [first, ...opening.slice(1), middles[0], ...ending],
    bishop: [first, ...opening.slice(1), middles[1], ...ending],
    priest: [first, ...opening.slice(1), middles[2], ...ending],
    many: [manyFirst, ...plural.slice(1)],
  };
}

const HEADINGS = ['Пра аднаго пастыра', 'Пра Папу', 'Пра біскупа', 'Пра прэзбітэра', 'Пра некалькіх пастыраў'];
const plainText = (line) => line.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/**
 * Flattened seasonal layout → the same `content` as the <hr> layout. The
 * headings are certain; the only inference is the end of the presbyter stanza
 * (there is no separator before the shared conclusion): the three mutually
 * exclusive stanzas have the same number of lines, so it is the one of the Pope
 * and bishop stanzas. Any other shape is left untouched.
 */
function flatContent(source) {
  if (/<hr\b/i.test(source)) return null;
  const lines = source.replace(/<\/p>\s*<p\b[^>]*>/gi, '<br />').replace(/^\s*<p\b[^>]*>|<\/p>\s*$/gi, '')
    .split(/<br\s*\/?>/i).map((line) => line.trim()).filter(Boolean);
  const at = HEADINGS.map((label) => {
    const found = lines.map((line, index) => (plainText(line).replace(/\s*:$/, '') === label ? index : -1)).filter((i) => i >= 0);
    return found.length === 1 ? found[0] : -1;
  });
  if (at.some((index, i) => index < 0 || (i > 0 && index <= at[i - 1])) || at[0] !== 0) return null;
  const opening = lines.slice(at[0] + 1, at[1]);
  const pope = lines.slice(at[1] + 1, at[2]);
  const bishop = lines.slice(at[2] + 1, at[3]);
  const rest = lines.slice(at[3] + 1, at[4]);
  const plural = lines.slice(at[4] + 1);
  const size = pope.length;
  if (!opening.length || !size || bishop.length !== size || rest.length <= size || !plural.length) return null;
  const priest = rest.slice(0, size);
  const ending = rest.slice(size);
  const block = (list) => list.join('<br />');
  return {
    pope: [block(opening), block(pope), block(ending)],
    bishop: [block(opening), block(bishop), block(ending)],
    priest: [block(opening), block(priest), block(ending)],
    many: [block(plural)],
  };
}

export function preparePastorsHymn(html, feastName = '') {
  const source = String(html || '');
  if (!source.includes('Пра аднаго пастыра') || !source.includes('Пра некалькіх')) return source;
  const content = flatContent(source) || hrContent(source);
  if (!content) return source;
  const selected = pastorKindFromTitle(feastName);
  const order = selected ? [selected, ...KINDS.filter((kind) => kind !== selected)] : KINDS;
  const hymns = order.map((kind) =>
    '<div data-alternative-title="' + TITLES[kind] + '" data-pastor-kind="' + kind + '">\n' +
    content[kind].map(paragraph).join('\n') + '\n</div>'
  ).join('\n');
  // With no explicit rank in the feast title, require a manual choice instead
  // of silently presenting the Pope hymn as if it belonged to this saint.
  if (selected) return hymns;
  return '<div data-alternative-title="Абярыце тып пастыра" data-pastor-kind="unspecified">' +
    '<p>Абярыце адпаведны варыянт гімна паводле святога.</p></div>\n' + hymns;
}
