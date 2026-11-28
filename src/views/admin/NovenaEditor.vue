<template>
  <v-container class="editor">
    <v-btn variant="text" rounded="pill" prepend-icon="mdi-arrow-left" class="text-none mb-2" :to="{ name: 'AdminNovenas' }">Усе навэнны</v-btn>
    <v-progress-linear v-if="loading" indeterminate />
    <v-alert v-if="error" type="error" variant="tonal" density="comfortable" class="mb-3">{{ error }}</v-alert>
    <v-alert v-if="notice" type="success" variant="tonal" density="comfortable" class="mb-3">{{ notice }}</v-alert>

    <template v-if="draft">
      <h1>{{ draft.title }}</h1>
      <p class="muted">
        {{ published ? `Апублікавана, версія ${published.contentVersion}` : 'Не апублікавана' }}
        · {{ stored ? 'чарнавік захаваны' : 'чарнавік яшчэ не захаваны' }}
        <template v-if="dirty"> · ёсць незахаваныя змены</template>
        · <router-link :to="{ name: 'PrayerView', params: { id: draft.sourcePrayerId } }">зыходная малітва</router-link>
      </p>

      <section class="panel" :class="{ 'panel--review': problems.length }" aria-label="Праверка">
        <h2>Праверка</h2>
        <p v-if="!problems.length" data-testid="validation-ok">Усе дні збіраюцца з агульнадаступных малітваў.</p>
        <ul v-else>
          <li v-for="item in problems" :key="item">{{ errorLabel(item) }}</li>
        </ul>
        <v-btn v-if="draft.blockers.length" variant="tonal" size="small" rounded="pill" class="text-none" @click="clearBlockers">
          Структура праверана рэдактарам — зняць заўвагі генератара
        </v-btn>
      </section>

      <section class="panel" aria-label="Агульныя звесткі">
        <h2>Агульныя звесткі</h2>
        <v-text-field v-model="draft.title" label="Назва" variant="outlined" density="compact" hide-details />
        <div class="grid mt-3">
          <v-text-field :model-value="draft.durationDays" type="number" min="1" max="31" label="Колькасць дзён" variant="outlined" density="compact" hide-details @update:model-value="setDuration" />
          <v-switch v-model="draft.trackerEnabled" color="primary" inset hide-details density="compact" label="Трэкер уключаны" />
        </div>
      </section>

      <section class="panel" aria-label="Парадак кожнага дня">
        <h2>Парадак кожнага дня</h2>
        <NovenaBlockList v-model:blocks="draft.template" :prayers="prayers" template />
      </section>

      <section class="panel" aria-label="Малітвы дня">
        <h2>Дзень і перадпрагляд</h2>
        <div class="days" role="group" aria-label="Выбар дня">
          <v-btn
            v-for="item in draft.days" :key="item.number" size="small" rounded="pill" class="text-none"
            :variant="item.number === dayNumber ? 'flat' : 'tonal'" :color="item.number === dayNumber ? 'primary' : undefined"
            :aria-pressed="item.number === dayNumber" @click="dayNumber = item.number"
          >{{ item.number }}</v-btn>
        </div>
        <h3>Уласныя блокі дня {{ dayNumber }}</h3>
        <NovenaBlockList v-if="day" :blocks="day.blocks" :prayers="prayers" @update:blocks="setDayBlocks" />

        <div class="preview" data-testid="day-preview">
          <h3>Поўны тэкст дня {{ dayNumber }}</h3>
          <v-alert v-if="preview.error" type="warning" variant="tonal" density="compact">{{ errorLabel(preview.error) }}</v-alert>
          <article v-for="(block, index) in preview.blocks" :key="index" class="preview__block" :class="`preview__block--${block.kind}`">
            <p class="preview__meta">{{ index + 1 }} · {{ kindLabels[block.kind] }}</p>
            <h4 v-if="block.title">{{ block.title }}</h4>
            <div class="preview__text" v-html="renderPrayerMarkdown(block.markdown, 'mybrev-markdown')" />
          </article>
        </div>
      </section>

      <section class="panel" aria-label="Каляндарнае правіла">
        <h2>Каляндарнае правіла</h2>
        <v-switch v-model="draft.schedule.enabled" color="primary" inset hide-details density="compact" label="Прапаноўваць пачаць" />
        <div class="grid">
          <v-select :model-value="draft.schedule.type" :items="typeItems" label="Тып правіла" variant="outlined" density="compact" hide-details @update:model-value="setType" />
          <v-select v-if="draft.schedule.type === 'liturgical'" v-model="draft.schedule.event" :items="eventItems" label="Свята" variant="outlined" density="compact" hide-details />
          <template v-if="['fixedFeast', 'fixedStart'].includes(draft.schedule.type)">
            <v-text-field v-model.number="draft.schedule.day" type="number" min="1" max="31" label="Дзень" variant="outlined" density="compact" hide-details />
            <v-text-field v-model.number="draft.schedule.month" type="number" min="1" max="12" label="Месяц" variant="outlined" density="compact" hide-details />
          </template>
          <v-text-field v-if="['fixedFeast', 'liturgical'].includes(draft.schedule.type)" v-model.number="draft.schedule.offsetDays" type="number" label="Зрух ад свята, дзён" variant="outlined" density="compact" hide-details />
        </div>
        <v-select
          :model-value="draft.schedule.dioceses || []" :items="ORDO_DIOCESES" item-title="label" item-value="value" multiple chips
          label="Толькі ў дыяцэзіях (пуста — усюды)" variant="outlined" density="compact" hide-details class="mt-3" @update:model-value="setDioceses"
        />
        <v-text-field
          v-model="extraDates" label="Разавыя даты пачатку (РРРР-ММ-ДД праз коску)" variant="outlined" density="compact" hide-details class="mt-3"
        />

        <div class="grid mt-4">
          <v-text-field v-model.number="year" type="number" label="Год перадпрагляду" :min="ORDO_MIN_YEAR" :max="ORDO_MAX_YEAR" variant="outlined" density="compact" hide-details />
          <v-select v-model="diocese" :items="ORDO_DIOCESES" item-title="label" item-value="value" label="Дыяцэзія перадпрагляду" variant="outlined" density="compact" hide-details />
        </div>
        <p class="mt-2" data-testid="schedule-preview">
          <strong>Прапанаваны пачатак:</strong> {{ starts.length ? starts.map(formatDate).join(', ') : 'прапановы няма' }}
        </p>
      </section>

      <div class="actions">
        <v-btn variant="tonal" rounded="pill" class="text-none" :loading="busy" :disabled="!dirty && Boolean(stored)" @click="save">Захаваць чарнавік</v-btn>
        <v-btn color="primary" rounded="pill" class="text-none" :loading="busy" :disabled="Boolean(problems.length)" @click="confirmation = 'publish'">Апублікаваць</v-btn>
        <v-btn v-if="published" color="error" variant="text" class="text-none" :loading="busy" @click="confirmation = 'unpublish'">Зняць з публікацыі</v-btn>
      </div>
    </template>

    <v-dialog :model-value="Boolean(confirmation)" max-width="440" @update:model-value="confirmation = ''">
      <v-card>
        <v-card-title>{{ confirmation === 'publish' ? 'Апублікаваць структуру?' : 'Зняць з публікацыі?' }}</v-card-title>
        <v-card-text>
          {{ confirmation === 'publish'
            ? 'Структура стане агульнадаступнай. У праграму яна трапіць пасля выпуску кантэнту.'
            : 'Апублікаваны дакумент будзе выдалены; чарнавік застанецца.' }}
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" class="text-none" @click="confirmation = ''">Скасаваць</v-btn>
          <v-btn color="primary" variant="flat" rounded="pill" class="text-none" @click="confirmed">Пацвердзіць</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup>
