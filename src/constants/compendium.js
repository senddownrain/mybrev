// Compendium of the Catechism of the Catholic Church — an independent,
// read-only content domain (not a prayer). See docs/compendium.md.
export const COMPENDIUM_TITLE = 'Кампендый Катэхізіса';
export const COMPENDIUM_FULL_TITLE = 'Кампендый Катэхізіса Каталіцкага Касцёла';
import { getSource } from './sources.js';

export const COMPENDIUM_SOURCE = getSource('compendium-kkbb-2010');
export const COMPENDIUM_SOURCE_URL = COMPENDIUM_SOURCE.digitalSources[0].url;
export const COMPENDIUM_SOURCE_HOST = COMPENDIUM_SOURCE.digitalSources[0].label;

// Firestore layout: one document per chapter-like unit + a version document.
export const COMPENDIUM_COLLECTION = 'compendium';
export const COMPENDIUM_META_COLLECTION = 'compendiumMeta';
export const COMPENDIUM_META_DOCUMENT = 'current';

// Bump when the cached (IndexedDB) shape of the remote result changes.
export const COMPENDIUM_CACHE_VERSION = 1;
