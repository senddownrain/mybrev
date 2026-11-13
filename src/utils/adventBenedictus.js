import reviewed from '../data/liturgical/advent-benedictus-by.json' with { type: 'json' };
import { getLiturgicalAlternatives } from './liturgicalAlternatives.js';
import { parse } from 'node-html-parser';

const CYCLES = { A: 'A', А: 'A', B: 'B', В: 'B', C: 'C', С: 'C' };

/** Select by the explicit cycle label, never by position or a nonempty fallback.
 * The shared heading and the selected HTML are retained by the existing parser.
 */
export function selectAdventBenedictus(html, cycle) {
  if (!['A', 'B', 'C'].includes(cycle)) return '';
  const options = getLiturgicalAlternatives(html, 'gospel-antiphon')
    .filter((option) => CYCLES[option.title.match(/^Год ([AАBВCС])(?: · \d+)?$/u)?.[1]] === cycle);
  if (options.length !== 1) return '';
  const text = parse(options[0].html).text.replace(/\s+/g, ' ');
  return /Год [AАBВCС]:\s*\S/u.test(text) ? options[0].html : '';
}

/** Bridge only the verified legacy value. Preserve any later editorial edition. */
export function adventSundayBenedictus(day, cycle) {
  const origin = day?._fieldSources?.laudesAntBen;
  const own = !origin || (origin.document === day?.id && origin.field === reviewed.field);
  const legacy = own && day?.id === reviewed.document && day.laudesAntBen === reviewed.legacyValue;
  return {
    value: own ? selectAdventBenedictus(legacy ? reviewed.value : day?.laudesAntBen, cycle) : '',
    source: {
      document: day?.id || reviewed.document, field: reviewed.field, cycle,
      ...(legacy ? { edition: reviewed.source.file } : {}),
    },
  };
}
