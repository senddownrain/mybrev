/**
 * Confirmed Office decisions for celebrations WITHOUT own Hours texts
 * (scaffolds of `patchs/generate-db-feasts.mjs`). Only decisions the owner
 * confirmed against the Belarusian breviary belong here; every other
 * scaffold keeps the automatic Common inference from its title
 * (`inferTemplates`, flagged `_templatesInferred`).
 *
 *   templates     the Commons the Office may use ([] = none)
 *   officeSource  'current-day': the Office is the temporal day (no Common,
 *                 no invented Proper)
 */
export const SCAFFOLD_DECISIONS = Object.freeze({
  // 03.01: the Belarusian breviary has no Proper for the Holy Name; the
  // Office is the Christmas weekday (task 7.4).
  'holy-name-of-jesus': {
    templates: [], officeSource: 'current-day',
    basis: 'No Proper in the Belarusian Liturgy of the Hours; Office of the Christmas weekday (owner decision, final phase §7.4)',
  },
  'sv-juan-diego': { templates: ['holy-men'], basis: 'Common of holy men (owner decision, §7.5)' },
  'sv-dismas': { templates: ['holy-men'], basis: 'Pinsk: Common of holy men, not of one martyr (owner decision, §7.6)' },
  'sv-jadwiga-queen': { templates: ['holy-women'], basis: 'Grodno: Common of holy women (owner decision, §7.7)' },
});

/** Decision for a scaffold, or null (automatic inference stays). */
export function scaffoldDecision(celebrationId) {
  return SCAFFOLD_DECISIONS[celebrationId] || null;
}
