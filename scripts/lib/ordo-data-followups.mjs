/**
 * Pure analysis for the Ordo Firestore follow-ups (no I/O, no Firestore).
 *
 *   buildRankMigrationPlan  — align stored `_rank` of `days`/`readings` with
 *                             the engine layers and plan obsolete documents
 *   buildMissingContentReport — celebrations the engine resolves that have
 *                             no `days` / `readings` document
 *
 * Both are deterministic for the same inputs (sorted output, no clock).
 */
import { buildCalendarLayers } from '../../src/utils/ordo/layers.js';
import { generateLiturgicalYear } from '../../src/utils/ordo/index.js';
import { claimedDayIds, selectFixedDocuments, selectReadingDocuments } from '../../src/utils/ordo/runtime.js';

export const ORDO_CONTEXTS = Object.freeze([null, 'grodno', 'minsk-mohilev', 'pinsk', 'vitebsk']);
export const DIOCESES = Object.freeze(['grodno', 'minsk-mohilev', 'pinsk', 'vitebsk']);

/** Ranks that are stored in `_rank`; other engine ranks (`dies-liturgicus`) are not compared. */
const STORED_RANKS = new Set(['solemnitas', 'festum', 'memoria', 'memoria-ad-libitum', 'commemoratio-defunctorum']);

/** Seasonal documents (`advent-17-12`, `christmas-03-01`) carry `_date` but are temporal. */
const SEASONAL_ID = /^(advent|christmas)-\d{2}-\d{2}$/;

const AMBIGUITIES = 'docs/ordo-engine-ambiguities.md';

/**
 * Reviewed decisions for documents no celebration owns any more. Anything
 * not listed here is left in place and reported for review.
 */
export const OBSOLETE_DECISIONS = Object.freeze({
  '06-06-sv-boniface-vitebsk--martyr-one': {
    decision: 'obsolete',
    supersededBy: ['05-06-sv-boniface--martyr-one', '05-06-sv-boniface--pastors'],
    reason: 'Vitebsk keeps St Boniface on 5 June like the General Calendar; the 06.06 Vitebsk variant was removed from fixedCalendar.js.',
    evidence: ['vitebsk:2026-06-05:c0', `${AMBIGUITIES}#18`, 'patchs/generate-db-feasts.mjs SYNTHETIC_VARIANTS (still generates it)'],
  },
  '06-06-sv-boniface-vitebsk--pastors': {
    decision: 'obsolete',
    supersededBy: ['05-06-sv-boniface--martyr-one', '05-06-sv-boniface--pastors'],
    reason: 'Vitebsk keeps St Boniface on 5 June like the General Calendar; the 06.06 Vitebsk variant was removed from fixedCalendar.js.',
    evidence: ['vitebsk:2026-06-05:c0', `${AMBIGUITIES}#18`, 'patchs/generate-db-feasts.mjs SYNTHETIC_VARIANTS (still generates it)'],
  },
  '05-06-vitebsk-cathedral-dedication': {
    decision: 'obsolete',
    supersededBy: ['10-10-vitebsk-cathedral-dedication'],
    reason: 'The Vitebsk cathedral dedication is kept on 10 October (fixedCalendar.js and the Vitebsk calendar); the 05.06 document is a stale duplicate.',
    evidence: ['vitebsk:2026-10-10:c0', `${AMBIGUITIES}#18`, 'src/constants/fixedCalendar.js 10.10 Віцебская дыяцэзія'],
  },
  '05-07-our-lady-trakai-sanctuary': {
    decision: 'leave-in-place',
    reason: 'Proper solemnity of the Trakai sanctuary itself (a local church, not the diocese). It becomes reachable once LocalChurchContext is used for shrines; not obsolete.',
    evidence: [`${AMBIGUITIES}#23`, `${AMBIGUITIES}#24`],
  },
});

/** Documents whose `_feastName` contains `<br>`: reviewed, display markup (not a data bug). */
export const TITLE_MARKUP_DECISION = Object.freeze({
  decision: 'leave-in-place',
  reason: 'DayTitle.vue deliberately escapes titles and re-allows only <br> for multi-line headings (Easter Sunday, Holy Family, Palm Sunday); the engine titles come from movableFeasts.js, not from _feastName. Plain-text consumers (FeastsPicker cleanText) strip tags. Not a data bug.',
  evidence: ['src/components/oraparts/DayTitle.vue displayTitleHtml'],
});

