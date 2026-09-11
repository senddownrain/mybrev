const book = (key, id, name, chapterCount, testament = 'old') => ({
  key,
  id,
  name,
  chapterCount,
  testament,
});

export const BIBLE_LANGUAGES = Object.freeze({
  bel: Object.freeze({
    id: 'bel',
    shortLabel: 'БЕЛ',
    label: 'Беларуская',
    collection: 'bible_bel',
    oldTestamentTranslation: 'А. Бокун',
    newTestamentTranslation: 'catholic.by - афіцыйны пераклад',
  }),
  ru: Object.freeze({
    id: 'ru',
    shortLabel: 'РУС',
    label: 'Русский',
    collection: 'bible_ru',
    translation: 'Синодальный перевод',
  }),
});

const BEL_OLD = [
  book('gen', 'gn', 'Быццё', 50),
  book('exo', 'ex', 'Зыход', 40),
  book('lev', 'lv', 'Левіт', 27),
  book('num', 'nm', 'Лікі', 36),
  book('deu', 'dt', 'Другазаконне', 34),
  book('jos', 'js', 'Кніга Ісуса Навіна', 24),
  book('jdg', 'jdg', 'Кніга Суддзяў', 21),
  book('rut', 'rt', 'Кніга Руты', 4),
  book('1sa', '1sm', '1-я Кніга Самуіла', 31),
  book('2sa', '2sm', '2-я Кніга Самуіла', 24),
  book('1ki', '1kgs', '1-я Кніга Цароў', 22),
  book('2ki', '2kgs', '2-я Кніга Цароў', 25),
  book('1ch', '1ch', '1-я Кніга Хронікаў', 29),
  book('2ch', '2ch', '2-я Кніга Хронікаў', 36),
  book('ezr', 'ezr', 'Кніга Ездры', 10),
  book('neh', 'ne', 'Кніга Неемія', 13),
  book('est', 'et', 'Кніга Эсфіры', 10),
  book('job', 'job', 'Кніга Іова', 42),
  book('psa', 'ps', 'Псалмы', 150),
  book('pro', 'prv', 'Прыпавесці', 31),
  book('ecc', 'ec', 'Экклезіяст', 12),
  book('sng', 'so', 'Песня Песняў', 8),
  book('isa', 'is', 'Ісая', 66),
  book('jer', 'jr', 'Ераміяш', 52),
  book('lam', 'lm', 'Плач Ерамія', 5),
  book('ezk', 'ez', 'Езэкіэль', 48),
  book('dan', 'dn', 'Данііл', 12),
  book('hos', 'ho', 'Осія', 14),
  book('jol', 'jl', 'Іоіль', 3),
  book('amo', 'am', 'Амос', 9),
  book('oba', 'ob', 'Авдзій', 1),
  book('jon', 'jon', 'Іона', 4),
  book('mic', 'mi', 'Міхей', 7),
  book('nam', 'na', 'Наум', 3),
  book('hab', 'hk', 'Аввакум', 3),
  book('zep', 'zp', 'Сафонія', 3),
  book('hag', 'hg', 'Аггей', 2),
  book('zec', 'zc', 'Захарыя', 14),
  book('mal', 'ml', 'Малахія', 4),
];

const BEL_NEW = [
  book('mat', 'mt', 'Евангелле паводле святога Мацвея', 28, 'new'),
  book('mrk', 'mk', 'Евангелле паводле святога Марка', 16, 'new'),
  book('luk', 'lk', 'Евангелле паводле святога Лукі', 24, 'new'),
  book('jhn', 'jn', 'Евангелле паводле святога Яна', 21, 'new'),
  book('act', 'acts', 'Дзеі Апосталаў', 28, 'new'),
  book('rom', 'rom', 'Пасланне да Рымлянаў', 16, 'new'),
  book('1co', '1co', 'Першае пасланне да Карынцянаў', 16, 'new'),
  book('2co', '2co', 'Другое пасланне да Карынцянаў', 13, 'new'),
  book('gal', 'gal', 'Пасланне да Галатаў', 6, 'new'),
  book('eph', 'eph', 'Пасланне да Эфесцаў', 6, 'new'),
  book('php', 'php', 'Пасланне да Філіпянаў', 4, 'new'),
  book('col', 'col', 'Пасланне да Каласянаў', 4, 'new'),
  book('1th', '1th', 'Першае пасланне да Тэсаланікійцаў', 5, 'new'),
  book('2th', '2th', 'Другое пасланне да Тэсаланікійцаў', 3, 'new'),
  book('1ti', '1ti', 'Першае пасланне да Цімафея', 6, 'new'),
  book('2ti', '2ti', 'Другое пасланне да Цімафея', 4, 'new'),
  book('tit', 'tit', 'Пасланне да Ціта', 3, 'new'),
  book('phm', 'phm', 'Пасланне да Філімона', 1, 'new'),
  book('heb', 'heb', 'Пасланне да Габрэяў', 13, 'new'),
  book('jas', 'jas', 'Пасланне святога Якуба', 5, 'new'),
  book('1pe', '1pe', 'Першае пасланне святога Пятра', 5, 'new'),
  book('2pe', '2pe', 'Другое пасланне святога Пятра', 3, 'new'),
  book('1jn', '1jn', 'Першае пасланне святога Яна', 5, 'new'),
  book('2jn', '2jn', 'Другое пасланне святога Яна', 1, 'new'),
  book('3jn', '3jn', 'Трэцяе пасланне святога Яна', 1, 'new'),
  book('jud', 'jud', 'Пасланне святога Юды', 1, 'new'),
  book('rev', 'rev', 'Апакаліпсіс святога Яна', 22, 'new'),
];

