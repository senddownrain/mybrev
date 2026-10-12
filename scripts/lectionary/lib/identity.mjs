/**
 * Normalized liturgical identity of a Catholic.by Lectionary page, from its
 * title (and category). One identity key = one stored `readings` selector:
 *
 *   period:<type>:w<week>:d<dow>[:cycle=A|B|C|I|II]   Sundays and weekdays of a period
 *   date:DD.MM[:rank]                                 fixed celebrations and dated weekdays
 *   special:<slug>                                    Triduum, Easter Vigil, …
 *
 * The title alphabet mixes Latin and Cyrillic look-alikes («Год С», «ІV»);
 * everything is folded to Latin capitals before matching.
 */

const FOLD = { 'А': 'A', 'В': 'B', 'С': 'C', 'І': 'I', 'Ӏ': 'I', 'Е': 'E', 'Н': 'H', 'К': 'K', 'М': 'M', 'О': 'O', 'Р': 'P', 'Т': 'T', 'Х': 'X', 'Ѵ': 'V' };
const fold = (value) => String(value || '').replace(/[А-ЯІӀѴ]/gu, (ch) => FOLD[ch] || ch);

export const MONTHS = Object.freeze({
  студзеня: 1, лютага: 2, сакавіка: 3, красавіка: 4, мая: 5, чэрвеня: 6, ліпеня: 7, жніўня: 8, верасня: 9, кастрычніка: 10, лістапада: 11, снежня: 12,
});
export const WEEKDAYS = Object.freeze({
  нядзеля: 1, панядзелак: 2, аўторак: 3, серада: 4, чацвер: 5, пятніца: 6, субота: 7,
});
const UNITS = ['', 'першы', 'другі', 'трэці', 'чацвёрты', 'пяты', 'шосты', 'сёмы', 'восьмы', 'дзявяты'];
const TEENS = ['дзясяты', 'адзінаццаты', 'дванаццаты', 'трынаццаты', 'чатырнаццаты', 'пятнаццаты', 'шаснаццаты', 'сямнаццаты', 'васемнаццаты', 'дзевятнаццаты'];
const ALIASES = [['дзевяты', 9], ['дзявятнаццаты', 19]];
const ORDINALS = new Map();
UNITS.forEach((word, n) => word && ORDINALS.set(word, n));
TEENS.forEach((word, n) => ORDINALS.set(word, 10 + n));
ALIASES.forEach(([word, n]) => ORDINALS.set(word, n));
ORDINALS.set('дваццаты', 20);
ORDINALS.set('трыццаты', 30);
for (let n = 1; n <= 9; n += 1) {
  ORDINALS.set(`дваццаць ${UNITS[n]}`, 20 + n);
  ORDINALS.set(`трыццаць ${UNITS[n]}`, 30 + n);
}
const ROMAN = new Map();
{
  const numeral = (n) => [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
    .reduce((out, [value, glyph]) => { while (n >= value) { out += glyph; n -= value; } return out; }, '');
  for (let n = 1; n <= 40; n += 1) ROMAN.set(numeral(n), n);
}

const SEASONS = [
  [/адвэнт/iu, 'advent'],
  [/вялікага\s+посту|вялікі\s+пост|папяльц/iu, 'lent'],
  [/велікодн/iu, 'easter'],
  [/звычайн\S*\s+тыдз/iu, 'ordinary'],
  [/актав[еа]\s+нараджэнн|па\s+нараджэнні/iu, 'christmas'],
];

const clean = (value) => String(value || '').replace(/^Catholic\.by\s*-\s*/u, '').replace(/\s+/gu, ' ').trim();
const romanOf = (token) => ROMAN.get(fold(token).toUpperCase().replace(/\s/g, '')) || 0;

const LATIN_LOOKALIKE = { c: 'с', a: 'а', e: 'е', o: 'о', p: 'р', x: 'х', i: 'і', y: 'у' };
const foldWord = (word) => word.replace(/[caeopxiy]/g, (ch) => LATIN_LOOKALIKE[ch]);

function ordinalOf(text) {
  const words = text.toLowerCase().split(/\s+/).map(foldWord);
  for (let i = 0; i < words.length; i += 1) {
    const pair = `${words[i]} ${words[i + 1] || ''}`.trim();
    if (ORDINALS.has(pair)) return ORDINALS.get(pair);
    if (ORDINALS.has(words[i])) return ORDINALS.get(words[i]);
  }
  return 0;
}

export function seasonOf(text) {
  const hit = SEASONS.find(([pattern]) => pattern.test(text));
  return hit ? hit[1] : '';
}

/**
 * @returns {{ kind: 'period'|'date'|'special'|'unknown', key: string, season?, week?, dow?, cycle?, date?, rank?, heading: string }}
 */
export function pageIdentity(rawTitle) {
  const heading = clean(rawTitle);
    // 15 ліпеня — успамін …
  const dated = /^(\d{1,2})\s+([а-яёўіі]+)\s+[—–-]\s*(.*)$/iu.exec(heading);
  if (dated && MONTHS[dated[2].toLowerCase()]) {
    const date = `${String(dated[1]).padStart(2, '0')}.${String(MONTHS[dated[2].toLowerCase()]).padStart(2, '0')}`;
    const rest = dated[3];
    let rank = '';
    if (/^успамін/iu.test(rest) || /\bуспамін\b/iu.test(rest)) rank = 'memorial';
    else if (/^свят[ао]/iu.test(rest) || /\bсвята\b/iu.test(rest) && !/урачыстасць/iu.test(rest)) rank = 'feast';
    else if (/урачыстасць/iu.test(rest)) rank = 'solemnity';
    else if (/гадавіна/iu.test(rest)) rank = 'dedication';
    else if (/^будзень|будзень$/iu.test(rest)) rank = 'weekday';
    else if (/звычайны\s+дзень\s+адвэнту/iu.test(rest)) rank = 'advent-weekday';
    else if (/дзень\s+у\s+актаве/iu.test(rest)) rank = 'octave-day';
    return { kind: 'date', date, rank, key: `date:${date}${rank ? `:${rank}` : ''}`, heading, rest };
  }
  if (/^(?:ІІ|II)\s+Нядзеля\s+пасля\s+Нараджэння\s+Пана$/iu.test(heading)) return { kind: 'period', season: 'christmas', week: 2, dow: 1, cycle: '', key: 'period:christmas:w2:d1', heading };
  const special = specialIdentity(heading);
  if (special) return { ...special, heading };
  const R = '[IVXІӀХ]+';
  // ІІ Нядзеля Адвэнту, Год A / VIII Звычайная нядзеля, Год С / ІІ Велікодная нядзеля, Год А
  const sunday = new RegExp(`^(${R})\\s+(Нядзеля|Звычайная нядзеля|Велікодная нядзеля)\\s*(.*?)(?:,\\s*Год\\s+([ABCАВС]))?$`, 'iu').exec(heading);
  if (sunday) {
    const week = romanOf(sunday[1]);
    const kind = sunday[2].toLowerCase();
    const season = kind.startsWith('звычайн') ? 'ordinary' : kind.startsWith('велікодн') ? 'easter' : (seasonOf(heading) || (/посту/i.test(heading) ? 'lent' : ''));
    const cycle = sunday[4] ? fold(sunday[4]).toUpperCase() : '';
    if (week && season) return { kind: 'period', season, week, dow: 1, cycle, key: `period:${season}:w${week}:d1${cycle ? `:cycle=${cycle}` : ''}`, heading };
  }
  // Панядзелак — Першы тыдзень Адвэнту / Чацвер — ІІ Тыдзень Вялікага посту / Субота пасля Папяльца
  const weekday = /^(Нядзеля|Панядзелак|Аўторак|Серада|Чацвер|Пятніца|Субота)(?=\s|$)\s*(?:[—–-]\s*)?(.*)$/iu.exec(heading);
  if (weekday) {
    const dow = WEEKDAYS[weekday[1].toLowerCase()];
    const rest = weekday[2];
    const season = seasonOf(rest);
    const roman = new RegExp(`^(${R})\\s+(?:Тыдзень|Велікодны)`, 'iu').exec(rest);
    const week = roman ? romanOf(roman[1]) : ordinalOf(rest);
    if (/пасля\s+папяльц/iu.test(rest)) return { kind: 'period', season: 'lent', week: 0, dow, key: `period:lent:w0:d${dow}`, heading };
    if (/^[уў]\s+актаве\s+Пасхі/iu.test(rest)) return { kind: 'period', season: 'easter', week: 1, dow, key: `period:easter:w1:d${dow}`, heading };
    if (season && week) return { kind: 'period', season, week, dow, key: `period:${season}:w${week}:d${dow}`, heading };
  }
  return { kind: 'unknown', key: '', heading };
}

/** Pages whose identity is a named celebration (movable feasts, Triduum, Easter). */
const SPECIAL = [
  [/Найсвяцейшай\s+Тройцы/iu, 'feast', 'trinity'], [/Цела\s+і\s+Крыві/iu, 'feast', 'corpuschristi'],
  [/Сэрца\s+Пана\s+Езуса/iu, 'feast', 'heartofjesus'], [/Валадара\s+Сусвету/iu, 'feast', 'christking'],
  [/Унебаўшэсця/iu, 'feast', 'ascension'], [/Святой\s+Сям/iu, 'feast', 'holyfamily'],
  [/Хросту\s+Пана/iu, 'feast', 'buptismofthelord'], [/Найвышэйшага\s+і\s+Вечнага\s+Святара/iu, 'feast', 'christthehighpriest'],
  [/Беззаганнага\s+Сэрца/iu, 'feast', 'heartofmary'], [/Маці\s+Касцёла/iu, 'feast', 'marymotherchurch'],
  [/Папяльцовая\s+серада/iu, 'feast', 'ash'], [/Пальмовая\s+нядзеля/iu, 'feast', 'palmsunday'],
  [/Нядзеля\s+Спаслання\s+Духа/iu, 'feast', 'pentecost'], [/Велікодная\s+нядзеля\s*\(Імша\s+ўдзень\)/iu, 'feast', 'eastersunday'],
  [/^Спасланне\s+Духа\s+Святога$/iu, 'period', 'easter:w7:d7:vigil'],
  [/Вялікі\s+чацвер\s*\(Імша\s+Хрызма\)/iu, 'period', 'holyweek:w1:d5:chrism'],
  [/Вялікі\s+чацвер\s*\(Імша\s+Вячэры/iu, 'period', 'holyweek:w1:d5:evening'],
  [/Вялікая\s+пятніца/iu, 'period', 'holyweek:w1:d6'], [/Пасхальная\s+вігілія/iu, 'period', 'holyweek:w1:d7:vigil'],
  [/Вялікі\s+панядзелак/iu, 'period', 'holyweek:w1:d2'], [/Вялікі\s+аўторак/iu, 'period', 'holyweek:w1:d3'], [/Вялікая\s+серада/iu, 'period', 'holyweek:w1:d4'],
];

function specialIdentity(heading) {
  for (const [pattern, kind, code] of SPECIAL) {
    if (!pattern.test(heading)) continue;
    const cycle = /Год\s+([ABCАВС])\s*$/iu.exec(heading)?.[1];
    const cycleKey = cycle ? fold(cycle).toUpperCase() : '';
    if (kind === 'feast') return { kind: 'feast', code, cycle: cycleKey, key: `feast:${code}${cycleKey ? `:cycle=${cycleKey}` : ''}` };
    const [season, week, dow, variant] = code.split(':');
    return { kind: 'period', season, week: Number(week.slice(1)), dow: Number(dow.slice(1)), variant: variant || '', key: `period:${season}:${week}:${dow}${variant ? `:${variant}` : ''}` };
  }
  return null;
}

/** Selector of a stored `readings` document (same space as pageIdentity().key without cycle). */
export function docSelector(doc) {
  const date = String(doc._date || '').trim();
  if (date) return `date:${date}`;
  if (doc._feast) return `feast:${String(doc._feast).replace(/^feast-/, '')}`;
  if (doc._periodType && Number.isInteger(Number(doc._periodWeekNumber)) && Number.isInteger(Number(doc._dayOfWeek))) {
    return `period:${doc._periodType}:w${Number(doc._periodWeekNumber)}:d${Number(doc._dayOfWeek)}`;
  }
  return '';
}
