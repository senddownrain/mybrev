<template>
  <v-container>
    <h1 class="text-h4 mb-2">Пошук недастаючых дадзеных</h1>
    <p class="text-body-2 text-medium-emphasis mb-4">
      Арыенцір для фіксаваных дат: поўны набор дат з <code>readings</code>. Для чытанняў падсвечваюцца запісы з запаўняльнікам тэксту («чтения ...»).
    </p>

    <v-card class="mb-6" variant="outlined">
      <v-card-title>Недастаючыя чытанні (readings)</v-card-title>
      <v-card-text>
        <v-btn color="primary" :loading="loadingReadings" block @click="scanReadings">Праверыць чытанні</v-btn>

        <v-alert v-if="scannedReadings && missingReadings.length === 0" type="success" class="mt-4">
          Недастаючых чытанняў не знойдзена.
        </v-alert>

        <template v-if="missingReadings.length">
          <div v-for="group in groupedReadingsConfig" :key="`readings-${group.type}`" class="mt-4">
            <div class="text-subtitle-1 font-weight-medium mb-2">{{ group.title }} ({{ readingsGrouped[group.type].length }})</div>
            <v-list v-if="readingsGrouped[group.type].length" density="compact" class="border rounded">
              <v-list-item
                v-for="item in readingsGrouped[group.type]"
                :key="item.key"
                :title="item.title"
                :subtitle="item.subtitle"
              >
                <template #append>
                  <v-btn size="small" color="primary" :to="item.createLink">Стварыць</v-btn>
                </template>
              </v-list-item>
            </v-list>
            <div v-else class="text-body-2 text-medium-emphasis">Няма недастаючых элементаў у гэтай групе.</div>
          </div>
        </template>
      </v-card-text>
    </v-card>

    <v-card variant="outlined">
      <v-card-title>Недастаючыя літургічныя дні (days)</v-card-title>
      <v-card-text>
        <v-btn color="primary" :loading="loadingDays" block @click="scanDays">Праверыць літургічныя дні</v-btn>

        <v-alert v-if="scannedDays && missingDays.length === 0" type="success" class="mt-4">
          Недастаючых літургічных дзён не знойдзена.
        </v-alert>

        <template v-if="missingDays.length">
          <div v-for="group in groupedDaysConfig" :key="`days-${group.type}`" class="mt-4">
            <div class="text-subtitle-1 font-weight-medium mb-2">{{ group.title }} ({{ daysGrouped[group.type].length }})</div>
            <v-list v-if="daysGrouped[group.type].length" density="compact" class="border rounded">
              <v-list-item
                v-for="item in daysGrouped[group.type]"
                :key="item.key"
                :title="item.title"
                :subtitle="item.subtitle"
              >
                <template #append>
                  <v-btn size="small" color="primary" :to="item.createLink">Стварыць</v-btn>
                </template>
              </v-list-item>
            </v-list>
            <div v-else class="text-body-2 text-medium-emphasis">Няма недастаючых элементаў у гэтай групе.</div>
          </div>
        </template>
      </v-card-text>
    </v-card>

    <NotificationSnackbar />
  </v-container>
</template>

<script setup>
import { collection, getDocs } from 'firebase/firestore';
import { computed, ref } from 'vue';
import moment from '@/utils/moment-be';
import { db } from '@/plugins/firebase';
import { useCalendarStore } from '@/stores/calendar';
import { FEAST_NAME_MAP } from '@/constants/liturgicalFeastsMap';
import { PERIOD_LABEL_MAP, WEEKDAY_LABEL_MAP } from '@/constants/liturgical';
import { useLiturgicalDay } from '@/composables/useLiturgicalDay';
import { useNotifier } from '@/composables/useNotifier';
import NotificationSnackbar from '@/components/NotificationSnackbar.vue';

const groupedReadingsConfig = [
  { type: 'dynamic', title: 'Дынамічныя святы' },
  { type: 'date', title: 'Фіксаваныя даты' },
  { type: 'period', title: 'Перыяды' },
];

const groupedDaysConfig = groupedReadingsConfig;

const { notifyError, notifySuccess } = useNotifier();
const calendarStore = useCalendarStore();
const { computeLiturgicalContextForDate } = useLiturgicalDay();

const loadingReadings = ref(false);
const loadingDays = ref(false);
const scannedReadings = ref(false);
const scannedDays = ref(false);
const missingReadings = ref([]);
const missingDays = ref([]);

const readingsGrouped = computed(() => groupByType(missingReadings.value));
const daysGrouped = computed(() => groupByType(missingDays.value));

function groupByType(items) {
  return {
    dynamic: items.filter((i) => i.type === 'dynamic'),
    date: items.filter((i) => i.type === 'date'),
    period: items.filter((i) => i.type === 'period'),
  };
}

function normalizeDate(value) {
  if (!value) return null;
  const m = moment(String(value), ['D.M', 'DD.MM'], true);
  return m.isValid() ? m.format('D.M') : null;
}

