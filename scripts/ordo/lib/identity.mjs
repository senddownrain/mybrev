/**
 * Map source celebration titles to MyBrev identities:
 *   fixed    — `src/constants/fixedCalendar.js` (+ day document IDs from
 *              `patchs/db-feasts`, whose `_id` is the Firestore `days` ID)
 *   dynamic  — FEAST_NAME_MAP codes (`feast-ascension` → `ascension`)
 *   period   — period day documents (`lent-w2-d4`), seasonal date documents
 *              (`advent-20-12`, `christmas-02-01`)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fixedCalendar, normalizeFixedPlace, normalizeFixedRank } from '../../../src/constants/fixedCalendar.js';
import { FEAST_NAME_MAP } from '../../../src/constants/liturgicalFeastsMap.js';
import { normalizePlaces } from '../../../src/utils/fixedFeasts.js';
import { fold, similarity, titleStems } from './text.mjs';

const PLACE_SUFFIX = /-(?:minsk-mohilev|minsk|vitebsk|grodno|pinsk|diocese)(?=$|-)/g;

export function celebrationSlug(fileId) {
  return String(fileId)
    .replace(/^\d{2}-\d{2}-/, '')
    .replace(/--.*$/, '')
    .replace(/-memoria-ad-libitum$/, '')
    .replace(PLACE_SUFFIX, '')
    .replace(/-+$/, '');
}

function mmddFromDdmm(ddmm) {
  const [day, month] = String(ddmm).split('.');
  return `${month}-${day}`;
}

export function loadFixedCatalog(root) {
  const dir = path.join(root, 'patchs', 'db-feasts');
  const documents = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort().map((name) => {
      const data = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      return {
        dayId: data._id || name.replace(/\.json$/, ''),
        ddmm: data._date,
        rank: data._rank,
        places: normalizePlaces(data._place),
        title: data._feastName || data._title || '',
      };
    })
    : [];
  const used = new Set();
  const entries = fixedCalendar.map((item, index) => {
    const rank = normalizeFixedRank(item.rank);
    const place = normalizeFixedPlace(item.place);
    const stems = titleStems(item.title);
    const candidates = documents
      .filter((doc) => doc.ddmm === item.date && doc.rank === rank)
      .map((doc) => ({ doc, score: similarity(stems, titleStems(doc.title)) + (place && doc.places.includes(place) ? 0.2 : 0) + (!place && !doc.places.length ? 0.1 : 0) }))
      .filter(({ score }) => score >= 0.3)
      .sort((a, b) => b.score - a.score);
    const matches = candidates.length ? documents.filter((doc) => celebrationSlug(doc.dayId) === celebrationSlug(candidates[0].doc.dayId) && doc.ddmm === item.date) : [];
    matches.forEach((doc) => used.add(doc.dayId));
    const [dd, mm] = item.date.split('.');
    return {
      kind: 'fixed',
      id: matches.length ? celebrationSlug(matches[0].dayId) : `fixed-${mm}${dd}-${index}`,
      ddmm: item.date,
      mmdd: mmddFromDdmm(item.date),
      title: item.title,
      rank,
      place: place || null,
      stems,
      fixedCalendarIndex: index,
      dayIds: [...new Set(matches.map((doc) => doc.dayId))],
    };
  });
  // Diocesan day documents that have no line in fixedCalendar.js.
  documents.filter((doc) => !used.has(doc.dayId)).forEach((doc) => {
    const id = celebrationSlug(doc.dayId);
    const existing = entries.find((entry) => entry.id === id && entry.ddmm === doc.ddmm && entry.rank === doc.rank);
    if (existing) {
      existing.dayIds.push(doc.dayId);
      return;
    }
    entries.push({
      kind: 'fixed', id, ddmm: doc.ddmm, mmdd: mmddFromDdmm(doc.ddmm), title: doc.title, rank: doc.rank,
      place: doc.places.length === 1 ? doc.places[0] : (doc.places.length ? doc.places : null),
      stems: titleStems(doc.title), fixedCalendarIndex: null, dayIds: [doc.dayId],
    });
  });
  return entries;
}

// Patterns run on `fold()`ed text (э→е, ё→е, ў→у, no apostrophes).
export const DYNAMIC_PATTERNS = [
  ['buptismofthelord', /хрост\S* пана/],
  ['holyfamily', /святой сям/],
  ['ash', /^(?:урачыстасць\s+)?(?:папяльцов|папялец)|^попельц/],
  ['palmsunday', /пальмов/],
  ['eastersunday', /нядзел\S* (?:змертвых|уваскрас)|змертвыхпаустання пана|^(?:урачыстасць\s+)?(?:велікодная|пасхальная) нядзеля/],
  ['ascension', /унебаушесц/],
  ['pentecost', /спасланн\S* (?:духа|св)/],
  ['trinity', /тройц/],
  ['corpuschristi', /цела і крыві|божага цела|божае цела/],
  ['christthehighpriest', /найвышейш\S* і вечн\S* святар/],
  ['marymotherchurch', /маці касцела/],
  ['christking', /валадар\S* сусвету/],
  ['heartofmary', /беззаганн\S* серц|серца (?:найсв\S* )?(?:панны марыі|нпм)/],
  ['heartofjesus', /серц\S* (?:пана )?езуса/],
];

export const DYNAMIC_CODES = Object.values(FEAST_NAME_MAP).map((code) => code.replace(/^feast-/, ''));

const PERIOD_TITLE = /нядзел|будзень|звычайны дзень|звычайная$|актав|вялікі (?:панядзелак|аутора|чацвер)|вялікая (?:серада|пятніца|субота)|вялікі тыдзень|вялікага тыдня|пасхальная вігілія|вігілія|трыдуум|дзень адвенту|перыяду|імша хрызма|мукі пана|пасля папяльца|^(?:[іivx\d]+\s+)?(?:адвенту|вялікага посту|в\. посту|велікодная|звычайная)(?:\s|$)|^(?:вялікі|вялікая|велікодн\S*)$/;

/** Resolve one source title to an identity (or null). */
export function resolveCelebration(title, align, catalog, diocese) {
  const text = fold(title);
  if (!text) return null;
  if (/нпм у суботу|найсвяцейшай панны марыі у суботу|панны марыі ў суботу/.test(text) || /нпм у суботу/.test(fold(title))) {
    return { kind: 'votive', id: 'bvm-saturday', template: 'blessed-virgin-mary', confidence: 'high' };
  }
  for (const [code, pattern] of DYNAMIC_PATTERNS) {
    if (pattern.test(text)) {
      const onDate = align.dynamic.includes(code);
      return { kind: 'dynamic', id: code, confidence: onDate ? 'high' : 'medium', ...(onDate ? {} : { dateMismatch: true }) };
    }
  }
  const stems = titleStems(title);
  const scored = (list) => list
    .map((entry) => ({ entry, score: similarity(stems, entry.stems) }))
    .sort((a, b) => b.score - a.score || (a.entry.place ? 1 : 0) - (b.entry.place ? 1 : 0));
  const sameDate = scored(catalog.filter((entry) => entry.mmdd === align.mmdd));
  const preferred = (list) => {
    if (!list.length) return null;
    const best = list[0].score;
    const ties = list.filter((item) => item.score >= best - 0.001);
    return (ties.find((item) => item.entry.place === diocese || (Array.isArray(item.entry.place) && item.entry.place.includes(diocese)))
      || ties.find((item) => !item.entry.place) || ties[0]);
  };
  const local = preferred(sameDate);
  if (local && local.score >= 0.4) {
    return fixedIdentity(local.entry, local.score >= 0.66 ? 'high' : 'medium', catalog, diocese);
  }
  if (PERIOD_TITLE.test(text) && stems.length <= 4) {
    return periodIdentity(align);
  }
  const global = preferred(scored(catalog));
  if (global && global.score >= 0.7) {
    return { ...fixedIdentity(global.entry, 'medium', catalog, diocese), transferredFrom: global.entry.mmdd };
  }
  if (PERIOD_TITLE.test(text)) return periodIdentity(align);
  if (local && local.score >= 0.3) return fixedIdentity(local.entry, 'low', catalog, diocese);
  return null;
}

function fixedIdentity(entry, confidence, catalog, diocese) {
  const universal = catalog.find((item) => item.id === entry.id && item.mmdd === entry.mmdd && !item.place);
  const own = catalog.find((item) => item.id === entry.id && item.mmdd === entry.mmdd
    && (item.place === diocese || (Array.isArray(item.place) && item.place.includes(diocese))));
  return {
    kind: 'fixed',
    id: entry.id,
    mmdd: entry.mmdd,
    confidence,
    mybrevRank: (universal || entry).rank,
    ...(own ? { mybrevDiocesanRank: own.rank } : {}),
    ...(entry.dayIds.length ? { dayIds: entry.dayIds } : {}),
  };
}

export function periodIdentity(align) {
  return {
    kind: 'period',
    id: align.seasonalDateId || align.periodDayId,
    periodDayId: align.periodDayId,
    ...(align.seasonalDateId ? { seasonalDateId: align.seasonalDateId } : {}),
    confidence: 'high',
  };
}
