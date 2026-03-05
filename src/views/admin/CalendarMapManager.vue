<template>
  <v-container fluid>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h5">Карта календара (calendarMap)</h1>
      <v-spacer></v-spacer>
      <v-btn color="primary" prepend-icon="mdi-plus" @click="createNew">Новы элемент</v-btn>
    </div>

    <v-alert type="info" variant="tonal" class="mb-4">
      Загружана элементаў calendarMap: <b>{{ items.length }}</b>
      · Па перыядзе: <b>{{ periodItems.length }}</b>
      · Па даце: <b>{{ dateItems.length }}</b>
      · Дынамічныя: <b>{{ dynamicItems.length }}</b>
    </v-alert>

    <v-card class="mb-4" variant="tonal">
      <v-card-text class="py-3">
        <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
          <div class="text-subtitle-2">Праверана элементаў карты календара</div>
          <div class="text-body-2">{{ checkedItemsCount }} / {{ items.length }} ({{ checkedItemsPercent }}%)</div>
        </div>
        <v-progress-linear :model-value="checkedItemsPercent" color="success" height="10" rounded />
      </v-card-text>
    </v-card>

    <v-card v-if="isLoading" class="mb-4" variant="outlined">
      <v-card-text>
        <div class="mb-2">{{ loadingText }}</div>
        <v-progress-linear :model-value="loadingProgress" color="primary" height="10" rounded></v-progress-linear>
      </v-card-text>
    </v-card>

    <v-expansion-panels variant="accordion" multiple>
      <v-expansion-panel title="Па перыядзе">
        <v-expansion-panel-text>
          <v-expansion-panels variant="accordion" multiple>
            <v-expansion-panel
              v-for="group in periodGroups"
              :key="group.periodType"
              :title="`${group.periodLabel} (${group.items.length})`"
            >
              <v-expansion-panel-text>
                <v-list density="compact">
                  <v-list-item v-for="item in group.items" :key="item.id" :class="{ 'checked-item': isChecked(item) }" @click="openItem(item.id)">
                    <v-list-item-title>
                      {{ item._periodWeekNumber ?? '—' }} • {{ weekdayLabel(item._dayOfWeek) }}
                    </v-list-item-title>
                    <v-list-item-subtitle>{{ item._feastName || item._date || item.id }}</v-list-item-subtitle>
                    <template #append>
                      <v-checkbox-btn
                        :model-value="isChecked(item)"
                        color="success"
                        class="mr-1"
                        @click.stop
                        @update:model-value="toggleChecked(item, $event)"
                      />
                    </template>
                  </v-list-item>
                </v-list>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
          <v-list v-if="!periodItems.length" density="compact">
            <v-list-item>
              <v-list-item-title class="text-medium-emphasis">Няма элементаў з _periodType</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <v-expansion-panel title="Па даце">
        <v-expansion-panel-text>
          <v-list density="compact">
            <v-list-item v-for="item in dateItems" :key="item.id" :class="{ 'checked-item': isChecked(item) }" @click="openItem(item.id)">
              <v-list-item-title>{{ item._date }}</v-list-item-title>
              <v-list-item-subtitle>{{ item._feastName || item._periodType || item.id }}</v-list-item-subtitle>
              <template #append>
                <v-checkbox-btn
                  :model-value="isChecked(item)"
                  color="success"
                  class="mr-1"
                  @click.stop
                  @update:model-value="toggleChecked(item, $event)"
                />
              </template>
            </v-list-item>
            <v-list-item v-if="!dateItems.length">
              <v-list-item-title class="text-medium-emphasis">Няма элементаў з _date</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <v-expansion-panel title="Дынамічныя дні">
        <v-expansion-panel-text>
          <v-list density="compact">
            <v-list-item v-for="item in dynamicItems" :key="item.id" :class="{ 'checked-item': isChecked(item) }" @click="openItem(item.id)">
              <v-list-item-title>{{ item._feast }}</v-list-item-title>
              <v-list-item-subtitle>{{ item._feastName || item._periodType || item.id }}</v-list-item-subtitle>
              <template #append>
                <v-checkbox-btn
                  :model-value="isChecked(item)"
                  color="success"
                  class="mr-1"
                  @click.stop
                  @update:model-value="toggleChecked(item, $event)"
                />
              </template>
            </v-list-item>
            <v-list-item v-if="!dynamicItems.length">
              <v-list-item-title class="text-medium-emphasis">Няма элементаў з _feast</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <v-dialog v-model="dialog" fullscreen transition="dialog-bottom-transition">
      <v-card>
        <v-toolbar color="primary">
          <v-btn icon="mdi-close" @click="dialog = false"></v-btn>
          <v-toolbar-title>{{ dialogTitle }}</v-toolbar-title>
          <v-spacer></v-spacer>
          <v-btn-toggle v-model="mode" mandatory density="compact" variant="outlined">
            <v-btn value="view" :disabled="isNewItem">Прагляд</v-btn>
            <v-btn value="edit">Рэдагаванне</v-btn>
            <v-btn value="build" :disabled="isNewItem">Пабудова</v-btn>
          </v-btn-toggle>
        </v-toolbar>

        <v-card-text>
          <template v-if="mode === 'view' && selectedItem">
            <v-alert type="info" variant="tonal" class="mb-3">
              Шаблон дня: <b>{{ selectedTemplateTitle }}</b> · Чытанне: <b>{{ selectedReadingTitle }}</b> · Комплета: <b>{{ selectedCompTitle }}</b>
            </v-alert>

            <v-expansion-panels variant="accordion">
              <v-expansion-panel v-for="group in groupedFilledFields" :key="group.title" :title="group.title">
                <v-expansion-panel-text>
                  <div v-for="row in group.items" :key="row.field" class="mb-2">
                    <div class="text-caption text-medium-emphasis">{{ row.field }}</div>
                    <div v-html="row.value"></div>
                  </div>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </template>

          <template v-else-if="mode === 'edit'">
            <v-row>
              <v-col cols="12" md="4"><v-select v-model="form._periodType" :items="periodOptions" label="_periodType" clearable /></v-col>
              <v-col cols="12" md="4"><v-text-field v-model.number="form._periodWeekNumber" type="number" label="_periodWeekNumber" /></v-col>
              <v-col cols="12" md="4"><v-select v-model.number="form._dayOfWeek" :items="dayOfWeekOptions" label="_dayOfWeek" clearable /></v-col>
              <v-col cols="12" md="4"><v-text-field v-model="form._date" label="_date" /></v-col>
              <v-col cols="12" md="4"><v-text-field v-model="form._feast" label="_feast" /></v-col>
              <v-col cols="12" md="4"><v-text-field v-model="form._psalmWeek" label="_psalmWeek" /></v-col>
              <v-col cols="12" md="6"><v-text-field v-model="form._feastName" label="_feastName" /></v-col>
              <v-col cols="12" md="6"><v-text-field v-model="form._feastType" label="_feastType" /></v-col>
              <v-col cols="12" md="4" class="d-flex align-center">
                <v-checkbox v-model="form._isChecked" label="Праверана" color="success" hide-details />
              </v-col>

              <v-col cols="12" md="4">
                <v-autocomplete v-model="form.templateRef" :items="templateOptions" item-title="label" item-value="id" label="templateRef" clearable />
              </v-col>
              <v-col cols="12" md="4">
                <v-autocomplete v-model="form.readingRef" :items="readingOptions" item-title="label" item-value="id" label="readingRef" clearable />
              </v-col>
              <v-col cols="12" md="4">
                <v-autocomplete v-model="form.compRef" :items="compOptions" item-title="label" item-value="id" label="compRef" clearable />
              </v-col>
            </v-row>

            <v-expansion-panels variant="accordion">
              <v-expansion-panel v-for="group in fieldGroups" :key="group.title" :title="group.title">
                <v-expansion-panel-text class="pa-1">
                  <v-row no-gutters>
                    <InlineEditor v-for="field in group.fields" :key="field" v-model="form[field]" :field-title="field" />
                  </v-row>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>

            <div class="mt-3">
              <v-btn color="primary" :loading="saving" @click="saveItem">Захаваць</v-btn>
              <v-btn v-if="!isNewItem" color="error" variant="text" class="ml-2" @click="removeItem">Выдаліць</v-btn>
            </div>
          </template>

          <template v-else-if="selectedItem">
            <v-alert type="info" variant="tonal" class="mb-3">У гэтай зборцы пустыя палі бяруцца з dayTemplates.</v-alert>
            <div class="mb-4">
              <div class="text-subtitle-1">Чытанне</div>
              <div v-html="resolvedReadingText"></div>
            </div>
            <v-expansion-panels variant="accordion">
              <v-expansion-panel v-for="group in resolvedGroups" :key="group.title" :title="group.title">
                <v-expansion-panel-text>
                  <div v-for="row in group.items" :key="row.field" class="mb-2">
                    <div class="text-caption text-medium-emphasis">{{ row.field }} <span v-if="row.fromTemplate">(з шаблона)</span></div>
                    <div v-html="row.value"></div>
                  </div>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </template>
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { useFirestore } from 'vuefire';
import InlineEditor from '@/components/admin/InlineEditor.vue';
import { useNotifier } from '@/composables/useNotifier';
import { PERIOD_LABEL_MAP, WEEKDAY_LABEL_MAP } from '@/constants/liturgical';
import { CALENDAR_MAP_FIELDS } from '@/constants/calendarMap';