export const placesOf = (doc) => (Array.isArray(doc?._place) ? doc._place : [doc?._place]).filter(Boolean);
const docId = (doc) => doc.id;
const byId = (a, b) => String(a.id ?? a.documentId).localeCompare(String(b.id ?? b.documentId));
const uniqueSorted = (values) => [...new Set(values.filter(Boolean))].sort();

function contextOk(doc, context) {
  const places = placesOf(doc);
  return context ? places.includes(context) : places.length === 0;
}

function normalizeFeastCode(value) {
  return String(value || '').replace(/^feast-/, '');
}

// ---------------------------------------------------------------------------
// Evidence index
// ---------------------------------------------------------------------------

/**
 * `evidenceFiles`: `{ [diocese]: evidenceJson }` (src/data/ordo/evidence/*.json).
 * Returns celebration id → [{ itemId, diocese, date, rank }].
 */
export function indexEvidence(evidenceFiles = {}) {
  const index = new Map();
  Object.entries(evidenceFiles).forEach(([diocese, file]) => {
    (file?.days || []).forEach((day) => (day.celebrations || []).forEach((item) => {
      const id = item.identity?.id;
      if (!id) return;
      const list = index.get(id) || [];
      list.push({ itemId: item.id, diocese, date: day.date, rank: item.rank || null });
      index.set(id, list);
    }));
  });
  index.forEach((list) => list.sort((a, b) => a.itemId.localeCompare(b.itemId)));
  return index;
}

function evidenceFor(index, celebrationId, rank, context) {
  return (index.get(celebrationId) || [])
    .filter((item) => item.rank === rank && (!context || item.diocese === context))
    .map((item) => item.itemId);
}

// ---------------------------------------------------------------------------
// Ownership: which celebration (per context) owns which `days` document
// ---------------------------------------------------------------------------

/** `{ owners: Map<docId, [{context, celebration}]>, expected: [{context, celebration, dayId}] }` */
export function collectOwnership(contexts = ORDO_CONTEXTS) {
  const owners = new Map();
  const expected = [];
  const fixedByContext = new Map();
  contexts.forEach((context) => {
    const { celebrations } = buildCalendarLayers({ country: 'BY', diocese: context });
    const list = [...celebrations.values()].sort(byId);
    fixedByContext.set(context, list);
    list.forEach((celebration) => {
      const refs = [celebration.daysRef, ...(celebration.fallbackDaysRefs || [])];
      refs.forEach((ref, refIndex) => (ref?.dayIds || []).forEach((dayId) => {
        const entry = { context, celebration, own: refIndex === 0 };
        owners.set(dayId, [...(owners.get(dayId) || []), entry]);
        if (refIndex === 0) expected.push({ context, celebration, dayId });
      }));
    });
  });
  return { owners, expected, celebrationsByContext: fixedByContext };
}

// ---------------------------------------------------------------------------
// Rank migration plan
// ---------------------------------------------------------------------------

function layerSourceOf(celebration, context) {
  const trail = celebration.layerTrail || [];
  if (context && trail.includes(context)) {
    return celebration.source?.file === 'src/data/ordo/layers.js' || celebration.inheritedFrom
      ? 'diocesan-layer'
      : 'fixedCalendar-place';
  }
  return trail.includes('belarus') ? 'belarus-layer' : 'universal';
}

/** High confidence: universal rules or ≥2 published calendars; one calendar only → review. */
function confidenceOf(sourceKind, evidence) {
  if (sourceKind === 'universal' || sourceKind === 'fixedCalendar-place') return 'high';
  const dioceses = new Set(evidence.map((item) => item.split(':')[0]));
  return dioceses.size >= 2 ? 'high' : 'single-source';
}

function rankReason(celebration, from, to, sourceKind) {
  const where = {
    universal: 'fixedCalendar.js / movableFeasts.js (General Calendar)',
    'belarus-layer': 'the national layer (src/data/ordo/layers.js BELARUS_LAYER)',
    'diocesan-layer': 'the diocesan layer (src/data/ordo/layers.js DIOCESAN_LAYERS)',
    'fixedCalendar-place': 'the diocesan entry of fixedCalendar.js',
  }[sourceKind];
  return `Stored _rank "${from ?? '(none)'}" differs from "${to}" in ${where} for ${celebration.id}.`;
}

