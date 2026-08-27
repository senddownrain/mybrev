export const PERIOD_LABEL_MAP = {
  ordinary: 'Звычайны перыяд',
  advent: 'Адвэнт',
  lent: 'Вялікі пост',
  easter: 'Велікодны перыяд',
  christmas: 'Перыяд Божага Нараджэння',
  holyweek: 'Вялікі тыдзень',
};

export const WEEKDAY_LABEL_MAP = {
  1: 'Нядзеля',
  2: 'Панядзелак',
  3: 'Аўторак',
  4: 'Серада',
  5: 'Чацвер',
  6: 'Пятніца',
  7: 'Субота',
};

/** Кананічныя значэнні поля _rank. */
export const LITURGICAL_RANK = Object.freeze({
  SOLEMNITY: 'solemnitas',
  FEAST: 'festum',
  MEMORIAL: 'memoria',
  OPTIONAL_MEMORIAL: 'memoria-ad-libitum',
});

/** Ранг (_rank, а таксама стары _feastType) → подпіс для UI. */
export const RANK_LABEL_MAP = Object.freeze({
  [LITURGICAL_RANK.SOLEMNITY]: 'Урачыстасць',
  [LITURGICAL_RANK.FEAST]: 'Свята',
  [LITURGICAL_RANK.MEMORIAL]: 'Успамін',
  [LITURGICAL_RANK.OPTIONAL_MEMORIAL]: 'Неабавязковы ўспамін',
  // Часовая сумяшчальнасць са старымі дакументамі days.
  solemnity: 'Урачыстасць',
  feast: 'Свята',
  memorial: 'Успамін',
});

/** @deprecated Новы код павінен выкарыстоўваць RANK_LABEL_MAP. */
export const FEAST_TYPE_LABEL_MAP = RANK_LABEL_MAP;

/** Назва дыяцэзіі/мясцовага календара → стабільны код для _place і ID. */
export const PLACE_CODE_MAP = Object.freeze({
  'гродзенская дыяцэзія': 'grodno',
  'гродзенскай дыяцэзіі': 'grodno',
  'віцебская дыяцэзія': 'vitebsk',
  'віцебскай дыяцэзіі': 'vitebsk',
  'пінская дыяцэзія': 'pinsk',
  'пінскай дыяцэзіі': 'pinsk',
  'мінска-магілёўская архідыяцэзія': 'minsk-mohilev',
  'мінска-магілёўскай архідыяцэзіі': 'minsk-mohilev',
});

export const PLACE_LABEL_MAP = Object.freeze({
  grodno: 'Гродзенская дыяцэзія',
  vitebsk: 'Віцебская дыяцэзія',
  pinsk: 'Пінская дыяцэзія',
  'minsk-mohilev': 'Мінска-Магілёўская архідыяцэзія',
});

/** Службовыя інструкцыі, якія resolver замяняе тэкстамі з іншай крыніцы. */
export const LITURGICAL_VALUE_REFERENCE = Object.freeze({
  FROM_DAY: 'from-day',
  FROM_FIRST_WEEK: 'from-first-week',
  FROM_OWN_TEXTS: 'from-own-texts',
});

/** Крыніца опцыі літургічнага дня (period / dynamic / fixed) */
export const LITURGICAL_OPTION_SOURCE = {
  PERIOD: 'period',
  DYNAMIC: 'dynamic',
  FIXED: 'fixed',
  OFFICE_FOR_DEAD: 'office-for-dead',
};

/** Колеры перыядаў для UI (chips, borders) */
export const PERIOD_COLORS = {
  ordinary: 'success',
  advent: 'purple',
  christmas: 'amber',
  lent: 'purple',
  holyweek: 'purple',
  easter: 'amber',
};

/** Адзіная палітра перыядаў для вялікіх UI-блокаў і каляровых акцэнтаў. */
export const LITURGICAL_THEME_MAP = Object.freeze({
  ordinary: { color: '#4d8a5b', rgb: '77, 138, 91' },
  advent: { color: '#7a57a7', rgb: '122, 87, 167' },
  lent: { color: '#6f4a92', rgb: '111, 74, 146' },
  holyweek: { color: '#5b3b83', rgb: '91, 59, 131' },
  christmas: { color: '#b07a1e', rgb: '176, 122, 30' },
  easter: { color: '#bd8a24', rgb: '189, 138, 36' },
  gold: { color: '#b88719', rgb: '218, 174, 70' },
  white: { color: '#8f7d52', rgb: '246, 243, 234' },
  red: { color: '#b33a3a', rgb: '179, 58, 58' },
  marian: { color: '#5e9ec5', rgb: '94, 158, 197' },
  requiem: { color: '#67546b', rgb: '103, 84, 107' },
  default: { color: '#55707c', rgb: '85, 112, 124' },
});