const RU_OLD = [
  book('gen', 'gn', 'Бытие', 50), book('exo', 'ex', 'Исход', 40),
  book('lev', 'lv', 'Левит', 27), book('num', 'nm', 'Числа', 36),
  book('deu', 'dt', 'Второзаконие', 34), book('jos', 'js', 'Иисус Навин', 24),
  book('jdg', 'jud', 'Судьи', 21), book('rut', 'rt', 'Руфь', 4),
  book('1sa', '1sm', '1 Царств', 31), book('2sa', '2sm', '2 Царств', 24),
  book('1ki', '1kgs', '3 Царств', 22), book('2ki', '2kgs', '4 Царств', 25),
  book('1ch', '1ch', '1 Паралипоменон', 29), book('2ch', '2ch', '2 Паралипоменон', 36),
  book('ezr', 'ezr', 'Ездра', 10), book('neh', 'ne', 'Неемия', 13),
  book('tob', 'tob', 'Товит', 14), book('jdt', 'jdt', 'Иудифь', 16),
  book('est', 'et', 'Есфирь', 16), book('1ma', '1mac', '1 Маккавейская', 16),
  book('2ma', '2mac', '2 Маккавейская', 15), book('job', 'job', 'Иов', 42),
  book('psa', 'ps', 'Псалтирь', 151), book('pro', 'prv', 'Притчи', 31),
  book('ecc', 'ec', 'Екклесиаст', 12), book('sng', 'so', 'Песня Песней', 8),
  book('wis', 'wis', 'Премудрость Соломона', 19), book('sir', 'sir', 'Сирах', 51),
  book('isa', 'is', 'Исаия', 66), book('jer', 'jr', 'Иеремия', 52),
  book('lam', 'lm', 'Плач Иеремии', 5), book('bar', 'bar', 'Варух', 6),
  book('ezk', 'ez', 'Иезекииль', 48), book('dan', 'dn', 'Даниил', 14),
  book('hos', 'ho', 'Осия', 14), book('jol', 'jl', 'Иоиль', 3),
  book('amo', 'am', 'Амос', 9), book('oba', 'ob', 'Авдий', 1),
  book('jon', 'jn', 'Иона', 4), book('mic', 'mi', 'Михей', 7),
  book('nam', 'na', 'Наум', 3), book('hab', 'hk', 'Аввакум', 3),
  book('zep', 'zp', 'Софония', 3), book('hag', 'hg', 'Аггей', 2),
  book('zec', 'zc', 'Захария', 14), book('mal', 'ml', 'Малахия', 4),
];

const RU_NEW = [
  book('mat', 'mt', 'Евангелие от Матфея', 28, 'new'),
  book('mrk', 'mk', 'Евангелие от Марка', 16, 'new'),
  book('luk', 'lk', 'Евангелие от Луки', 24, 'new'),
  book('jhn', 'jo', 'Евангелие от Иоанна', 21, 'new'),
  book('act', 'act', 'Деяния Апостолов', 28, 'new'),
  book('rom', 'rm', 'Римлянам', 16, 'new'),
  book('1co', '1co', '1 Коринфянам', 16, 'new'),
  book('2co', '2co', '2 Коринфянам', 13, 'new'),
  book('gal', 'gl', 'Галатам', 6, 'new'),
  book('eph', 'eph', 'Ефесянам', 6, 'new'),
  book('php', 'ph', 'Филиппийцам', 4, 'new'),
  book('col', 'cl', 'Колоссянам', 4, 'new'),
  book('1th', '1ts', '1 Фессалоникийцам', 5, 'new'),
  book('2th', '2ts', '2 Фессалоникийцам', 3, 'new'),
  book('1ti', '1tm', '1 Тимофею', 6, 'new'),
  book('2ti', '2tm', '2 Тимофею', 4, 'new'),
  book('tit', 'tt', 'Титу', 3, 'new'),
  book('phm', 'phm', 'Филимону', 1, 'new'),
  book('heb', 'hb', 'Евреям', 13, 'new'),
  book('jas', 'jm', 'Иакова', 5, 'new'),
  book('1pe', '1pe', '1 Петра', 5, 'new'),
  book('2pe', '2pe', '2 Петра', 3, 'new'),
  book('1jn', '1jo', '1 Иоанна', 5, 'new'),
  book('2jn', '2jo', '2 Иоанна', 1, 'new'),
  book('3jn', '3jo', '3 Иоанна', 1, 'new'),
  book('jud', 'jd', 'Иуды', 1, 'new'),
  book('rev', 're', 'Откровение', 22, 'new'),
];

