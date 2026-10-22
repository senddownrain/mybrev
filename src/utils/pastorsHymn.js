/**
 * Select a complete hymn from the legacy Common of Pastors without editing
 * the underlying liturgical text (also handles already-published Firestore data).
 *
 * The source has four <hr> sections: shared opening; mutually exclusive Pope /
 * bishop / presbyter stanza; shared conclusion; independent hymn for several
 * pastors. The separators are inside <p> elements in the original HTML.
 * This is intentionally limited to this exact, recognizable four-part layout.
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

export function preparePastorsHymn(html, feastName = '') {
  const source = String(html || '');
  if (!source.includes('Пра аднаго пастыра') || !source.includes('Пра некалькіх') || !/<hr\b/i.test(source)) {
    return source;
  }
  const parts = source.split(/<hr\s*\/?>/gi);
  if (parts.length !== 4) return source;
  const [opening, middle, ending, plural] = parts.map(paragraphs);
  if (!opening.length || middle.length !== 3 || !ending.length || !plural.length) return source;
  const first = withoutRubric(opening[0]);
  const middles = middle.map(withoutRubric);
  const manyFirst = withoutRubric(plural[0]);
  if (!first || !manyFirst || middles.some((part) => !part)) return source;
  const content = {
    pope: [first, ...opening.slice(1), middles[0], ...ending],
    bishop: [first, ...opening.slice(1), middles[1], ...ending],
    priest: [first, ...opening.slice(1), middles[2], ...ending],
    many: [manyFirst, ...plural.slice(1)],
  };
  const selected = pastorKindFromTitle(feastName);
  const order = selected ? [selected, ...KINDS.filter((kind) => kind !== selected)] : KINDS;
  return order.map((kind) =>
    '<div data-alternative-title="' + TITLES[kind] + '" data-pastor-kind="' + kind + '">\n' +
    content[kind].map(paragraph).join('\n') + '\n</div>'
  ).join('\n');
}