const db = useFirestore();
const { success, error } = useNotifier();

const dialog = ref(false);
const mode = ref('view');
const isLoading = ref(false);
const loadingText = ref('Загрузка...');
const loadingProgress = ref(0);
const saving = ref(false);

const items = ref([]);
const templates = ref([]);
const readings = ref([]);
const completoriums = ref([]);

const selectedId = ref(null);
const isNewItem = ref(false);
const form = reactive(getEmptyItem());

const periodOptions = Object.entries(PERIOD_LABEL_MAP).map(([value, title]) => ({ value, title }));
const dayOfWeekOptions = Object.entries(WEEKDAY_LABEL_MAP).map(([value, title]) => ({ value: Number(value), title }));

const fieldGroups = [
  { title: 'Каментар і заклік', fields: ['invitatoriumAnt', 'feastComment'] },
  { title: 'Гадзіна чытанняў', fields: ['officeOfReadingsHymn', 'officeOfReadingsAnt1', 'officeOfReadingsAnt2', 'officeOfReadingsAnt3', 'officeOfReadingsPs1', 'officeOfReadingsPs2', 'officeOfReadingsPs3', 'officeOfReadingsVers', 'officeOfReadingsR1', 'officeOfReadingsR2', 'officeOfReadingsTeDeum', 'officeOfReadingsPr'] },
  { title: 'Ютрань', fields: ['laudesHymn', 'laudesAnt1', 'laudesAnt2', 'laudesAnt3', 'laudesPs1', 'laudesPs2', 'laudesPs3', 'laudesR', 'laudesAntBen', 'laudesInter', 'laudesPr'] },
  { title: 'Тэрцыя / Сэкста / Нона', fields: ['sext1Hymn', 'sext1Ant1', 'sext1Ant2', 'sext1Ant3', 'sext1Ps1', 'sext1Ps2', 'sext1Ps3', 'sext1R', 'sext1Pr', 'sext2Hymn', 'sext2Ant1', 'sext2Ant2', 'sext2Ant3', 'sext2Ps1', 'sext2Ps2', 'sext2Ps3', 'sext2R', 'sext2Pr', 'sext3Hymn', 'sext3Ant1', 'sext3Ant2', 'sext3Ant3', 'sext3Ps1', 'sext3Ps2', 'sext3Ps3', 'sext3R', 'sext3Pr'] },
  { title: 'Нешпары', fields: ['vesperHymn', 'vesperAnt1', 'vesperAnt2', 'vesperAnt3', 'vesperPs1', 'vesperPs2', 'vesperPs3', 'vesperR', 'vesperAntMag', 'vesperInter', 'vesperPr'] },
];

