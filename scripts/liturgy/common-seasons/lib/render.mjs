/**
 * Render the lines of a structural unit as HTML in the style of the
 * existing `common-texts` fields (see html.mjs). Conventions were measured on
 * the stored HTML (Volume III ↔ common-texts), see tests/common-seasons-parser.test.mjs.
 */
import { HR, escapeHtml, markInline, paragraph, red } from './html.mjs';
import { ALLELUIA_ANNOTATION } from './volume.mjs';

const clean = (text) => text.replace(ALLELUIA_ANNOTATION, '').replace(/\t+/g, '\t').replace(/\s+$/, '');
const textOf = (line) => (typeof line === 'string' ? line : line.text);

/** «Хваліце Пана, †» → strophes (a strophe ends with a line that is not a half-line `*` / `†`). */
export function psalmStrophes(lines) {
  const strophes = [];
  let current = [];
  lines.forEach((line) => {
    const text = line.trim();
    if (!text) { if (current.length) { strophes.push(current); current = []; } return; }
    current.push(text);
    if (!/[*†]\s*$/.test(text)) { strophes.push(current); current = []; }
  });
  if (current.length) strophes.push(current);
  return strophes;
}

/** Hymn strophes: blank lines when the volume has them, else a closing «.» / «Амэн.» ends a strophe. */
export function hymnStrophes(lines) {
  const hasBlank = lines.some((line) => !line.trim());
  if (hasBlank) {
    const strophes = [];
    let current = [];
    lines.forEach((line) => {
      if (!line.trim()) { if (current.length) { strophes.push(current); current = []; } return; }
      current.push(line.trim());
    });
    if (current.length) strophes.push(current);
    return strophes;
  }
  const strophes = [];
  let current = [];
  lines.forEach((line) => {
    current.push(line.trim());
    if (/[.!?]\s*$/.test(line.trim()) && current.length >= 3) { strophes.push(current); current = []; }
  });
  if (current.length) strophes.push(current);
  return strophes;
}

const redMarksEnd = (line) => {
  const text = line.trim();
  const match = /^(.*?)\s*([*†])$/.exec(text);
  if (!match) return escapeHtml(text);
  return `${escapeHtml(match[1])} ${red(match[2])}`;
};

export function renderPsalm(lines, { title, note } = {}) {
  const out = [];
  const rest = [...lines];
  const header = rest.shift();
  const titleText = textOf(header).replace(/\s*\t+\s*/g, ' ').replace(/\s+/g, ' ').trim();
  out.push(paragraph(red(escapeHtml(title || titleText)), 'center'));
  const verses = [];
  const notes = [];
  const repeats = [];
  rest.forEach((line) => {
    const text = clean(textOf(line));
    if (!text.trim()) { verses.push(''); return; }
    if (/^Ант\./i.test(text)) { repeats.push(text); return; }
    if (/^(Пры спеве наступнай|Калі ніжэйпададзены|Калі гэты псальм|Псальм Закліку)/u.test(text) && !verses.length) { notes.push(text); return; }
    verses.push(text);
  });
  notes.forEach((text) => {
    if (/^Пры спеве/u.test(text)) {
      const html = escapeHtml(text).split(/(Аллелюя)/u).map((part) => (part === 'Аллелюя' ? ' Аллелюя ' : (part.trim() ? red(part.trim()) : ''))).join('').replace(/\s{2,}/g, ' ');
      out.push(paragraph(html, 'justify'));
    } else out.push(paragraph(`<em>${escapeHtml(text)}</em>`, 'justify'));
  });
  psalmStrophes(verses).forEach((strophe) => out.push(paragraph(strophe.map(redMarksEnd).join('<br />'))));
  repeats.forEach((text) => out.push(renderAntiphonParagraph(text)));
  return out.join('\n');
}

export function renderHymn(lines) {
  const body = lines.map(textOf).map((text) => text.replace(/ /g, ' '));
  if (/^Гімн$/i.test((body[0] || '').trim())) body.shift();
  return hymnStrophes(body).map((strophe) => paragraph(strophe.map(escapeHtml).join('<br />'))).join('\n');
}

