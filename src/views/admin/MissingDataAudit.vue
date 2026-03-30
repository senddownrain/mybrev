<template>
  <v-container>
    <h1 class="text-h4 mb-2">Пошук недастаючых дадзеных</h1>
    <p class="text-body-2 text-medium-emphasis mb-4">
      Арыенцір для фіксаваных дат: поўны набор дат з <code>readings</code>. У чытаннях шукаюцца запісы без тэксту або з запаўняльнікам («чтения ...»).
    </p>

    <v-card class="mb-6" variant="outlined">
      <v-card-title>Недастаючыя чытанні (readings)</v-card-title>
      <v-card-text>
        <v-btn color="primary" :loading="loadingReadings" block @click="scanReadings">Праверыць чытанні</v-btn>

        <v-alert v-if="scannedReadings && missingReadings.length === 0" type="success" class="mt-4">
          Недастаючых чытанняў не знойдзена.
        </v-alert>

        <v-expansion-panels v-if="scannedReadings" v-model="expandedReadings" multiple class="mt-4">
          <v-expansion-panel v-for="group in groupedConfig" :key="`readings-missing-${group.type}`">
            <v-expansion-panel-title>
              Недастаючыя: {{ group.title }} ({{ readingsMissingGrouped[group.type].length }})
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <v-list v-if="readingsMissingGrouped[group.type].length" density="compact" class="border rounded">
                <v-list-item v-for="item in readingsMissingGrouped[group.type]" :key="item.key" :title="item.title">
                  <template #subtitle>
                    <div class="item-subtitle">{{ item.subtitle }}</div>
                  </template>
                  <template #append>
                    <v-btn size="small" color="primary" :to="item.createLink">Стварыць</v-btn>
                  </template>
                </v-list-item>
              </v-list>
              <div v-else class="text-body-2 text-medium-emphasis">Няма недастаючых элементаў.</div>
            </v-expansion-panel-text>
          </v-expansion-panel>

          <v-expansion-panel v-for="group in groupedConfig" :key="`readings-existing-${group.type}`">
            <v-expansion-panel-title>
              Ёсць у базе: {{ group.title }} ({{ readingsExistingGrouped[group.type].length }})
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <v-list v-if="readingsExistingGrouped[group.type].length" density="compact" class="border rounded">
                <v-list-item v-for="item in readingsExistingGrouped[group.type].slice(0, 100)" :key="item.key" :title="item.title">
                  <template #subtitle>
                    <div class="item-subtitle">{{ item.subtitle }}</div>
                  </template>
                </v-list-item>
              </v-list>
              <div v-else class="text-body-2 text-medium-emphasis">Няма запісаў у гэтай групе.</div>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-card-text>
    </v-card>

    <v-card variant="outlined">
      <v-card-title>Недастаючыя літургічныя дні (days)</v-card-title>
      <v-card-text>
        <v-btn color="primary" :loading="loadingDays" block @click="scanDays">Праверыць літургічныя дні</v-btn>

        <v-alert v-if="scannedDays && missingDays.length === 0" type="success" class="mt-4">
          Недастаючых літургічных дзён не знойдзена.
        </v-alert>

        <v-expansion-panels v-if="scannedDays" v-model="expandedDays" multiple class="mt-4">
          <v-expansion-panel v-for="group in groupedConfig" :key="`days-missing-${group.type}`">
            <v-expansion-panel-title>
              Недастаючыя: {{ group.title }} ({{ daysMissingGrouped[group.type].length }})
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <v-list v-if="daysMissingGrouped[group.type].length" density="compact" class="border rounded">
                <v-list-item v-for="item in daysMissingGrouped[group.type]" :key="item.key" :title="item.title">
                  <template #subtitle>
                    <div class="item-subtitle">{{ item.subtitle }}</div>
                  </template>
                  <template #append>
                    <v-btn size="small" color="primary" :to="item.createLink">Стварыць</v-btn>
                  </template>
                </v-list-item>
              </v-list>
              <div v-else class="text-body-2 text-medium-emphasis">Няма недастаючых элементаў.</div>
            </v-expansion-panel-text>
          </v-expansion-panel>

          <v-expansion-panel v-for="group in groupedConfig" :key="`days-existing-${group.type}`">
            <v-expansion-panel-title>
              Ёсць у базе: {{ group.title }} ({{ daysExistingGrouped[group.type].length }})
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <v-list v-if="daysExistingGrouped[group.type].length" density="compact" class="border rounded">
                <v-list-item v-for="item in daysExistingGrouped[group.type].slice(0, 100)" :key="item.key" :title="item.title">
                  <template #subtitle>
                    <div class="item-subtitle">{{ item.subtitle }}</div>
                  </template>
                </v-list-item>
              </v-list>
              <div v-else class="text-body-2 text-medium-emphasis">Няма запісаў у гэтай групе.</div>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
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
import { DAY_EDITOR_FIELDS } from '@/constants/days';
import { CANONICAL_FIXED_CALENDAR_DATES } from '@/constants/liturgicalFixedCalendarDates';
import { useLiturgicalDay } from '@/composables/useLiturgicalDay';
import { useNotifier } from '@/composables/useNotifier';
import NotificationSnackbar from '@/components/NotificationSnackbar.vue';

