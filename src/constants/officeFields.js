/**
 * Hours fields of a `days` document and the Office component each of them
 * carries. Shared by the content assembler (`src/utils/ordo/officeAssembly.js`)
 * and the fixed-feast generator (`patchs/generate-db-feasts.mjs`).
 */
const hourFields = (prefix, hour, { antiphonOf = 'canticleAntiphon', canticle } = {}) => ({
  [`${prefix}Hymn`]: [hour, 'hymn'],
  [`${prefix}Ant1`]: [hour, 'antiphons'],
  [`${prefix}Ant2`]: [hour, 'antiphons'],
  [`${prefix}Ant3`]: [hour, 'antiphons'],
  [`${prefix}Ps1`]: [hour, 'psalmody'],
  [`${prefix}Ps2`]: [hour, 'psalmody'],
  [`${prefix}Ps3`]: [hour, 'psalmody'],
  [`${prefix}R`]: [hour, 'reading'],
  ...(canticle ? { [`${prefix}${canticle}`]: [hour, antiphonOf], [`${prefix}Inter`]: [hour, 'intercessions'] } : {}),
  [`${prefix}Pr`]: [hour, 'prayer'],
});

/** field → [hour, component] of the Office descriptor (`src/utils/ordo/office.js`). */
export const OFFICE_FIELD_SLOTS = Object.freeze({
  invitatoriumAnt: ['invitatory', 'antiphon'],
  officeOfReadingsHymn: ['officeOfReadings', 'hymn'],
  officeOfReadingsAnt1: ['officeOfReadings', 'antiphons'],
  officeOfReadingsAnt2: ['officeOfReadings', 'antiphons'],
  officeOfReadingsAnt3: ['officeOfReadings', 'antiphons'],
  officeOfReadingsPs1: ['officeOfReadings', 'psalmody'],
  officeOfReadingsPs2: ['officeOfReadings', 'psalmody'],
  officeOfReadingsPs3: ['officeOfReadings', 'psalmody'],
  officeOfReadingsVers: ['officeOfReadings', 'versicle'],
  officeOfReadingsR1: ['officeOfReadings', 'reading1'],
  officeOfReadingsR2: ['officeOfReadings', 'reading2'],
  officeOfReadingsPr: ['officeOfReadings', 'prayer'],
  ...hourFields('laudes', 'lauds', { canticle: 'AntBen' }),
  ...hourFields('sext1', 'daytime'),
  ...hourFields('sext2', 'daytime'),
  ...hourFields('sext3', 'daytime'),
  ...hourFields('vesper', 'vespers', { canticle: 'AntMag' }),
});

/** Fields of I Vespers (present only when the celebration has them). */
export const FIRST_VESPER_FIELDS = Object.freeze([
  'vesper1Hymn', 'vesper1Ant1', 'vesper1Ant2', 'vesper1Ant3', 'vesper1Ps1', 'vesper1Ps2', 'vesper1Ps3',
  'vesper1R', 'vesper1AntMag', 'vesper1Inter', 'vesper1Pr',
]);

/** Text fields of the Hours, in document order (without the Te Deum flag). */
export const OFFICE_TEXT_FIELDS = Object.freeze(Object.keys(OFFICE_FIELD_SLOTS));

export const TE_DEUM_FIELD = 'officeOfReadingsTeDeum';

/** Every content field the generator and the assembler handle. */
export const OFFICE_CONTENT_FIELDS = Object.freeze([
  ...OFFICE_TEXT_FIELDS.slice(0, OFFICE_TEXT_FIELDS.indexOf('officeOfReadingsPr')),
  TE_DEUM_FIELD,
  ...OFFICE_TEXT_FIELDS.slice(OFFICE_TEXT_FIELDS.indexOf('officeOfReadingsPr')),
  ...FIRST_VESPER_FIELDS,
]);

/** Version of the sparse feast document (`_schema`). */
export const SPARSE_DAY_SCHEMA = 2;

export const isSparseDayDocument = (doc) => Number(doc?._schema) === SPARSE_DAY_SCHEMA;

/** Reusable sources kept as `liturgicalTemplates` documents besides the Commons. */
export const SUNDAY_WEEK_1_TEMPLATE = 'sunday-week-1';