const periodItems = computed(() => items.value
  .filter((item) => item._periodType)
  .sort((a, b) => (a._periodType || '').localeCompare(b._periodType || '')
    || Number(a._periodWeekNumber || 0) - Number(b._periodWeekNumber || 0)
    || Number(a._dayOfWeek || 0) - Number(b._dayOfWeek || 0)
    || (a.id || '').localeCompare(b.id || '')));

const periodGroups = computed(() => {
  const grouped = new Map();

  periodItems.value.forEach((item) => {
    const periodType = item._periodType || '__unknown__';
    if (!grouped.has(periodType)) {
      grouped.set(periodType, []);
    }
    grouped.get(periodType).push(item);
  });

  return [...grouped.entries()]
    .sort((a, b) => {
      const labelA = PERIOD_LABEL_MAP[a[0]] || a[0];
      const labelB = PERIOD_LABEL_MAP[b[0]] || b[0];
      return labelA.localeCompare(labelB);
    })
    .map(([periodType, groupItems]) => ({
      periodType,
      periodLabel: PERIOD_LABEL_MAP[periodType] || periodType,
      items: groupItems,
    }));
});

const dateItems = computed(() => items.value.filter((item) => item._date));
const dynamicItems = computed(() => items.value.filter((item) => item._feast));
const selectedItem = computed(() => items.value.find((item) => item.id === selectedId.value));
const checkedItemsCount = computed(() => items.value.filter((item) => isChecked(item)).length);
const checkedItemsPercent = computed(() => {
  if (!items.value.length) return 0;
  return Math.round((checkedItemsCount.value / items.value.length) * 100);
});

