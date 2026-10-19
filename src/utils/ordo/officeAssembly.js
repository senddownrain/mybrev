/**
 * Content assembly of a sparse feast document (`_schema: 2`).
 *
 * The feast document holds only its own texts. Every other field is taken
 * from the source the Office descriptor names for that component — never
 * from one blanket fallback:
 *
 *   own text → `_fieldRules[field]` → descriptor slot
 *     fallback chain   Proper → Common → …              (solemnity, feast)
 *     rubrical source  current day / Sunday, week I / complementary
 *     allowed choice   memorial: «З дня» (default) ↔ a Common template
 *
 * `_fieldRules` are the structured form of the old textual instructions:
 *   { ref: 'laudesHymn' }                        «Гімн з Ютрані»
 *   { source: 'sunday-week-1' }                  «з нядзелі І тыдня»
 *   { source: 'current-day' }                    «з бягучага дня»
 *   { source: 'common' }                         the chosen Common
 *   { source: 'template', template: 'apostles' } a named Common
 *   { source: 'proper' }                         the celebration's own text («Гімн з Уласных
 *                                                тэкстаў пра святых» in a Common); missing → integrity
 *   { …, allowCurrentDay: true }                 «… або з будня»: «З дня» keeps the weekday
 *   { omit: true }                               intentionally empty
 * Every kind is listed in `src/utils/ordo/fieldRules.js` (shared with Flutter).
 *
 * A reusable source the rubric requires (Sunday, week I; the complementary
 * psalmody) is never silently replaced by the day: its absence is reported in
 * `integrity` / `day._integrityErrors`.
 *
 * Pure: no Firestore, no strings to interpret at runtime.
 */
import {
  COMPLEMENTARY_PSALMODY_TEMPLATE, FIRST_VESPER_FIELDS, OFFICE_FIELD_SLOTS, OFFICE_TEXT_FIELDS, SUNDAY_WEEK_1_TEMPLATE,
  TE_DEUM_FIELD,
} from '../../constants/officeFields.js';
import { isFromDayReference } from '../../constants/days.js';
import { MAIN_SECTION_FIELD, SATURDAY_MEMORIAL_OPTION, seasonalTemplateGetter, variantKeyForSeason } from './commonSeasons.js';

export const CURRENT_DAY_CHOICE = 'current-day';

// Volume III, 03_ordinary_utf8.txt:5931,6080,6143: everything except
// the printed exceptions comes from holy men/women. No such blanket rule
// is prescribed for pastors, martyrs or the base Commons themselves.
const COMMON_BASES = {
  religious: ['holy-men', 'holy-women'],
  'works-of-mercy': ['holy-men', 'holy-women'],
  educators: ['holy-men', 'holy-women'],
};
// Existing Common bindings, not names or prayer text. Pastors is the
// ordained-saints category; virgins is the female-virgins category.
const BASE_BY_COMMON_BINDING = {
  'holy-men': 'holy-men', pastors: 'holy-men',
  'holy-women': 'holy-women', virgins: 'holy-women',
};

const IDENTITY = new Set([
  'id', '_id', '_schema', '_date', '_feast', '_feastName', '_rank', '_place', '_templates', '_defaultTemplate',
  '_currentVersion', '_celebrationId', '_fieldRules', '_contentStatus', '_periodType', '_periodWeekNumber',
  '_dayOfWeek', '_fromDayFields', '_omitFirstVespers', '_omitTeDeum', '_obsolete',
]);

export function isBlank(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '' || isFromDayReference(value);
  if (Array.isArray(value)) return value.length === 0 || value.every(isBlank);
  return false;
}

const templatesOf = (proper) => (Array.isArray(proper?._templates) ? proper._templates.filter(Boolean) : []);

