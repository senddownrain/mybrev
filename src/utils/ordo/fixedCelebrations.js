/**
 * Fixed-date celebrations as calendar data, derived from the existing
 * `src/constants/fixedCalendar.js` (the same source used to build `days`
 * fixed documents). No parallel fixed calendar is introduced: this module
 * only adds stable ids, a liturgical category and the `_date/_rank/_place`
 * identity used by `days` and `readings`.
 *
 * Entries without `place` form the universal (+ national) layer. Entries
 * with `place` form the diocesan layers as `add`/`modify` records.
 */
import { fixedCalendar, normalizeFixedPlace } from '../../constants/fixedCalendar.js';
import { FIXED_IDENTITIES } from '../../data/ordo/fixed-identities.js';
import { normalizeRank } from '../fixedFeasts.js';
import { contentFields, feastContentOf } from './feastContentIndex.js';

/** Generated identity (`patchs/db-feasts` slug + `days` ids) of a fixedCalendar entry. */
export function fixedIdentityOf(entry) {
  return FIXED_IDENTITIES[`${entry.date}|${normalizeFixedPlace(entry.place) || '-'}|${entry.title}`] || null;
}

/**
 * Well-known ids (aligned with `patchs/db-feasts` slugs) and rule metadata.
 * `precedence` pins the Table row when rank alone is not enough.
 */
const FIXED_METADATA = Object.freeze({
  '01.01|урачыстасць святой багародзіцы': { id: 'holy-mary-mother-of-god', category: 'mary' },
  '03.01|найсвяцейшага імя езуса': { id: 'holy-name-of-jesus', category: 'lord' },
  '06.01|аб’яўленне пана': { id: 'epiphany-lord', category: 'lord', precedence: 2 },
  '25.01|навяртанне': { id: 'conversion-saint-paul', category: 'saint', color: 'albus' },
  '02.02|ахвяраванне пана': { id: 'presentation-lord', category: 'lord', color: 'albus' },
  '22.02|катэдры': { id: 'chair-of-saint-peter', category: 'saint', color: 'albus' },
  '04.03|св. казіміра': { id: 'sv-casimir', category: 'saint' },
  '19.03|св. юзафа': { id: 'sv-joseph', category: 'saint', color: 'albus' },
  '25.03|звеставанне пана': { id: 'annunciation-lord', category: 'lord', color: 'albus' },
  '01.05|св. юзафа рамесніка': { id: 'sv-joseph-worker', category: 'saint', color: 'albus' },
  '16.05|св. андрэя баболі': { id: 'sv-andrei-bobola', category: 'saint' },
  '31.05|адведзіны': { id: 'visitation-blessed-virgin-mary', category: 'mary' },
  '24.06|нараджэнне св. яна': { id: 'nativity-john-baptist', category: 'saint', color: 'albus' },
  '29.06|св. пятра і паўла': { id: 'sv-peter-paul-apostles', category: 'saint' },
  '02.07|будслаўскай': { id: 'our-lady-budslav', category: 'mary' },
  '06.08|перамяненне пана': { id: 'transfiguration-lord', category: 'lord', color: 'albus' },
  '15.08|унебаўзяцце': { id: 'assumption-blessed-virgin-mary', category: 'mary' },
  '08.09|нараджэнне найсв': { id: 'nativity-blessed-virgin-mary', category: 'mary' },
  '14.09|узвышэнне': { id: 'exaltation-holy-cross', category: 'lord', color: 'ruber' },
  '29.09|архангёл': { id: 'archangels-michael-gabriel-raphael', category: 'saint', color: 'albus' },
  '01.11|усіх святых': { id: 'all-saints', category: 'saint', color: 'albus' },
  '02.11|усіх памерлых': {
    // All four calendars print violet; black is the alternative.
    id: 'all-faithful-departed', category: 'dead', precedence: 3, rank: 'commemoratio-defunctorum', color: 'violaceus',
    colorAlternatives: ['niger'],
  },
  // The dedication of the Lateran is kept on a Sunday of Ordinary Time like a feast of the Lord.
  '09.11|латэранскай': { id: 'dedication-lateran-basilica', category: 'lord', color: 'albus' },
  '12.11|св. язафата': { id: 'sv-josaphat', category: 'saint' },
  '16.11|маці міласэрнасці': { id: 'our-lady-mother-mercy', category: 'mary' },
  '20.11|каліноўскага': { id: 'sv-raphael-kalinowski', category: 'saint' },
  '27.01|матулевіча': { id: 'bl-jurgis-matulaitis', category: 'saint' },
  '29.01|лямэнт': { id: 'bl-boleslawa-lament', category: 'saint' },
  '08.12|беззаганнага зачацця': { id: 'immaculate-conception', category: 'mary' },
  // Added to the General Calendar after the `days` import (no db-feasts slug yet).
  '27.02|нарэцкага': { id: 'sv-gregory-narek', category: 'saint' },
  '10.05|авільскага': { id: 'sv-john-avila', category: 'saint' },
  '05.09|калькуты': { id: 'sv-teresa-calcutta', category: 'saint' },
  '17.09|хільдэгарды': { id: 'sv-hildegard-bingen', category: 'saint' },
  '05.10|фаўстыны': { id: 'sv-faustina-kowalska', category: 'saint' },
  '11.10|яна xxiii': { id: 'sv-john-xxiii', category: 'saint' },
  '09.12|куаўхтлатаацына': { id: 'sv-juan-diego', category: 'saint' },
  '10.12|ларэтанскай': { id: 'our-lady-loreto', category: 'mary' },
  '12.12|гвадэлупы': { id: 'our-lady-guadalupe', category: 'mary' },
  '25.12|нараджэнне пана': { id: 'nativity-lord', category: 'lord', precedence: 2 },
  '26.12|стэфана': { id: 'sv-stephen-protomartyr', category: 'saint', color: 'ruber' },
  '27.12|св. яна, апостала': { id: 'sv-john-apostle-evangelist', category: 'saint', color: 'albus' },
  '28.12|немаўлят': { id: 'holy-innocents', category: 'saint', color: 'ruber' },
});