import { computed, onMounted, ref, shallowRef } from 'vue';
import { onBeforeRouteLeave, useRoute } from 'vue-router';
import NovenaBlockList from '@/components/admin/novena/NovenaBlockList.vue';
import { errorLabel, EVENT_LABELS, formatDate, isExcluded, TYPE_LABELS } from '@/components/admin/novena/labels';
import { fetchStoredNovena, loadNovenaPrayers, publishNovena, saveNovenaDraft, unpublishNovena } from '@/services/novenaAdminService';
import { resolveDay } from '@/utils/novena/core.mjs';
import { isCivilDate, recommendedStarts } from '@/utils/novena/calendar.mjs';
import { pickDefinition, publicationErrors } from '@/utils/novena/document.mjs';
import { generatedDraft, stableJson } from '@/utils/novena/drafts.mjs';
import { ORDO_DIOCESES, ordoDiocese } from '@/utils/ordoDiocese';
import { ordoCalendarEpoch } from '@/utils/ordoCalendarState';
import { ORDO_MAX_YEAR, ORDO_MIN_YEAR, isSupportedOrdoYear } from '@/utils/liturgicalMovableDates';
import { renderPrayerMarkdown } from '@/utils/prayerMarkdown';

const route = useRoute();
const id = String(route.params.id);
const prayers = shallowRef(new Map());
const stored = shallowRef(null);
const published = shallowRef(null);
const draft = ref(null);
const baseline = ref('');
const extraDates = ref('');
const dayNumber = ref(1);
const year = ref(new Date().getFullYear());
const diocese = ref(ordoDiocese.value);
const loading = ref(true);
const busy = ref(false);
const error = ref('');
const notice = ref('');
const confirmation = ref('');

