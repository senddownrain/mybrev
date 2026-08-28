import { normalizeFixedDate, normalizePlaces, normalizeRank } from './fixedFeasts.js';

export const READING_SECTIONS = Object.freeze([
  'reading1',
  'reading2',
  'psalm',
  'alleluia',
  'gospel',
]);

const VALID_CYCLES = new Set(['A', 'B', 'C', '1', '2']);

export function normalizeFeastCode(value) {
  const code = String(value ?? '').trim().toLowerCase().replace(/^feast-/, '');
  return code ? `feast-${code}` : '';
}

export function normalizeReadingCycle(value) {
  const cycle = String(value ?? '').trim().toUpperCase();
  return VALID_CYCLES.has(cycle) ? cycle : '';
}

export function inferReadingCycleFromTitle(value) {
  const match = String(value ?? '').toLocaleLowerCase('be').match(/год\s+([abcавс])/u);
  if (!match) return '';
  if (match[1] === 'a' || match[1] === 'а') return 'A';
  if (match[1] === 'b' || match[1] === 'в') return 'B';
  if (match[1] === 'c' || match[1] === 'с') return 'C';
  return '';
}

export function inferFeastCodeFromTitle(value) {
  const title = String(value ?? '').normalize('NFKC').toLocaleLowerCase('be');
  const rules = [
    [/найвышэйш\p{L}*\s+і\s+вечн\p{L}*\s+святар/u, 'feast-christthehighpriest'],
    [/свят\p{L}*\s+сям/u, 'feast-holyfamily'],
    [/(?:хрост|хрышчэнн)\p{L}*\s+пана/u, 'feast-buptismofthelord'],
    [/найсвяцейш\p{L}*\s+тройц/u, 'feast-trinity'],
    [/цел\p{L}*\s+і\s+крыв\p{L}*\s+хрыст/u, 'feast-corpuschristi'],
    [/сэрц\p{L}*\s+пана\s+езус/u, 'feast-heartofjesus'],
    [/беззаганн\p{L}*\s+сэрц\p{L}*.*панн\p{L}*\s+мары/u, 'feast-heartofmary'],
    [/панн\p{L}*\s+мары\p{L}*,?\s+мац\p{L}*\s+касц/u, 'feast-marymotherchurch'],
    [/хрыст\p{L}*.*,?\s+валадар\p{L}*\s+сусвет/u, 'feast-christking'],
    [/унебаўшэсц\p{L}*\s+пана/u, 'feast-ascension'],
    [/пальмов\p{L}*\s+нядзел/u, 'feast-palmsunday'],
    [/спасланн\p{L}*\s+духа\s+святога/u, 'feast-pentecost'],
    [/^\s*велікодн\p{L}*\s+нядзел/u, 'feast-eastersunday'],
    [/(?:папяльцов\p{L}*\s+серад|^\s*папялец)/u, 'feast-ash'],
  ];
  return rules.find(([pattern]) => pattern.test(title))?.[1] ?? '';
}

export function inferPeriodMetadataFromTitle(value) {
  const title = String(value ?? '').normalize('NFKC').toLocaleLowerCase('be');
  const holyWeekRules = [
    [/вялі\p{L}*\s+панядзел/u, { _periodType: 'holyweek', _periodWeekNumber: 1, _dayOfWeek: 2 }],
    [/вялі\p{L}*\s+аўторак/u, { _periodType: 'holyweek', _periodWeekNumber: 1, _dayOfWeek: 3 }],
    [/вялі\p{L}*\s+серад/u, { _periodType: 'holyweek', _periodWeekNumber: 1, _dayOfWeek: 4 }],
    [/вялі\p{L}*\s+чацвер/u, {
      _periodType: 'holyweek',
      _periodWeekNumber: 1,
      _dayOfWeek: 5,
      ...(/вячэр\p{L}*\s+пана/u.test(title) ? { _variant: 'evening-mass' } : {}),
    }],
    [/вялі\p{L}*\s+пятніц/u, { _periodType: 'holyweek', _periodWeekNumber: 1, _dayOfWeek: 6 }],
    [/пасхальн\p{L}*\s+вігілі/u, {
      _periodType: 'holyweek',
      _periodWeekNumber: 1,
      _dayOfWeek: 7,
      _variant: 'vigil',
    }],
  ];
  return holyWeekRules.find(([pattern]) => pattern.test(title))?.[1] ?? null;
}