/**
 * @param {{ days: object[], readings: object[], evidenceIndex?: Map, allowDelete?: boolean,
 *   source?: object, contexts?: (string|null)[] }} input
 */
export function buildRankMigrationPlan({
  days, readings = [], evidenceIndex = new Map(), allowDelete = false, source = {}, contexts = ORDO_CONTEXTS,
}) {
  const daysById = new Map(days.map((doc) => [docId(doc), doc]));
  const { owners, expected, celebrationsByContext } = collectOwnership(contexts);
  const targets = new Map(); // docId → [{ context, celebration, rank }]

  const addTarget = (doc, context, celebration) => {
    if (!STORED_RANKS.has(celebration.rank)) return;
    const list = targets.get(doc.id) || [];
    if (!list.some((item) => item.context === context && item.celebration.id === celebration.id)) {
      list.push({ context, celebration, rank: celebration.rank });
    }
    targets.set(doc.id, list);
  };

  // Fixed documents owned (own daysRef) by a celebration of a context whose place matches.
  owners.forEach((entries, dayId) => {
    const doc = daysById.get(dayId);
    if (!doc) return;
    entries.filter((entry) => entry.own && contextOk(doc, entry.context))
      .forEach((entry) => addTarget(doc, entry.context, entry.celebration));
  });
  // Dynamic documents (`_feast`) are universal.
  const universal = celebrationsByContext.get(null) || [];
  universal.filter((item) => item.daysRef?.source === 'dynamic').forEach((celebration) => {
    days.filter((doc) => doc._feast && normalizeFeastCode(doc._feast) === normalizeFeastCode(celebration.daysRef._feast)
      && contextOk(doc, null))
      .forEach((doc) => addTarget(doc, null, celebration));
  });

  const changes = [];
  const reviews = [];

  [...targets.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([dayId, list]) => {
    const doc = daysById.get(dayId);
    const ranks = uniqueSorted(list.map((item) => item.rank));
    if (ranks.length > 1) {
      reviews.push({
        collection: 'days', documentId: dayId, kind: 'rank-conflict', decision: 'leave-in-place',
        current: { _rank: doc._rank ?? null },
        reason: `Contexts expect different ranks (${list.map((item) => `${item.context || 'BY'}=${item.rank}`).join(', ')}) for one multi-place document.`,
        evidence: [],
      });
      return;
    }
    const [to] = ranks;
    if ((doc._rank ?? null) === to) return;
    const primary = list[0];
    const sourceKind = layerSourceOf(primary.celebration, primary.context);
    const evidence = uniqueSorted(list.flatMap((item) => evidenceFor(evidenceIndex, item.celebration.id, to, item.context)
      .concat(item.celebration.source?.evidence || [])));
    const confidence = confidenceOf(sourceKind, evidence);
    const item = {
      collection: 'days',
      documentId: dayId,
      celebrationId: primary.celebration.id,
      contexts: uniqueSorted(list.map((entry) => entry.context || 'BY')),
      set: { _rank: to },
      precondition: { _rank: doc._rank ?? null },
      reason: rankReason(primary.celebration, doc._rank ?? null, to, sourceKind),
      source: sourceKind,
      confidence,
      evidence: [...evidence, ...(dayId === '22-07-sv-mary-magdalene' || dayId === '02-11-all-faithful-departed' ? [`${AMBIGUITIES}#25`] : [])],
    };
    if (confidence === 'high') changes.push({ action: 'update', ...item });
    else reviews.push({ kind: 'rank-single-source', decision: 'review', proposed: item.set, ...item });
  });

  // Readings linked to a re-ranked `days` document follow it.
  const dayRank = new Map(changes.map((item) => [item.documentId, item]));
  [...readings].sort(byId).forEach((reading) => {
    const linked = uniqueSorted([reading._dayId, ...(reading._dayIds || [])]).filter((id) => dayRank.has(id));
    if (!linked.length || reading._rank === undefined) return;
    const ranks = uniqueSorted(linked.map((id) => dayRank.get(id).set._rank));
    if (ranks.length > 1) {
      reviews.push({ collection: 'readings', documentId: reading.id, kind: 'rank-conflict', decision: 'leave-in-place', reason: `Linked days documents get different ranks (${ranks.join(', ')}).`, evidence: linked });
      return;
    }
    if (reading._rank === ranks[0]) return;
    changes.push({
      action: 'update',
      collection: 'readings',
      documentId: reading.id,
      celebrationId: dayRank.get(linked[0]).celebrationId,
      contexts: dayRank.get(linked[0]).contexts,
      set: { _rank: ranks[0] },
      precondition: { _rank: reading._rank ?? null },
      reason: `Readings document linked (_dayId/_dayIds) to ${linked.join(', ')} whose _rank changes to "${ranks[0]}".`,
      source: 'linked-days-document',
      confidence: 'high',
      evidence: linked.map((id) => `days/${id}`),
    });
  });

  // Documents no celebration owns any more.
  const obsolete = [];
  days.filter((doc) => doc._date && !SEASONAL_ID.test(doc.id) && !owners.has(doc.id)).sort(byId).forEach((doc) => {
    const decision = OBSOLETE_DECISIONS[doc.id];
    const linkedReadings = readings.filter((reading) => [reading._dayId, ...(reading._dayIds || [])].includes(doc.id)).map(docId).sort();
    const base = {
      collection: 'days',
      documentId: doc.id,
      current: { _date: doc._date, _rank: doc._rank ?? null, _place: placesOf(doc), _feastName: doc._feastName ?? null },
      linkedReadings,
    };
    if (decision?.decision === 'obsolete') {
      const supersededPresent = decision.supersededBy.filter((id) => daysById.has(id));
      if (supersededPresent.length !== decision.supersededBy.length) {
        reviews.push({ ...base, kind: 'obsolete-without-successor', decision: 'leave-in-place', reason: `Successor document missing: ${decision.supersededBy.filter((id) => !daysById.has(id)).join(', ')}.`, evidence: decision.evidence });
        return;
      }
      obsolete.push({
        ...base,
        action: allowDelete ? 'delete' : 'mark-obsolete',
        set: allowDelete ? undefined : { _obsolete: true, _obsoleteReason: decision.reason, _supersededBy: decision.supersededBy },
        precondition: { _date: doc._date, _rank: doc._rank ?? null },
        reason: decision.reason,
        supersededBy: decision.supersededBy,
        evidence: decision.evidence,
        confidence: 'high',
      });
      return;
    }
    reviews.push({
      ...base,
      kind: 'unowned-document',
      decision: decision?.decision || 'leave-in-place',
      reason: decision?.reason || 'No engine celebration owns this document; not in the reviewed obsolete list, so it is left in place.',
      evidence: decision?.evidence || [],
    });
  });

  // Identities pointing to documents that do not exist (multi-place documents in Firestore).
  const missingIds = new Map();
  expected.filter((item) => !daysById.has(item.dayId)).forEach((item) => {
    const key = item.dayId;
    if (missingIds.has(key)) return;
    const ref = item.celebration.daysRef || {};
    const variant = key.includes('--') ? key.slice(key.lastIndexOf('--')) : '';
    const sameDatePlace = days.filter((doc) => doc._date === ref._date
      && (item.context ? placesOf(doc).includes(item.context) : !placesOf(doc).length)).map(docId);
    const sameVariant = variant ? sameDatePlace.filter((id) => id.endsWith(variant)) : [];
    const candidates = (sameVariant.length ? sameVariant : sameDatePlace).sort();
    missingIds.set(key, {
      collection: 'days',
      documentId: key,
      kind: 'identity-relink',
      decision: 'code-fix',
      context: item.context || 'BY',
      celebrationId: item.celebration.id,
      liveCandidates: candidates,
      reason: candidates.length
        ? `fixed-identities.js expects "${key}" (generated from patchs/db-feasts) but Firestore stores the text as ${candidates.join(', ')} (multi-place _place). The runtime falls back to the universal document for ${item.context || 'BY'}. Fix the identity (build-identities should map to the live id); no Firestore write.`
        : `fixed-identities.js expects "${key}" but no live document of that date and place exists.`,
      evidence: ['src/data/ordo/fixed-identities.js', 'scripts/ordo/build-identities.mjs'],
    });
  });
  reviews.push(...missingIds.values());
  const relinkTargets = new Map();
  missingIds.forEach((item) => item.liveCandidates.forEach((id) => relinkTargets.set(id, [...(relinkTargets.get(id) || []), item.documentId])));
  reviews.filter((item) => item.kind === 'unowned-document' && relinkTargets.has(item.documentId)).forEach((item) => {
    item.kind = 'unowned-relink-target';
    item.decision = 'leave-in-place';
    item.reason = `Live multi-place document that the identities should point to (${relinkTargets.get(item.documentId).join(', ')}); see identity-relink. Not obsolete.`;
  });

  // `<br>` in titles.
  days.filter((doc) => /<br\s*\/?>/i.test(String(doc._feastName || doc._title || ''))).sort(byId).forEach((doc) => {
    reviews.push({
      collection: 'days', documentId: doc.id, kind: 'title-markup', decision: TITLE_MARKUP_DECISION.decision,
      current: { _feastName: doc._feastName ?? doc._title },
      reason: TITLE_MARKUP_DECISION.reason,
      evidence: TITLE_MARKUP_DECISION.evidence,
    });
  });

  // Diocesan date changes that are reached by id (no `_date` change needed).
  contexts.filter(Boolean).forEach((context) => {
    (celebrationsByContext.get(context) || []).forEach((celebration) => {
      const ref = celebration.daysRef || {};
      if (ref.source !== 'fixed' || !ref._date || celebration.date?.type !== 'fixed') return;
      const key = `${String(celebration.date.day).padStart(2, '0')}.${String(celebration.date.month).padStart(2, '0')}`;
      if (key === ref._date || !(ref.dayIds || []).some((id) => daysById.has(id))) return;
      reviews.push({
        collection: 'days', documentId: (ref.dayIds || []).filter((id) => daysById.has(id)).join(','), kind: 'date-moved-by-layer',
        decision: 'leave-in-place', context, celebrationId: celebration.id,
        reason: `The ${context} layer celebrates ${celebration.id} on ${key}; the document keeps _date ${ref._date} and is fetched by id (extraFixedDatesOf). Changing _date would break the fixedCalendar identity.`,
        evidence: celebration.source?.evidence || [],
      });
    });
  });

  const sortItems = (list) => list.sort((a, b) => `${a.collection}/${a.documentId}/${a.kind || a.action}`
    .localeCompare(`${b.collection}/${b.documentId}/${b.kind || b.action}`));
  const writes = sortItems([...changes, ...obsolete]);
  const reviewList = sortItems(reviews);
  const count = (list, fn) => list.reduce((acc, item) => { const key = fn(item); acc[key] = (acc[key] || 0) + 1; return acc; }, {});
  return {
    kind: 'ordo-migrate-ranks-plan',
    schemaVersion: 1,
    source,
    policy: {
      writes: 'update-only-with-precondition',
      obsolete: allowDelete ? 'delete (--allow-delete)' : 'mark-obsolete (_obsolete/_obsoleteReason/_supersededBy)',
      reviewItems: 'never written',
    },
    summary: {
      writes: writes.length,
      byAction: count(writes, (item) => `${item.collection}:${item.action}`),
      reviews: reviewList.length,
      byReviewKind: count(reviewList, (item) => item.kind),
    },
    writes,
    reviews: reviewList,
  };
}

