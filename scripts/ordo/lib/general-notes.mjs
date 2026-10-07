/**
 * General notes («агульныя заўвагі / ўказанні») of the Grodno and Pinsk
 * calendars (final phase §13).
 *
 * The adapters keep the front matter of these calendars as `rules` with
 * `scopeHint: 'front'` (Grodno pp. 15–36, Pinsk pp. 3–14) — period
 * introductions, rubrics of Holy Week and the Triduum, devotions of the year,
 * quarterly prayer days … Earlier builds dropped them because a front rule
 * has no selector. This module rebuilds the paragraphs (the Grodno PDF is
 * split into lines), follows the headings and gives every meaningful
 * paragraph an explicit selector. Content that is not a day note is skipped
 * with a reason:
 *   - tables (precedence, movable dates of the year, Masses for various needs);
 *   - the pastor's Mass «pro populo» obligation and other canon-law lists;
 *   - indexes with page numbers, patrons lists;
 *   - anything the exclusion rules flag (collections, clergy personal data).
 *
 * Nothing here is invented: every published text is the printed paragraph.
 */
import { clean, fold } from './text.mjs';
import { exclusionCategory } from './exclusions.mjs';

const relative = (celebrationId, offsetDays, throughOffsetDays) => ({
  type: 'relative', celebrationId, offsetDays, ...(throughOffsetDays !== undefined ? { throughOffsetDays } : {}),
});
const period = (name, dayOfWeek) => ({ type: 'period', period: name, ...(dayOfWeek ? { dayOfWeek } : {}) });
const phase = (name, value) => ({ type: 'period-phase', period: name, phase: value });
const celebration = (celebrationId) => ({ type: 'celebration', celebrationId });
const firstWeekday = (isoWeekday) => ({ type: 'nth-weekday-of-month', isoWeekday, nth: 1 });
const months = (list) => ({ type: 'months', months: list });

/** Patterns are written in plain Belarusian and compared with `fold`ed text. */
const folded = (pattern) => new RegExp(pattern.source.replace(/[ёэ]/g, 'е').replace(/ў/g, 'у'), pattern.flags);
const foldAll = (list) => list.map((item) => ({ ...item, match: folded(item.match), ...(item.absorb ? { absorb: item.absorb.map(folded) } : {}) }));

/** A heading line: sets the selector of the paragraphs below it (or skips them). */
const GRODNO_HEADINGS = foldAll([
  { match: /^галоуны апякун|^касцельнай правінцыі|^табліца|^і літургічных дзен у/, skip: 'patrons-or-table' },
  { match: /^перанос урачыстасцяу падчас прывілеяваных/, skip: 'precedence-rule-computed-by-engine' },
  { match: /^заувагі да календара/, selector: period('ordinary') },
  { match: /^перыяд вялікага посту/, selector: period('lent') },
  { match: /^абрадавыя прадпісанні на папялец/, selector: celebration('ash-wednesday'), category: 'liturgical-rule' },
  { match: /^абрадавыя прадпісанні на пальмовую нядзелю/, selector: celebration('palm-sunday') },
  { match: /^абрадавыя прадпісанні на вялікі чацвер/, selector: phase('holyweek', 'holy-thursday') },
  { match: /^святы пасхальны трыдуум/, selector: phase('holyweek', 'triduum') },
  { match: /^абрадавыя прадпісанні на св\. імшу вячеры пана/, selector: phase('holyweek', 'holy-thursday') },
  { match: /^абрадавыя прадпісанні на вялікую суботу/, selector: relative('easter-sunday', -1) },
  { match: /^велікодны перыяд/, selector: period('easter') },
  { match: /^абрадавыя прадпісанні$/, selector: celebration('corpus-christi'), absorb: [/^на урачыстасць$/, /^найсвяцейшага цела і крыві хрыста$/] },
  { match: /^перыяд адвенту/, selector: period('advent') },
  { match: /^перыяд нарадження пана/, selector: period('christmas') },
  { match: /^абрадавыя прадпісанні на перыяд нарадження пана/, selector: period('christmas') },
]);