export function canonicalizeLegacyReadingMetadata(data) {
  const result = { ...data };
  const title = String(data?.title ?? '');
  const normalizedTitle = title.normalize('NFKC').toLocaleLowerCase('be');
  const isPaulVi = /паўл\p{L}*\s+vi/u.test(normalizedTitle)
    || normalizeFeastCode(data?._feast) === 'feast-paulvi';

  if (isPaulVi) {
    delete result._feast;
    delete result._periodType;
    delete result._periodWeekNumber;
    delete result._dayOfWeek;
    result._date = '29.05';
    result._rank = 'memoria-ad-libitum';
  } else {
    const inferredFeast = inferFeastCodeFromTitle(title);
    const isPentecostVigil = inferredFeast === 'feast-pentecost'
      && String(data?._periodType).toLowerCase() === 'easter'
      && Number(data?._periodWeekNumber) === 7
      && Number(data?._dayOfWeek) === 7;
    if (isPentecostVigil) {
      delete result._date;
      delete result._feast;
      result._periodType = 'easter';
      result._periodWeekNumber = 7;
      result._dayOfWeek = 7;
      result._variant = 'pentecost-vigil';
    } else if (inferredFeast) {
      delete result._date;
      delete result._periodType;
      delete result._periodWeekNumber;
      delete result._dayOfWeek;
      result._feast = inferredFeast;
      const inferredCycle = normalizeReadingCycle(data?.year) || inferReadingCycleFromTitle(title);
      result.year = inferredCycle || null;
    } else {
      const inferredPeriod = inferPeriodMetadataFromTitle(title);
      if (inferredPeriod) {
        delete result._date;
        delete result._feast;
        Object.assign(result, inferredPeriod);
      } else if (result._feast) {
        result._feast = normalizeFeastCode(result._feast);
      }
    }
  }

  const date = normalizeFixedDate(result._date);
  if (date) result._date = date;
  if (result._periodType) result._periodType = String(result._periodType).trim().toLowerCase();
  if (result._periodWeekNumber !== undefined && result._periodWeekNumber !== null) {
    result._periodWeekNumber = Number(result._periodWeekNumber);
  }
  if (result._dayOfWeek !== undefined && result._dayOfWeek !== null) {
    result._dayOfWeek = Number(result._dayOfWeek);
  }
  if (result.year !== undefined && result.year !== null) {
    result.year = normalizeReadingCycle(result.year) || result.year;
  }
  return result;
}

