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

/** Ранг свята (_feastType) → подпіс для UI */
export const FEAST_TYPE_LABEL_MAP = {
  solemnity: 'Урачыстасць',
  feast: 'Свята',
  memorial: 'Успамін',
};

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
