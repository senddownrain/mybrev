/** Runtime collection for all liturgical-day entities. */
export const LITURGICAL_DAYS_COLLECTION = 'fixedDays';

/**
 * The collection contains three intentionally different entity shapes.
 * Keeping the selectors here prevents date feasts, period days and movable
 * feasts from being treated as interchangeable documents.
 */
export const LITURGICAL_DAY_KIND = Object.freeze({
  PERIOD: 'period',
  FIXED: 'fixed',
  DYNAMIC: 'dynamic',
});

export const LITURGICAL_DAY_SELECTOR_FIELDS = Object.freeze({
  [LITURGICAL_DAY_KIND.PERIOD]: ['_periodType', '_periodWeekNumber', '_dayOfWeek'],
  [LITURGICAL_DAY_KIND.FIXED]: ['_date', '_rank', '_place'],
  [LITURGICAL_DAY_KIND.DYNAMIC]: ['_feast'],
});

export const LITURGICAL_DAY_META_FIELDS = Object.freeze([
  '_date',
  '_periodType',
  '_periodWeekNumber',
  '_dayOfWeek',
  '_feast',
  '_feastName',
  '_rank',
  '_place',
  '_templates',
  '_currentVersion',
]);

/** Canonical content reference accepted with or without legacy brackets. */
export function isFromDayReference(value) {
  const normalized = String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .trim();
  return normalized === 'from-day';
}

/**
 * Список полей документа дня для формы редактирования.
 * Форма пока сохраняет общий superset; runtime использует типизированные
 * selectors выше и не предполагает, что каждый тип содержит все meta-поля.
 */
export const DAY_EDITOR_FIELDS = [
  '_dayOfWeek',
  '_periodType',
  '_periodWeekNumber',
  '_date',
  '_feast',
  '_psalmWeek',
  '_dayName',
  '_weekDay',
  '_weekNum',
  '_feastName',
  '_feastType',
  '_rank',
  '_place',
  '_templates',
  '_currentVersion',
  'allowedAlleluia',
  'invitatoriumAnt',
  'invitatoriumPs1',
  'invitatoriumPs2',
  'invitatoriumPs3',
  'invitatoriumPs4',
  'invitatoriumPs5',
  'invitatoriumPs6',
  'feastComment',
  'officeOfReadingsHymn',
  'officeOfReadingsAnt1',
  'officeOfReadingsAnt2',
  'officeOfReadingsAnt3',
  'officeOfReadingsPs1',
  'officeOfReadingsPs2',
  'officeOfReadingsPs3',
  'officeOfReadingsVers',
  'officeOfReadingsR1',
  'officeOfReadingsR2',
  'officeOfReadingsTeDeum',
  'officeOfReadingsPr',
  'laudesHymn',
  'laudesAnt1',
  'laudesAnt2',
  'laudesAnt3',
  'laudesPs1',
  'laudesPs2',
  'laudesPs3',
  'laudesR',
  'laudesAntBen',
  'laudesInter',
  'laudesPr',
  'sext1Hymn',
  'sext1Ant1',
  'sext1Ant2',
  'sext1Ant3',
  'sext1Ps1',
  'sext1Ps2',
  'sext1Ps3',
  'sext1R',
  'sext1Pr',
  'sext2Hymn',
  'sext2Ant1',
  'sext2Ant2',
  'sext2Ant3',
  'sext2Ps1',
  'sext2Ps2',
  'sext2Ps3',
  'sext2R',
  'sext2Pr',
  'sext3Hymn',
  'sext3Ant1',
  'sext3Ant2',
  'sext3Ant3',
  'sext3Ps1',
  'sext3Ps2',
  'sext3Ps3',
  'sext3R',
  'sext3Pr',
  'vesperHymn',
  'vesperAnt1',
  'vesperAnt2',
  'vesperAnt3',
  'vesperPs1',
  'vesperPs2',
  'vesperPs3',
  'vesperR',
  'vesperAntMag',
  'vesperInter',
  'vesperPr',
  'vesper1Hymn',
  'vesper1Ant1',
  'vesper1Ant2',
  'vesper1Ant3',
  'vesper1Ps1',
  'vesper1Ps2',
  'vesper1Ps3',
  'vesper1R',
  'vesper1AntMag',
  'vesper1Inter',
  'vesper1Pr',
  'compHymn',
  'compAnt1',
  'compAnt2',
  'compPs1',
  'compPs2',
  'compR',
  'compResp',
  'compAntS',
  'compPr',
  'compAntM',
];

/** Поля, которые обнуляются при «Стварыць копію» (пользователь задаёт их заново). */
export const DAY_EDITOR_COPY_CLEARED_FIELDS = [
  '_periodType',
  '_periodWeekNumber',
  '_dayOfWeek',
  '_date',
  '_dayName',
  '_weekDay',
  '_weekNum',
];
