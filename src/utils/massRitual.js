import ritual from '../data/mass/order-of-mass.ritual.json' with { type: 'json' };

// Holy Mass is one ritual with several language variants. Each variant is an
// ordinary prayer document (or a bundled fallback text); this module keeps the
// semantic section taxonomy that connects them independent from the UI.

export const MASS_RITUAL = ritual;
export const MASS_ORDER_PRAYER_ID = ritual.primaryPrayerId;
export const MASS_LANGUAGE_STORAGE_KEY = 'massRitualLanguage';

const sectionById = new Map(ritual.sections.map((section, order) => [section.id, { ...section, order }]));

export function normalizeMassMarker(value = '') {
  return String(value)
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[*_#:.,;!?«»"()[\]—–-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getMassVariant(language) {
  return ritual.variants.find((variant) => variant.language === language) || null;
}

export function getMassVariantByPrayerId(prayerId) {
  return ritual.variants.find((variant) => variant.prayerId === prayerId) || null;
}

export function isMassRitualPrayerId(prayerId) {
  return Boolean(getMassVariantByPrayerId(prayerId));
}

export function resolveMassLanguage(requested, stored) {
  if (getMassVariant(requested)) return requested;
  if (getMassVariant(stored)) return stored;
  return ritual.defaultLanguage;
}

export function getMassSection(sectionId) {
  return sectionById.get(sectionId) || null;
}

export function isMajorMassSection(sectionId) {
  const section = getMassSection(sectionId);
  return Boolean(section && !section.parent);
}

function markerIndex(variant) {
  const index = new Map();
  Object.entries(variant?.markers || {}).forEach(([sectionId, markers]) => {
    if (!sectionById.has(sectionId)) return;
    markers.forEach((marker) => {
      const key = normalizeMassMarker(marker);
      if (key && !index.has(key)) index.set(key, sectionId);
    });
  });
  return index;
}

/**
 * Finds semantic sections among rendered blocks.
 * @param {{ language: string }|object} variant
 * @param {string[]} blockTexts visible text of candidate block elements in document order
 * @returns {{ blockIndex: number, sectionId: string, title: string, parent: string|null }[]}
 */
export function locateMassSections(variant, blockTexts) {
  const index = markerIndex(variant);
  const seen = new Set();
  const located = [];
  blockTexts.forEach((text, blockIndex) => {
    const sectionId = index.get(normalizeMassMarker(text));
    if (!sectionId || seen.has(sectionId)) return;
    seen.add(sectionId);
    located.push({
      blockIndex,
      sectionId,
      title: String(text).replace(/\s+/g, ' ').trim(),
      parent: sectionById.get(sectionId).parent || null,
    });
  });
  return located;
}

/**
 * Chooses where to land after switching language: the same section, its
 * parent, the closest preceding section in ritual order, then the next one.
 */
export function resolveMassSectionTarget(sectionId, availableSectionIds) {
  const available = new Set(availableSectionIds);
  if (!sectionId || !available.size) return null;
  if (available.has(sectionId)) return sectionId;

  const section = sectionById.get(sectionId);
  if (!section) return null;
  if (section.parent && available.has(section.parent)) return section.parent;

  const ordered = ritual.sections.map((item) => item.id);
  for (let i = section.order - 1; i >= 0; i -= 1) {
    if (available.has(ordered[i])) return ordered[i];
  }
  for (let i = section.order + 1; i < ordered.length; i += 1) {
    if (available.has(ordered[i])) return ordered[i];
  }
  return null;
}

/**
 * Returns the section whose heading is the last one above the reading line.
 * Pure function so the scroll tracker cannot oscillate between neighbours.
 */
export function activeMassSectionAt(sectionTops, readingLine) {
  let active = null;
  for (const { sectionId, top } of sectionTops) {
    if (top <= readingLine) active = sectionId;
    else break;
  }
  return active ?? sectionTops[0]?.sectionId ?? null;
}
