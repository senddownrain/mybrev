// Compendium of the Catechism of the Catholic Church — an independent,
// read-only content domain (not a prayer). See docs/compendium.md.
export const COMPENDIUM_TITLE = 'Кампендый Катэхізіса';
export const COMPENDIUM_FULL_TITLE = 'Кампендый Катэхізіса Каталіцкага Касцёла';
export const COMPENDIUM_SOURCE_URL = 'https://catholic.by/3/lib/documents/kasciol/3963-kampendyj-katekhizisa-katalitskaga-kastsjola';
export const COMPENDIUM_SOURCE_HOST = 'Catholic.by';

// Firestore layout: one document per chapter-like unit + a version document.
export const COMPENDIUM_COLLECTION = 'compendium';
export const COMPENDIUM_META_COLLECTION = 'compendiumMeta';
export const COMPENDIUM_META_DOCUMENT = 'current';

// Bump when the cached (IndexedDB) shape of the remote result changes.
export const COMPENDIUM_CACHE_VERSION = 1;
