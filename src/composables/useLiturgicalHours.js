import { ordoCalendarEpoch } from '@/utils/ordoCalendarState';
import { effectiveOrdoDiocese } from '@/utils/ordoDiocese';
import { computed, inject, provide, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import moment from '@/utils/moment-be';
import { useResolvedLiturgicalDay } from '@/composables/useResolvedLiturgicalDay';
import { useLiturgicalContent } from '@/composables/useLiturgicalContent';
import { eveningVespersModel, needsTomorrowVespers, vespersHourTitle } from '@/utils/liturgicalVespers';
import { resolveRuntimeDay } from '@/utils/ordo/runtime';
import { PLACE_LABEL_MAP } from '@/constants/liturgical';
import { LITURGICAL_HOURS, liturgicalHourRoute } from '@/constants/liturgicalHours';
import { logger } from '@/utils/logger';

const HOURS = Symbol('liturgical-hours');
export const useLiturgicalHours = () => inject(HOURS);
export function provideLiturgicalHours() {
  const route = useRoute();
  const dayId = computed(() => route.params.id);
  const dateParam = computed(() => route.params.day);
  const isHoursList = computed(() => route.name === 'oras');
  const { day: dayData } = useResolvedLiturgicalDay({ enabled: isHoursList });
  const { getLiturgicalContentForDate } = useLiturgicalContent();
  const tomorrowContent = ref(null);
  const date = computed(() => moment(String(dateParam.value), ['YYYY-MM-DD', 'DD-MM-YYYY'], true));
  const legacyLookup = computed(() => isHoursList.value && dayId.value !== 'office-for-dead'
    && !route.query.reference && route.query.view !== 'period'
    && !dayData.value?._ordo?.vespers && needsTomorrowVespers(dayData.value));
  let sequence = 0;
  watch([legacyLookup, dateParam, dayId, ordoCalendarEpoch, effectiveOrdoDiocese], async ([needed]) => {
    const current = ++sequence;
    tomorrowContent.value = null;
    if (!needed || !date.value.isValid()) return;
    try {
      const content = await getLiturgicalContentForDate(date.value.clone().add(1, 'day').toDate());
      if (current === sequence) tomorrowContent.value = content;
    } catch (error) { logger.error('[Hours] Tomorrow content:', error); }
  }, { immediate: true });
  // II Vespers vs I Vespers of tomorrow: the Ordo descriptor of the selected
  // Office decides (legacy heuristics only for days without a descriptor).
  const eveningModel = computed(() => (
    dayId.value === 'office-for-dead' ? { firstVespers: null, local: [], second: false }
      : eveningVespersModel(dayData.value, tomorrowContent.value, {
        isoWeekday: moment(String(dateParam.value), ['YYYY-MM-DD', 'DD-MM-YYYY'], true).isoWeekday(),
      })
  ));
  const localTomorrowFirstVespers = computed(() => eveningModel.value.local);
  const vespersTitle = computed(() => {
    if (dayId.value === 'office-for-dead') return vespersHourTitle(null);
    const type = dayData.value?._ordo?.vespers?.type;
    if (isHoursList.value || route.query.reference || route.query.view === 'period' || !date.value.isValid()) {
      return type === 'first' ? 'I Нешпары' : vespersHourTitle(eveningModel.value);
    }
    const evening = resolveRuntimeDay(date.value.format('YYYY-MM-DD'), {
      diocese: effectiveOrdoDiocese.value,
    }).officeResolution.evening.vespers;
    return evening.type === 'first' ? 'I Нешпары' : vespersHourTitle({ second: evening.type === 'second' });
  });
  function localFirstVespersLabel(item) {
    const places = (item.places || []).map((place) => PLACE_LABEL_MAP[place] || place);
    return ['I Нешпары', item.title, ...places].filter(Boolean).join(' · ');
  }

  const oras = computed(() => {
    const regular = LITURGICAL_HOURS.map((hour) => ({
      ...hour,
      ...(hour.name === 'vesper' ? { title: vespersTitle.value } : {}),
      path: liturgicalHourRoute(route, hour.name, hour.name === 'vesper' ? { firstVespersDayId: undefined } : {}),
    }));
    const local = localTomorrowFirstVespers.value.map((item, index) => ({
      name: 'vesper-first-' + (item.sourceDayId || index), title: 'I Нешпары',
      subtitle: ['Vesperae', item.title, ...(item.places || []).map((place) => PLACE_LABEL_MAP[place] || place)].filter(Boolean).join(' · '),
      selectorSubtitle: localFirstVespersLabel(item),
      icon: 'mdi-weather-night-partly-cloudy', tag: 'Галоўная',
      path: liturgicalHourRoute(route, 'vesper', { firstVespersDayId: item.sourceDayId }),
    }));
    regular.splice(regular.length - 1, 0, ...local);
    return regular;
  });
  provide(HOURS, oras);
  return oras;
}