export const BIBLE_BOOK_SHORT_NAMES = Object.freeze({
  bel: Object.freeze({
    gen: 'Быц', exo: 'Зых', lev: 'Лев', num: 'Лікі', deu: 'Дрг',
    jos: 'Нав', jdg: 'Суд', rut: 'Рут', '1sa': '1 Сам', '2sa': '2 Сам',
    '1ki': '1 Цар', '2ki': '2 Цар', '1ch': '1 Хр', '2ch': '2 Хр',
    ezr: 'Езд', neh: 'Нээм', est: 'Эст', job: 'Іоў', psa: 'Пс',
    pro: 'Прып', ecc: 'Экл', sng: 'Пп', isa: 'Іс', jer: 'Ер', lam: 'Пл',
    ezk: 'Эз', dan: 'Дан', hos: 'Ос', jol: 'Ёіл', amo: 'Ам', oba: 'Аўдз',
    jon: 'Ён', mic: 'Міх', nam: 'Навм', hab: 'Абк', zep: 'Саф', hag: 'Аг',
    zec: 'Зах', mal: 'Мал', mat: 'Мц', mrk: 'Мк', luk: 'Лк', jhn: 'Ян',
    act: 'Дзеі', rom: 'Рым', '1co': '1 Кар', '2co': '2 Кар', gal: 'Гал',
    eph: 'Эф', php: 'Флп', col: 'Клс', '1th': '1 Тэс', '2th': '2 Тэс',
    '1ti': '1 Цім', '2ti': '2 Цім', tit: 'Ціт', phm: 'Флм', heb: 'Гбр',
    jas: 'Як', '1pe': '1 П', '2pe': '2 П', '1jn': '1 Ян', '2jn': '2 Ян',
    '3jn': '3 Ян', jud: 'Юд', rev: 'Ап',
  }),
  ru: Object.freeze({
    gen: 'Быт', exo: 'Исх', lev: 'Лев', num: 'Чис', deu: 'Втор',
    jos: 'Нав', jdg: 'Суд', rut: 'Руф', '1sa': '1 Цар', '2sa': '2 Цар',
    '1ki': '3 Цар', '2ki': '4 Цар', '1ch': '1 Пар', '2ch': '2 Пар',
    ezr: 'Езд', neh: 'Неем', tob: 'Тов', jdt: 'Иудф', est: 'Есф',
    '1ma': '1 Мак', '2ma': '2 Мак', job: 'Иов', psa: 'Пс', pro: 'Прит',
    ecc: 'Еккл', sng: 'Песн', wis: 'Прем', sir: 'Сир', isa: 'Ис', jer: 'Иер',
    lam: 'Плач', bar: 'Вар', ezk: 'Иез', dan: 'Дан', hos: 'Ос', jol: 'Иоил',
    amo: 'Ам', oba: 'Авд', jon: 'Ион', mic: 'Мих', nam: 'Наум', hab: 'Авв',
    zep: 'Соф', hag: 'Агг', zec: 'Зах', mal: 'Мал', mat: 'Мф', mrk: 'Мк',
    luk: 'Лк', jhn: 'Ин', act: 'Деян', rom: 'Рим', '1co': '1 Кор',
    '2co': '2 Кор', gal: 'Гал', eph: 'Еф', php: 'Флп', col: 'Кол',
    '1th': '1 Фес', '2th': '2 Фес', '1ti': '1 Тим', '2ti': '2 Тим',
    tit: 'Тит', phm: 'Флм', heb: 'Евр', jas: 'Иак', '1pe': '1 Пет',
    '2pe': '2 Пет', '1jn': '1 Ин', '2jn': '2 Ин', '3jn': '3 Ин',
    jud: 'Иуд', rev: 'Откр',
  }),
});

function withShortNames(language, books) {
  return books.map((item) => Object.freeze({
    ...item,
    shortName: BIBLE_BOOK_SHORT_NAMES[language][item.key] || item.name,
  }));
}

export const BIBLE_BOOKS = Object.freeze({
  bel: Object.freeze(withShortNames('bel', [...BEL_OLD, ...BEL_NEW])),
  ru: Object.freeze(withShortNames('ru', [...RU_OLD, ...RU_NEW])),
});

export const BIBLE_HIGHLIGHT_COLORS = Object.freeze([
  { id: 'amber', label: 'Залаты' },
  { id: 'rose', label: 'Ружовы' },
  { id: 'sky', label: 'Блакітны' },
  { id: 'leaf', label: 'Зялёны' },
]);

export function getBibleBook(language, bookId) {
  return BIBLE_BOOKS[language]?.find((item) => item.id === bookId) || null;
}

export function getParallelBibleBook(fromLanguage, bookId, toLanguage) {
  const source = getBibleBook(fromLanguage, bookId);
  return source
    ? BIBLE_BOOKS[toLanguage]?.find((item) => item.key === source.key) || null
    : null;
}