// ---------------------------------------------------------------------------
// Missing content
// ---------------------------------------------------------------------------

const COMMON_RULES = [
  [/мучанікаў|мучаніц(,|\s|$)|паплечнік/u, 'martyrs-many'],
  [/мучані(ка|цы)/u, 'martyr-one'],
  [/доктар/u, 'doctors-of-church'],
  [/біскуп|пап(а|ы)(?!\p{L})|прэзбітэр/u, 'pastors'],
  [/панн(ы|аў)(?!\p{L})/u, 'virgins'],
  [/абат|манах|законні|пустэльн/u, 'religious'],
];

/** Suggested Common of the Liturgy of the Hours (`patchs/feasts/common-texts/<id>.json`). */
export function suggestCommons({ title = '', category = 'saint', id = '' } = {}) {
  const text = String(title).toLocaleLowerCase('be-BY');
  if (id === 'saturday-blessed-virgin-mary' || category === 'mary') return ['blessed-virgin-mary'];
  if (category === 'dedication') return ['church-dedication'];
  if (category === 'lord') return [];
  if (category === 'dead') return ['office-for-dead'];
  const found = COMMON_RULES.filter(([re]) => re.test(text)).map(([, common]) => common);
  const commons = found.includes('martyrs-many') ? found.filter((common) => common !== 'martyr-one') : found;
  return commons.length ? [...new Set(commons)] : ['holy-men', 'holy-women'];
}

