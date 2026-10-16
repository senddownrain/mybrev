<template>
  <article class="catalog-detail">
    <header>
      <h1>{{ entry.title }}</h1>
      <p>{{ entry.rankLabel }} <span v-if="entry.dateLabel">· {{ entry.dateLabel }}</span></p>
      <VestmentMarker v-if="entry.color" :color="entry.color" />
      <p v-for="place in entry.placeLabels" :key="place">{{ place }}</p>
      <p>{{ catalogContentLabel(entry) }}</p>
    </header>
    <div class="catalog-actions">
      <button type="button" @click="showPanel('preview')">Праглядзець тэксты</button>
      <button type="button" @click="showPanel('calendar')">Адкрыць у календары</button>
    </div>

    <section v-if="panel === 'preview'" class="source-preview" aria-label="Прагляд тэкстаў" aria-live="polite">
      <h2>Даступныя крыніцы тэкстаў</h2>
      <p>Даведачны прагляд уласных і агульных крыніц. Для літургіі канкрэтнага дня адкрыйце каляндар: дапушчальнасць вызначае Ordo.</p>
      <p v-if="loading" role="status">Загрузка тэкстаў…</p>
      <template v-else-if="preview">
        <p class="preview-availability">{{ availabilityLabel }}</p>
        <p v-if="preview.status === 'no-content'" role="status">Тэксты для гэтай пазіцыі не знойдзены. Даступнасць у календары правяраецца асобна.</p>
        <p v-if="preview.missing.length">Частка пазначаных крыніц недаступная.</p>
        <div v-if="preview.errors.length" role="alert">
          <p>Не ўсе крыніцы ўдалося загрузіць. Праверце злучэнне і паўтарыце.</p>
          <button type="button" @click="loadPreview">Паўтарыць загрузку</button>
        </div>
        <details v-for="source in preview.sources" :key="`${source.collection}:${source.id}`" class="source-document" open>
          <summary>{{ source.label }}</summary>
          <p v-if="!source.fields.length">У гэтай крыніцы няма самастойных тэкстаў.</p>
          <section v-for="field in source.fields" :key="field.key" class="source-field">
            <h3>{{ field.label }}</h3>
            <div v-html="renderPrayerMarkdown(field.text)" />
          </section>
          <details v-if="source.instructions.length">
            <summary>Спасылкі на іншыя літургічныя часткі</summary>
            <p v-for="instruction in source.instructions" :key="instruction.key">{{ instruction.label }}: {{ instruction.text }}</p>
          </details>
        </details>
        <section aria-label="Крыніцы чытанняў">
          <h2>Чытанні з крыніц</h2>
          <p>Усе наяўныя цыклы і наборы пададзены для даведкі. Выбар цыкла тут не замяняе чытанняў каляндарнага дня.</p>
          <p v-if="!readingViews.length">Уласныя чытанні не знойдзены. Чытанні будня вызначаюцца толькі для канкрэтнай даты.</p>
          <ParsedReadingCard v-for="reading in readingViews" :key="reading.id" :reading="reading" />
        </section>
      </template>
      <div v-else role="alert"><p>Не ўдалося загрузіць тэксты.</p><button type="button" @click="loadPreview">Паўтарыць загрузку</button></div>
    </section>

    <section v-if="panel === 'calendar'" class="calendar-occurrence" aria-label="Дапушчальнасць у календары" aria-live="polite">
      <h2>Дапушчальнасць у календары</h2>
      <div class="calendar-controls">
        <label>Каляндарны год
          <input v-model.number="year" type="number" min="1583" max="4099" step="1" aria-label="Каляндарны год">
        </label>
        <label>Дыяцэзія
          <select v-model="diocese" aria-label="Дыяцэзія">
            <option v-for="id in dioceses" :key="id" :value="id">{{ PLACE_LABEL_MAP[id] }}</option>
          </select>
        </label>
      </div>
      <div class="catalog-actions">
        <button type="button" @click="year = currentYear">Бягучы год</button>
        <button type="button" @click="year = currentYear + 1">Наступны год</button>
      </div>
      <template v-if="occurrence">
        <strong class="occurrence-status">{{ OCCURRENCE_LABELS[occurrence.status] }}</strong>
        <p v-if="occurrence.originalDate">Намінальная дата: {{ occurrence.originalDate }}</p>
        <p v-if="occurrence.effectiveDate">Фактычная дата: {{ occurrence.effectiveDate }}</p>
        <p v-if="occurrence.reason">{{ occurrence.reason }}</p>
        <p>Літургія гадзінаў: {{ occurrence.canOpenHours ? 'дазволена' : 'асобны варыянт не дазволены' }}.<br>Чытанні: {{ occurrence.canOpenReadings ? 'дазволена' : 'асобны варыянт не дазволены' }}.</p>
        <button type="button" :disabled="!calendarRoute" @click="openCalendar">{{ mode === 'readings' ? 'Перайсці да чытанняў' : 'Перайсці да літургіі гадзінаў' }}</button>
        <p v-if="!calendarRoute && nearest">Найбліжэйшы правераны год: <button type="button" @click="year = nearest.year">{{ nearest.year }}</button></p>
        <p v-else-if="!calendarRoute">Дазволены варыянт не знойдзены ў межах 12 гадоў. Можна праверыць іншы год.</p>
      </template>
      <p v-else>Увядзіце цэлы год ад 1583 да 4099.</p>
    </section>
  </article>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { catalogContentLabel } from '@/utils/liturgicalCatalog';