const LABEL = /^((?:[123]\s+)?[Аа]нт\.(?:\s+да\s+песні\s+(?:Марыі|Захарыі)\s*:)?|Або\s*:|Пра [^:]{2,70}:|Ютрань:|Заклік:|І Нешпары:|ІІ Нешпары:)\s*(.*)$/u;

export function renderAntiphonParagraph(rawText) {
  const text = clean(rawText).trim();
  const match = LABEL.exec(text);
  if (!match) return paragraph(markInline(text));
  const label = match[1].replace(/\s+:$/, ':').replace(/^Ант\.$/u, 'Ант.');
  const rest = match[2];
  return paragraph(`${red(label)}${rest ? ` ${markInline(rest)}` : ''}`);
}

/** Antiphon-like fields: every line is one paragraph, alternatives are separated by <hr />. */
export function renderAntiphons(lines) {
  const items = lines.map(textOf).filter((text) => text.trim());
  return items.map(renderAntiphonParagraph).join(`\n${HR}\n`);
}

const isAlt = (text) => /^(Або|Пра [^:]{2,70}|У [^:]{2,80}|Калі [^:]{2,80}):?\s*$/u.test(text.trim()) || /^[^.!?]{2,90}:$/u.test(text.trim());

export function renderPrayers(lines) {
  const items = lines.map(textOf).map(clean).filter((text) => text.trim());
  const out = [];
  items.forEach((text, index) => {
    if (/^Калі няма ўласнай малітвы/u.test(text)) { out.push(paragraph(red(escapeHtml(text.trim())), 'justify')); return; }
    if (isAlt(text) && text.trim().length < 100 && index > 0 && !/^Калі/u.test(text)) {
      if (out.length) out.push(HR);
      out.push(paragraph(red(escapeHtml(text.trim())), 'justify'));
      return;
    }
    if (isAlt(text) && text.trim().length < 100) { out.push(paragraph(red(escapeHtml(text.trim())), 'justify')); return; }
    out.push(paragraph(markInline(text, { names: true }), 'justify'));
  });
  return out.join('\n');
}

/** «К. … * … Н. …» responsory/versicle lines. */
export function renderVersicles(lines, { align = 'none' } = {}) {
  return lines.map(textOf).map(clean).filter((text) => text.trim())
    .map((text) => paragraph(markInline(text), align)).join('\n');
}

const REF_LINE = /^(.*?)\t+\s*(.+)$/u;

/** Short reading (+ short responsory) of Lauds / Vespers / Daytime Prayer. */
export function renderShortReading(lines, { responsoryAlign = 'justify' } = {}) {
  const out = [];
  const items = lines.map(textOf).map(clean).filter((text) => text.trim());
  let mode = 'text';
  items.forEach((text) => {
    const tab = REF_LINE.exec(text);
    if (/^Кароткае\s+чытанне/u.test(text)) {
      const ref = tab ? tab[2].trim() : '';
      out.push(paragraph(`${red('Кароткае чытанне')}${ref ? `${red(' ')}${red(escapeHtml(ref))}` : ''}`, 'justify'));
      return;
    }
    if (/^Кароткі\s+рэспансорый/u.test(text)) { out.push(paragraph(red('Кароткі рэспансорый'), responsoryAlign)); mode = 'resp'; return; }
    if (/^Або\s*:/u.test(text)) {
      const ref = tab ? tab[2].trim() : text.replace(/^Або\s*:\s*/u, '').trim();
      out.push(HR, paragraph(red('Або: '), 'justify'));
      if (ref) out.push(paragraph(red(escapeHtml(ref)), 'justify'));
      return;
    }
    if (tab && !/[.!?»]$/.test(tab[1].trim()) && /\d/.test(tab[2]) && out.length === 0) {
      out.push(paragraph(red(escapeHtml(`${tab[1].trim()} ${tab[2].trim()}`)), 'justify'));
      return;
    }
    if (/^(К\.|Н\.)\s/u.test(text)) { out.push(paragraph(markInline(text), mode === 'resp' ? responsoryAlign : 'none')); return; }
    if (tab && /^\s*(пар\.\s*)?[\d\sА-Яа-я,.\-–:;()Ііa-z]+$/u.test(tab[2]) && out.length && /^\p{Lu}/u.test(tab[1])) {
      // an inline reference line in a season branch: «1 П 5, 10-11» was split off by the scanner as its own line
      out.push(paragraph(red(escapeHtml(text.replace(/\t+/g, ' '))), 'justify'));
      return;
    }
    out.push(paragraph(markInline(text.replace(/\t+/g, ' ')), 'justify'));
  });
  return out.join('\n');
}