const groupedConfig = [
  { type: 'dynamic', title: 'Дынамічныя святы' },
  { type: 'date', title: 'Фіксаваныя даты' },
  { type: 'period', title: 'Перыяды' },
  { type: 'fields', title: 'Палі блокаў (days)' },
];

const DAY_REQUIRED_IDENTITY_FIELDS = ['_dayOfWeek', '_periodType', '_periodWeekNumber', '_date', '_feast'];
const DAY_REQUIRED_METADATA_FIELDS = ['_psalmWeek', '_dayName', '_weekDay', '_weekNum', '_feastName', '_feastType', 'allowedAlleluia'];
const DAY_REQUIRED_CONTENT_FIELDS = DAY_EDITOR_FIELDS.filter((field) => ![
  ...DAY_REQUIRED_IDENTITY_FIELDS,
  ...DAY_REQUIRED_METADATA_FIELDS,
  'feastComment',
].includes(field));
const HOLIDAY_FEAST_TYPES = new Set(['solemnity', 'feast', 'memorial']);

const { notifyError, notifySuccess } = useNotifier();
const calendarStore = useCalendarStore();
const { computeLiturgicalContextForDate } = useLiturgicalDay();

const loadingReadings = ref(false);
const loadingDays = ref(false);
const scannedReadings = ref(false);
const scannedDays = ref(false);
const missingReadings = ref([]);
const missingDays = ref([]);
const existingReadings = ref([]);
const existingDays = ref([]);
const expandedReadings = ref([0]);
const expandedDays = ref([0]);

const readingsMissingGrouped = computed(() => groupByType(missingReadings.value));
const daysMissingGrouped = computed(() => groupByType(missingDays.value));
const readingsExistingGrouped = computed(() => groupByType(existingReadings.value));
const daysExistingGrouped = computed(() => groupByType(existingDays.value));

function groupByType(items) {
  return {
    dynamic: items.filter((i) => i.type === 'dynamic'),
    date: items.filter((i) => i.type === 'date'),
    period: items.filter((i) => i.type === 'period'),
    fields: items.filter((i) => i.type === 'fields'),
  };
}

function normalizeDate(value) {
  if (!value) return null;
  const m = moment(String(value), ['D.M', 'DD.MM'], true);
  return m.isValid() ? m.format('DD.MM') : null;
}

