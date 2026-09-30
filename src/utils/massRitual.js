import ritual from '../data/mass/order-of-mass.ritual.json' with { type: 'json' };

// Holy Mass is one ritual with several language variants. Each variant is an
// ordinary prayer document (or a bundled fallback text); this module keeps the
// semantic section taxonomy that connects them independent from the UI.

export const MASS_RITUAL = ritual;
export const MASS_ORDER_PRAYER_ID = ritual.primaryPrayerId;
export const MASS_LANGUAGE_STORAGE_KEY = 'massRitualLanguage';
export const MASS_SECTION_ANCHOR_PREFIX = 'mass-';

const sectionById = new Map(ritual.sections.map((section, order) => [section.id, { ...section, order }]));
const aliases = ritual.aliases || {};

// The five canonical major sections. Their titles are always Belarusian,
// whatever the language of the Mass text.
export const MASS_MAJOR_SECTIONS = Object.freeze(
  ritual.sections.filter((section) => !section.parent).map(({ id, title }) => Object.freeze({ id, title })),
);

export function normalizeMassMarker(value = '') {
  return String(value)
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[*_#:.,;!?«»"()[\]—–…-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compiles a ritual marker. A marker ending with "…" matches every text that
 * starts with it; any other marker must match the whole normalized text.
 * @param {string} marker
 * @returns {(normalizedText: string) => boolean}
 */
function compileMarker(marker) {
  const raw = String(marker).trim();
  const key = normalizeMassMarker(raw);
  if (!key) return () => false;
  if (raw.endsWith('…')) return (text) => text === key || text.startsWith(`${key} `);
  return (text) => text === key;
}

export function massMarkerMatches(marker, text) {
  return compileMarker(marker)(normalizeMassMarker(text));
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

/** Maps retired section ids (e.g. `liturgy-of-the-eucharist`) to current ones. */
export function resolveMassSectionId(sectionId) {
  if (!sectionId) return null;
  const id = aliases[sectionId] || sectionId;
  return sectionById.has(id) ? id : null;
}

export function getMassSection(sectionId) {
  return sectionById.get(resolveMassSectionId(sectionId)) || null;
}

export function isMajorMassSection(sectionId) {
  const section = getMassSection(sectionId);
  return Boolean(section && !section.parent);
}

/** Major section that contains the section (the section itself for majors). */
export function getMassMajorSectionId(sectionId) {
  const section = getMassSection(sectionId);
  if (!section) return null;
  return section.parent || section.id;
}

/**
 * Finds semantic sections among content blocks. Sections are searched in
 * ritual order, each after the previous one found, so a repeated line (for
 * example `V. Dominus vobiscum.`) anchors only the section that follows.
 * `markers` name blocks that become the visible section heading; `anchors`
 * name blocks that keep their type and only carry the section anchor.
 * @param {object} variant ritual variant
 * @param {string[]} blockTexts visible text of content blocks in document order
 * @returns {{ blockIndex: number, sectionId: string, title: string, parent: string|null, heading: boolean }[]}
 */
export function locateMassSections(variant, blockTexts) {
  const texts = blockTexts.map((text) => normalizeMassMarker(text));
  const located = [];
  let lastIndex = -1;

  ritual.sections.forEach((section) => {
    const candidates = [
      ...(variant?.markers?.[section.id] || []).map((marker) => ({ match: compileMarker(marker), heading: true })),
      ...(variant?.anchors?.[section.id] || []).map((marker) => ({ match: compileMarker(marker), heading: false })),
    ];
    if (!candidates.length) return;

    for (let blockIndex = lastIndex + 1; blockIndex < texts.length; blockIndex += 1) {
      const candidate = candidates.find(({ match }) => match(texts[blockIndex]));
      if (!candidate) continue;
      lastIndex = blockIndex;
      located.push({
        blockIndex,
        sectionId: section.id,
        title: String(blockTexts[blockIndex]).replace(/\s+/g, ' ').trim(),
        parent: section.parent || null,
        heading: candidate.heading,
      });
      return;
    }
  });
  return located;
}

/**
 * Chooses where to land after switching language: the same section, the
 * nearest preceding sibling, the parent, the closest preceding section in
 * ritual order, then the next one.
 */
export function resolveMassSectionTarget(sectionId, availableSectionIds) {
  const available = new Set(availableSectionIds);
  const id = resolveMassSectionId(sectionId);
  if (!id || !available.size) return null;
  if (available.has(id)) return id;

  const section = sectionById.get(id);
  const ordered = ritual.sections;
  if (section.parent) {
    for (let i = section.order - 1; i >= 0 && ordered[i].parent === section.parent; i -= 1) {
      if (available.has(ordered[i].id)) return ordered[i].id;
    }
    if (available.has(section.parent)) return section.parent;
  }
  for (let i = section.order - 1; i >= 0; i -= 1) {
    if (available.has(ordered[i].id)) return ordered[i].id;
  }
  for (let i = section.order + 1; i < ordered.length; i += 1) {
    if (available.has(ordered[i].id)) return ordered[i].id;
  }
  return null;
}

/** Section id carried by a `#mass-<id>` location hash, aliases resolved. */
export function massSectionFromHash(hash = '') {
  const match = String(hash).match(/^#mass-([a-z0-9-]+)$/);
  return match ? resolveMassSectionId(match[1]) : null;
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

/**
 * Model of the section control and its picker. The five major sections are
 * always listed, in ritual order, with their Belarusian titles; subsections
 * found in the current text are secondary rows under their major section.
 * @param {string[]} locatedSectionIds sections found in the current variant
 * @param {string|null} activeSectionId section at the reading line
 */
export function buildMassSectionPicker(locatedSectionIds, activeSectionId) {
  const located = new Set(locatedSectionIds);
  const activeId = resolveMassSectionId(activeSectionId);
  const activeMajorId = getMassMajorSectionId(activeId);
  const total = MASS_MAJOR_SECTIONS.length;
  const items = MASS_MAJOR_SECTIONS.map(({ id, title }, index) => ({
    id,
    title,
    number: index + 1,
    total,
    active: id === activeMajorId,
    available: located.has(id),
    children: ritual.sections
      .filter((section) => section.parent === id && located.has(section.id))
      .map((section) => ({ id: section.id, title: section.title, active: section.id === activeId })),
  }));
  return { current: items.find((item) => item.active) || null, items };
}