/** Section (as printed in the evidence) → default selector or skip. */
const GRODNO_SECTIONS = {
  'page 5': { skip: 'precedence-table-computed-by-engine' },
  'Супадзенне і першынство цэлебрацый': { skip: 'precedence-rule-computed-by-engine' },
  'Св. Імша за парафіянаў': { skip: 'pastor-mass-pro-populo-obligation' },
  'Набажэнствы на працягу года': { selector: null },
  'ТАБЛІЦА ІМШАЎ АБРАДАВЫХ І Ў РОЗНЫХ ПАТРЭБАХ': { skip: 'table' },
  'ТАБЛІЦА АБРАДАВЫХ ІМШАЎ ЗА СУЖЭНЦАЎ': { skip: 'table' },
  'ТАБЛІЦА ІМШАЎ ЗА ПАМЕРЛЫХ': { skip: 'table' },
  'Звычайны перыяд': { selector: period('ordinary') },
  'Падчас Вялікага Посту': { selector: period('lent') },
  'ВЯЛІКІ ТЫДЗЕНЬ': { selector: period('holyweek') },
  'Абрадавыя прадпісанні на Вялікую Пятніцу': { selector: relative('easter-sunday', -2) },
  'Абрадавыя прадпісанні на Вігілію і Пасхальную Нядзелю': { selector: relative('easter-sunday', -1, 0) },
};

/** Paragraph-level selectors (numbered items of a list, a section without one). */
const GRODNO_ITEMS = foldAll([
  { match: /^1\. калі не прадпісана нейкая асаблівая цэлебрацыя/, selector: period('ordinary') },
  { match: /^2\. успаміны, якія прыпадаюць на дні з 17 па 31 снежня/, selector: { type: 'any', selectors: [phase('advent', 'dec17-24'), phase('christmas', 'octave'), phase('lent', 'lent-weeks')] } },
  { match: /^3\. ва успамінах святых без уласнай прэфацыі/, selector: period('ordinary') },
  { match: /^4\. суботнюю імшу аб найсв\. панне марыі/, selector: period('ordinary', 7) },
  { match: /^1\. і чацвер месяца/, selector: firstWeekday(4) },
  { match: /^2\. і пятніца месяца/, selector: firstWeekday(5) },
  { match: /^3\. і субота месяца/, selector: firstWeekday(6) },
  { match: /^у кожную суботу, калі няма свята або урачыстасці/, selector: period('ordinary', 7) },
  { match: /^4\. набаженства ружанцовыя, маевыя і черв/, selector: months([5, 6, 10]) },
  { match: /^5\. першая святая камунія дзяцей/, selector: celebration('corpus-christi') },
  { match: /^3 заутрашняга дня пачынаем тыдзень малітвы за цвярозасць/, selector: celebration('ash-wednesday') },
  { match: /^імша у вігілію нарадження пана цэлебруецца вечарам 24 снежня/, selector: { type: 'fixed-date', month: 12, day: 24 } },
]);

const PINSK_SECTIONS = {
  'СВЯТЫЯ АПЕКУНЫ АПЕКУНЫ ЕЎРОПЫ': { skip: 'patrons-list' },
  'РУХОМЫЯ ЦЭЛЕБРАЦЫІ Ў 2026 ГОДЗЕ': { skip: 'table-of-the-year' },
  'ТАБЛІЦА ПЕРШЫНСТВА ЛІТУРГІЧНЫХ ДЗЁН': { skip: 'precedence-table-computed-by-engine' },
  'ВЫБАР ІМШАЛЬНАГА ФАРМУЛЯРА': { skip: 'table' },
  'В 1–2–3': { skip: 'table' },
};

