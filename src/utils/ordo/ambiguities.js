/**
 * Detection of the open cases of `src/data/ordo/ambiguities.js` in a year.
 * Pure: reads the generated year only.
 */
import { ORDO_AMBIGUITIES } from '../../data/ordo/ambiguities.js';
import { generateLiturgicalYear, getYearPlan } from './index.js';

const occurrence = (date, detail, celebrationId) => ({ date, detail, ...(celebrationId ? { celebrationId } : {}) });

const DETECTORS = Object.freeze({
  'st-joseph-holy-week': ({ plan }) => plan.transfers
    .filter((item) => item.rule === 'joseph-anticipated-before-palm-sunday')
    .map((item) => occurrence(item.to, `перанесена з ${item.from} на ${item.to}`, item.celebrationId)),

  'coinciding-general-solemnities': ({ plan }) => plan.transfers
    .filter((item) => item.rule === 'impeded-by-celebration')
    .filter((item) => plan.celebrations.get(item.celebrationId)?.layer === 'universal')
    .map((item) => occurrence(item.to, `${plan.celebrations.get(item.celebrationId)?.title}: з ${item.from} на ${item.to}`, item.celebrationId)),

  'all-souls-on-sunday': ({ days }) => days
    .filter((day) => day.primary.id === 'all-faithful-departed' && Number(day.dayOfWeek) === 1)
    .map((day) => occurrence(day.date, 'нядзеля', 'all-faithful-departed')),

  'mary-mother-church-with-memorial': ({ days }) => days
    .filter((day) => [day.primary, ...day.alternatives].some((item) => item.id === 'mary-mother-church'))
    .filter((day) => day.appliedRules.some((rule) => rule.rule === 'concurrent-obligatory-memorials-choice'))
    .map((day) => occurrence(day.date, [day.primary, ...day.alternatives].map((item) => item.title).join(' / '), 'mary-mother-church')),

  'christ-high-priest-omitted': ({ days }) => days
    .filter((day) => day.suppressed.some((item) => item.id === 'christ-the-high-priest'))
    .map((day) => occurrence(day.date, `саступае: ${day.primary.title}`, 'christ-the-high-priest')),

  'immaculate-heart-with-memorial': ({ days }) => days
    .filter((day) => day.appliedRules.some((rule) => rule.rule === 'concurrent-obligatory-memorials-optional'))
    .map((day) => occurrence(day.date, day.alternatives.map((item) => item.title).join(' / '), 'immaculate-heart')),

  'diocesan-patron-impeded': ({ plan }) => plan.transfers
    .filter((item) => ['diocese', 'belarus'].includes(plan.celebrations.get(item.celebrationId)?.layer))
    .map((item) => occurrence(item.to, `${plan.celebrations.get(item.celebrationId)?.title}: з ${item.from} на ${item.to}`, item.celebrationId)),
});

/**
 * Open cases the year actually hits:
 * `[{ ...ambiguity, occurrences: [{ date, detail, celebrationId? }] }]`.
 */
export function findAmbiguities(year, context = {}) {
  const engineContext = { country: 'BY', ...context };
  const input = { days: generateLiturgicalYear(Number(year), engineContext), plan: getYearPlan(Number(year), engineContext) };
  return ORDO_AMBIGUITIES
    .map((item) => ({ ...item, occurrences: (DETECTORS[item.id] || (() => []))(input) }))
    .filter((item) => item.occurrences.length);
}

/** Years of a range in which a case occurs (for the documentation of a case). */
export function ambiguityYears(id, { from, to, context = {} }) {
  const years = [];
  for (let year = Number(from); year <= Number(to); year += 1) {
    if (findAmbiguities(year, context).some((item) => item.id === id)) years.push(year);
  }
  return years;
}