function normalizePeriodKey(item) {
  const periodType = String(item?._periodType || '').trim().toLowerCase();
  const week = Number(item?._periodWeekNumber);
  const day = Number(item?._dayOfWeek);
  if (!periodType || !Number.isFinite(week) || !Number.isFinite(day) || week < 0 || day < 1) return null;
  return `${periodType}|${week}|${day}`;
}

function extractMeta(item) {
  return {
    title: String(item?.title || item?._feastName || item?._dayName || item?.name || '').trim(),
    rank: String(item?.rank || item?._rank || item?._feastType || '').trim(),
    place: String(item?.place || item?._place || '').trim(),
  };
}

function buildDateSubtitle(date, item) {
  const meta = extractMeta(item);
  const chunks = [`Дата: ${date}`];
  if (meta.title) chunks.push(`Назва: ${meta.title}`);
  if (meta.rank) chunks.push(`Ранг: ${meta.rank}`);
  if (meta.place) chunks.push(`Place: ${meta.place}`);
  return chunks.join(' • ');
}

function dynamicSubtitle(feastKey, feastValue, year) {
  const dynamicDate = calendarStore.dynamicDatesForYear(year).value?.[feastKey];
  const date = dynamicDate ? dynamicDate.format('DD.MM.YYYY') : 'Дата не вылічаная';
  return `Ключ: ${feastKey} • Код: ${feastValue} • Дата: ${date}`;
}

function periodSubtitle(periodType, week, day) {
  const periodName = PERIOD_LABEL_MAP[periodType] || periodType;
  const dayName = WEEKDAY_LABEL_MAP[day] || `дзень ${day}`;
  return `Перыяд: ${periodName} • Тыдзень: ${week} • Дзень: ${dayName}`;
}

function readingLinkFor(item) {
  if (item._feast) return { name: 'ReadingsTest', query: { type: 'feast', feastName: item._feast } };
  if (item._date) return { name: 'ReadingsTest', query: { type: 'date', _date: moment(item._date, 'D.M').format('YYYY-MM-DD') } };
  return { name: 'ReadingsTest', query: { type: 'period', _periodType: item._periodType, _periodWeekNumber: String(item._periodWeekNumber), _dayOfWeek: String(item._dayOfWeek) } };
}

function dayLinkFor(item) {
  return {
    name: 'AdminDayEditor',
    params: { id: 'new' },
    query: {
      _periodType: item._periodType || '',
      _periodWeekNumber: item._periodWeekNumber ? String(item._periodWeekNumber) : '',
      _dayOfWeek: item._dayOfWeek ? String(item._dayOfWeek) : '',
      _date: item._date || '',
      _feast: item._feast || '',
    },
  };
}

async function buildExpectedPeriodKeys(year) {
  const expected = new Map();
  const start = moment(`${year}-01-01`);
  const end = moment(`${year}-12-31`);
  const total = end.diff(start, 'days');

  for (let i = 0; i <= total; i += 1) {
    const current = start.clone().add(i, 'days');
    const ctx = await computeLiturgicalContextForDate(current);
    if (!ctx?.periodType || !ctx?.periodWeek || !ctx?.dayOfWeek) continue;

    if (ctx.periodType === 'ordinary' && ctx.dayOfWeek === 1 && (Number(ctx.periodWeek) === 1 || Number(ctx.periodWeek) === 34)) continue;

    const key = `${ctx.periodType}|${Number(ctx.periodWeek)}|${Number(ctx.dayOfWeek)}`;
    if (!expected.has(key)) expected.set(key, { key, _periodType: ctx.periodType, _periodWeekNumber: Number(ctx.periodWeek), _dayOfWeek: Number(ctx.dayOfWeek) });
  }

  return expected;
}

function isMissingReadingText(reading) {
  const text = String(reading?.text || '').trim().toLowerCase();
  return !text || text === 'чтения' || text === '<p>чтения</p>' || text.includes('чтения пока нету');
}

function buildFixedCalendarFromReadings(readingsDocs) {
  return readingsDocs.filter((doc) => normalizeDate(doc._date)).map((doc) => ({ ...doc, _date: normalizeDate(doc._date) }));
}

