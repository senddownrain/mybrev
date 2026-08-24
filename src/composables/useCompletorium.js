import { LITURGICAL_RANK } from '@/constants/liturgical';
import { useLiturgicalDay } from '@/composables/useLiturgicalDay';
import { getCompletoriumById } from '@/services/staticLiturgicalService';

const SUNDAY = 1;

// Holy Week has no separate templates in the normalized 35-document
// collection; it continues to use the Lenten set.
const COMPLETORIUM_PERIOD_ALIASES = Object.freeze({
  holyweek: 'lent',
});

const SUNDAY_RANKS = new Set([
  LITURGICAL_RANK.SOLEMNITY,
  LITURGICAL_RANK.FEAST,
  'solemnity',
  'feast',
  'урачыстасць',
  'свята',
  'торжество',
  'праздник',
]);

function normalizeRank(value) {
  return String(value || '').trim().toLowerCase();
}

/** Whether the selected celebration uses the Sunday compline. */
export function usesSundayCompletorium(day) {
  const rank = day?._rank || day?._feastType || day?.rank || day?.feastComment;
  return SUNDAY_RANKS.has(normalizeRank(rank));
}

/** Build the deterministic ID used by the normalized collection. */
export function getCompletoriumId(periodType, dayOfWeek, day) {
  const completoriumPeriod = COMPLETORIUM_PERIOD_ALIASES[periodType] || periodType;
  const completoriumDay = usesSundayCompletorium(day) ? SUNDAY : Number(dayOfWeek);

  if (!completoriumPeriod || !Number.isInteger(completoriumDay) || completoriumDay < 1 || completoriumDay > 7) {
    return null;
  }

  return `${completoriumPeriod}-d${completoriumDay}`;
}

export function useCompletorium() {
  const { computeLiturgicalContextForDate } = useLiturgicalDay();

  /**
   * Load compline for the date's period and weekday. Solemnities and feasts
   * always use Sunday (d1) within the same period.
   */
  async function getCompletoriumForDate(date, selectedDay = null) {
    const context = await computeLiturgicalContextForDate(date);
    const id = getCompletoriumId(context.periodType, context.dayOfWeek, selectedDay);

    if (!id) {
      throw new Error('Не атрымалася вызначыць перыяд або дзень тыдня для камплеты.');
    }

    const completorium = await getCompletoriumById(id);

    if (!completorium) {
      throw new Error(`Камплета ${id} не знойдзена ў калекцыі completoriums.`);
    }

    return completorium;
  }

  return { getCompletoriumForDate };
}
