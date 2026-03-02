<template>
  <v-container>
    <h1 class="text-h4 mb-4">Пошук недастаючых дадзеных</h1>

    <v-card class="mb-6" variant="outlined">
      <v-card-title>Недастаючыя чытанні (readings)</v-card-title>
      <v-card-text>
        <v-btn color="primary" :loading="loadingReadings" block @click="scanReadings">Праверыць чытанні</v-btn>

        <v-alert v-if="scannedReadings && missingReadings.length === 0" type="success" class="mt-4">
          Недастаючых чытанняў не знойдзена.
        </v-alert>

        <v-list v-if="missingReadings.length" class="mt-4">
          <v-list-item
            v-for="item in missingReadings"
            :key="item.key"
            :title="item.title"
            :subtitle="item.subtitle"
          >
            <template #append>
              <v-btn size="small" color="primary" :to="item.createLink">Стварыць</v-btn>
            </template>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>

    <v-card variant="outlined">
      <v-card-title>Недастаючыя літургічныя дні (days)</v-card-title>
      <v-card-text>
        <v-btn color="primary" :loading="loadingDays" block @click="scanDays">Праверыць літургічныя дні</v-btn>

        <v-alert v-if="scannedDays && missingDays.length === 0" type="success" class="mt-4">
          Недастаючых літургічных дзён не знойдзена.
        </v-alert>

        <v-list v-if="missingDays.length" class="mt-4">
          <v-list-item
            v-for="item in missingDays"
            :key="item.key"
            :title="item.title"
            :subtitle="item.subtitle"
          >
            <template #append>
              <v-btn size="small" color="primary" :to="item.createLink">Стварыць</v-btn>
            </template>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>

    <NotificationSnackbar />
  </v-container>
</template>

<script setup>
import { collection, getDocs } from 'firebase/firestore';
import { ref } from 'vue';
import moment from '@/utils/moment-be';
import { db } from '@/plugins/firebase';
import { useCalendarStore } from '@/stores/calendar';
import { FEAST_NAME_MAP } from '@/constants/liturgicalFeastsMap';
import { useLiturgicalDay } from '@/composables/useLiturgicalDay';
import { useNotifier } from '@/composables/useNotifier';
import NotificationSnackbar from '@/components/NotificationSnackbar.vue';

const { notifyError, notifySuccess } = useNotifier();
const calendarStore = useCalendarStore();
const { computeLiturgicalContextForDate } = useLiturgicalDay();

const loadingReadings = ref(false);
const loadingDays = ref(false);
const scannedReadings = ref(false);
const scannedDays = ref(false);
const missingReadings = ref([]);
const missingDays = ref([]);

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

function readingLinkFor(item) {
  if (item._feast) return { name: 'ReadingsTest', query: { type: 'feast', feastName: item._feast } };
  if (item._date) return { name: 'ReadingsTest', query: { type: 'date', _date: moment(item._date, 'D.M').format('YYYY-MM-DD') } };
  return {
    name: 'ReadingsTest',
    query: {
      type: 'period',
      _periodType: item._periodType,
      _periodWeekNumber: String(item._periodWeekNumber),
      _dayOfWeek: String(item._dayOfWeek),
    },
  };
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

    if (ctx.periodType === 'ordinary' && ctx.dayOfWeek === 1 && (Number(ctx.periodWeek) === 1 || Number(ctx.periodWeek) === 34)) {
      continue;
    }

    const key = `${ctx.periodType}|${Number(ctx.periodWeek)}|${Number(ctx.dayOfWeek)}`;
    if (!expected.has(key)) {
      expected.set(key, {
        key,
        _periodType: ctx.periodType,
        _periodWeekNumber: Number(ctx.periodWeek),
        _dayOfWeek: Number(ctx.dayOfWeek),
      });
    }
  }

  return expected;
}

function fillFixedDateExpectations(daysDocs, readingsDocs) {
  const dateSet = new Set();
  daysDocs.forEach((item) => {
    const d = normalizeDate(item._date);
    if (d) dateSet.add(d);
  });
  readingsDocs.forEach((item) => {
    const d = normalizeDate(item._date);
    if (d) dateSet.add(d);
  });
  return Array.from(dateSet.values()).sort((a, b) => moment(a, 'D.M').diff(moment(b, 'D.M')));
}