/** What content is needed and whether a Common covers it. */
export function contentNeedOf(item) {
  const { rank, category, id, kind } = item;
  const commons = suggestCommons(item);
  if (kind === 'votive-memorial') {
    return {
      coverage: 'common',
      commons,
      hours: 'Common of the BVM (texts of the Saturday memorial are the Common; no proper texts exist).',
      readings: 'Weekday readings or the Common of the BVM (Lectionary, Commons).',
      route: 'A template route or a `days` document built from common-texts/blessed-virgin-mary.',
    };
  }
  if (category === 'lord' || !commons.length) {
    return {
      coverage: 'proper',
      commons,
      hours: id === 'holy-name-of-jesus'
        ? 'Proper collect (and proper antiphons/hymns where the Polish/Latin LH has them); the rest from the Christmas weekday.'
        : 'Proper Office (no Common exists for celebrations of the Lord).',
      readings: 'Proper readings (Missal/Lectionary).',
      route: 'New `days` document with proper texts.',
    };
  }
  if (rank === 'solemnitas' || rank === 'festum') {
    return {
      coverage: 'common-plus-proper',
      commons,
      hours: `Common (${commons.join(' / ')}) for psalmody and most texts; proper collect, ${rank === 'solemnitas' ? 'I Vespers, ' : ''}hymns/antiphons where the diocesan proper has them.`,
      readings: 'Proper readings or the Common of the Lectionary (required: the weekday readings are not allowed).',
      route: 'New `days` document (Common completed at import, like patchs/generate-db-feasts.mjs).',
    };
  }
  return {
    coverage: 'common-plus-collect',
    commons,
    hours: `Common (${commons.join(' / ')}) + proper collect (and a hagiographic second reading of the Office of Readings if available).`,
    readings: 'Optional: the weekday readings are the default (GIRM 357); saint/Common readings as an alternative.',
    route: 'New `days` document built from the Common (generate-db-feasts) with the proper collect.',
  };
}

