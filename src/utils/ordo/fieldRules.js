/**
 * Structured field rules (`_fieldRules[field]`) of sparse Hours documents —
 * the only form in which a source instruction («Гімн з Ютрані», «з нядзелі
 * І тыдня», «Гімн з Уласных тэкстаў пра святых») reaches the runtime.
 *
 * Kinds (shared with the Flutter port, see docs/liturgical-data-architecture.md):
 *
 *   { ref: 'laudesHymn' }                      same-day field: another field of the same assembled Office
 *   { ref: ['vesperHymn', 'vesper1Hymn'] }     same-day field, first non-empty candidate
 *   { source: 'current-day' }                  the temporal day of the date
 *   { source: 'sunday-week-1' }                psalter template `sunday-week-1`
 *   { source: 'common' }                       the Common the user chose (`_defaultTemplate`)
 *   { source: 'template', template: 'apostles' } a named Common
 *   { source: 'proper' }                       the celebration's own Proper (used inside a Common:
 *                                              «Гімн з Уласных тэкстаў пра святых»); never a weekday fallback
 *   { source: 'complementary' }                complementary psalmody template
 *   { source: 'office-for-dead' }              the Office for the Dead template
 *   { omit: true }                             intentionally empty
 *   allowCurrentDay: true                      (modifier) «… або з будня»: «З дня» keeps the weekday
 *
 * Pure: no Firestore.
 */

export const FIELD_RULE_SOURCES = Object.freeze([
  'current-day', 'sunday-week-1', 'common', 'template', 'proper', 'complementary', 'office-for-dead',
]);

/** Kind of a rule: 'same-day-field' | the source name | 'omit' | 'invalid'. */
export function fieldRuleKind(rule) {
  if (!rule || typeof rule !== 'object') return 'invalid';
  if (rule.omit === true) return 'omit';
  if (rule.ref !== undefined) {
    const refs = Array.isArray(rule.ref) ? rule.ref : [rule.ref];
    return refs.length && refs.every((name) => typeof name === 'string' && name) ? 'same-day-field' : 'invalid';
  }
  if (!FIELD_RULE_SOURCES.includes(rule.source)) return 'invalid';
  if (rule.source === 'template' && !rule.template) return 'invalid';
  return rule.source;
}

export const isValidFieldRule = (rule) => fieldRuleKind(rule) !== 'invalid';

const FIELD_LABELS = Object.freeze({
  officeOfReadingsHymn: 'гімн Гадзіны чытанняў',
  officeOfReadingsPr: 'малітва Гадзіны чытанняў',
  laudesHymn: 'гімн Ютрані',
  laudesPr: 'малітва Ютрані',
  vesperHymn: 'гімн Нешпараў',
  vesper1Hymn: 'гімн І Нешпараў',
  vesperPr: 'малітва Нешпараў',
});

const SOURCE_LABELS = Object.freeze({
  'current-day': 'з бягучага дня',
  'sunday-week-1': 'з нядзелі І тыдня псалтыра',
  common: 'з выбраных агульных тэкстаў',
  proper: 'з уласных тэкстаў празднавання',
  complementary: 'з дадатковай псалмодыі',
  'office-for-dead': 'з Афіцыя за памерлых',
});

/** Human (Belarusian) description for the editor; never a runtime directive. */
export function describeFieldRule(rule) {
  const kind = fieldRuleKind(rule);
  if (kind === 'omit') return 'наўмысна пустое';
  if (kind === 'same-day-field') {
    const refs = Array.isArray(rule.ref) ? rule.ref : [rule.ref];
    return `тое самае, што ${refs.map((name) => FIELD_LABELS[name] || name).join(' / ')}`;
  }
  if (kind === 'template') return `з агульных тэкстаў «${rule.template}»${rule.allowCurrentDay ? ' (або з будня)' : ''}`;
  if (kind === 'invalid') return 'нявызначанае правіла';
  return `${SOURCE_LABELS[kind] || kind}${rule.allowCurrentDay ? ' (або з будня)' : ''}`;
}

/** Rules an editor may set on a field (structured choices, no free text). */
export function editableRuleOptions(field) {
  const options = [
    { value: 'current-day', title: SOURCE_LABELS['current-day'], rule: { source: 'current-day' } },
    { value: 'common', title: SOURCE_LABELS.common, rule: { source: 'common' } },
    { value: 'sunday-week-1', title: SOURCE_LABELS['sunday-week-1'], rule: { source: 'sunday-week-1' } },
    { value: 'omit', title: 'наўмысна пустое', rule: { omit: true } },
  ];
  const hour = field.replace(/(Hymn|Ant\d|Ps\d|R\d?|AntBen|AntMag|Inter|Pr|Vers)$/, '');
  const component = field.slice(hour.length);
  ['officeOfReadings', 'laudes', 'vesper', 'vesper1']
    .filter((prefix) => prefix !== hour && ['Hymn', 'Pr'].includes(component))
    .forEach((prefix) => {
      const target = `${prefix}${component}`;
      options.push({ value: `ref:${target}`, title: `тое самае, што ${FIELD_LABELS[target] || target}`, rule: { ref: target } });
    });
  return options;
}
