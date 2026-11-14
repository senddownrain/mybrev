/** Independent semantic expectations for the late-Advent audit.
 * Checks both the selected source slot and the text, including evening I/II.
 * Nonempty text from a wrong day is a failure, even if two sources agree.
 */
import moment from '../../../src/utils/moment-be.js';
import reviewed from '../../../src/data/liturgical/advent-vespers-by.json' with { type: 'json' };
import benedictus from '../../../src/data/liturgical/advent-benedictus-by.json' with { type: 'json' };
import { selectAdventBenedictus } from '../../../src/utils/adventBenedictus.js';
import { OFFICE_CONTENT_FIELDS } from '../../../src/constants/officeFields.js';
import { eveningVespersModel } from '../../../src/utils/liturgicalVespers.js';
import { contentFor } from './snapshot-content.mjs';
import { plain } from './lh-catholic-by.mjs';

const SUFFIXES = ['Hymn', 'Ant1', 'Ant2', 'Ant3', 'Ps1', 'Ps2', 'Ps3', 'R', 'AntMag', 'Inter', 'Pr'];
const WEEKDAYS = ['', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const valueAt = (source, document, field) => {
  const raw = source.daysById.get(document)?.[field];
  const correction = reviewed.documents[document]?.[field];
  // An edited source must not redefine the audit's oracle. Review a new
  // edition explicitly rather than blessing any nonempty canonical field.
  return correction ? correction.value : raw;
};
const present = (value) => Boolean(plain(value));

export function checkAdventProvenance(source, date, diocese, content = contentFor(source, date, { diocese })) {
  const m = moment(date);
  if (content.context.periodType !== 'advent' || m.month() !== 11 || m.date() < 17 || m.date() > 24) return null;
  const option = content.dayOptions.find((item) => item.ordo?.role === 'primary');
  const tomorrow = contentFor(source, m.clone().add(1, 'day').format('YYYY-MM-DD'), { diocese });
  const model = eveningVespersModel(option ? { ...option.day, _ordo: option.ordo } : null, tomorrow);
  const first = Boolean(model.firstVespers);
  const actualDay = model.firstVespers?.day || option?.day;
  // Christmas I Vespers on 24 December are audited by the Christmas rules,
  // not against an Advent weekday. Still inspect the daytime Sunday below.
  const christmasFirst = first && actualDay?._periodType === 'christmas';
  const period = `advent-w${content.context.periodWeek}-d${content.context.dayOfWeek}`;
  const dated = `advent-${m.format('DD')}-12`;
  const sunday = m.day() === 0;
  const rows = [];
  const assertField = (day, field, expectedDocument, expectedField = field, expectedValue, cycle) => {
    const expected = expectedValue ?? valueAt(source, expectedDocument, expectedField);
    const actualSource = day?._fieldSources?.[field] || null;
    const missing = !present(expected) || !present(day?.[field]);
    const matchesSource = actualSource?.document === expectedDocument && actualSource?.field === expectedField
      && (!cycle || actualSource?.cycle === cycle);
    const matchesText = plain(day?.[field]) === plain(expected);
    rows.push({ field, expectedSource: { document: expectedDocument, field: expectedField, ...(cycle ? { cycle } : {}) }, actualSource,
      expectedText: plain(expected).slice(0, 120), actualText: plain(day?.[field]).slice(0, 120),
      status: missing ? 'MISSING_SOURCE_TEXT' : matchesSource && matchesText ? 'PASS' : 'WRONG_SOURCE',
    });
  };
  if (!christmasFirst) {
    for (const suffix of SUFFIXES) {
      const field = `vesper${suffix}`;
      if (suffix === 'AntMag') {
        assertField(actualDay, field, dated);
      } else if (first) {
        assertField(actualDay, field, 'advent-w4-d1', `vesper1${suffix}`);
      } else if (sunday) {
        assertField(actualDay, field, period);
      } else if (/^Ps[123]$/.test(suffix)) {
        assertField(actualDay, field, `ordinary-w${content.context.periodWeek}-d${content.context.dayOfWeek}`);
      } else if (/^Ant[123]$/.test(suffix)) {
        const weekdayField = WEEKDAYS[content.context.dayOfWeek];
        const antiphons = String(source.daysById.get(dated)?.[weekdayField] || '').match(/<p(?:\s[^>]*)?>[\s\S]*?<\/p>/gi) || [];
        if (antiphons.length >= 3) {
          assertField(actualDay, field, dated, weekdayField, antiphons[Number(suffix.slice(-1)) - 1]);
        } else {
          assertField(actualDay, field, period);
        }
      } else {
        const own = valueAt(source, dated, field);
        assertField(actualDay, field, present(own) ? dated : period);
      }
    }
  }
  // Sunday Office, with the chosen Benedictus policy and 24 December Lauds.
  if (sunday) {
    for (const field of OFFICE_CONTENT_FIELDS.filter((field) => !field.startsWith('vesper'))) {
      if (field === 'laudesAntBen' && Number(content.context.periodWeek) === 4 && ![21, 23, 24].includes(m.date())) {
        const cycle = content.resolved.readingCycle.sunday;
        assertField(option?.day, field, benedictus.document, field, selectAdventBenedictus(benedictus.value, cycle), cycle);
        continue;
      }
      const dateLauds = m.date() === 24 && field.startsWith('laudes') && !/^laudesPs[123]$/.test(field);
      const expectedDocument = field === 'laudesAntBen' || dateLauds ? dated : period;
      const expected = valueAt(source, expectedDocument, field);
      // Some optional daytime/Te Deum fields are absent from both sources.
      if (expected === undefined || typeof expected === 'boolean' || !present(expected)) continue;
      assertField(option?.day, field, expectedDocument);
    }
  }
  const evening = christmasFirst ? 'christmas-I' : first ? 'I' : model.second ? 'II' : 'weekday';
  const expectedEvening = m.date() === 24 ? 'christmas-I' : m.day() === 6 ? 'I' : sunday ? 'II' : 'weekday';
  return { evening, expectedEvening, eveningStatus: evening === expectedEvening ? 'PASS' : 'WRONG_EVENING', fields: rows };
}