/** One source rule for a rubric-confirmed base, without celebration-ID exceptions. */
export function commonBaseRule(proper, templateId) {
  const allowed = COMMON_BASES[templateId];
  if (!Array.isArray(allowed)) return null;
  const explicit = proper?._commonBase?.[templateId];
  if (explicit !== undefined) {
    return allowed.includes(explicit)
      ? { rule: { source: 'template', template: explicit } }
      : { reason: 'base-common-invalid' };
  }
  // Scaffolds marked as title-inferred are not confirmed structural evidence.
  const candidates = new Set(proper?._templatesInferred ? [] : templatesOf(proper)
    .map((id) => BASE_BY_COMMON_BINDING[id]).filter((id) => allowed.includes(id)));
  if (candidates.size !== 1) return { reason: candidates.size ? 'base-common-ambiguous' : 'base-common-unconfirmed' };
  return { rule: { source: 'template', template: [...candidates][0] } };
}

/** Default Common of a celebration: `_defaultTemplate`, else the first template. */
export function defaultTemplateOf(proper) {
  const templates = templatesOf(proper);
  return templates.includes(proper?._defaultTemplate) ? proper._defaultTemplate : (templates[0] || '');
}

/** Does the Office let the user choose between the day and a Common? */
export function hasDayChoice(office) {
  return (office?.allowedChoices || []).some((item) => item.options?.includes(CURRENT_DAY_CHOICE));
}

/**
 * Legal assemblies of a celebration, default first:
 *   memorial        [current-day, ...templates]
 *   solemnity/feast [defaultTemplate, ...other templates]   (or one without a Common)
 */
export function assemblyChoices(proper, office) {
  const templates = templatesOf(proper);
  const fallback = defaultTemplateOf(proper);
  const ordered = fallback ? [fallback, ...templates.filter((item) => item !== fallback)] : [];
  if (hasDayChoice(office)) return [CURRENT_DAY_CHOICE, ...ordered];
  return ordered.length ? ordered : [CURRENT_DAY_CHOICE];
}

function slotOf(office, field) {
  const [hour, component] = OFFICE_FIELD_SLOTS[field] || [];
  return office?.hours?.[hour]?.[component] || null;
}

/**
 * @param {object} params
 * @param {object} params.proper      sparse feast document
 * @param {object} params.office      Office descriptor of the option (`buildOfficeDescriptor`)
 * @param {Map|object} params.templates  `liturgicalTemplates` by id
 * @param {string} [params.choice]    'current-day' or a template id (default: first of `assemblyChoices`)
 * @param {object} params.currentDay  assembled temporal day of the date
 * @returns {{ day: object, choice: string, template: string, provenance: object, missing: string[] }}
 */