function readingsFor(option, readings, readingsByDate) {
  const ref = option.readingsRef || {};
  if (ref._feast) return readings.filter((doc) => normalizeFeastCode(doc._feast) === normalizeFeastCode(ref._feast));
  if (ref._date) {
    const docs = readingsByDate.get(ref._date) || [];
    return selectReadingDocuments({ purpose: 'proper', where: { _date: ref._date } }, option, docs);
  }
  return [];
}

function daysFor(option, day, days, daysByDate) {
  const ref = option.daysRef || {};
  if (ref.source === 'dynamic') {
    return { docs: days.filter((doc) => normalizeFeastCode(doc._feast) === normalizeFeastCode(ref._feast)), via: 'feast' };
  }
  if (ref.source === 'template') return { docs: [], via: 'template' };
  if (ref.source !== 'fixed') return { docs: [], via: 'unknown' };
  const docs = selectFixedDocuments(option, daysByDate.get(ref._date) || [], {
    diocese: day.context.diocese, claimedIds: claimedDayIds(day, option.id),
  });
  const own = (ref.dayIds || []).some((id) => docs.some((doc) => doc.id === id));
  const fallback = !own && (option.fallbackDaysRefs || []).some((item) => (item.dayIds || []).some((id) => docs.some((doc) => doc.id === id)));
  return { docs, via: own ? 'own' : fallback ? 'fallback' : docs.length ? 'title' : 'none' };
}

const HIGHER_RANKS = new Set(['solemnitas', 'festum']);

/** high: a primary or a feast/solemnity without Hours; medium: an alternative without Hours or a feast without readings. */
function priorityOf({ daysMissing, roles, ranks }) {
  const higher = ranks.some((rank) => HIGHER_RANKS.has(rank));
  if (daysMissing) return higher || roles.includes('primary') ? 'high' : 'medium';
  return higher ? 'medium' : 'low';
}

/**
 * @param {{ days: object[], readings: object[], years?: number[], dioceses?: string[],
 *   evidenceIndex?: Map, source?: object }} input
 */