const PINSK_ITEMS = foldAll([
  { match: /^1\. у трецім тыдні адвенту — квартальныя дні малітвау/, selector: { type: 'period-day', period: 'advent', week: 3 } },
  { match: /^2\. ад папяльцовай cерады да першай нядзелі вялікага посту/, selector: relative('ash-wednesday', 0, 4) },
  { match: /^3\. у чацвертым тыдні велікоднага перыяду/, selector: { type: 'period-day', period: 'easter', week: 4 } },
  { match: /^4\. у панядзелак, аутора[кк] і сераду шостага тыдня велікоднага/, selector: relative('ascension', -3, -1) },
  // «Трэці тыдзень верасня» is not a liturgical week of the engine: the
  // whole of September with the printed text, for review.
  { match: /^5\. у трэці тыдзень верасня/, selector: months([9]), classification: 'NEEDS_REVIEW' },
  { match: /^1\. у першы чацвер месяца можна цэлебраваць/, selector: firstWeekday(4) },
  { match: /^2\. у першую пятніцу месяца/, selector: firstWeekday(5) },
  { match: /^3\. у першую суботу месяца/, selector: firstWeekday(6) },
  { match: /^4\. mаевыя, червеньскія і кастрычніцкія набаженствы|^4\. маевыя, червеньскія і кастрычніцкія набаженствы/, selector: months([5, 6, 10]) },
  { match: /^5\. у перыяд адвенту, апрача нядзель і урачыстасцей/, selector: period('advent') },
  { match: /^у будні гэтага перыяду святар можа выбраць св\. імшу з буднага дня/, selector: phase('christmas', 'after-octave') },
  { match: /^у гэтыя дні імшы у розных патребах і ватыуныя/, selector: phase('christmas', 'after-octave') },
  { match: /^у лг на будныя дні антыфона закліку/, selector: phase('christmas', 'after-octave') },
  { match: /^ва ўспаміны святых, калі няма ўласных чытанняў/, selector: phase('christmas', 'after-octave') },
]);

/** Pinsk paragraphs that are general canon law or year lists, not day notes. */
const PINSK_SKIPS = [
  [/^у нядзелі, а таксама іншыя прадпісаныя святочныя дні вернікі павінны/, 'general-canon-law-every-sunday'],
  [/^устрыманне ад мяса ці іншай ежы/, 'general-canon-law-every-friday'],
  [/канонам 534 ккп|^а\) ва усе нядзелі года|^б\) у святы, прадпісаныя у дыяцезіі|^2\. калі у тую ці іншы дзень пробашч|^2\. калі у той ці іншы дзень пробашч|^3\. больш таго, пробашч/, 'pastor-mass-pro-populo-obligation'],
  [/^4\. згодна з канонам 1246 ккп|^урачыстасць .* — \d+ (студзеня|сакавіка|мая|червеня|жніуня|лістапада|снежня)/, 'holy-days-of-obligation-list'],
  [/^кнігі новага запавету|\.{6,}|^у па рафіяльна/, 'index-or-fragment'],
].map(([pattern, reason]) => [folded(pattern), reason]);

const END = /[.!?»”);:]$/;
// A numbered item starts a paragraph; its lettered / dashed sub-items stay in it.
const ITEM_START = /^\d{1,2}\.\s/u;
const SUB_ITEM = /^([а-еa-e]\)\s|[-–—•]\s?)/u;

function numeric(id) {
  return Number(String(id).split(':').pop()) || 0;
}

/** Merge printed lines into paragraphs within a section (Grodno PDF lines). */
export function paragraphsOf(rules) {
  const paragraphs = [];
  let current = null;
  rules.forEach((rule) => {
    const text = clean(rule.text);
    if (!text) return;
    const startsItem = ITEM_START.test(text) || isHeadingText(text) || startsKnownItem(text);
    // Inside a numbered item every line belongs to it until the next item.
    const continues = current && current.section === rule.section && !startsItem && !isHeadingText(current.text)
      && (!END.test(current.text) || ITEM_START.test(current.text) || SUB_ITEM.test(text));
    if (continues) {
      current.text = `${current.text} ${text}`.replace(/\s+/g, ' ');
      current.ids.push(rule.id);
      current.categories.push(rule.category);
      return;
    }
    current = { section: rule.section, text, ids: [rule.id], categories: [rule.category], evidence: rule.evidence, tags: rule.tags || [] };
    paragraphs.push(current);
  });
  return paragraphs;
}

function startsKnownItem(text) {
  const value = fold(text);
  return [...GRODNO_ITEMS, ...PINSK_ITEMS].some((item) => item.match.test(value));
}