function normalizePeriodKey(item) {
  const periodType = String(item?._periodType || '').trim().toLowerCase();
  const week = Number(item?._periodWeekNumber);
  const day = Number(item?._dayOfWeek);
  if (!periodType || !Number.isFinite(week) || !Number.isFinite(day) || week < 1 || day < 1) return null;
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

function collectMissingNameRankForReadings(items) {
  const missing = [];
  items.forEach((item) => {
    const title = String(item?.title || '').trim();
    const hasRankField = Object.prototype.hasOwnProperty.call(item || {}, 'rank');
    if (!title || !hasRankField) {
      missing.push(item.id || 'без-id');
    }
  });
  return missing;
}

function collectMissingNameRankForDays(items) {
  const missing = [];
  items.forEach((item) => {
    const name = String(item?._feastName || item?.title || '').trim();
    const hasRankField = Object.prototype.hasOwnProperty.call(item || {}, '_feastType')
      || Object.prototype.hasOwnProperty.call(item || {}, 'rank');
    if (!name || !hasRankField) {
      missing.push(item.id || 'без-id');
    }
  });
  return missing;
}

function hasNonEmptyValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function isHolidayDay(item) {
  const feastType = String(item?._feastType || '').trim().toLowerCase();
  return Boolean(item?._feast) || HOLIDAY_FEAST_TYPES.has(feastType);
}

function dynamicSubtitle(feastKey, feastValue, year, item = null) {
  const dynamicDate = calendarStore.dynamicDatesForYear(year).value?.[feastKey];
  const date = dynamicDate ? dynamicDate.format('DD.MM.YYYY') : 'Дата не вылічаная';
  const meta = item ? extractMeta(item) : { title: '', rank: '', place: '' };
  const chunks = [`Ключ: ${feastKey}`, `Код: ${feastValue}`, `Дата: ${date}`];
  if (meta.title) chunks.push(`Назва: ${meta.title}`);
  if (meta.rank) chunks.push(`Ранг: ${meta.rank}`);
  if (meta.place) chunks.push(`Place: ${meta.place}`);
  return chunks.join(' • ');
}

function periodSubtitle(periodType, week, day) {
  const periodName = PERIOD_LABEL_MAP[periodType] || periodType;
  const dayName = WEEKDAY_LABEL_MAP[day] || `дзень ${day}`;
  return `Перыяд: ${periodName} • Тыдзень: ${week} • Дзень: ${dayName}`;
}

function readingLinkFor(item) {
  if (item._feast) return { name: 'ReadingsTest', query: { type: 'feast', feastName: item._feast } };
  if (item._date) return { name: 'ReadingsTest', query: { type: 'date', _date: moment(item._date, ['DD.MM', 'D.M']).format('YYYY-MM-DD') } };
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
      _periodType: item._periodType ? String(item._periodType) : undefined,
      _periodWeekNumber: item._periodWeekNumber ? String(item._periodWeekNumber) : undefined,
      _dayOfWeek: item._dayOfWeek ? String(item._dayOfWeek) : undefined,
      _date: item._date ? String(item._date) : undefined,
      _feast: item._feast ? String(item._feast) : undefined,
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
    if (Number(ctx.periodWeek) < 1) continue;

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

function isMissingReadingText(reading) {
  const text = String(reading?.text || '').trim().toLowerCase();
  return !text || text === 'чтения' || text === '<p>чтения</p>' || text.includes('чтения пока нету');
}

function buildReadingsByDateMap(readingsDocs) {
  const byDate = new Map();
  readingsDocs.forEach((doc) => {
    const normalized = normalizeDate(doc._date);
    if (!normalized) return;
    const list = byDate.get(normalized) || [];
    list.push({ ...doc, _date: normalized });
    byDate.set(normalized, list);
  });
  return byDate;
}

function pushResult(target, payload) {
  target.push(payload);
}

async function scanReadings() {
  loadingReadings.value = true;
  scannedReadings.value = true;
  missingReadings.value = [];
  existingReadings.value = [];

  try {
    const year = moment().year();
    await calendarStore.getYearOptions(year);
    await calendarStore.getYearOptions(year + 1);
    await calendarStore.getDynamicDates(year);

    const readingsSnap = await getDocs(collection(db, 'readings'));
    const readingsDocs = readingsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const byFeast = new Map();
    const byPeriod = new Map();
    const readingsByDate = buildReadingsByDateMap(readingsDocs);

    readingsDocs.forEach((doc) => {
      if (doc._feast) byFeast.set(String(doc._feast).toLowerCase(), doc);
      const pKey = normalizePeriodKey(doc);
      if (pKey) byPeriod.set(pKey, doc);
    });

    const missing = [];
    const existing = [];

    Object.entries(FEAST_NAME_MAP).forEach(([feastKey, feastValue]) => {
      const found = byFeast.get(String(feastValue).toLowerCase());
      const base = {
        key: `readings-feast-${feastValue}`,
        type: 'dynamic',
        title: `Дынамічнае свята: ${feastValue}`,
        subtitle: dynamicSubtitle(feastKey, feastValue, year, found),
        _feast: feastValue,
        createLink: readingLinkFor({ _feast: feastValue }),
      };

      if (!found || isMissingReadingText(found)) pushResult(missing, base);
      else pushResult(existing, base);
    });

    CANONICAL_FIXED_CALENDAR_DATES.forEach((dateKey) => {
      const dateReadings = readingsByDate.get(dateKey) || [];
      const firstDoc = dateReadings[0] || null;
      const hasValidText = dateReadings.some((item) => !isMissingReadingText(item));
      const missingNameRankIds = collectMissingNameRankForReadings(dateReadings);
      const base = {
        key: `readings-date-${dateKey}`,
        type: 'date',
        title: `Фіксаваная дата: ${dateKey}`,
        subtitle: firstDoc ? buildDateSubtitle(dateKey, firstDoc) : `Дата: ${dateKey}`,
        _date: dateKey,
        createLink: readingLinkFor({ _date: dateKey }),
      };

      if (!dateReadings.length) {
        pushResult(missing, { ...base, subtitle: `${base.subtitle} • Статус: няма запісу` });
      } else if (missingNameRankIds.length) {
        pushResult(
          missing,
          { ...base, subtitle: `${base.subtitle} • Статус: не для ўсіх запісаў ёсць title і поле rank (${missingNameRankIds.length})` },
        );
      } else if (!hasValidText) {
        pushResult(missing, { ...base, subtitle: `${base.subtitle} • Статус: няма поўнага тэксту` });
      } else {
        pushResult(existing, { ...base, subtitle: `${base.subtitle} • Статус: ёсць (${dateReadings.length})` });
      }
    });

    const expectedPeriods = await buildExpectedPeriodKeys(year);
    expectedPeriods.forEach((value, key) => {
      const found = byPeriod.get(key);
      const base = {
        key: `readings-period-${key}`,
        type: 'period',
        title: `${value._periodType}: тыдзень ${value._periodWeekNumber}, дзень ${value._dayOfWeek}`,
        subtitle: periodSubtitle(value._periodType, value._periodWeekNumber, value._dayOfWeek),
        ...value,
        createLink: readingLinkFor(value),
      };

      if (!found || isMissingReadingText(found)) {
        pushResult(missing, { ...base, subtitle: `${base.subtitle} • ${found ? 'тэкст-запаўняльнік' : 'няма запісу'}` });
      } else {
        pushResult(existing, { ...base, subtitle: `${base.subtitle} • ёсць` });
      }
    });

    missingReadings.value = missing;
    existingReadings.value = existing;
    notifySuccess(`Знойдзена недастаючых чытанняў: ${missing.length}`);
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
  existingDays.value = [];

  try {
    const year = moment().year();
    await calendarStore.getYearOptions(year);
    await calendarStore.getYearOptions(year + 1);
    await calendarStore.getDynamicDates(year);

    const daysSnap = await getDocs(collection(db, 'days'));
    const daysDocs = daysSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const byFeast = new Map();
    const byPeriod = new Map();
    const dayDates = new Map();

    daysDocs.forEach((doc) => {
      if (doc._feast) byFeast.set(String(doc._feast).toLowerCase(), doc);
      const pKey = normalizePeriodKey(doc);
      if (pKey) byPeriod.set(pKey, doc);
      const date = normalizeDate(doc._date);
      if (!date) return;
      const list = dayDates.get(date) || [];
      list.push(doc);
      dayDates.set(date, list);
    });

    const missing = [];
    const existing = [];

    Object.entries(FEAST_NAME_MAP).forEach(([feastKey, feastValue]) => {
      const found = byFeast.get(String(feastValue).toLowerCase()) || null;
      const base = {
        key: `days-feast-${feastValue}`,
        type: 'dynamic',
        title: `Дынамічнае свята: ${feastValue}`,
        subtitle: dynamicSubtitle(feastKey, feastValue, year, found),
        _feast: feastValue,
        createLink: dayLinkFor({ _feast: feastValue }),
      };
      if (!found) pushResult(missing, base);
      else pushResult(existing, base);
    });

    CANONICAL_FIXED_CALENDAR_DATES.forEach((dateKey) => {
      const matchedDays = dayDates.get(dateKey) || [];
      const matchedDay = matchedDays[0] || null;
      const missingNameRankIds = collectMissingNameRankForDays(matchedDays);
      const base = {
        key: `days-date-${dateKey}`,
        type: 'date',
        title: `Фіксаваная дата: ${dateKey}`,
        subtitle: matchedDay ? buildDateSubtitle(dateKey, matchedDay) : `Дата: ${dateKey}`,
        _date: dateKey,
        createLink: dayLinkFor({ _date: dateKey }),
      };

      if (!matchedDay) {
        pushResult(missing, { ...base, subtitle: `${base.subtitle} • Няма адпаведніка ў days` });
      } else if (missingNameRankIds.length) {
        pushResult(
          missing,
          { ...base, subtitle: `${base.subtitle} • Статус: не для ўсіх запісаў ёсць _feastName і поле _feastType (${missingNameRankIds.length})` },
        );
      } else {
        pushResult(existing, { ...base, subtitle: `${base.subtitle} • ёсць (${matchedDays.length})` });
      }
    });

    const expectedPeriods = await buildExpectedPeriodKeys(year);
    expectedPeriods.forEach((value, key) => {
      const base = {
        key: `days-period-${key}`,
        type: 'period',
        title: `${value._periodType}: тыдзень ${value._periodWeekNumber}, дзень ${value._dayOfWeek}`,
        subtitle: periodSubtitle(value._periodType, value._periodWeekNumber, value._dayOfWeek),
        ...value,
        createLink: dayLinkFor(value),
      };

      if (!byPeriod.has(key)) pushResult(missing, { ...base, subtitle: `${base.subtitle} • Няма запісу ў days` });
      else pushResult(existing, { ...base, subtitle: `${base.subtitle} • ёсць` });
    });

    daysDocs.forEach((dayDoc) => {
      const missingIdentity = DAY_REQUIRED_IDENTITY_FIELDS.filter((field) => !hasNonEmptyValue(dayDoc[field]));
      const missingMetadata = DAY_REQUIRED_METADATA_FIELDS.filter((field) => !hasNonEmptyValue(dayDoc[field]));
      const missingContent = DAY_REQUIRED_CONTENT_FIELDS.filter((field) => !hasNonEmptyValue(dayDoc[field]));
      const hasInvalidFeastComment = !isHolidayDay(dayDoc) && hasNonEmptyValue(dayDoc.feastComment);
      const dateLabel = normalizeDate(dayDoc?._date) || 'без _date';
      const periodLabel = normalizePeriodKey(dayDoc) || 'без period-key';

      const details = [];
      if (missingIdentity.length) details.push(`ідэнтыфікатары: ${missingIdentity.join(', ')}`);
      if (missingMetadata.length) details.push(`метаданыя: ${missingMetadata.join(', ')}`);
      if (missingContent.length) details.push(`блокі: ${missingContent.join(', ')}`);
      if (hasInvalidFeastComment) details.push('feastComment запоўнены, але дзень не з\'яўляецца святам');

      const base = {
        key: `days-fields-${dayDoc.id}`,
        type: 'fields',
        title: `days/${dayDoc.id}`,
        subtitle: `Дата: ${dateLabel} • Ключ: ${periodLabel}`,
        createLink: { name: 'AdminDayEditor', params: { id: dayDoc.id } },
      };

      if (details.length) {
        pushResult(missing, { ...base, subtitle: `${base.subtitle} • ${details.join(' • ')}` });
      } else {
        pushResult(existing, { ...base, subtitle: `${base.subtitle} • усе абавязковыя палі запоўнены` });
      }
    });

    missingDays.value = missing;
    existingDays.value = existing;
    notifySuccess(`Знойдзена недастаючых літургічных дзён: ${missing.length}`);
  } catch (error) {
    notifyError(`Памылка пры пошуку недастаючых дзён: ${error.message || error}`);
  } finally {
    loadingDays.value = false;
  }
}
</script>

<style scoped>
.item-subtitle {
  white-space: normal;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
</style>