export function buildMissingContentReport({
  days, readings = [], years = [2026, 2027, 2028], dioceses = DIOCESES, evidenceIndex = new Map(), source = {},
}) {
  const daysByDate = new Map();
  days.forEach((doc) => { if (doc._date) daysByDate.set(doc._date, [...(daysByDate.get(doc._date) || []), doc]); });
  const readingsByDate = new Map();
  readings.forEach((doc) => { if (doc._date) readingsByDate.set(doc._date, [...(readingsByDate.get(doc._date) || []), doc]); });

  const items = new Map();
  dioceses.forEach((diocese) => years.forEach((year) => {
    generateLiturgicalYear(year, { country: 'BY', diocese }).forEach((day) => {
      [day.primary, ...day.alternatives].forEach((option) => {
        if (option.kind === 'temporal') return;
        const daysHit = daysFor(option, day, days, daysByDate);
        const readingDocs = readingsFor(option, readings, readingsByDate);
        const daysMissing = daysHit.docs.length === 0;
        const readingsMissing = readingDocs.length === 0;
        if (!daysMissing && !readingsMissing) return;
        const key = option.id;
        const entry = items.get(key) || {
          id: option.id,
          title: option.title,
          kind: option.kind,
          category: option.category,
          rank: option.rank,
          layer: option.layer,
          daysRef: option.daysRef || null,
          readingsRef: option.readingsRef || null,
          dioceses: {},
          evidence: [],
        };
        const perDiocese = entry.dioceses[diocese] || {
          rank: option.rank, daysMissing, readingsMissing, roles: [], dates: [],
        };
        perDiocese.daysMissing = perDiocese.daysMissing || daysMissing;
        perDiocese.readingsMissing = perDiocese.readingsMissing || readingsMissing;
        if (!perDiocese.roles.includes(option.role)) perDiocese.roles.push(option.role);
        if (perDiocese.dates.length < 3) perDiocese.dates.push(day.date);
        perDiocese.dateCount = (perDiocese.dateCount || 0) + 1;
        entry.dioceses[diocese] = perDiocese;
        items.set(key, entry);
      });
    });
  }));

  const list = [...items.values()].map((entry) => {
    const perDiocese = Object.values(entry.dioceses);
    const evidence = uniqueSorted([
      ...(evidenceIndex.get(entry.id) || []).map((item) => item.itemId).slice(0, 4),
    ]);
    const daysMissing = perDiocese.some((item) => item.daysMissing);
    const readingsMissing = perDiocese.some((item) => item.readingsMissing);
    // Roles/ranks of the dioceses where the most important gap is.
    const relevant = perDiocese.filter((item) => (daysMissing ? item.daysMissing : item.readingsMissing));
    const roles = uniqueSorted(relevant.flatMap((item) => item.roles));
    Object.values(entry.dioceses).forEach((item) => item.roles.sort());
    const need = contentNeedOf(entry);
    return {
      ...entry,
      daysMissing,
      readingsMissing,
      roles,
      dioceseIds: Object.keys(entry.dioceses).sort(),
      displayImpact: daysMissing
        ? (roles.includes('primary')
          ? 'Primary without a document: shown with the texts of the day (missingProper).'
          : 'Legal alternative without a document: no card is shown.')
        : 'Hours available; readings fall back to the weekday.',
      need,
      ranks: uniqueSorted(perDiocese.map((item) => item.rank)),
      priority: priorityOf({ daysMissing, roles, ranks: relevant.map((item) => item.rank) }),
      evidence,
    };
  }).sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority] || a.id.localeCompare(b.id);
  });
  list.forEach((entry) => { entry.dioceses = Object.fromEntries(Object.entries(entry.dioceses).sort(([a], [b]) => a.localeCompare(b))); });

  const count = (fn) => list.filter(fn).length;
  return {
    kind: 'ordo-missing-content',
    schemaVersion: 1,
    source,
    scope: { years, dioceses },
    summary: {
      celebrations: list.length,
      daysMissing: count((item) => item.daysMissing),
      readingsOnlyMissing: count((item) => !item.daysMissing && item.readingsMissing),
      coverage: list.filter((item) => item.daysMissing).reduce((acc, item) => {
        acc[item.need.coverage] = (acc[item.need.coverage] || 0) + 1;
        return acc;
      }, {}),
    },
    items: list,
  };
}

const ROLE_LABEL = { primary: 'primary', alternative: 'alternative' };