function isHeadingText(text) {
  const value = fold(text);
  return GRODNO_HEADINGS.some((item) => item.match.test(value));
}

const CATEGORY_ORDER = ['liturgical-rule', 'mass', 'office', 'indulgence', 'procession', 'blessing', 'devotion', 'special-prayer-day', 'pastoral-note'];

/** Most specific category among the merged lines (`other` is the weakest). */
function categoryOf(paragraph) {
  const found = CATEGORY_ORDER.find((category) => paragraph.categories.includes(category));
  if (found === 'blessing' && !/благаслаул|асвячен/u.test(fold(paragraph.text))) return 'liturgical-rule';
  return found || 'liturgical-rule';
}

function skipOf(text) {
  if (text.length < 25) return 'fragment';
  const excluded = exclusionCategory(text);
  if (excluded) return `excluded:${excluded}`;
  // Money (stipends, offerings) is never an Ordo note.
  if (/стыпенд|ахвяраванн|зборы?\b/u.test(fold(text))) return 'excluded:money';
  return null;
}

/**
 * General notes of one normalized source.
 * @returns {{ notes: object[], skipped: object[] }}
 *   notes: `{ itemIds, text, selector, category, tags, evidence, classification? }`
 */
export function extractGeneralNotes(source) {
  const diocese = source.diocese;
  if (!['grodno', 'pinsk'].includes(diocese)) return { notes: [], skipped: [] };
  const front = source.rules
    .filter((rule) => rule.scopeHint === 'front' || (diocese === 'pinsk' && !rule.scopeHint && !rule.anchorDate))
    .sort((a, b) => numeric(a.id) - numeric(b.id));
  const notes = [];
  const skipped = [];
  const skip = (paragraph, reason) => skipped.push({ diocese, itemIds: paragraph.ids, reason, text: paragraph.text.slice(0, 120) });

  if (diocese === 'grodno') {
    let heading = null;
    let lastSection = null;
    let absorb = [];
    paragraphsOf(front).forEach((paragraph) => {
      const value = fold(paragraph.text);
      if (paragraph.section !== lastSection) { heading = null; lastSection = paragraph.section; }
      if (absorb.length && absorb[0].test(value)) { absorb = absorb.slice(1); return; }
      const head = GRODNO_HEADINGS.find((item) => item.match.test(value));
      if (head) { heading = head; absorb = head.absorb || []; skip(paragraph, 'heading'); return; }
      const section = GRODNO_SECTIONS[paragraph.section] || null;
      const item = GRODNO_ITEMS.find((entry) => entry.match.test(value));
      const reason = item ? null : (heading?.skip || (!heading && section?.skip)) || skipOf(paragraph.text);
      if (reason) { skip(paragraph, reason); return; }
      const selector = item?.selector || heading?.selector || section?.selector || null;
      if (!selector) { skip(paragraph, 'no-selector'); return; }
      notes.push({
        itemIds: paragraph.ids, section: paragraph.section, text: paragraph.text, selector, category: heading?.category || categoryOf(paragraph),
        tags: paragraph.tags, evidence: paragraph.evidence, ...(item?.classification ? { classification: item.classification } : {}),
      });
    });
  } else {
    const paragraphs = paragraphsOf(front);
    for (const paragraph of paragraphs) {
      const value = fold(paragraph.text);
      const item = PINSK_ITEMS.find((entry) => entry.match.test(value));
      const section = PINSK_SECTIONS[paragraph.section];
      const skipRule = PINSK_SKIPS.find(([pattern]) => pattern.test(value));
      const reason = item ? null : (skipRule?.[1] || section?.skip || skipOf(paragraph.text) || 'no-selector');
      if (reason) { skip(paragraph, reason); continue; }
      const { text, ids } = paragraph;
      notes.push({
        itemIds: ids, section: paragraph.section, text, selector: item.selector, category: categoryOf({ ...paragraph, text }),
        tags: paragraph.tags, evidence: paragraph.evidence, ...(item.classification ? { classification: item.classification } : {}),
      });
    }
  }
  return { notes, skipped };
}