export function normalizeReadingTitle(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('be')
    .replace(/^\d{1,2}\s+[\p{L}.]+\s*[—–-]\s*/u, '')
    .replace(/(?:^|[\s,])год\s+[abcавс](?=\s|,|$)/gu, ' ')
    .replace(/(?:^|[\s,])(?:урачыстасць|свята|успамін)(?=[\s,]|$)/gu, ' ')
    .replace(/юзаф\p{L}*\s+(?:работнік|рамеснік)\p{L}*/gu, 'юзаф рамеснік')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleStems(value) {
  return new Set(normalizeReadingTitle(value)
    .split(' ')
    .filter((token) => token.length >= 3 && token !== 'св')
    .map((token) => token.slice(0, 6)));
}

export function readingTitleSimilarity(left, right) {
  const leftTokens = titleStems(left);
  const rightTokens = titleStems(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return (2 * intersection) / (leftTokens.size + rightTokens.size);
}

export function readingCelebrationKey(data) {
  const variant = String(data?._variant ?? '').trim().toLowerCase();
  const variantSuffix = variant ? `|variant:${variant}` : '';
  const explicit = String(data?._dayId ?? '').trim();
  if (explicit) return `day:${explicit}${variantSuffix}`;
  if (Array.isArray(data?._dayIds) && data._dayIds.length) {
    return `days:${[...data._dayIds].map(String).sort().join(',')}${variantSuffix}`;
  }
  const selector = readingSelector(data);
  if (!selector.startsWith('date:')) return `${selector}${variantSuffix}`;
  return [
    selector,
    normalizeReadingTitle(data?.title),
    normalizeRank(data?._rank),
    normalizeDayPlaces(data?._place),
    variant,
  ].join('|');
}

export function selectReadingCycleVariants(documents, cycle) {
  const groups = new Map();
  for (const document of documents) {
    const key = readingCelebrationKey(document);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(document);
  }

  const normalizedCycle = normalizeReadingCycle(cycle);
  return [...groups.values()].flatMap((group) => {
    if (normalizedCycle) {
      const exact = group.filter((document) => normalizeReadingCycle(document.year) === normalizedCycle);
      if (exact.length) return exact;
    }
    const shared = group.filter((document) => !normalizeReadingCycle(document.year));
    return shared.length ? shared : group;
  });
}

export function selectReadingLectionaryVariants(documents, { cycle, sundayCycle = cycle } = {}) {
  const groups = new Map();
  for (const document of documents) {
    const key = readingCelebrationKey(document);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(document);
  }

  return [...groups.values()].flatMap((group) => {
    const available = new Set(group.map((document) => normalizeReadingCycle(document.year)).filter(Boolean));
    const hasSundayCycles = ['A', 'B', 'C'].some((value) => available.has(value));
    const desired = normalizeReadingCycle(hasSundayCycles ? sundayCycle : cycle);
    if (desired) {
      const exact = group.filter((document) => normalizeReadingCycle(document.year) === desired);
      if (exact.length) return exact;
    }
    const shared = group.filter((document) => !normalizeReadingCycle(document.year));
    return shared.length ? shared : group;
  });
}

export function selectCalendarDayVariants(documents, dayOfWeek) {
  const exact = documents.filter((document) => Number(document._calendarDayOfWeek) === Number(dayOfWeek));
  if (exact.length) return exact;
  return documents.filter((document) => document._calendarDayOfWeek === undefined
    || document._calendarDayOfWeek === null);
}

export function readingSelector(data) {
  const date = normalizeFixedDate(data?._date);
  if (date) return `date:${date}`;

  const feast = normalizeFeastCode(data?._feast);
  if (feast) return `feast:${feast}`;

  const periodType = String(data?._periodType ?? '').trim().toLowerCase();
  const week = Number(data?._periodWeekNumber);
  const day = Number(data?._dayOfWeek);
  if (periodType && Number.isInteger(week) && Number.isInteger(day)) {
    return `period:${periodType}:w${week}:d${day}`;
  }

  return '';
}

export function buildPeriodDayId(data) {
  const selector = readingSelector({ ...data, _date: null, _feast: null });
  const match = selector.match(/^period:([^:]+):w(-?\d+):d(\d+)$/);
  return match ? `${match[1]}-w${match[2]}-d${match[3]}` : '';
}

export function buildReadingDocumentId(dayId, data) {
  const base = String(dayId ?? '').trim();
  if (!base) return '';
  const qualifiers = [
    normalizeReadingCycle(data?.year),
    String(data?._variant ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
  ].filter(Boolean);
  return qualifiers.length ? `${base}--${qualifiers.join('-')}` : base;
}

export function hasReadingSectionContent(section) {
  if (!section || typeof section !== 'object') return false;
  if (typeof section.text === 'string' && section.text.trim().length > 10) return true;
  if (typeof section.verse === 'string' && section.verse.trim().length > 5) return true;
  if (Array.isArray(section.verses) && section.verses.some((item) => String(item ?? '').trim())) return true;
  return typeof section.chorus === 'string' && section.chorus.trim().length > 5;
}

export function hasReadingDocumentContent(document) {
  return READING_SECTIONS.some((sectionName) => hasReadingSectionContent(document?.[sectionName]));
}

export function removeTrailingParserStub(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (/^[аa]$/iu.test(trimmed)) return null;
  return value
    .replace(/(?:(?:\r?\n)+|(?<=[.!?;:»”]))\s+[аa]\s*$/iu, '')
    .trimEnd();
}

export function removeDuplicatedBiblePrefix(value, bible) {
  if (typeof value !== 'string') return value;
  const reference = String(bible ?? '').trim();
  if (!reference) return value;
  const leadingWhitespace = value.match(/^\s*/)?.[0] ?? '';
  const body = value.slice(leadingWhitespace.length);
  if (!body.startsWith(reference)) return value;
  return body.slice(reference.length).replace(/^[\s,.;:\-–—]+/u, '').trimStart();
}

export function normalizeDayPlaces(value) {
  return normalizePlaces(value).join(',');
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object ?? {}, key);
}

function exactTitleMatch(reading, day) {
  const readingTitle = normalizeReadingTitle(reading?.title);
  const dayTitle = normalizeReadingTitle(day?._title ?? day?._feastName ?? day?.title);
  if (!readingTitle || !dayTitle) return false;
  return readingTitle === dayTitle
    || readingTitle.includes(dayTitle)
    || dayTitle.includes(readingTitle);
}

function dayTitle(day) {
  return day?._title ?? day?._feastName ?? day?.title;
}

function matchingRank(reading, day) {
  if (!hasOwn(reading, '_rank')) return false;
  return normalizeRank(reading?._rank) === normalizeRank(day?._rank ?? day?._feastType);
}

function matchingPlaces(reading, day) {
  if (!hasOwn(reading, '_place')) return false;
  return normalizeDayPlaces(reading?._place) === normalizeDayPlaces(day?._place);
}

export function rankFromSourceCategory(value) {
  const category = String(value ?? '').trim().toLowerCase();
  if (category === 'urachystasci') return 'solemnitas';
  if (category === 'sviaty') return 'festum';
  if (category === 'uspaminy') return 'memoria';
  return '';
}

/**
 * Resolve a readings document to days candidates without relying on its
 * legacy Firestore ID. The result is intentionally conservative: ambiguous
 * fixed-date celebrations stay ambiguous and must not be migrated blindly.
 */
export function findReadingDayCandidates(reading, days) {
  const explicitDayIds = Array.isArray(reading?._dayIds)
    ? reading._dayIds
    : [reading?._dayId].filter(Boolean);
  if (explicitDayIds.length) {
    return days.filter((day) => explicitDayIds.includes(day.id));
  }

  const selector = readingSelector(reading);
  let candidates = days.filter((day) => readingSelector(day) === selector);
  if (candidates.length <= 1 || !selector.startsWith('date:')) return candidates;

  const byTitle = candidates.filter((day) => exactTitleMatch(reading, day));
  if (byTitle.length) candidates = byTitle;
  else if (reading?.title) {
    const scored = candidates.map((day) => ({
      day,
      score: readingTitleSimilarity(reading.title, dayTitle(day)),
    }));
    const maxScore = Math.max(...scored.map((item) => item.score));
    if (maxScore >= 0.55) candidates = scored.filter((item) => item.score === maxScore).map((item) => item.day);
  }
  if (candidates.length <= 1) return candidates;

  if (hasOwn(reading, '_rank')) {
    const byRank = candidates.filter((day) => matchingRank(reading, day));
    if (byRank.length) candidates = byRank;
  } else {
    const inferredRank = rankFromSourceCategory(reading?._sourceCategory);
    if (inferredRank) {
      const byRank = candidates.filter((day) => normalizeRank(day?._rank ?? day?._feastType) === inferredRank);
      if (byRank.length) candidates = byRank;
    }
  }
  if (candidates.length <= 1) return candidates;

  if (hasOwn(reading, '_place')) {
    const byPlace = candidates.filter((day) => matchingPlaces(reading, day));
    if (byPlace.length) candidates = byPlace;
  }

  return candidates;
}

export function readingDayBaseId(day) {
  return String(day?.id ?? '').replace(/--.*$/, '');
}

function commonBaseId(baseIds) {
  const tokenLists = baseIds.map((value) => String(value).split('-'));
  if (!tokenLists.length) return '';
  const common = [];
  const shortest = Math.min(...tokenLists.map((tokens) => tokens.length));
  for (let index = 0; index < shortest; index += 1) {
    const token = tokenLists[0][index];
    if (!tokenLists.every((tokens) => tokens[index] === token)) break;
    common.push(token);
  }
  return common.length >= 3 ? common.join('-') : '';
}

/** Resolve one reading to one or more office templates and a shared ID base. */
export function resolveReadingDayLink(reading, days) {
  const canonical = canonicalizeLegacyReadingMetadata(reading);
  let candidates = findReadingDayCandidates(canonical, days);
  if (!candidates.length) {
    const periodBase = buildPeriodDayId(canonical);
    if (periodBase) return { status: 'mapped', canonical, dayIds: [], baseId: periodBase };

    const feast = normalizeFeastCode(canonical._feast);
    if (feast) return { status: 'mapped', canonical, dayIds: [], baseId: feast };

    const seasonalCategory = String(reading?._sourceCategory ?? '').toLowerCase();
    const seasonalTitle = String(reading?.title ?? '').toLocaleLowerCase('be');
    const seasonalDate = normalizeFixedDate(canonical._date);
    const isChristmas = seasonalCategory === 'bn'
      || seasonalTitle.includes('каляд')
      || seasonalTitle.includes('актав');
    if (seasonalDate && isChristmas) {
      return {
        status: 'mapped',
        canonical,
        dayIds: [],
        baseId: `christmas-${seasonalDate.replace('.', '-')}`,
      };
    }

    return { status: 'unmapped', canonical, dayIds: [], baseId: '' };
  }

  const category = String(reading?._sourceCategory ?? '').toLowerCase();
  const title = String(reading?.title ?? '').toLowerCase();
  const seasonalPrefix = category === 'advent' || title.includes('адвэнт')
    ? 'advent-'
    : category === 'bn' || title.includes('каляд') || title.includes('актав') || title.includes('будзень')
      ? 'christmas-'
      : '';
  if (seasonalPrefix) {
    const seasonal = candidates.filter((day) => readingDayBaseId(day).startsWith(seasonalPrefix));
    if (seasonal.length) candidates = seasonal;
  }

  const baseIds = [...new Set(candidates.map(readingDayBaseId).filter(Boolean))];
  if (baseIds.length === 1) {
    return {
      status: 'mapped',
      canonical,
      dayIds: candidates.map((day) => day.id).sort(),
      baseId: baseIds[0],
    };
  }

  const candidateTitles = new Set(candidates.map((day) => normalizeReadingTitle(dayTitle(day))).filter(Boolean));
  const candidateRanks = new Set(candidates.map((day) => normalizeRank(day?._rank ?? day?._feastType)));
  const sharedBase = commonBaseId(baseIds);
  if (candidateTitles.size === 1 && candidateRanks.size === 1 && sharedBase) {
    return {
      status: 'mapped',
      canonical,
      dayIds: candidates.map((day) => day.id).sort(),
      baseId: sharedBase,
    };
  }

  return {
    status: 'ambiguous',
    canonical,
    dayIds: candidates.map((day) => day.id).sort(),
    baseId: '',
  };
}