const kindLabels = { prayer: 'уся малітва', section: 'раздзел', rubric: 'рубрыка', text: 'тэкст' };
const typeItems = Object.entries(TYPE_LABELS).map(([value, title]) => ({ value, title }));
const eventItems = Object.entries(EVENT_LABELS).map(([value, title]) => ({ value, title }));

/** The record as it would be stored, with the dates field applied. */
const current = computed(() => draft.value && {
  ...draft.value,
  schedule: { ...draft.value.schedule, extraDates: extraDates.value.split(/[\s,;]+/).filter(Boolean) },
});
const dirty = computed(() => Boolean(current.value) && stableJson(current.value) !== baseline.value);
const day = computed(() => draft.value?.days.find((item) => item.number === dayNumber.value));
const problems = computed(() => (current.value
  ? [...new Set([...current.value.blockers, ...publicationErrors({ ...pickDefinition(current.value), status: 'draft' }, prayers.value)])]
  : []));
const preview = computed(() => {
  if (!current.value) return { blocks: [], error: '' };
  try {
    return { blocks: resolveDay(current.value, dayNumber.value, prayers.value), error: '' };
  } catch (cause) {
    return { blocks: [], error: cause.message };
  }
});
const starts = computed(() => {
  // Recompute when a newer calendar publication is applied.
  const epoch = ordoCalendarEpoch.value;
  if (epoch < 0 || !current.value || !isSupportedOrdoYear(year.value)) return [];
  const schedule = { ...current.value.schedule, extraDates: current.value.schedule.extraDates.filter(isCivilDate) };
  return recommendedStarts(schedule, Number(year.value), { diocese: diocese.value });
});

function setDuration(value) {
  const duration = Number(value);
  if (!Number.isInteger(duration) || duration < 1 || duration > 31) return;
  draft.value.durationDays = duration;
  draft.value.days = Array.from({ length: duration }, (_, n) => draft.value.days[n] || { number: n + 1, blocks: [] });
  dayNumber.value = Math.min(dayNumber.value, duration);
}
function setDayBlocks(blocks) {
  draft.value.days = draft.value.days.map((item) => (item.number === dayNumber.value ? { ...item, blocks } : item));
}
function setType(type) {
  const { enabled, extraDates: dates, dioceses } = draft.value.schedule;
  const fields = {
    manual: {},
    fixedFeast: { month: 1, day: 1, offsetDays: -9 },
    fixedStart: { month: 1, day: 1 },
    liturgical: { event: 'pentecost', offsetDays: -9 },
  };
  draft.value.schedule = { enabled, extraDates: dates, ...(dioceses ? { dioceses } : {}), type, ...fields[type] };
}
function setDioceses(value) {
  const { dioceses: _previous, ...schedule } = draft.value.schedule;
  draft.value.schedule = value.length ? { ...schedule, dioceses: value } : schedule;
}
function clearBlockers() {
  draft.value.blockers = [];
}

