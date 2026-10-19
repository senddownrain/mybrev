/**
 * Confirmed Office decisions for celebrations WITHOUT own Hours texts
 * (scaffolds of `patchs/generate-db-feasts.mjs`). Only decisions the owner
 * confirmed against the Belarusian breviary belong here; source-backed
 * `commonBase` metadata may also be recorded without changing the offered
 * templates. Every other
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
  'sv-albert-chmielowski': {
    commonBase: { religious: 'holy-men' },
    basis: 'Brother Albert: canonization homily, 12.11.1989, https://www.vatican.va/content/john-paul-ii/it/homilies/1989/documents/hf_jp-ii_hom_19891112_due-canonizzazioni.html',
  },
  'sv-gregory-narek': {
    commonBase: { religious: 'holy-men' },
    basis: 'Abbot Gregory of Narek: decree, 25.01.2021, https://press.vatican.va/roman_curia/congregations/ccdds/documents/rc_con_ccdds_doc_20210125_decreto-dottori_en.html',
  },
});

/** Decision for a scaffold, or null (automatic inference stays). */
export function scaffoldDecision(celebrationId) {
  return SCAFFOLD_DECISIONS[celebrationId] || null;
}
