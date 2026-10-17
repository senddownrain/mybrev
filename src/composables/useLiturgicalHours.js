import { computed, inject, provide, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import moment from '@/utils/moment-be';
import { useResolvedLiturgicalDay } from '@/composables/useResolvedLiturgicalDay';
import { useLiturgicalContent } from '@/composables/useLiturgicalContent';
import { eveningVespersModel } from '@/utils/liturgicalVespers';
import { PLACE_LABEL_MAP, getLiturgicalTheme } from '@/constants/liturgical';
import { LITURGICAL_HOURS, liturgicalHourRoute } from '@/constants/liturgicalHours';
import { logger } from '@/utils/logger';

const HOURS = Symbol('liturgical-hours');
export const useLiturgicalHours = () => inject(HOURS);
export function provideLiturgicalHours() {
  const route = useRoute();
  const dayId = computed(() => route.params.id);
  const dateParam = computed(() => route.params.day);
  const { day: dayData } = useResolvedLiturgicalDay();
  const { getLiturgicalContentForDate } = useLiturgicalContent();
  const tomorrowContent = ref(null);
  let sequence = 0;
  watch(dateParam, async (date) => {
    const current = ++sequence;
    tomorrowContent.value = null;
    if (route.query.reference || route.query.view === 'period') return;
    try {
      const content = await getLiturgicalContentForDate(moment(date, 'YYYY-MM-DD').add(1, 'day').toDate());
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
  const tomorrowFirstVespers = computed(() => eveningModel.value.firstVespers);
  const localTomorrowFirstVespers = computed(() => eveningModel.value.local);
  function getVespersRubricStyle(rubricDay) {
    const theme = getLiturgicalTheme(rubricDay, rubricDay?._periodType);
    return {
      '--vespers-rubric-color': theme.color,
      '--vespers-rubric-rgb': theme.rgb,
    };
  }

  const vespersRubricStyle = computed(() => (
    getVespersRubricStyle(tomorrowFirstVespers.value?.day || dayData.value)
  ));

  const vespersRubric = computed(() => {
    if (tomorrowFirstVespers.value) return {
      labelHtml: formatTitleHtml(`I Нешпары · ${tomorrowFirstVespers.value.title}`),
      kind: 'first',
      icon: '',
    };
    if (eveningModel.value.second) return {
      labelHtml: 'II Нешпары',
      kind: 'second',
      icon: '',
    };
    return null;
  });

  // Назва свята надходзіць з даных: дазваляем толькі <br>, а іншыя тэгі экраніруем.
  function formatTitleHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\\?&lt;br\s*\/?&gt;/gi, '<br>')
      .replace(/\r?\n/g, '<br>');
  }

  function localFirstVespersLabel(item) {
    const places = (item.places || []).map((place) => PLACE_LABEL_MAP[place] || place);
    return ['I Нешпары', item.title, ...places].filter(Boolean).join(' · ');
  }

  const oras = computed(() => {
    const regular = LITURGICAL_HOURS.map((hour) => ({
      ...hour, path: liturgicalHourRoute(route, hour.name, hour.name === 'vesper' ? { firstVespersDayId: undefined } : {}),
      ...(hour.name === 'vesper' ? { rubric: vespersRubric.value, rubricStyle: vespersRubricStyle.value } : {}),
    }));
    const local = localTomorrowFirstVespers.value.map((item, index) => ({
      name: 'vesper-first-' + (item.sourceDayId || index), title: 'Нешпары', subtitle: 'Vesperae',
      selectorSubtitle: localFirstVespersLabel(item),
      icon: 'mdi-weather-night-partly-cloudy', tag: 'Галоўная',
      path: liturgicalHourRoute(route, 'vesper', { firstVespersDayId: item.sourceDayId }),
      rubric: { labelHtml: formatTitleHtml(localFirstVespersLabel(item)), kind: 'first', icon: '' },
      rubricStyle: getVespersRubricStyle(item.day),
    }));
    regular.splice(regular.length - 1, 0, ...local);
    return regular;
  });
  provide(HOURS, oras);
  return oras;
}
