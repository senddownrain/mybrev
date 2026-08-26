import { useLiturgicalDay } from '@/composables/useLiturgicalDay';
import { getCompletoriumById } from '@/services/staticLiturgicalService';
import { usesSundayCompletorium } from '@/utils/liturgicalOffice';

const SUNDAY = 1;

// Holy Week has no separate templates in the normalized 35-document
// collection; it continues to use the Lenten set.
const COMPLETORIUM_PERIOD_ALIASES = Object.freeze({
  holyweek: 'lent',
});

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
   * Load compline for the date's period and weekday. Solemnities and the
   * Office for the Dead use Sunday (d1); feasts keep the actual weekday.
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