/** Committed Markdown summary of the missing-content report. */
export function renderMissingContentMarkdown(report) {
  const lines = [];
  const src = report.source || {};
  lines.push('# Ordo: celebrations without `days` / `readings` content');
  lines.push('');
  lines.push('Generated by `node scripts/ordo-missing-content.mjs` — do not edit by hand.');
  lines.push(`Source: ${src.kind || 'snapshot'} \`${src.snapshotVersion || '?'}\` (project \`${src.projectId || '?'}\`, ${src.scope || 'snapshot'}); `
    + `years ${report.scope.years.join(', ')}; dioceses ${report.scope.dioceses.join(', ')}.`);
  lines.push('');
  lines.push('The engine resolves these celebrations as a primary or a legal alternative, but Firestore has no');
  lines.push('`days` document (Hours) and/or no proper `readings` document for them. A primary without a document');
  lines.push('is shown with the texts of the day (`missingProper`); an alternative without a document is not shown.');
  lines.push('Coverage: `common` = the Common is the proper text; `common-plus-collect` = Common + proper collect;');
  lines.push('`common-plus-proper` = Common + proper collect/I Vespers/readings; `proper` = proper texts required.');
  lines.push('');
  lines.push(`Summary: ${report.summary.celebrations} celebrations — ${report.summary.daysMissing} without \`days\`, `
    + `${report.summary.readingsOnlyMissing} with \`days\` but without proper \`readings\`.`);
  lines.push('');

  const section = (title, filter) => {
    const rows = report.items.filter(filter);
    lines.push(`## ${title} (${rows.length})`);
    lines.push('');
    if (!rows.length) { lines.push('None.'); lines.push(''); return; }
    lines.push('| Priority | Celebration | Rank | Dioceses (role) | Missing | Coverage | Common | Example dates |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    rows.forEach((item) => {
      const dioceses = Object.entries(item.dioceses)
        .filter(([, value]) => (item.daysMissing ? value.daysMissing : value.readingsMissing))
        .map(([id, value]) => `${id} (${value.roles.map((role) => ROLE_LABEL[role] || role).join('/')})`).join(', ');
      const missing = [item.daysMissing ? 'days' : '', item.readingsMissing ? 'readings' : ''].filter(Boolean).join(' + ');
      const dates = uniqueSorted(Object.values(item.dioceses).filter((value) => (item.daysMissing ? value.daysMissing : value.readingsMissing))
        .flatMap((value) => value.dates)).slice(0, 2).join(', ');
      const ranks = uniqueSorted(Object.values(item.dioceses).filter((value) => (item.daysMissing ? value.daysMissing : value.readingsMissing))
        .map((value) => value.rank));
      lines.push(`| ${item.priority} | \`${item.id}\` ${item.title} | ${ranks.join(' / ')} | ${dioceses} | ${missing} | ${item.need.coverage} | ${item.need.commons.join(', ') || '—'} | ${dates} |`);
    });
    lines.push('');
  };
  section('Without a `days` document', (item) => item.daysMissing);

  const readingsOnly = report.items.filter((item) => !item.daysMissing && item.readingsMissing);
  lines.push(`## With \`days\` but without proper \`readings\` (${readingsOnly.length})`);
  lines.push('');
  lines.push('On memorials the weekday readings are the default (GIRM 357), so these only lack the optional saint');
  lines.push('readings; feasts and solemnities (priority `medium`) need proper or Common readings.');
  lines.push('');
  ['medium', 'low'].forEach((priority) => {
    const rows = readingsOnly.filter((item) => item.priority === priority);
    if (!rows.length) return;
    lines.push(`- **${priority}** (${rows.length}): ${rows.map((item) => `\`${item.id}\` (${item.ranks.join('/')})`).join(', ')}`);
  });
  lines.push('');

  lines.push('## Content needed per coverage type');
  lines.push('');
  const seen = new Set();
  report.items.filter((item) => item.daysMissing).forEach((item) => {
    const key = `${item.need.coverage}|${item.id === 'holy-name-of-jesus' ? item.id : ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    lines.push(`- **${item.need.coverage}** (e.g. \`${item.id}\`): Hours — ${item.need.hours} Readings — ${item.need.readings} Route — ${item.need.route}`);
  });
  lines.push('');
  lines.push('Common templates live in `patchs/feasts/common-texts/`; `patchs/generate-db-feasts.mjs` completes a');
  lines.push('proper source file with its Common. Readings on memorials are optional (weekday readings are the default).');
  lines.push('');
  return `${lines.join('\n')}\n`;
}