async function scanReadings() {
  loadingReadings.value = true;
  scannedReadings.value = true;
  missingReadings.value = [];

  try {
    const year = moment().year();
    await calendarStore.getYearOptions(year);
    await calendarStore.getYearOptions(year + 1);
    await calendarStore.getDynamicDates(year);

    const readingsSnap = await getDocs(collection(db, 'readings'));
    const readingsDocs = readingsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const byFeast = new Map();
    const byPeriod = new Map();

    readingsDocs.forEach((doc) => {
      if (doc._feast) byFeast.set(String(doc._feast).toLowerCase(), doc);
      const pKey = normalizePeriodKey(doc);
      if (pKey) byPeriod.set(pKey, doc);
    });

    const result = [];

    Object.entries(FEAST_NAME_MAP).forEach(([feastKey, feastValue]) => {
      const existing = byFeast.get(String(feastValue).toLowerCase());
      if (!existing || isMissingReadingText(existing)) {
        result.push({
          key: `readings-feast-${feastValue}`,
          type: 'dynamic',
          title: `Дынамічнае свята: ${feastValue}`,
          subtitle: dynamicSubtitle(feastKey, feastValue, year),
          _feast: feastValue,
          createLink: readingLinkFor({ _feast: feastValue }),
        });
      }
    });

    const fixedCalendar = buildFixedCalendarFromReadings(readingsDocs);
    fixedCalendar.forEach((item) => {
      if (isMissingReadingText(item)) {
        result.push({
          key: `readings-date-${item.id}`,
          type: 'date',
          title: `Фіксаваная дата: ${item._date}`,
          subtitle: `${buildDateSubtitle(item._date, item)} • Статус: няма поўнага тэксту`,
          _date: item._date,
          createLink: readingLinkFor({ _date: item._date }),
        });
      }
    });

    const expectedPeriods = await buildExpectedPeriodKeys(year);
    expectedPeriods.forEach((value, key) => {
      const existing = byPeriod.get(key);
      if (!existing || isMissingReadingText(existing)) {
        result.push({
          key: `readings-period-${key}`,
          type: 'period',
          title: `${value._periodType}: тыдзень ${value._periodWeekNumber}, дзень ${value._dayOfWeek}`,
          subtitle: `${periodSubtitle(value._periodType, value._periodWeekNumber, value._dayOfWeek)} • ${existing ? 'ёсць запіс, але тэкст-запаўняльнік' : 'няма запісу'}`,
          ...value,
          createLink: readingLinkFor(value),
        });
      }
    });

    missingReadings.value = result;
    notifySuccess(`Знойдзена недастаючых чытанняў: ${result.length}`);
  } catch (error) {
    notifyError(`Памылка пры пошуку недастаючых чытанняў: ${error.message || error}`);
  } finally {
    loadingReadings.value = false;
  }
}

async function scanDays() {
  loadingDays.value = true;
  scannedDays.value = true;
  missingDays.value = [];

  try {
    const year = moment().year();
    await calendarStore.getYearOptions(year);
    await calendarStore.getYearOptions(year + 1);
    await calendarStore.getDynamicDates(year);

    const [daysSnap, readingsSnap] = await Promise.all([getDocs(collection(db, 'days')), getDocs(collection(db, 'readings'))]);
    const daysDocs = daysSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const readingsDocs = readingsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const byFeast = new Map();
    const byPeriod = new Map();
    const dayDateKeys = new Set();

    daysDocs.forEach((doc) => {
      if (doc._feast) byFeast.set(String(doc._feast).toLowerCase(), doc);
      const pKey = normalizePeriodKey(doc);
      if (pKey) byPeriod.set(pKey, doc);
      const date = normalizeDate(doc._date);
      if (date) {
        const meta = extractMeta(doc);
        dayDateKeys.add(`${date}|${meta.title}|${meta.rank}|${meta.place}`);
      }
    });

    const result = [];

    Object.entries(FEAST_NAME_MAP).forEach(([feastKey, feastValue]) => {
      if (!byFeast.has(String(feastValue).toLowerCase())) {
        result.push({
          key: `days-feast-${feastValue}`,
          type: 'dynamic',
          title: `Дынамічнае свята: ${feastValue}`,
          subtitle: dynamicSubtitle(feastKey, feastValue, year),
          _feast: feastValue,
          createLink: dayLinkFor({ _feast: feastValue }),
        });
      }
    });

    const fixedCalendar = buildFixedCalendarFromReadings(readingsDocs);
    fixedCalendar.forEach((item) => {
      const meta = extractMeta(item);
      const sig = `${item._date}|${meta.title}|${meta.rank}|${meta.place}`;
      if (!dayDateKeys.has(sig)) {
        result.push({
          key: `days-date-${item.id}`,
          type: 'date',
          title: `Фіксаваная дата: ${item._date}`,
          subtitle: `${buildDateSubtitle(item._date, item)} • Няма адпаведніка ў days`,
          _date: item._date,
          createLink: dayLinkFor({ _date: item._date }),
        });
      }
    });

    const expectedPeriods = await buildExpectedPeriodKeys(year);
    expectedPeriods.forEach((value, key) => {
      if (!byPeriod.has(key)) {
        result.push({
          key: `days-period-${key}`,
          type: 'period',
          title: `${value._periodType}: тыдзень ${value._periodWeekNumber}, дзень ${value._dayOfWeek}`,
          subtitle: `${periodSubtitle(value._periodType, value._periodWeekNumber, value._dayOfWeek)} • Няма запісу ў days`,
          ...value,
          createLink: dayLinkFor(value),
        });
      }
    });

    missingDays.value = result;
    notifySuccess(`Знойдзена недастаючых літургічных дзён: ${result.length}`);
  } catch (error) {
    notifyError(`Памылка пры пошуку недастаючых дзён: ${error.message || error}`);
  } finally {
    loadingDays.value = false;
  }
}
</script>