/**
 * Diocesan entries that are the local form of a general celebration on the
 * same day although the title differs (Vitebsk 2025/26: "8 верасня – свята
 * Найсв. Панны Марыі Браслаўскай" replaces the Nativity of the BVM).
 */
const DIOCESAN_REPLACES = Object.freeze({
  '08.09|браслаўскай': 'nativity-blessed-virgin-mary',
});

const TRANSLIT = Object.freeze({
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', і: 'i', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ў: 'w',
  ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ы: 'y', ь: '', ъ: '', э: 'e', ю: 'yu', я: 'ya',
});

export function normalizeCelebrationTitle(title) {
  return String(title || '')
    .toLocaleLowerCase('be-BY')
    .replace(/[’'`]/g, '’')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugifyTitle(title, maxWords = 5) {
  const words = normalizeCelebrationTitle(title)
    .split(',')[0]
    .replace(/[’]/g, '')
    .split('')
    .map((char) => TRANSLIT[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  return words.slice(0, maxWords).join('-');
}

/**
 * Id of a fixedCalendar entry that has no generated identity (no `days`
 * document yet): the metadata id or a transliterated title slug. Shared with
 * the stage 2 parser so evidence and engine agree.
 */
export function fallbackFixedCelebrationId(entry) {
  return findMetadata(entry.date, entry.title)?.id || slugifyTitle(entry.title);
}

function findMetadata(date, title) {
  const normalized = normalizeCelebrationTitle(title);
  const entry = Object.entries(FIXED_METADATA)
    .find(([key]) => {
      const [metaDate, fragment] = key.split('|');
      return metaDate === date && normalized.includes(fragment);
    });
  return entry ? entry[1] : null;
}

const MARTYR_RE = /мучан/u;
const MARIAN_RE = /(?:панны марыі|багародзіцы)/u;

function inferCategory(title) {
  const text = normalizeCelebrationTitle(title);
  if (MARIAN_RE.test(text)) return 'mary';
  if (/пасвячэння/u.test(text)) return 'dedication';
  return 'saint';
}

export function inferColor(title, category) {
  const text = normalizeCelebrationTitle(title);
  if (category === 'dead') return 'niger';
  if (MARTYR_RE.test(text) || /апостал|евангеліст/u.test(text)) return 'ruber';
  return 'albus';
}

/** Kind of proper celebration, used by rows 4, 8 and 11 of the Table. */
export function inferProperKind(title) {
  const text = normalizeCelebrationTitle(title);
  if (/пасвячэння катэдральнага/u.test(text)) return 'cathedral-dedication';
  if (/галоўн\p{L}*\s+апе\p{L}*|апякункі архідыяцэзіі|апекуна дыяцэзіі/u.test(text)
    && !/дадатков/u.test(text)) return 'principal-patron-diocese';
  if (/дадатков\p{L}*\s+апе/u.test(text)) return 'secondary-patron';
  return 'other';
}

export function fixedParts(date) {
  const [day, month] = date.split('.').map(Number);
  return { month, day };
}

function buildCelebration(entry, { id, layer, dioceseId, meta }) {
  const rank = meta?.rank || normalizeRank(entry.rank);
  const place = normalizeFixedPlace(entry.place);
  const content = feastContentOf({ id, date: entry.date, place, rank });
  // A celebration without texts is carried by its scaffold document.
  const dayIds = fixedIdentityOf(entry)?.dayIds || (content?.scaffold ? [content.dayId] : []);
  const category = meta?.category || inferCategory(entry.title);
  return {
    id,
    title: entry.title,
    rank,
    category,
    layer,
    ...(dioceseId ? { dioceseId } : {}),
    ...(layer !== 'universal' ? { properKind: inferProperKind(entry.title) } : {}),
    ...(meta?.precedence ? { precedence: meta.precedence } : {}),
    color: meta?.color || inferColor(entry.title, category),
    ...(meta?.colorAlternatives ? { colorAlternatives: meta.colorAlternatives } : {}),
    date: { type: 'fixed', ...fixedParts(entry.date) },
    // Existing identities. `days` fixed documents are selected by
    // `_date` + `_rank` (+ `_place`); readings by `_date` (+ title/rank).
    daysRef: {
      source: 'fixed',
      _date: entry.date,
      _rank: normalizeRank(entry.rank),
      ...(place ? { _place: place } : {}),
      ...(dayIds.length ? { dayIds } : {}),
    },
    readingsRef: { _date: entry.date },
    ...contentFields(content),
  };
}

function uniqueId(base, used) {
  let id = base;
  let index = 2;
  while (used.has(id)) id = `${base}-${index++}`;
  used.add(id);
  return id;
}

function buildCatalog() {
  const used = new Set();
  const universal = [];
  fixedCalendar.filter((entry) => !entry.place).forEach((entry) => {
    const meta = findMetadata(entry.date, entry.title);
    const id = uniqueId(meta?.id || fixedIdentityOf(entry)?.id || slugifyTitle(entry.title), used);
    const layer = meta?.layer || 'universal';
    universal.push(buildCelebration(entry, { id, layer, meta }));
  });

  const byNormalizedTitle = new Map();
  universal.forEach((celebration) => {
    byNormalizedTitle.set(normalizeCelebrationTitle(celebration.title).split(',')[0], celebration);
  });

  const dioceses = {};
  fixedCalendar.filter((entry) => entry.place).forEach((entry) => {
    const dioceseId = normalizeFixedPlace(entry.place);
    const layer = dioceses[dioceseId] || (dioceses[dioceseId] = {
      id: dioceseId, level: 'diocese', add: [], modify: [], rules: [], notes: [],
    });
    const title = normalizeCelebrationTitle(entry.title);
    const sameDate = universal.filter((item) => item.daysRef._date === entry.date);
    const replaced = Object.entries(DIOCESAN_REPLACES).find(([key]) => {
      const [date, fragment] = key.split('|');
      return date === entry.date && title.includes(fragment);
    });
    const identity = fixedIdentityOf(entry);
    const base = (replaced && universal.find((item) => item.id === replaced[1]))
      || (identity && universal.find((item) => item.id === identity.id))
      || sameDate.find((item) => {
      const universalTitle = normalizeCelebrationTitle(item.title).split(',')[0];
      return title === normalizeCelebrationTitle(item.title) || title.startsWith(universalTitle);
    }) || byNormalizedTitle.get(title.split(',')[0]) || null;
    const meta = findMetadata(entry.date, entry.title);
    const properKind = inferProperKind(entry.title);
    if (base) {
      const changes = {
        rank: normalizeRank(entry.rank),
        title: entry.title,
        properKind,
        daysRef: {
          source: 'fixed',
          _date: entry.date,
          _rank: normalizeRank(entry.rank),
          _place: dioceseId,
          ...(identity?.dayIds?.length ? { dayIds: identity.dayIds } : {}),
        },
        ...(feastContentOf({ id: base.id, date: entry.date, place: dioceseId, rank: normalizeRank(entry.rank) })
          ? contentFields(feastContentOf({ id: base.id, date: entry.date, place: dioceseId, rank: normalizeRank(entry.rank) })) : {}),
        fallbackDaysRefs: [base.daysRef],
      };
      if (base.daysRef._date !== entry.date) {
        changes.date = { type: 'fixed', ...fixedParts(entry.date) };
        changes.readingsRef = { _date: entry.date };
      }
      layer.modify.push({ id: base.id, changes, source: { file: 'src/constants/fixedCalendar.js', rawText: entry.title } });
    } else {
      // The same proper celebration keeps one id in every diocese that adds it.
      const layerIds = new Set(layer.add.map((item) => item.id));
      const id = uniqueId(identity?.id
        || (properKind === 'cathedral-dedication'
          ? `cathedral-dedication-${dioceseId}`
          : `${meta?.id || slugifyTitle(entry.title)}-${dioceseId}`), layerIds);
      layer.add.push({
        ...buildCelebration(entry, { id, layer: 'diocese', dioceseId, meta }),
        category: properKind === 'cathedral-dedication' ? 'dedication' : (meta?.category || inferCategory(entry.title)),
        source: { file: 'src/constants/fixedCalendar.js', rawText: entry.title },
      });
    }
  });

  return { universal, dioceses };
}

let catalog = null;

export function getFixedCatalog() {
  if (!catalog) catalog = buildCatalog();
  return catalog;
}

/** Universal + national fixed celebrations (layer `universal` or `belarus`). */
export function getUniversalFixedCelebrations() {
  return getFixedCatalog().universal;
}

/** Diocesan layers derived from `_place` entries: `{ add, modify, rules, notes }`. */
export function getDiocesanFixedLayers() {
  return getFixedCatalog().dioceses;
}