const SOLEMNITY_RANKS = new Set([
  LITURGICAL_RANK.SOLEMNITY,
  'solemnity',
  'урачыстасць',
  'ўрачыстасць',
]);

const FEAST_RANKS = new Set([
  LITURGICAL_RANK.FEAST,
  'feast',
  'свята',
]);

const MEMORIAL_RANKS = new Set([
  LITURGICAL_RANK.MEMORIAL,
  LITURGICAL_RANK.OPTIONAL_MEMORIAL,
  'memorial',
  'memory',
  'успамін',
  'неабавязковы ўспамін',
]);

const RED_FEAST_CODES = new Set([
  'pentecost',
  'heartofjesus',
]);

const MARIAN_TEMPLATE = 'blessed-virgin-mary';

const normalizeRank = (day) => String(day?._rank || day?._feastType || day?.rank || '')
  .trim()
  .toLocaleLowerCase('be-BY');

const normalizeFeastCode = (day) => String(day?._feast || '')
  .trim()
  .toLowerCase()
  .replace(/^feast-/, '');

const hasMarianTemplate = (day) => (Array.isArray(day?._templates) ? day._templates : [])
  .some((template) => String(template).trim().toLowerCase() === MARIAN_TEMPLATE);

const celebrationText = (day) => [
  day?._feastName,
  day?._title,
  day?.title,
  day?._currentVersion,
  ...(Array.isArray(day?._templates) ? day._templates : []),
]
  .filter(Boolean)
  .join(' ')
  .toLocaleLowerCase('be-BY');

/** Return the celebration rank group used by ordering and visual themes. */
export function getLiturgicalCelebrationRank(day) {
  const rank = normalizeRank(day);
  if (SOLEMNITY_RANKS.has(rank)) return 'solemnity';
  if (FEAST_RANKS.has(rank)) return 'feast';
  return '';
}

/**
 * Resolve the visual family of a liturgical celebration.
 * Red has precedence over rank colors for martyrs, apostles, Pentecost and Sacred Heart.
 */
export function getLiturgicalCelebrationThemeKey(day) {
  if (!day) return '';
  const text = celebrationText(day);
  const feastCode = normalizeFeastCode(day);
  const isMartyr = /мучан/u.test(text) || /(?:^|\s)martyrs?(?:\s|$)/u.test(text);
  const isApostle = /апостал/u.test(text) || /(?:^|\s)apostles?(?:\s|$)/u.test(text);
  const isRedSolemnity = RED_FEAST_CODES.has(feastCode)
    || /спасланн\p{L}*\s+(?:святога\s+духа|духа\s+святога)/u.test(text)
    || /сэрц\p{L}*\s+(?:пана\s+)?езус/u.test(text);

  if (isMartyr || isApostle || isRedSolemnity) return 'red';
  const rank = getLiturgicalCelebrationRank(day);
  if (rank === 'solemnity') return 'gold';
  if (normalizeRank(day) && hasMarianTemplate(day)) return 'marian';
  if (rank === 'feast' || MEMORIAL_RANKS.has(normalizeRank(day))) return 'white';
  return '';
}

/** Celebration-aware theme with the regular period as fallback. */
export function getLiturgicalTheme(day, fallbackPeriodType = 'default') {
  if (day?._theme === 'requiem' || day?._kind === 'office-for-dead') {
    return LITURGICAL_THEME_MAP.requiem;
  }
  const celebrationTheme = getLiturgicalCelebrationThemeKey(day);
  return LITURGICAL_THEME_MAP[celebrationTheme]
    || LITURGICAL_THEME_MAP[day?._periodType || fallbackPeriodType]
    || LITURGICAL_THEME_MAP.default;
}

/** Theme for the calendar day itself, without a lower-rank celebration accent. */
export function getLiturgicalPeriodTheme(day, fallbackPeriodType = 'default') {
  if (day?._theme === 'requiem' || day?._kind === 'office-for-dead') {
    return LITURGICAL_THEME_MAP.requiem;
  }
  return LITURGICAL_THEME_MAP[day?._contextPeriodType || day?._periodType || fallbackPeriodType]
    || LITURGICAL_THEME_MAP.default;
}

/** Lower values are displayed first; other liturgical days keep their source order. */
export function getLiturgicalCelebrationPriority(day) {
  const rank = getLiturgicalCelebrationRank(day);
  if (rank === 'solemnity') return 0;
  if (rank === 'feast') return 1;
  return 2;
}