const SOURCE_PAREN = /^\(.+\)$/u;

/** First/Second Reading of the Office of Readings with its responsory. */
export function renderLongReading(lines, { heading = true } = {}) {
  const items = lines.map(textOf).map(clean).filter((text) => text.trim());
  const out = [];
  let state = 'start';
  let sawBodyOrTitle = false;
  items.forEach((text) => {
    if (/^(Першае|Другое)\s+чытанне/u.test(text)) { if (heading) out.push(paragraph(red(escapeHtml(text.trim())), 'justify')); return; }
    if (/^Або\s+іншае\s*:/u.test(text)) { out.push(HR, paragraph(red('Або іншае:'), 'justify')); state = 'start'; sawBodyOrTitle = false; return; }
    if (/^Рэспансорый/u.test(text)) {
      const tab = REF_LINE.exec(text);
      const label = tab ? `${tab[1].trim()} ${tab[2].trim()}` : text.trim();
      out.push(paragraph(red(escapeHtml(label)), 'justify'));
      state = 'resp';
      return;
    }
    if (state === 'resp' && /^(К\.|Н\.)\s/u.test(text)) { out.push(paragraph(markInline(text), 'justify')); return; }
    const tab = REF_LINE.exec(text);
    if (tab && !sawBodyOrTitle) {
      // «Кніга Апакаліпсіса св. апостала Яна \t21, 9-27»
      out.push(paragraph(`${escapeHtml(tab[1].trim())} ${red(escapeHtml(tab[2].trim()))}`, 'justify'));
      state = 'afterRef';
      return;
    }
    if (SOURCE_PAREN.test(text.trim())) { out.push(paragraph(red(escapeHtml(text.trim())), 'justify')); state = 'afterRef'; return; }
    if (state === 'start' && !sawBodyOrTitle) {
      // author/work line of a patristic reading
      out.push(paragraph(escapeHtml(text.trim()), 'justify'));
      sawBodyOrTitle = false;
      state = 'afterAuthor';
      return;
    }
    if ((state === 'afterRef' || state === 'afterAuthor') && !sawBodyOrTitle && text.length < 140 && !/[.!?»]$/.test(text.trim())) {
      out.push(paragraph(`<em><em>${red(escapeHtml(text.trim()))}</em></em>`, 'center'));
      sawBodyOrTitle = true;
      return;
    }
    sawBodyOrTitle = true;
    out.push(paragraph(markInline(text), 'justify'));
  });
  return out.join('\n');
}

/**
 * @param {object} unit  unit of units.mjs
 * @param {string|null} season  branch to read
 * @param {object} lines  already selected lines (from fields.unitLines)
 */
export function renderUnitLines(unit, lines, options = {}) {
  const items = lines.filter((line) => textOf(line) !== undefined);
  switch (unit.kind) {
    case 'hymn': return renderHymn(items);
    case 'ant': case 'canticleAnt': return renderAntiphons(items);
    case 'psalm': return renderPsalm(items, options);
    case 'shortReading': return renderShortReading(items, options);
    case 'reading1': case 'reading2': return renderLongReading(items, options);
    case 'versicle': return renderVersicles(items, options);
    case 'prayer': return renderPrayers(items);
    default: return null;
  }
}