const dialogTitle = computed(() => {
  if (isNewItem.value) return 'Новы элемент calendarMap';
  return selectedItem.value?._feastName || selectedItem.value?._date || selectedItem.value?.id || 'calendarMap';
});

const templateOptions = computed(() => templates.value.map((item) => ({ id: item.id, label: item._title || item.id })));
const readingOptions = computed(() => readings.value.map((item) => ({ id: item.id, label: item._title || item.title || item._date || item.id })));
const compOptions = computed(() => completoriums.value.map((item) => ({ id: item.id, label: item.title || item.id })));

const selectedTemplate = computed(() => templates.value.find((item) => item.id === (selectedItem.value?.templateRef || form.templateRef)));
const selectedReading = computed(() => readings.value.find((item) => item.id === (selectedItem.value?.readingRef || form.readingRef)));
const selectedComp = computed(() => completoriums.value.find((item) => item.id === (selectedItem.value?.compRef || form.compRef)));

const selectedTemplateTitle = computed(() => selectedTemplate.value?._title || selectedItem.value?.templateRef || '—');
const selectedReadingTitle = computed(() => selectedReading.value?._title || selectedReading.value?.title || selectedItem.value?.readingRef || '—');
const selectedCompTitle = computed(() => selectedComp.value?.title || selectedItem.value?.compRef || '—');

const groupedFilledFields = computed(() => {
  if (!selectedItem.value) return [];
  return fieldGroups
    .map((group) => ({
      title: group.title,
      items: group.fields
        .filter((field) => hasValue(selectedItem.value[field]))
        .map((field) => ({ field, value: selectedItem.value[field] })),
    }))
    .filter((group) => group.items.length);
});

const resolvedReadingText = computed(() => selectedReading.value?.text || selectedReading.value?.reading || '—');

const resolvedGroups = computed(() => {
  if (!selectedItem.value) return [];
  return fieldGroups
    .map((group) => ({
      title: group.title,
      items: group.fields
        .map((field) => {
          const ownValue = selectedItem.value[field];
          if (hasValue(ownValue)) return { field, value: ownValue, fromTemplate: false };
          const templateValue = selectedTemplate.value?.[field];
          if (hasValue(templateValue)) return { field, value: templateValue, fromTemplate: true };
          return null;
        })
        .filter(Boolean),
    }))
    .filter((group) => group.items.length);
});

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function isChecked(item) {
  return item?._isChecked === true;
}