function isMissingReadingText(reading) {
  const text = String(reading?.text || '').trim().toLowerCase();
  return !text || text === 'чтения' || text === '<p>чтения</p>';
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

    const [daysSnap, readingsSnap] = await Promise.all([
      getDocs(collection(db, 'days')),
      getDocs(collection(db, 'readings')),
    ]);

    const daysDocs = daysSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const readingsDocs = readingsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const byFeast = new Map();
    const byDate = new Map();
    const byPeriod = new Map();

    readingsDocs.forEach((doc) => {
      if (doc._feast) byFeast.set(String(doc._feast).toLowerCase(), doc);
      const date = normalizeDate(doc._date);
      if (date) byDate.set(date, doc);
      const pKey = normalizePeriodKey(doc);
      if (pKey) byPeriod.set(pKey, doc);
    });

    const result = [];

    Object.entries(FEAST_NAME_MAP).forEach(([feastKey, feastValue]) => {
      const dynamicDate = calendarStore.dynamicDatesForYear(year).value?.[feastKey];
      const existing = byFeast.get(String(feastValue).toLowerCase());
      if (!existing || isMissingReadingText(existing)) {
        result.push({
          key: `readings-feast-${feastValue}`,
          title: `Дынамічнае свята: ${feastValue}`,
          subtitle: dynamicDate ? dynamicDate.format('DD.MM.YYYY') : 'Дата не вылічаная',
          _feast: feastValue,
          createLink: readingLinkFor({ _feast: feastValue }),
        });
      }
    });

    const fixedDates = fillFixedDateExpectations(daysDocs, readingsDocs);
    fixedDates.forEach((date) => {
      const existing = byDate.get(date);
      if (!existing || isMissingReadingText(existing)) {
        result.push({
          key: `readings-date-${date}`,
          title: `Фіксаваная дата: ${date}`,
          subtitle: existing ? 'Ёсць запіс, але адсутнічае тэкст' : 'Няма запісу ў readings',
          _date: date,
          createLink: readingLinkFor({ _date: date }),
        });
      }
    });

    const expectedPeriods = await buildExpectedPeriodKeys(year);
    expectedPeriods.forEach((value, key) => {
      const existing = byPeriod.get(key);
      if (!existing || isMissingReadingText(existing)) {
        result.push({
          key: `readings-period-${key}`,
          title: `${value._periodType}: тыдзень ${value._periodWeekNumber}, дзень ${value._dayOfWeek}`,
          subtitle: existing ? 'Ёсць запіс, але адсутнічае тэкст' : 'Няма запісу ў readings',
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

    const [daysSnap, readingsSnap] = await Promise.all([
      getDocs(collection(db, 'days')),
      getDocs(collection(db, 'readings')),
    ]);

    const daysDocs = daysSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const readingsDocs = readingsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const byFeast = new Map();
    const byDate = new Map();
    const byPeriod = new Map();

    daysDocs.forEach((doc) => {
      if (doc._feast) byFeast.set(String(doc._feast).toLowerCase(), doc);
      const date = normalizeDate(doc._date);
      if (date) byDate.set(date, doc);
      const pKey = normalizePeriodKey(doc);
      if (pKey) byPeriod.set(pKey, doc);
    });

    const result = [];

    Object.entries(FEAST_NAME_MAP).forEach(([feastKey, feastValue]) => {
      const dynamicDate = calendarStore.dynamicDatesForYear(year).value?.[feastKey];
      if (!byFeast.has(String(feastValue).toLowerCase())) {
        result.push({
          key: `days-feast-${feastValue}`,
          title: `Дынамічнае свята: ${feastValue}`,
          subtitle: dynamicDate ? dynamicDate.format('DD.MM.YYYY') : 'Дата не вылічаная',
          _feast: feastValue,
          createLink: dayLinkFor({ _feast: feastValue }),
        });
      }
    });

    const fixedDates = fillFixedDateExpectations(daysDocs, readingsDocs);
    fixedDates.forEach((date) => {
      if (!byDate.has(date)) {
        result.push({
          key: `days-date-${date}`,
          title: `Фіксаваная дата: ${date}`,
          subtitle: 'Няма запісу ў days',
          _date: date,
          createLink: dayLinkFor({ _date: date }),
        });
      }
    });

    const expectedPeriods = await buildExpectedPeriodKeys(year);
    expectedPeriods.forEach((value, key) => {
      if (!byPeriod.has(key)) {
        result.push({
          key: `days-period-${key}`,
          title: `${value._periodType}: тыдзень ${value._periodWeekNumber}, дзень ${value._dayOfWeek}`,
          subtitle: 'Няма запісу ў days',
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
