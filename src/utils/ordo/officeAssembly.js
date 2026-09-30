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
 *   { omit: true }                               intentionally empty
 *
 * Pure: no Firestore, no strings to interpret at runtime.
 */
import {
  FIRST_VESPER_FIELDS, OFFICE_FIELD_SLOTS, OFFICE_TEXT_FIELDS, SUNDAY_WEEK_1_TEMPLATE, TE_DEUM_FIELD,
} from '../../constants/officeFields.js';
import { isFromDayReference } from '../../constants/days.js';

export const CURRENT_DAY_CHOICE = 'current-day';

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
export function assembleOffice({ proper, office, templates, choice, currentDay }) {
  const getTemplate = (id) => (templates instanceof Map ? templates.get(id) : templates?.[id]) || null;
  const choices = assemblyChoices(proper, office);
  const selected = choices.includes(choice) ? choice : choices[0];
  const templateId = selected === CURRENT_DAY_CHOICE ? defaultTemplateOf(proper) : selected;
  const common = getTemplate(templateId);
  const sundayWeek1 = getTemplate(SUNDAY_WEEK_1_TEMPLATE);
  const rules = proper?._fieldRules || {};
  const day = {};
  const provenance = {};
  const refs = [];

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
    if (rule?.ref) { refs.push({ field, ref: rule.ref, origin }); return { pending: true }; }
    if (rule?.source) return fromSource(rule.source === 'common' ? 'current-day' : rule.source, field, rule.template);
    return isBlank(template[field]) ? null : { value: template[field], origin };
  };
  function fromSource(source, field, named) {
    switch (source) {
      case 'common': return fromTemplate(common, field, `common:${templateId}`);
      case 'template': return fromTemplate(getTemplate(named), field, `common:${named}`);
      case 'sunday-week-1':
        return sundayWeek1 && !isBlank(sundayWeek1[field]) ? { value: sundayWeek1[field], origin: SUNDAY_WEEK_1_TEMPLATE } : null;
      case 'complementary': {
        const complementary = getTemplate('complementary-psalmody');
        if (complementary && !isBlank(complementary[field])) return { value: complementary[field], origin: 'complementary' };
        return fromSource(CURRENT_DAY_CHOICE, field);
      }
      case CURRENT_DAY_CHOICE:
        return isBlank(currentDay?.[field]) ? null : { value: currentDay[field], origin: CURRENT_DAY_CHOICE };
      default: return null;
    }
  }
  const firstOf = (sources, field) => {
    for (const source of sources) {
      const found = fromSource(source, field);
      if (found) return found;
    }
    return null;
  };

  function resolveField(field) {
    if (!isBlank(proper?.[field])) return { value: proper[field], origin: 'proper' };
    const rule = rules[field];
    if (rule?.omit) return { value: '', origin: 'omit' };
    if (rule?.ref) { refs.push({ field, ref: rule.ref, origin: 'proper' }); return { pending: true }; }
    if (rule?.source) {
      const found = fromSource(rule.source, field, rule.template);
      if (found) return found;
    }
    const slot = slotOf(office, field);
    if (!slot) return firstOf(['common', CURRENT_DAY_CHOICE], field);
    const chain = slot.chain.filter((source) => source !== 'proper');
    const fromChain = firstOf(chain, field);
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
    if (!found) { day[field] = ''; missing.push(field); return; }
    day[field] = found.value;
    provenance[field] = found.origin;
  });

  // I Vespers: own or Common texts only. Without them the runtime assembles
  // I Vespers from the celebration's Vespers (`liturgicalVespers.js`).
  if (!proper?._omitFirstVespers) {
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
    const fallback = fromSource(CURRENT_DAY_CHOICE, field);
    day[field] = fallback?.value ?? '';
    if (fallback) provenance[field] = fallback.origin; else if (OFFICE_FIELD_SLOTS[field]) missing.push(field);
    void origin;
  });

  if (proper?._omitTeDeum) day[TE_DEUM_FIELD] = false;
  else if (proper?.[TE_DEUM_FIELD] !== undefined && proper[TE_DEUM_FIELD] !== '') day[TE_DEUM_FIELD] = Boolean(proper[TE_DEUM_FIELD]);
  else day[TE_DEUM_FIELD] = office?.teDeum ? true : '';

  // Identity of the celebration; `_currentVersion` keeps the template label
  // and the Marian/requiem theme heuristics of the existing UI working.
  ['_date', '_rank', '_place', '_feastName', '_feast', '_celebrationId', '_contentStatus'].forEach((key) => {
    if (proper?.[key] !== undefined) day[key] = proper[key];
  });
  day._templates = templatesOf(proper);
  if (templateId && selected !== CURRENT_DAY_CHOICE) day._currentVersion = templateId;
  day._assembly = { choice: selected, template: selected === CURRENT_DAY_CHOICE ? '' : templateId, sparse: true };
  return { day, choice: selected, template: templateId, provenance, missing };
}

/** Coarse availability of the Hours of a celebration. */
export function hoursContentStatus(proper, { hasTemplates = templatesOf(proper).length > 0 } = {}) {
  if (!proper) return hasTemplates ? 'common-only' : 'day-fallback';
  const own = OFFICE_TEXT_FIELDS.some((field) => !isBlank(proper[field]));
  if (own) return 'proper';
  return hasTemplates ? 'common-only' : 'day-fallback';
}
