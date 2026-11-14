/**
 * Prayer-category icon contract shared by Web and Flutter.
 *
 * `iconKey` is the only thing stored (Firestore, localStorage, Hive). It is a
 * stable semantic key; every platform maps it to its own glyph. The list of 48
 * keys, their labels and groups MUST stay identical in the Flutter app
 * (`lib/constants/prayer_category_icons.dart`); `npm run sync:category-icons`
 * exports `catalog.json` + the 12 authored SVGs for it and a test compares them.
 */
export const CATEGORY_ICON_GROUPS = [
  { id: 'prayer', label: 'Малітва і духоўнае жыццё' },
  { id: 'church', label: 'Хрыстус, Касцёл і сакрамэнты' },
  { id: 'daily', label: 'Штодзённае жыццё і набажэнствы' },
  { id: 'symbols', label: 'Хрысціянскія сімвалы' },
];

const phosphor = (group, key, label, name) => ({ key, label, group, source: 'phosphor', phosphor: name });
const authored = (key, label) => ({ key, label, group: 'symbols', source: 'svg', svg: `${key}.svg` });

export const CATEGORY_ICONS = [
  phosphor('prayer', 'prayer', 'Малітва', 'HandsPraying'),
  phosphor('prayer', 'adoration', 'Адарацыя', 'Sparkle'),
  phosphor('prayer', 'praise', 'Праслаўленне', 'MusicNotes'),
  phosphor('prayer', 'thanksgiving', 'Падзяка', 'HandHeart'),
  phosphor('prayer', 'petitions', 'Просьбы', 'ChatCircleText'),
  phosphor('prayer', 'trust', 'Давер', 'Heart'),
  phosphor('prayer', 'meditation', 'Разважанні', 'BookOpen'),
  phosphor('prayer', 'novena', 'Навэнны', 'CalendarDots'),
  phosphor('prayer', 'litany', 'Літаніі', 'ListDashes'),
  phosphor('prayer', 'spiritual-reading', 'Духоўнае чытанне', 'BookBookmark'),
  phosphor('prayer', 'repentance', 'Пакаянне', 'Drop'),
  phosphor('prayer', 'hope', 'Надзея', 'Anchor'),
  phosphor('church', 'cross', 'Крыж', 'Cross'),
  phosphor('church', 'church', 'Касцёл', 'Church'),
  phosphor('church', 'gospel', 'Евангелле', 'BookOpenText'),
  phosphor('church', 'kingdom', 'Валадарства', 'Crown'),
  phosphor('church', 'bread-of-life', 'Хлеб жыцця', 'Grains'),
  phosphor('church', 'baptism', 'Хрост', 'DropHalf'),
  phosphor('church', 'scripture', 'Святое Пісанне', 'Scroll'),
  phosphor('church', 'holy-spirit', 'Святы Дух', 'Flame'),
  phosphor('church', 'faith', 'Вера', 'Shield'),
  phosphor('church', 'apostles', 'Апосталы', 'UsersThree'),
  phosphor('church', 'vocation', 'Пакліканне', 'Footprints'),
  phosphor('church', 'bell', 'Звон', 'Bell'),
  phosphor('daily', 'morning', 'Раніца', 'SunHorizon'),
  phosphor('daily', 'evening', 'Вечар', 'MoonStars'),
  phosphor('daily', 'family', 'Сям’я', 'House'),
  phosphor('daily', 'children', 'Дзеці', 'Baby'),
  phosphor('daily', 'saints', 'Святыя', 'Star'),
  phosphor('daily', 'mary-flowers', 'Кветкі Марыі', 'Flower'),
  phosphor('daily', 'gift', 'Дар Божы', 'Gift'),
  phosphor('daily', 'peace', 'Мір', 'Bird'),
  phosphor('daily', 'pilgrimage', 'Паломніцтва', 'Path'),
  phosphor('daily', 'creation', 'Стварэнне', 'Plant'),
  phosphor('daily', 'silence', 'Цішыня', 'Mountains'),
  phosphor('daily', 'daily', 'На кожны дзень', 'Sun'),
  authored('praying-hands', 'Складзеныя рукі'),
  authored('rosary', 'Ружанец'),
  authored('monstrance', 'Найсвяцейшы Сакрамэнт'),
  authored('chalice-host', 'Келіх і Гостыя'),
  authored('sacred-heart', 'Найсвяцейшае Сэрца Езуса'),
  authored('immaculate-heart', 'Беззаганнае Сэрца Марыі'),
  authored('virgin-mary', 'Маці Божая'),
  authored('holy-spirit-dove', 'Дух Святы'),
  authored('angel', 'Анёл'),
  authored('saint-halo', 'Святы'),
  authored('crucifix', 'Укрыжаванне'),
  authored('candle', 'Свечка'),
];

export const CATEGORY_ICON_KEYS = CATEGORY_ICONS.map((icon) => icon.key);
const KEY_SET = new Set(CATEGORY_ICON_KEYS);

/** Shown while a form has no choice yet. */
export const DEFAULT_CATEGORY_ICON_KEY = 'prayer';

/** The three built-in categories (see `constants/categories.js`). */
export const SEED_CATEGORY_ICON_KEYS = Object.freeze({
  mary: 'virgin-mary',
  litanies: 'litany',
  novenas: 'novena',
});

export function isValidCategoryIconKey(value) {
  return typeof value === 'string' && KEY_SET.has(value);
}