function open(record) {
  draft.value = JSON.parse(JSON.stringify(record));
  extraDates.value = (record.schedule.extraDates || []).join(', ');
  baseline.value = stableJson(current.value);
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    if (isExcluded(id)) throw new Error('Для гэтай навэнны трэкер не ствараецца.');
    const [catalog, saved] = await Promise.all([loadNovenaPrayers(), fetchStoredNovena(id)]);
    prayers.value = catalog;
    stored.value = saved.draft;
    published.value = saved.published;
    const source = catalog.get(id);
    const record = saved.draft
      || (saved.published && { ...saved.published, status: 'draft', blockers: [], everPublished: true })
      || (source && generatedDraft(source, catalog));
    if (!record) throw new Error('Зыходная малітва не знойдзена сярод агульнадаступных.');
    const { updatedAt: _at, updatedBy: _by, ...editable } = record;
    open({ blockers: [], ...editable });
  } catch (cause) {
    error.value = cause?.message || String(cause);
  } finally {
    loading.value = false;
  }
}

async function run(task, message) {
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    await task();
    await load();
    notice.value = message;
  } catch (cause) {
    error.value = cause?.message || String(cause);
  } finally {
    busy.value = false;
  }
}
const save = () => run(() => saveNovenaDraft(current.value, stored.value), 'Чарнавік захаваны.');
function confirmed() {
  const action = confirmation.value;
  confirmation.value = '';
  if (action === 'publish') run(() => publishNovena(current.value, stored.value), 'Структура апублікавана.');
  else run(() => unpublishNovena(id), 'Структура знята з публікацыі.');
}

onBeforeRouteLeave(() => !dirty.value || globalThis.confirm('Пакінуць старонку без захавання змен?'));
onMounted(load);
</script>

<style scoped>
.editor { width: min(100%, 980px); padding: 28px 22px 80px !important; color: var(--nav-on-surface); }
h1 { margin: 0 0 6px; font-family: var(--reader-display-font-family); font-size: clamp(1.5rem, 5vw, 2.1rem); line-height: 1.15; }
.muted { color: var(--nav-muted); font-size: .84rem; }
.panel { margin-bottom: 14px; padding: 18px 20px; border: 1px solid var(--nav-border); border-radius: 20px; background: var(--nav-surface); }
.panel--review { border-color: rgb(var(--v-theme-warning)); }
.panel h2 { margin: 0 0 10px; font-size: 1.02rem; }
.panel h3 { margin: 14px 0 6px; font-size: .92rem; }
.panel ul { margin: 0 0 10px; padding-left: 18px; font-size: .88rem; overflow-wrap: anywhere; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); align-items: center; gap: 12px; }
.days { display: flex; flex-wrap: wrap; gap: 6px; }
.preview { margin-top: 18px; padding-top: 4px; border-top: 1px solid var(--nav-border); }
.preview__block { padding: 10px 0; border-top: 1px dashed var(--nav-border); font-family: var(--reader-font-family); line-height: 1.55; overflow-wrap: anywhere; }
.preview__block--rubric { color: rgb(var(--v-theme-error)); font-size: .92rem; }
.preview__meta { margin: 0 0 4px; color: var(--nav-muted); font-family: inherit; font-size: .72rem; text-transform: uppercase; }
.preview__text :deep(p) { margin: 0 0 8px; }
.preview__text :deep(ul), .preview__text :deep(ol) { padding-left: 22px; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; }
</style>