function weekdayLabel(day) {
  return WEEKDAY_LABEL_MAP[day] || day || '—';
}

function getEmptyItem() {
  const obj = {
    _dayOfWeek: null,
    _periodType: null,
    _periodWeekNumber: null,
    _date: '',
    _feast: '',
    _psalmWeek: '',
    _feastName: '',
    _feastType: '',
    _isChecked: false,
    _checkedAt: null,
    templateRef: null,
    compRef: null,
    readingRef: null,
  };
  CALENDAR_MAP_FIELDS.forEach((field) => {
    if (!(field in obj)) obj[field] = '';
  });
  return obj;
}

function assignToForm(source) {
  Object.assign(form, getEmptyItem(), source || {});
}

async function loadAll() {
  isLoading.value = true;
  try {
    const steps = [
      ['calendarMap', items],
      ['dayTemplates', templates],
      ['readings', readings],
      ['completoriumTemplates', completoriums],
    ];

    for (let i = 0; i < steps.length; i += 1) {
      const [name, target] = steps[i];
      loadingText.value = `Загрузка ${name}...`;
      const snap = await getDocs(collection(db, name));
      target.value = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      loadingProgress.value = Math.round(((i + 1) / steps.length) * 100);
    }
  } catch (e) {
    error(`Не атрымалася загрузіць даныя: ${e?.message || e}`);
  } finally {
    isLoading.value = false;
  }
}

function openItem(id) {
  selectedId.value = id;
  isNewItem.value = false;
  assignToForm(items.value.find((item) => item.id === id));
  mode.value = 'view';
  dialog.value = true;
}

function createNew() {
  selectedId.value = null;
  isNewItem.value = true;
  assignToForm();
  mode.value = 'edit';
  dialog.value = true;
}

function buildPayload() {
  const payload = {};
  [...CALENDAR_MAP_FIELDS, 'templateRef', 'readingRef', 'compRef', '_isChecked', '_checkedAt'].forEach((field) => {
    payload[field] = form[field] ?? null;
  });
  payload._isChecked = form._isChecked === true;
  payload._checkedAt = form._isChecked ? (form._checkedAt || new Date().toISOString()) : null;
  return payload;
}

async function toggleChecked(item, checkedValue) {
  try {
    await setDoc(doc(db, 'calendarMap', item.id), {
      _isChecked: checkedValue,
      _checkedAt: checkedValue ? serverTimestamp() : null,
    }, { merge: true });
    item._isChecked = checkedValue;
    item._checkedAt = checkedValue ? new Date().toISOString() : null;
    success(checkedValue ? 'Элемент пазначаны як правераны.' : 'Пазнака праверкі знятая.');
  } catch (e) {
    error(`Не атрымалася абнавіць пазнаку праверкі: ${e?.message || e}`);
  }
}

async function saveItem() {
  saving.value = true;
  try {
    if (isNewItem.value) {
      const docRef = await addDoc(collection(db, 'calendarMap'), buildPayload());
      selectedId.value = docRef.id;
      isNewItem.value = false;
    } else {
      await setDoc(doc(db, 'calendarMap', selectedId.value), buildPayload(), { merge: true });
    }

    success('Элемент карты календаря захаваны.');
    await loadAll();
    mode.value = 'view';
  } catch (e) {
    error(`Памылка захавання: ${e?.message || e}`);
  } finally {
    saving.value = false;
  }
}

async function removeItem() {
  if (!selectedId.value) return;
  if (!window.confirm('Выдаліць элемент карты календаря?')) return;

  try {
    await deleteDoc(doc(db, 'calendarMap', selectedId.value));
    success('Элемент выдалены.');
    dialog.value = false;
    await loadAll();
  } catch (e) {
    error(`Памылка выдалення: ${e?.message || e}`);
  }
}

onMounted(loadAll);
</script>

<style scoped>
.checked-item {
  background-color: rgba(var(--v-theme-success), 0.12);
}
</style>