/** Allowlist normaliser for values that are about to be stored: valid key or null. */
export function normalizeCategoryIconKey(value) {
  return isValidCategoryIconKey(value) ? value : null;
}

export function categoryIconMeta(key) {
  return CATEGORY_ICONS.find((icon) => icon.key === key) || null;
}

const NEUTRAL_ICON_KEYS = ['prayer', 'spiritual-reading', 'meditation', 'daily', 'cross', 'faith', 'hope', 'trust'];

const L = '(?<![а-яёіў])';
const R = '(?![а-яёіў])';
const RULES = [
  [/непарочн|беззаган|непорочн/, 'immaculate-heart'],
  [/сэрц\S* (езус|ісус)|сердц\S* иисус|найсвяцейшае сэрца/, 'sacred-heart'],
  [/ружан|розари/, 'rosary'],
  [/адарацы|адорац|манстранц|найсвяцейшы сакрамэнт/, 'monstrance'],
  [/эўхарыст|евхарист|прычасц|причаст/, 'chalice-host'],
  [/крыжов\S* шлях|крестн\S* путь|страсц|страст|укрыжав|распят/, 'crucifix'],
  [/дух святы|святы дух|святого духа|святой дух/, 'holy-spirit-dove'],
  [/памерл|умерш|чыстц|вернічаў/, 'candle'],
  [new RegExp(`${L}свяціц|${L}святы(я|х|м)${R}|${L}святых|${L}святой${R}|${L}святы${R}`), 'saint-halo'],
  [/марыйн|багародзіц|богородиц|маці божая/, 'virgin-mary'],
  [new RegExp(`${L}марыя${R}|${L}марыі${R}|${L}марыю${R}`), 'virgin-mary'],
  [/анёл|ангел/, 'angel'],
  [/літані|литани/, 'litany'],
  [/навэн|новен/, 'novena'],
  [/раніц|утренн|утро/, 'morning'],
  [/вечар|вечерн|вечер/, 'evening'],
  [/сям['’]я|семь[яи]|сем[ьъ]/, 'family'],
  [/дзеці|дзяцей|дети|детск/, 'children'],
  [new RegExp(`${L}мір${R}|${L}мир${R}`), 'peace'],
  [/паломн|пилигрим/, 'pilgrimage'],
  [/просьб|прашэнн|просьб/, 'petitions'],
  [/пакаян|покаян/, 'repentance'],
  [/падзяк|благодар/, 'thanksgiving'],
  [/хвал|праслаў/, 'praise'],
  [/надзе|надеж/, 'hope'],
  [/давер/, 'trust'],
  [/разважан|медитац/, 'meditation'],
  [/кветк|цвет/, 'mary-flowers'],
  [/евангел|эвангел/, 'gospel'],
  [/пісанн|писани/, 'scripture'],
  [/духоўн\S* чытан|духовн\S* чтен/, 'spiritual-reading'],
  [/кансэкрав|призван/, 'vocation'],
  [/хрост|крещен/, 'baptism'],
  [/касцёл|царкв|костел|церков/, 'church'],
  [/цішын|тишин/, 'silence'],
  [/стварэнн|творен/, 'creation'],
  [/звон/, 'bell'],
  [new RegExp(`${L}крыж|${L}крест`), 'cross'],
];

export function normalizeIconText(value) {
  return String(value ?? '').toLowerCase().replace(/́/g, '').replace(/’/g, "'");
}

/** FNV-1a over UTF-16 code units; identical in Dart (`codeUnitAt`). */
export function stableHash(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * A meaningful icon for a category that has none yet. Deterministic: keyword
 * rules over name + tags, then a stable hash of id/name over neutral icons.
 * Used once (migration / creation default); never to override a stored choice.
 */
export function suggestCategoryIconKey({ id = '', name = '', tags = [] } = {}) {
  const nameText = normalizeIconText(name);
  const tagText = normalizeIconText((Array.isArray(tags) ? tags : []).join(' '));
  for (const text of [nameText, `${nameText} ${tagText}`]) {
    const rule = RULES.find(([pattern]) => pattern.test(text));
    if (rule) return rule[1];
  }
  return NEUTRAL_ICON_KEYS[stableHash(normalizeIconText(id) || nameText) % NEUTRAL_ICON_KEYS.length];
}

/** Stored valid key wins; otherwise a suggestion. Unknown keys are not "valid". */
export function resolveCategoryIconKey(category) {
  return normalizeCategoryIconKey(category?.iconKey) || suggestCategoryIconKey(category || {});
}

/**
 * One-time migration of personal categories. Only entries with a missing or
 * empty `iconKey` get one; a valid key is kept; an unrecognised non-empty key
 * (written by a newer app) is left alone and rendered with the fallback glyph.
 */
export function migratePersonalCategoryIcons(list) {
  if (!Array.isArray(list)) return { list: [], changed: false };
  let changed = false;
  const next = list.map((category) => {
    if (!category || typeof category !== 'object') return category;
    const stored = category.iconKey;
    if (typeof stored === 'string' && stored.trim() !== '') return category;
    changed = true;
    return { ...category, iconKey: suggestCategoryIconKey({ name: category.name, tags: category.tags }) };
  });
  return { list: next, changed };
}

/** What to draw for a category: its stored key (unknown ones fall back inside the renderer), else a suggestion. */
export function displayCategoryIconKey(category) {
  const stored = category?.iconKey;
  return typeof stored === 'string' && stored.trim() !== '' ? stored : suggestCategoryIconKey(category || {});
}
