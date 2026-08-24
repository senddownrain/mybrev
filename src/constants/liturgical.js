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
  default: { color: '#55707c', rgb: '85, 112, 124' },
});
