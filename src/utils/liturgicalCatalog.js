/** Year-independent definitions and semantic positions. No calendar decisions here. */
import { buildCalendarLayers } from './ordo/layers.js';
import { dateRuleOf } from './ordo/definitions.js';
import { PERIOD_LABEL_MAP, PLACE_LABEL_MAP, RANK_LABEL_MAP, WEEKDAY_LABEL_MAP } from '../constants/liturgical.js';

const pad = (n) => String(n).padStart(2, '0');
const ANCHORS = Object.freeze({ easterSunday: 'Вялікадня', pentecost: 'Спаслання Духа Святога', firstAdventSunday: 'I нядзелі Адвэнту', christmas: 'Божага Нараджэння', epiphany: 'Аб’яўлення Пана' });
const NAMED = Object.freeze({ ascension: 'Унебаўшэсце паводле календара краіны', corpusChristi: 'Цела і Кроў Хрыста паводле календара краіны', holyFamily: 'Нядзеля Святой Сям’і', baptismOfLord: 'Хрост Пана паводле календара краіны' });

export function catalogDateLabel(rule) {
  if (rule?.type === 'fixed') return `${pad(rule.day)}.${pad(rule.month)}`;
  if (rule?.type === 'named') return NAMED[rule.rule] || 'Рухомая дата';
  if (rule?.type === 'movable') return `${Number(rule.offsetDays) || 0} дзён ад ${ANCHORS[rule.anchor] || 'літургічнай падзеі'}`;
  if (rule?.type === 'last-weekday-of-month') return `Апошні дзень: ${WEEKDAY_LABEL_MAP[(rule.isoWeekday % 7) + 1]}, месяц ${rule.month}`;
  return '';
}

/** Merge only definitions identical in ALL product fields, retaining diocesan differences. */
export function feastCatalog(dioceses = ['minsk-mohilev']) {
  const rows = new Map();
  [...new Set(dioceses)].forEach((diocese) => {
    buildCalendarLayers({ diocese }).celebrations.forEach((definition) => {
      if (!definition.id || !definition.date || definition.suppressedBy) return;
      const { layerTrail: _trail, inheritedFrom: _inherited, dioceseId: _diocese, ...identity } = definition;
      const signature = JSON.stringify(identity);
      const row = rows.get(signature) || {
        ...structuredClone(definition), kind: 'feast', scope: definition.layer,
        dateRule: dateRuleOf(definition.date), dioceses: [],
      };
      row.dioceses.push(diocese);
      rows.set(signature, row);
    });
  });
  return [...rows.values()].map((entry) => ({
    ...entry, key: `${entry.id}:${entry.dioceses.join(',')}`,
    dateLabel: catalogDateLabel(entry.dateRule), rankLabel: RANK_LABEL_MAP[entry.rank] || '',
    placeLabels: entry.dioceses.map((id) => PLACE_LABEL_MAP[id] || id),
  })).sort((a, b) => {
    const key = (e) => e.dateRule.type === 'fixed' ? e.dateRule.month * 100 + e.dateRule.day : 10000;
    return key(a) - key(b) || a.title.localeCompare(b.title, 'be');
  });
}

export function catalogMatches(entry, query = '', filter = 'all') {
  if (filter === 'fixed' && entry.dateRule?.type !== 'fixed') return false;
  if (filter === 'dynamic' && entry.dateRule?.type === 'fixed') return false;
  // A typed year qualifies a nominal date; it never filters out impeded celebrations.
  const normalized = query.trim().toLocaleLowerCase('be').replace(/(\d{2}\.\d{2})\.\d{4}/g, '$1');
  return [entry.title, entry.dateLabel, entry.rankLabel, ...(entry.placeLabels || [])]
    .join(' ').toLocaleLowerCase('be').includes(normalized);
}

export function periodCatalog() {
  const entries = [];
  const definitions = [...buildCalendarLayers().celebrations.values()];
  const weekly = (periodKey, week, weekday) => {
    const id = `${periodKey}-w${week}-d${weekday}`;
    entries.push({ id: `period:${id}`, key: `period:${id}`, kind: 'period', periodKey, week, weekday,
      title: `${PERIOD_LABEL_MAP[periodKey]} · ${week} тыдзень · ${WEEKDAY_LABEL_MAP[weekday]}`,
      daysRef: { id }, readingsRef: { _periodType: periodKey, _periodWeekNumber: week === 0 ? [0, null] : week, _dayOfWeek: weekday },
    });
  };
  for (const [period, count] of Object.entries({ advent: 4, lent: 5, holyweek: 1, easter: 7, ordinary: 34 })) {
    for (let week = 1; week <= count; week += 1) for (let day = 1; day <= 7; day += 1) weekly(period, week, day);
  }
  for (let day = 4; day <= 7; day += 1) weekly('lent', 0, day);
  weekly('easter', 8, 1); // Pentecost, according to Ordo's actual week identity.
  for (const week of [1, 2]) weekly('christmas', week, 1);
  const special = (periodKey, month, day) => {
    const specialDateKey = `${pad(day)}.${pad(month)}`;
    const id = `${periodKey}-${pad(day)}-${pad(month)}`;
    const fixedSourceRefs = definitions
      .filter((item) => item.date?.type === 'fixed' && item.date.month === month && item.date.day === day
        && (item.temporal || (periodKey === 'christmas' && [25, 26, 27, 28].includes(day) && month === 12) || (month === 1 && [1, 6].includes(day))))
      .map((item) => item.daysRef).filter(Boolean);
    entries.push({ id: `period:${id}`, key: `period:${id}`, kind: 'period', periodKey, specialDateKey, fixedSourceRefs,
      title: `${PERIOD_LABEL_MAP[periodKey]} · ${specialDateKey}`,
      daysRef: { id }, readingsRef: { _date: specialDateKey, dateOnly: true },
    });
  };
  for (let day = 17; day <= 24; day += 1) special('advent', 12, day);
  for (let day = 25; day <= 31; day += 1) special('christmas', 12, day);
  for (let day = 1; day <= 13; day += 1) special('christmas', 1, day);
  return entries;
}

export function periodMatchesDay(entry, day) {
  if (day.period !== entry.periodKey) return false;
  if (entry.specialDateKey) {
    const key = `${day.date.slice(8, 10)}.${day.date.slice(5, 7)}`;
    // Dated ferias and Sundays have different sources; fixed Christmas
    // celebrations (e.g. 1 January) retain their own identity even on Sunday.
    const weekdaySource = entry.periodKey === 'advent' || (entry.periodKey === 'christmas' && !entry.fixedSourceRefs?.length);
    return key === entry.specialDateKey && (!weekdaySource || day.dayOfWeek !== 1);
  }
  return Number(day.week) === entry.week && Number(day.dayOfWeek) === entry.weekday;
}

export function findCatalogEntry(id, dioceses, diocese) {
  return id?.startsWith('period:') ? periodCatalog().find((entry) => entry.id === id)
    : feastCatalog(dioceses).find((entry) => entry.id === id && (!diocese || entry.dioceses.includes(diocese)));
}

export const catalogContentLabel = (entry) => entry.kind === 'period' ? 'Крыніцы дня перыяду'
  : [entry.contentStatus?.hours === 'proper' ? 'Уласныя тэксты' : '', entry.templates?.length ? 'Агульныя тэксты' : '',
    ['full', 'proper'].includes(entry.contentStatus?.readings) ? 'Уласныя чытанні' : ''].filter(Boolean).join(' · ') || 'Наяўнасць тэкстаў патрабуе праверкі';
