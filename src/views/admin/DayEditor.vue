<template>
  <div>
    <v-app-bar color="primary" app>
      <v-btn icon="mdi-arrow-left" aria-label="Назад" @click="goBack" />
      <v-toolbar-title>{{ isNew ? 'Новы літургічны дзень' : 'Рэдагаванне літургічнага дня' }}</v-toolbar-title>
      <v-spacer />
      <v-btn
        v-if="!isNew"
        class="mr-2"
        variant="text"
        prepend-icon="mdi-content-copy"
        @click="createCopy"
      >
        Стварыць копію
      </v-btn>
      <v-btn :loading="saving" variant="text" @click="saveChanges">Захаваць усё</v-btn>
    </v-app-bar>

    <div v-if="loading" class="d-flex justify-center align-center ga-4" style="height: 80vh;">
      <v-progress-circular indeterminate color="primary" size="64" />
      <span>Збіраем літургічны дзень…</span>
    </div>

    <v-container v-else-if="dayData" class="day-editor pb-16">
      <v-alert v-if="loadError" type="warning" variant="tonal" class="mb-4">
        {{ loadError }}
      </v-alert>

      <v-card class="mb-6" variant="outlined">
        <v-card-title>Пра гэты дзень</v-card-title>
        <v-card-subtitle class="pb-2">
          Тут задаюцца ўласныя тэксты дня. Агульныя і аўтаматычна падабраныя часткі пазначаны каля кожнага поля.
        </v-card-subtitle>
        <v-card-text>
          <v-row>
            <v-col cols="12" md="4">
              <v-select v-model="dayData._periodType" :items="periodOptions" label="Літургічны перыяд" clearable hide-details variant="outlined" density="compact" />
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field v-model.number="dayData._periodWeekNumber" label="Нумар тыдня" type="number" hide-details variant="outlined" density="compact" />
            </v-col>
            <v-col cols="12" md="4">
              <v-select v-model="dayData._dayOfWeek" :items="dayOfWeekOptions" label="Дзень тыдня" clearable hide-details variant="outlined" density="compact" />
            </v-col>
          </v-row>
          <v-row>
            <v-col cols="12" md="3">
              <v-text-field v-model="dayData._date" label="Дата (ДД.ММ)" hide-details variant="outlined" density="compact" />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field v-model="dayData._feastName" label="Назва дня або свята" hide-details variant="outlined" density="compact" />
            </v-col>
            <v-col cols="12" md="3">
              <v-text-field v-model="dayData._rank" label="Ранг" hide-details variant="outlined" density="compact" />
            </v-col>
          </v-row>
          <v-row>
            <v-col cols="12" md="4">
              <v-text-field v-model="dayData._feast" label="Рухомае свята" hide-details variant="outlined" density="compact" />
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field v-model="dayData._psalmWeek" label="Тыдзень псалтыра" hide-details variant="outlined" density="compact" />
            </v-col>
            <v-col cols="6" md="2">
              <v-checkbox v-model="dayData.allowedAlleluia" label="Аллелюя" hide-details density="compact" />
            </v-col>
            <v-col cols="6" md="2">
              <v-checkbox v-model="dayData.checked" label="Праверана" hide-details density="compact" />
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <v-expansion-panels v-model="panels" multiple variant="accordion">
        <v-expansion-panel value="general">
          <v-expansion-panel-title>Каментар</v-expansion-panel-title>
          <v-expansion-panel-text class="pa-1">
            <v-row no-gutters>
              <InlineEditor v-model="dayData.feastComment" field-title="Каментар да дня" source-label="Уласны тэкст" source-color="success" />
            </v-row>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <v-expansion-panel value="invitatorium">
          <v-expansion-panel-title>
            <div class="d-flex align-center flex-wrap ga-2">
              <span>Заклік</span>
              <v-chip size="x-small" color="info" variant="tonal">Сабіраецца з двух частак</v-chip>
            </div>
          </v-expansion-panel-title>
          <v-expansion-panel-text class="pa-1">
            <v-alert type="info" variant="tonal" density="compact" class="ma-3">
              Антыфона належыць гэтаму дню, а псальм з'яўляецца агульным варыянтам. Рэдактар захавае кожную частку ў патрэбным месцы.
            </v-alert>
            <v-row no-gutters>
              <InlineEditor v-model="dayData.invitatoriumAnt" field-title="Антыфона Закліку" source-label="Уласны тэкст дня" source-color="success" />
            </v-row>

            <div class="px-3 pb-2">
              <v-select
                v-model="selectedInvitatoriumId"
                :items="invitatoriumOptions"
                item-title="label"
                item-value="id"
                label="Псальм Закліку"
                :loading="loadingInvitatoriums"
                hide-details
                variant="outlined"
              />
            </div>
            <v-row v-if="selectedInvitatorium" no-gutters>
              <InlineEditor
                v-for="field in INVITATORIUM_EDITOR_FIELDS"
                :key="field.key"
                v-model="selectedInvitatorium[field.key]"
                :field-title="field.title"
                source-label="Агульны варыянт Закліку"
                source-color="info"
              />
            </v-row>
            <v-alert v-else-if="!loadingInvitatoriums" type="warning" variant="tonal" class="ma-3">
              Агульны псальм Закліку не знойдзены.
            </v-alert>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <v-expansion-panel v-if="seasonalSourceField" value="seasonal-source">
          <v-expansion-panel-title>
            <div class="d-flex align-center flex-wrap ga-2">
              <span>Антыфоны дня тыдня</span>
              <v-chip size="x-small" color="info" variant="tonal">Крыніца для Ютрані і Нешпараў</v-chip>
            </div>
          </v-expansion-panel-title>
          <v-expansion-panel-text class="pa-1">
            <v-alert type="info" variant="tonal" density="compact" class="ma-3">
              Тры антыфоны з гэтага набору аўтаматычна падстаўляюцца ў Ютрань і Нешпары.
            </v-alert>
            <v-row no-gutters>
              <InlineEditor
                v-model="dayData[seasonalSourceField]"
                :field-title="`Набор антыфонаў: ${weekdayLabel(editorDayOfWeek)}`"
                source-label="Крыніца аўтаматычнай зборкі"
                source-color="info"
              />
            </v-row>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <v-expansion-panel v-for="section in DAY_EDITOR_SECTIONS" :key="section.key" :value="section.key">
          <v-expansion-panel-title>{{ section.title }}</v-expansion-panel-title>
          <v-expansion-panel-text class="pa-1">
            <v-alert v-if="section.note" type="info" variant="tonal" density="compact" class="ma-3">
              {{ section.note }}
            </v-alert>
            <v-row no-gutters>
              <InlineEditor
                v-for="field in section.fields"
                :key="field.key"
                v-model="dayData[field.key]"
                :display-value="fieldDisplayValue(field.key)"
                :field-title="field.title"
                :source-label="fieldSource(field.key).label"
                :source-color="fieldSource(field.key).color"
                :read-only="fieldSource(field.key).readOnly"
                :source-action-label="fieldSourceActionLabel(field.key)"
                :hint="fieldHint(field.key)"
                @source-action="openFieldSource(field.key)"
              />
            </v-row>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <v-expansion-panel value="completorium">
          <v-expansion-panel-title>
            <div class="d-flex align-center flex-wrap ga-2">
              <span>Камплета</span>
              <v-chip size="x-small" color="secondary" variant="tonal">Падбіраецца па календары</v-chip>
            </div>
          </v-expansion-panel-title>
          <v-expansion-panel-text class="pa-1">
            <v-alert type="info" variant="tonal" density="compact" class="ma-3">
              Камплета агульная для перыяду і дня тыдня. Ва ўрачыстасці выкарыстоўваецца нядзельны варыянт. Змены паўплываюць на ўсе дні, дзе выбіраецца гэты варыянт.
            </v-alert>
            <div v-if="completoriumId" class="px-3 pb-2 text-body-2 text-medium-emphasis">
              Выбраны варыянт: <strong>{{ completoriumTitle }}</strong>
            </div>
            <div v-if="loadingCompletorium" class="d-flex justify-center pa-8">
              <v-progress-circular indeterminate color="primary" />
            </div>
            <v-row v-else-if="completoriumData" no-gutters>
              <InlineEditor
                v-for="field in COMPLETORIUM_EDITOR_FIELDS"
                :key="field.key"
                v-model="completoriumData[field.key]"
                :field-title="field.title"
                source-label="Агульны варыянт камплеты"
                source-color="secondary"
              />
            </v-row>
            <v-alert v-else type="warning" variant="tonal" class="ma-3">
              {{ completoriumId
                ? 'Варыянт камплеты не знойдзены.'
                : 'Каб падабраць камплету, адкрыйце рэдактар з канкрэтнай календарнай даты або задайце перыяд і дзень тыдня.' }}
            </v-alert>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-container>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { collection, doc, getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import InlineEditor from '@/components/admin/InlineEditor.vue';
import { useLiturgicalDay } from '@/composables/useLiturgicalDay';
import { useNotifier } from '@/composables/useNotifier';
import { DAY_EDITOR_COPY_CLEARED_FIELDS, LITURGICAL_DAYS_COLLECTION } from '@/constants/days';
import {
  COMPLETORIUM_EDITOR_FIELDS,
  DAY_EDITOR_SECTIONS,
  INVITATORIUM_EDITOR_FIELDS,
  WEEKDAY_ASSEMBLY_FIELDS,
} from '@/constants/liturgicalEditor';
import { PERIOD_LABEL_MAP, WEEKDAY_LABEL_MAP } from '@/constants/liturgical';
import { getCompletoriumId } from '@/composables/useCompletorium';
import { getDefaultInvitatoriumId } from '@/utils/invitatorium';
import {
  applySeasonalWeekdayAntiphons,
  getPeriodDayDocumentId,
  resolveDateDayAgainstPeriod,
  resolveDayAgainstPeriod,
} from '@/utils/liturgicalDayResolution';
import {
  EDITOR_SOURCE_KIND,
  getDayEditorFieldSource,
  getDayEditorFieldValue,
} from '@/utils/liturgicalEditorSources';
import moment from '@/utils/moment-be';
import { logger } from '@/utils/logger';
import { retryFirestore } from '@/utils/retry';

const SESSION_KEY_COPY = 'dayEditorCopyData';
const INVITATORIUM_COLLECTION = 'invitatoriums';
const COMPLETORIUM_COLLECTION = 'completoriums';

const route = useRoute();
const router = useRouter();
const { computeLiturgicalContextForDate } = useLiturgicalDay();
const { success, error: notifyError } = useNotifier();

const dayId = computed(() => String(route.params.id || ''));
const isNew = computed(() => dayId.value === 'new');
const loading = ref(true);
const saving = ref(false);
const loadError = ref('');
const panels = ref(['general', 'invitatorium']);
const dayData = ref(null);
const calendarContext = ref(null);
const fallbackDay = ref(null);

const invitatoriums = ref([]);
const invitatoriumOriginals = new Map();
const selectedInvitatoriumId = ref('');
const loadingInvitatoriums = ref(false);

const completoriumData = ref(null);
const completoriumOriginal = ref('');
const loadingCompletorium = ref(false);
let completoriumLoadSequence = 0;

const periodOptions = Object.entries(PERIOD_LABEL_MAP).map(([value, title]) => ({ value, title }));
const dayOfWeekOptions = Object.entries(WEEKDAY_LABEL_MAP).map(([value, title]) => ({ value: Number(value), title }));

const usesCalendarDateContext = computed(() => Boolean(dayData.value?._date && calendarContext.value));
const editorPeriodType = computed(() => (
  usesCalendarDateContext.value
    ? calendarContext.value?.periodType
    : dayData.value?._periodType || calendarContext.value?.periodType || ''
));
const editorPeriodWeek = computed(() => (
  usesCalendarDateContext.value
    ? calendarContext.value?.periodWeek ?? null
    : dayData.value?._periodWeekNumber ?? calendarContext.value?.periodWeek ?? null
));
const editorDayOfWeek = computed(() => Number(
  usesCalendarDateContext.value
    ? calendarContext.value?.dayOfWeek
    : dayData.value?._dayOfWeek || calendarContext.value?.dayOfWeek,
) || null);
const fallbackDayId = computed(() => getPeriodDayDocumentId(editorPeriodType.value, editorPeriodWeek.value, editorDayOfWeek.value));
const completoriumId = computed(() => getCompletoriumId(editorPeriodType.value, editorDayOfWeek.value, dayData.value));
const completoriumTitle = computed(() => {
  const period = PERIOD_LABEL_MAP[editorPeriodType.value] || editorPeriodType.value;
  const day = WEEKDAY_LABEL_MAP[Number(completoriumData.value?._dayOfWeek || editorDayOfWeek.value)] || '';
  return completoriumData.value?.title || [period, day].filter(Boolean).join(' — ') || completoriumId.value;
});

const selectedInvitatorium = computed(() => invitatoriums.value.find((item) => item.id === selectedInvitatoriumId.value) || null);
const invitatoriumOptions = computed(() => invitatoriums.value.map((item, index) => ({ id: item.id, label: invitatoriumLabel(item, index) })));
const seasonalSourceField = computed(() => {
  const field = WEEKDAY_ASSEMBLY_FIELDS[editorDayOfWeek.value];
  return field && Object.prototype.hasOwnProperty.call(dayData.value || {}, field) ? field : '';
});

const assembledDay = computed(() => {
  if (!dayData.value) return {};
  const resolved = dayData.value._date
    ? resolveDateDayAgainstPeriod(dayData.value, fallbackDay.value)
    : resolveDayAgainstPeriod(dayData.value, fallbackDay.value);
  return applySeasonalWeekdayAntiphons(resolved, editorDayOfWeek.value);
});

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function comparable(value) {
  return JSON.stringify(value || {});
}

function withoutId(value) {
  const result = { ...(value || {}) };
  delete result.id;
  return result;
}

function createEmptyDay() {
  return {
    _periodType: route.query._periodType || '',
    _periodWeekNumber: route.query._periodWeekNumber ? Number(route.query._periodWeekNumber) : null,
    _dayOfWeek: route.query._dayOfWeek ? Number(route.query._dayOfWeek) : null,
    _date: route.query._date || '',
    _feast: route.query._feast || '',
    _feastName: '',
    _rank: '',
    _psalmWeek: '',
    allowedAlleluia: true,
    checked: false,
    feastComment: '',
    invitatoriumAnt: '',
    ...Object.fromEntries(DAY_EDITOR_SECTIONS.flatMap((section) => section.fields.map((field) => [field.key, '']))),
  };
}

async function loadCalendarContext() {
  const date = moment(String(route.query.date || ''), 'YYYY-MM-DD', true);
  if (!date.isValid()) return;
  try {
    calendarContext.value = await computeLiturgicalContextForDate(date.toDate());
  } catch (error) {
    logger.error('[DayEditor] calendar context failed:', error);
    loadError.value = 'Не атрымалася вызначыць каляндарны кантэкст. Уласныя тэксты дня ўсё яшчэ можна рэдагаваць.';
  }
}

async function loadDay() {
  if (isNew.value) {
    const copyData = sessionStorage.getItem(SESSION_KEY_COPY);
    if (copyData) {
      try {
        dayData.value = JSON.parse(copyData);
        sessionStorage.removeItem(SESSION_KEY_COPY);
      } catch {
        dayData.value = createEmptyDay();
      }
    } else if (route.query.duplicateFrom) {
      const source = await getDoc(doc(db, LITURGICAL_DAYS_COLLECTION, String(route.query.duplicateFrom)));
      dayData.value = source.exists() ? clone(source.data()) : createEmptyDay();
    } else {
      dayData.value = createEmptyDay();
    }
    return;
  }

  const snapshot = await getDoc(doc(db, LITURGICAL_DAYS_COLLECTION, dayId.value));
  if (!snapshot.exists()) throw new Error('Літургічны дзень не знойдзены.');
  dayData.value = clone(snapshot.data());
}

async function loadFallbackDay() {
  const id = fallbackDayId.value;
  if (!id || id === dayId.value) {
    fallbackDay.value = null;
    return;
  }
  try {
    const snapshot = await getDoc(doc(db, LITURGICAL_DAYS_COLLECTION, id));
    fallbackDay.value = snapshot.exists() ? { id, ...snapshot.data() } : null;
  } catch (error) {
    logger.error('[DayEditor] fallback day failed:', error);
    fallbackDay.value = null;
  }
}

async function loadInvitatoriums() {
  loadingInvitatoriums.value = true;
  try {
    const snapshot = await getDocs(collection(db, INVITATORIUM_COLLECTION));
    invitatoriums.value = snapshot.docs.map((item) => ({ id: item.id, ...clone(item.data()) }));
    invitatoriumOriginals.clear();
    invitatoriums.value.forEach((item) => invitatoriumOriginals.set(item.id, comparable(withoutId(item))));
    selectedInvitatoriumId.value = getDefaultInvitatoriumId(invitatoriums.value, editorPeriodType.value);
  } catch (error) {
    logger.error('[DayEditor] invitatoriums failed:', error);
    loadError.value = 'Уласныя тэксты загружаны, але агульныя псальмы Закліку недаступныя.';
  } finally {
    loadingInvitatoriums.value = false;
  }
}

async function loadCompletorium() {
  const sequence = ++completoriumLoadSequence;
  const id = completoriumId.value;
  completoriumData.value = null;
  completoriumOriginal.value = '';
  if (!id) return;
  loadingCompletorium.value = true;
  try {
    const snapshot = await getDoc(doc(db, COMPLETORIUM_COLLECTION, id));
    if (sequence !== completoriumLoadSequence) return;
    if (snapshot.exists()) {
      completoriumData.value = { id, ...clone(snapshot.data()) };
      completoriumOriginal.value = comparable(withoutId(completoriumData.value));
    }
  } catch (error) {
    logger.error('[DayEditor] completorium failed:', error);
  } finally {
    if (sequence === completoriumLoadSequence) loadingCompletorium.value = false;
  }
}

async function initialize() {
  loading.value = true;
  loadError.value = '';
  try {
    await Promise.all([loadDay(), loadCalendarContext()]);
    await Promise.all([loadFallbackDay(), loadInvitatoriums(), loadCompletorium()]);
  } catch (error) {
    logger.error('[DayEditor] load failed:', error);
    loadError.value = error?.message || 'Не атрымалася загрузіць літургічны дзень.';
    if (!dayData.value) dayData.value = createEmptyDay();
  } finally {
    loading.value = false;
  }
}

function invitatoriumLabel(item, index) {
  const plain = String(item.invitatoriumPs1 || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return item.title || item.name || plain.match(/Псальм\s+\d+(?:\s*\(\d+\))?/i)?.[0] || `Псальм ${index + 1}`;
}

function weekdayLabel(day) {
  return WEEKDAY_LABEL_MAP[Number(day)] || '';
}

function isSeasonalGeneratedField(field) {
  return Boolean(seasonalSourceField.value) && /^(?:laudes|vesper)Ant[123]$/.test(field);
}

function fieldSource(field) {
  if (isSeasonalGeneratedField(field)) {
    return { kind: 'seasonal-assembly', label: 'Сабрана з набору дня тыдня', color: 'info', readOnly: true };
  }
  return getDayEditorFieldSource(dayData.value, field);
}

function fieldDisplayValue(field) {
  return getDayEditorFieldValue(dayData.value, assembledDay.value, field);
}

function fieldSourceActionLabel(field) {
  const source = fieldSource(field);
  if (source.kind === EDITOR_SOURCE_KIND.SHARED_DAYTIME) return 'Да агульнага тэксту';
  if (source.kind === EDITOR_SOURCE_KIND.INHERITED && fallbackDay.value) return 'Рэдагаваць агульны тэкст';
  return '';
}

function fieldHint(field) {
  const source = fieldSource(field);
  if (source.kind === EDITOR_SOURCE_KIND.INHERITED) return 'Ніжэй паказаны выніковы тэкст. Ён змяняецца ў агульным літургічным дні.';
  if (source.kind === EDITOR_SOURCE_KIND.SHARED_DAYTIME) return 'Гэта поле не дублюецца: выкарыстоўваецца адпаведны тэкст малітвы перад поўднем.';
  if (source.kind === 'seasonal-assembly') return 'Ніжэй паказаны вынік аўтаматычнай зборкі з набору антыфонаў дня тыдня.';
  return '';
}

function openFieldSource(field) {
  const source = fieldSource(field);
  if (source.kind === EDITOR_SOURCE_KIND.SHARED_DAYTIME) {
    panels.value = [...new Set([...panels.value, 'sext1'])];
    nextTick(() => document.querySelector('.day-editor')?.scrollIntoView({ behavior: 'smooth' }));
    return;
  }
  if (source.kind === EDITOR_SOURCE_KIND.INHERITED && fallbackDay.value?.id) {
    router.push({ name: 'AdminDayEditor', params: { id: fallbackDay.value.id }, query: route.query.date ? { date: route.query.date } : {} });
  }
}

async function saveChanges() {
  if (!dayData.value) return;
  saving.value = true;
  try {
    const batch = writeBatch(db);
    const targetRef = isNew.value ? doc(collection(db, LITURGICAL_DAYS_COLLECTION)) : doc(db, LITURGICAL_DAYS_COLLECTION, dayId.value);
    const dayPayload = withoutId(dayData.value);
    dayPayload.allowedAlleluia = dayData.value.allowedAlleluia !== false;
    dayPayload.checked = dayData.value.checked === true;
    batch.set(targetRef, dayPayload, { merge: !isNew.value });

    invitatoriums.value.forEach((item) => {
      const payload = withoutId(item);
      if (invitatoriumOriginals.get(item.id) !== comparable(payload)) {
        batch.set(doc(db, INVITATORIUM_COLLECTION, item.id), payload, { merge: true });
      }
    });

    if (completoriumData.value) {
      const payload = withoutId(completoriumData.value);
      if (completoriumOriginal.value !== comparable(payload)) {
        batch.set(doc(db, COMPLETORIUM_COLLECTION, completoriumData.value.id), payload, { merge: true });
      }
    }

    await retryFirestore(() => batch.commit());
    success('Усе змененыя часткі літургічнага дня захаваны.');
    invitatoriums.value.forEach((item) => invitatoriumOriginals.set(item.id, comparable(withoutId(item))));
    if (completoriumData.value) completoriumOriginal.value = comparable(withoutId(completoriumData.value));
    if (isNew.value) await router.replace({ name: 'AdminDayEditor', params: { id: targetRef.id }, query: route.query });
  } catch (error) {
    logger.error('[DayEditor] save failed:', error);
    notifyError(`Не атрымалася захаваць змены: ${error?.message || 'невядомая памылка'}`);
  } finally {
    saving.value = false;
  }
}

function createCopy() {
  const copyData = clone(dayData.value);
  delete copyData.id;
  DAY_EDITOR_COPY_CLEARED_FIELDS.forEach((key) => {
    copyData[key] = key === '_periodWeekNumber' ? null : '';
  });
  [...INVITATORIUM_EDITOR_FIELDS, ...COMPLETORIUM_EDITOR_FIELDS].forEach(({ key }) => delete copyData[key]);
  sessionStorage.setItem(SESSION_KEY_COPY, JSON.stringify(copyData));
  router.push({ name: 'AdminDayEditor', params: { id: 'new' } });
}

const goBack = () => router.go(-1);

watch(fallbackDayId, loadFallbackDay);
watch(completoriumId, loadCompletorium);
watch(editorPeriodType, (period) => {
  if (!selectedInvitatoriumId.value && invitatoriums.value.length) {
    selectedInvitatoriumId.value = getDefaultInvitatoriumId(invitatoriums.value, period);
  }
});
watch(dayId, initialize);
onMounted(initialize);
</script>

<style scoped>
.day-editor {
  width: min(100%, 1120px);
}

.day-editor :deep(.v-expansion-panel-title__overlay) {
  opacity: 0;
}
</style>