import { calendarOccurrence, nearestCatalogYear, occurrenceRoute, OCCURRENCE_LABELS } from '@/utils/catalogOccurrence';
import { fetchCatalogPreview } from '@/services/catalogPreviewService';
import { ordoDioceses } from '@/utils/ordoDiocese';
import { ordoCalendarEpoch } from '@/utils/ordoCalendarState';
import { PLACE_LABEL_MAP } from '@/constants/liturgical';
import { renderPrayerMarkdown } from '@/utils/prayerMarkdown';
import { massReadingSetsOf, readingViewOfSet, setCycles } from '@/utils/massReadingSets';
import ParsedReadingCard from '@/components/readings/ParsedReadingCard.vue';
import VestmentMarker from './VestmentMarker.vue';

const props = defineProps({ entry: { type: Object, required: true }, mode: { type: String, default: 'hours' } });
const route = useRoute(), router = useRouter();
const currentYear = new Date().getFullYear();
const queryYear = (value) => value === undefined ? currentYear : value === '' ? '' : Number(value);
const year = ref(queryYear(route.query.year));
const dioceses = computed(() => props.entry.dioceses || ordoDioceses.value);
const diocese = ref(dioceses.value.includes(route.query.calendarDiocese) ? route.query.calendarDiocese : dioceses.value[0]);
const panel = computed(() => route.query.panel || '');
const preview = ref(null), loading = ref(false);
let sequence = 0;
const occurrence = computed(() => panel.value === 'calendar' && (ordoCalendarEpoch.value, calendarOccurrence(props.entry, year.value, diocese.value, props.mode, { preview: preview.value })));
const calendarRoute = computed(() => occurrenceRoute(occurrence.value, props.mode));
const nearest = computed(() => occurrence.value && !calendarRoute.value ? nearestCatalogYear(props.entry, year.value, diocese.value, props.mode) : null);
const availabilityLabel = computed(() => ({ 'proper-and-common': 'Наяўныя ўласныя і агульныя тэксты. Гэта асобныя крыніцы.', 'proper-only': 'Наяўныя толькі ўласныя часткі.', 'common-only': 'Наяўныя толькі агульныя крыніцы; уласныя тэксты не знойдзены.', none: 'Тэксты літургічных гадзінаў не знойдзены.' })[preview.value?.availability]);
const readingViews = computed(() => (preview.value?.readings || []).flatMap((doc) => {
  const sets = massReadingSetsOf(doc);
  return sets.length ? sets.flatMap((set) => (setCycles(set).length ? setCycles(set) : ['']).map((cycle) => ({ ...readingViewOfSet(doc, set, cycle), id: `${doc.id}:${set.id}:${cycle}` }))) : [doc];
}));
function showPanel(value) { router.push({ query: { ...route.query, panel: value } }); }
async function loadPreview() {
  const request = ++sequence;
  loading.value = true;
  preview.value = null;
  try {
    const result = await fetchCatalogPreview(props.entry, diocese.value);
    if (request === sequence) preview.value = result;
  } catch {
    if (request === sequence) preview.value = null;
  } finally { if (request === sequence) loading.value = false; }
}
watch([() => props.entry.key, diocese, panel, ordoCalendarEpoch], ([key, id, , epoch], previous = []) => {
  if (key !== previous[0] || id !== previous[1] || epoch !== previous[3]) preview.value = null;
  if (panel.value === 'preview') loadPreview().catch(() => {});
  else { sequence += 1; loading.value = false; }
}, { immediate: true });
watch([year, diocese], () => {
  router.replace({ query: { ...route.query, year: String(year.value), calendarDiocese: diocese.value } });
});
watch(() => [route.query.year, route.query.calendarDiocese], ([value, id]) => {
  year.value = queryYear(value);
  diocese.value = dioceses.value.includes(id) ? id : dioceses.value[0];
});
function openCalendar() {
  // Revalidate against the CURRENT published Ordo immediately before navigation.
  const target = occurrenceRoute(calendarOccurrence(props.entry, year.value, diocese.value, props.mode), props.mode);
  if (target) router.push(target);
}
</script>
<style scoped>
.catalog-detail, .source-preview, .calendar-occurrence { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; min-width: 0; overflow-wrap: anywhere; }
.catalog-detail > *, .source-preview > *, .calendar-occurrence > * { min-width: 0; max-width: 100%; }
h1 { font-size: clamp(1.6rem, 5vw, 2.4rem); line-height: 1.2; }
h2 { font-size: 1.3rem; } h3 { font-size: 1rem; margin-bottom: 8px; }
.catalog-actions, .calendar-controls { display: flex; flex-wrap: wrap; gap: 10px; }
label { display: grid; gap: 6px; flex: 1 1 180px; min-width: 0; }
input, select, button { font: inherit; color: rgb(var(--v-theme-on-surface)); border: 1px solid var(--nav-border); border-radius: 14px; padding: 12px; background: var(--nav-surface); max-width: 100%; }
input, select { width: 100%; min-width: 0; }
button { white-space: normal; overflow-wrap: anywhere; min-width: 0; }
option { background: rgb(var(--v-theme-surface)); }
button, summary { cursor: pointer; } button:disabled { opacity: .5; cursor: default; }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--chrome-accent); outline-offset: 2px; }
.source-document, .calendar-occurrence { border: 1px solid var(--nav-border); border-radius: 18px; padding: 16px; }
summary { font-weight: 700; padding-block: 8px; }
.source-field { margin-block: 20px; line-height: 1.65; }
.source-field :deep(p) { margin-bottom: 10px; }
.source-field :deep(.rubric) { color: var(--liturgical-red, #b33a3a); }
</style>