export function assembleOffice({ proper, office, templates, choice, currentDay, season }) {
  // Commons are read through the season of the SELECTED Office (`computeSeason` of its date;
  // I Vespers use the celebration's own date). Materialised per call: the shared map is never mutated.
  const getTemplate = seasonalTemplateGetter(templates, season);
  const seasonVariant = variantKeyForSeason(season);
  const seasonProvenance = {};
  // Marian Common (D-2): only the Saturday memorial itself shows the Saturday section merged into the stored fields.
  const showsSaturdaySection = office?.optionId === SATURDAY_MEMORIAL_OPTION;
  const mainSectionFields = [];
  const choices = assemblyChoices(proper, office);
  const selected = choices.includes(choice) ? choice : choices[0];
  // An existing Common choice may be used as a local festive formulary.
  // This changes only these three hours, never the calendar descriptor.
  const festiveCommon = hasDayChoice(office) && selected !== CURRENT_DAY_CHOICE
    && ['memorial', 'optional-memorial'].includes(office?.officeKind);
  const isMainHourField = (field) => ['lauds', 'vespers', 'officeOfReadings'].includes(OFFICE_FIELD_SLOTS[field]?.[0]);
  const isFestiveField = (field) => festiveCommon && isMainHourField(field);
  const templateId = selected === CURRENT_DAY_CHOICE ? defaultTemplateOf(proper) : selected;
  const common = getTemplate(templateId);
  const base = selected !== CURRENT_DAY_CHOICE ? commonBaseRule(proper, templateId) : null;
  const isStrictCommonField = (field) => isFestiveField(field) || (Boolean(base) && isMainHourField(field));
  const sundayWeek1 = getTemplate(SUNDAY_WEEK_1_TEMPLATE);
  const rules = proper?._fieldRules || {};
  const day = {};
  const provenance = {};
  const refs = [];
  const integrity = [];

  // Fields outside the Office slots behave as before: own, else the day's.
  Object.entries(currentDay || {}).forEach(([key, value]) => {
    if (!IDENTITY.has(key) && !OFFICE_FIELD_SLOTS[key] && !FIRST_VESPER_FIELDS.includes(key)) day[key] = value;
  });
  Object.entries(proper || {}).forEach(([key, value]) => {
    if (!OFFICE_FIELD_SLOTS[key] && !FIRST_VESPER_FIELDS.includes(key) && key !== '_fieldRules' && !isBlank(value)) day[key] = value;
  });

  const fromTemplate = (template, field, origin) => {
    if (!template) return null;
    const rule = template._fieldRules?.[field];
    if (rule?.omit) return { value: '', origin: `${origin}:omit` };
    if (rule?.ref) { refs.push({ field, ref: rule.ref, origin }); return { pending: true }; }
    if (rule?.source) {
      // A Common referring back to Common is not permission to use a weekday.
      if (rule.source === 'common' && isStrictCommonField(field)) return null;
      return fromSource(rule.source === 'common' ? 'current-day' : rule.source, field, rule.template);
    }
    if (isBlank(template[field])) {
      // Reuse the named-template resolver only after the selected Common's
      // own text/rule. Base lookup is limited to the three festive hours.
      if (template === common && isMainHourField(field) && base) {
        if (base.rule) return fromSource(base.rule.source, field, base.rule.template);
        integrity.push({ field, source: `common:${templateId}`, reason: base.reason });
        return { missingRequired: true };
      }
      return null;
    }
    if (template._seasonal?.fields?.includes(field)) seasonProvenance[field] = template._seasonal.variant;
    // A seasonal variant is already the volume's own (main) text; otherwise the main section replaces the merged field.
    const mainSection = !showsSaturdaySection && !template._seasonal?.fields?.includes(field) ? template[MAIN_SECTION_FIELD]?.[field] : undefined;
    if (!isBlank(mainSection)) { mainSectionFields.push(field); return { value: mainSection, origin }; }
    return { value: template[field], origin };
  };
  function fromSource(source, field, named) {
    switch (source) {
      case 'common': return fromTemplate(common, field, `common:${templateId}`);
      case 'template': {
        const template = getTemplate(named);
        const found = fromTemplate(template, field, `common:${named}`);
        if (found || !isStrictCommonField(field)) return found;
        integrity.push({ field, source: `common:${named}`, reason: template ? 'field-missing' : 'template-missing' });
        return { missingRequired: true };
      }
      case 'office-for-dead': return fromTemplate(getTemplate('office-for-dead'), field, 'common:office-for-dead');
      case 'sunday-week-1':
        return sundayWeek1 && !isBlank(sundayWeek1[field]) ? { value: sundayWeek1[field], origin: SUNDAY_WEEK_1_TEMPLATE } : null;
      case 'complementary': {
        const complementary = getTemplate(COMPLEMENTARY_PSALMODY_TEMPLATE);
        if (complementary && !isBlank(complementary[field])) return { value: complementary[field], origin: 'complementary' };
        integrity.push({ field, source: COMPLEMENTARY_PSALMODY_TEMPLATE, reason: complementary ? 'field-missing' : 'template-missing' });
        return { missingRequired: true };
      }
      case 'proper':
        // A Common that defers to the celebration's own text: never filled
        // from the weekday when the Proper has none (reported instead).
        if (!isBlank(proper?.[field])) return { value: proper[field], origin: 'proper' };
        integrity.push({ field, source: 'proper', reason: 'proper-text-missing' });
        return { missingRequired: true };
      case CURRENT_DAY_CHOICE:
        return isBlank(currentDay?.[field]) ? null : { value: currentDay[field], origin: CURRENT_DAY_CHOICE };
      default: return null;
    }
  }
  const firstOf = (sources, field) => {
    let required = false;
    for (const source of sources) {
      const found = fromSource(source, field);
      if (found?.missingRequired) { required = true; continue; }
      if (found) return found;
    }
    return required ? { missingRequired: true } : null;
  };

  function resolveField(field) {
    if (!isBlank(proper?.[field])) return { value: proper[field], origin: 'proper' };
    const rule = rules[field];
    if (rule?.omit) return { value: '', origin: 'omit' };
    if (rule?.ref) { refs.push({ field, ref: rule.ref, origin: 'proper' }); return { pending: true }; }
    if (rule?.source) {
      if (rule.allowCurrentDay && selected === CURRENT_DAY_CHOICE) {
        const fromDay = fromSource(CURRENT_DAY_CHOICE, field);
        if (fromDay) return fromDay;
      }
      const found = fromSource(rule.source, field, rule.template);
      if (found && !found.missingRequired) return found;
    }
    // One own collect may be stored only at Lauds. In a selected Common
    // formulary it still precedes the Common collect (including groups).
    // Keep the legacy current-day assembly unchanged.
    if (selected !== CURRENT_DAY_CHOICE && field === 'officeOfReadingsPr' && !rule && !isBlank(proper?.laudesPr)) {
      refs.push({ field, ref: 'laudesPr', origin: 'proper' });
      return { pending: true };
    }
    if (isFestiveField(field)) {
      const source = OFFICE_FIELD_SLOTS[field][0] === 'lauds' && OFFICE_FIELD_SLOTS[field][1] === 'psalmody'
        ? SUNDAY_WEEK_1_TEMPLATE : 'common';
      const found = fromSource(source, field);
      if (found) return found;
      const template = source === 'common' ? common : sundayWeek1;
      integrity.push({ field, source: source === 'common' ? `common:${templateId}` : source,
        reason: template ? 'field-missing' : 'template-missing' });
      return null;
    }
    const slot = slotOf(office, field);
    if (!slot) return firstOf(['common', CURRENT_DAY_CHOICE], field);
    const chain = slot.chain.filter((source) => source !== 'proper');
    const fromChain = firstOf(chain, field);
    if (fromChain?.missingRequired) return null;
    if (fromChain) return fromChain;
    if (slot.choice) {
      const order = selected === CURRENT_DAY_CHOICE ? [CURRENT_DAY_CHOICE, 'common'] : ['common', CURRENT_DAY_CHOICE];
      return firstOf(order.filter((source) => slot.choice.options.includes(source)), field);
    }
    // Nothing in the prescribed chain: the day's text is better than a hole.
    return fromSource(CURRENT_DAY_CHOICE, field);
  }

  const missing = [];
  OFFICE_TEXT_FIELDS.forEach((field) => {
    const found = resolveField(field);
    if (found?.pending) return;
    if (!found || found.missingRequired) { day[field] = ''; missing.push(field); return; }
    day[field] = found.value;
    provenance[field] = found.origin;
  });

  // One antiphon around the whole psalmody (solemnities, seasonal Daytime
  // Prayer): an empty 2nd/3rd antiphon is the form of the hour, not a gap.
  ['officeOfReadings', 'laudes', 'sext1', 'sext2', 'sext3', 'vesper'].forEach((hour) => {
    const has = (name) => !isBlank(day[`${hour}${name}`]);
    if (!has('Ant1') || !has('Ps1') || !has('Ps2') || !has('Ps3') || has('Ant2') || has('Ant3')) return;
    [`${hour}Ant2`, `${hour}Ant3`].forEach((field) => {
      const index = missing.indexOf(field);
      if (index >= 0) missing.splice(index, 1);
    });
  });

  // I Vespers: own or Common texts only. Without them the runtime assembles
  // I Vespers from the celebration's Vespers (`liturgicalVespers.js`).
  if (!proper?._omitFirstVespers && !festiveCommon) {
    FIRST_VESPER_FIELDS.forEach((field) => {
      if (!isBlank(proper?.[field])) { day[field] = proper[field]; provenance[field] = 'proper'; return; }
      const rule = rules[field];
      if (rule?.omit) return;
      if (rule?.ref) { refs.push({ field, ref: rule.ref, origin: 'proper' }); return; }
      const found = (rule?.source && fromSource(rule.source, field, rule.template)) || fromTemplate(common, field, `common:${templateId}`);
      if (found && !found.pending) { day[field] = found.value; provenance[field] = found.origin; }
    });
  }

  // References to another field of the same Office («Гімн з Ютрані»).
  refs.forEach(({ field, ref, origin }) => {
    const target = (Array.isArray(ref) ? ref : [ref]).find((name) => !isBlank(day[name]));
    if (target) { day[field] = day[target]; provenance[field] = `ref:${target}`; return; }
    const fallback = isStrictCommonField(field) ? null : fromSource(CURRENT_DAY_CHOICE, field);
    day[field] = fallback?.value ?? '';
    if (fallback) provenance[field] = fallback.origin; else if (OFFICE_FIELD_SLOTS[field]) missing.push(field);
    if (isStrictCommonField(field)) integrity.push({ field, source: `ref:${[ref].flat().join(',')}`, reason: 'field-missing' });
    void origin;
  });

  if (proper?._omitTeDeum) day[TE_DEUM_FIELD] = false;
  else if (proper?.[TE_DEUM_FIELD] !== undefined && proper[TE_DEUM_FIELD] !== '') day[TE_DEUM_FIELD] = Boolean(proper[TE_DEUM_FIELD]);
  else day[TE_DEUM_FIELD] = festiveCommon || office?.teDeum ? true : '';

  // Identity of the celebration; `_currentVersion` keeps the template label
  // and the Marian/requiem theme heuristics of the existing UI working.
  ['_date', '_rank', '_place', '_feastName', '_feast', '_celebrationId', '_contentStatus'].forEach((key) => {
    if (proper?.[key] !== undefined) day[key] = proper[key];
  });
  day._templates = templatesOf(proper);
  if (templateId && selected !== CURRENT_DAY_CHOICE) day._currentVersion = templateId;
  day._assembly = {
    choice: selected, template: selected === CURRENT_DAY_CHOICE ? '' : templateId, sparse: true,
    ...(festiveCommon ? { festiveCommon: true } : {}),
    ...(seasonVariant ? { season: seasonVariant } : {}),
  };
  if (integrity.length) day._integrityErrors = integrity;
  // Only the fields that really came from a seasonal variant of a Common.
  const seasonal = Object.keys(provenance).filter((field) => seasonProvenance[field] && /^common:/.test(provenance[field]));
  return {
    day, choice: selected, template: templateId, provenance, missing, integrity,
    seasonal: { variant: seasonVariant, fields: Object.fromEntries(seasonal.map((field) => [field, seasonProvenance[field]])) },
    // fields whose Saturday-memorial section was left out (Marian Common, not the Saturday memorial)
    mainSection: { fields: [...new Set(mainSectionFields)], saturdaySection: showsSaturdaySection },
  };
}

/** Coarse availability of the Hours of a celebration. */
export function hoursContentStatus(proper, { hasTemplates = templatesOf(proper).length > 0 } = {}) {
  if (!proper) return hasTemplates ? 'common-only' : 'day-fallback';
  const own = OFFICE_TEXT_FIELDS.some((field) => !isBlank(proper[field]));
  if (own) return 'proper';
  return hasTemplates ? 'common-only' : 'day-fallback';
}
