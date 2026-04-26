<template>
  <v-container fluid class="pa-4 ordinary-admin">
    <v-toolbar density="comfortable" rounded="lg" class="mb-4">
      <template v-if="!selectedSlot">
        <v-toolbar-title>Полный Ordinary</v-toolbar-title>
      </template>
      <template v-else>
        <v-btn variant="text" prepend-icon="mdi-arrow-left" @click="closeDay">Закрыть</v-btn>
        <v-toolbar-title>{{ selectedSlotLabel }}</v-toolbar-title>
        <v-btn color="primary" :loading="saving" @click="saveDay">Сохранить</v-btn>
      </template>
    </v-toolbar>

    <v-card v-if="!selectedSlot" rounded="lg" class="pa-4">
      <v-alert type="info" variant="tonal" class="mb-4">
        34 недели, без воскресенья 1-й и 34-й недели.
      </v-alert>

      <v-expansion-panels multiple>
        <v-expansion-panel v-for="week in weekGroups" :key="week.week" :value="week.week">
          <v-expansion-panel-title>Неделя {{ week.week }}</v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-list density="comfortable">
              <v-list-item
                v-for="item in week.days"
                :key="item.key"
                :title="item.label"
                :active="item.checked"
                rounded="lg"
                @click="openDay(item)"
              >
                <template #prepend>
                  <v-icon :color="item.checked ? 'success' : 'error'">
                    {{ item.checked ? 'mdi-check-circle' : 'mdi-close-circle' }}
                  </v-icon>
                </template>
                <template #append>
                  <v-checkbox-btn :model-value="item.checked" disabled />
                </template>
              </v-list-item>
            </v-list>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-card>

    <v-card v-else rounded="lg" class="pa-4">
      <v-row class="mb-3" align="center" dense>
        <v-col cols="12" md="3">
          <v-select
            v-model="selectedCompareYear"
            :items="compareYears"
            label="Год для сравнения"
            density="comfortable"
            variant="outlined"
          />
        </v-col>
        <v-col cols="12" md="3">
          <v-checkbox v-model="editableChecked" label="Проверен (fixedDays)" hide-details />
        </v-col>
        <v-col cols="12" md="6" class="d-flex flex-wrap ga-2 justify-md-end">
          <v-btn color="secondary" variant="outlined" @click="copyAllFromCompare">Копировать всё</v-btn>
          <v-btn color="warning" variant="outlined" @click="undoAllChanges">Отменить всё</v-btn>
          <v-btn color="primary" :loading="saving" @click="saveDay">Сохранить</v-btn>
        </v-col>
      </v-row>

      <v-alert type="info" variant="tonal" class="mb-3">
        Скролл общий: поля слева и справа всегда напротив друг друга.
      </v-alert>

      <div class="compare-table-wrapper">
        <v-row class="header-row" no-gutters>
          <v-col cols="6" class="px-1">
            <v-card color="primary" variant="tonal" class="pa-2 text-subtitle-1 font-weight-bold">
              Источник (fixedDays/2025) — редактируемый
            </v-card>
          </v-col>
          <v-col cols="6" class="px-1">
            <v-card color="secondary" variant="tonal" class="pa-2 text-subtitle-1 font-weight-bold">
              Сравнение: {{ selectedCompareYear }}
            </v-card>
          </v-col>
        </v-row>

        <div class="compare-scroll">
          <v-row
            v-for="field in FIELDS"
            :key="field"
            class="field-row"
            no-gutters
          >
            <v-col cols="6" class="px-1 py-1">
              <v-card :color="isEmpty(leftDraft[field]) ? 'error' : undefined" :variant="isEmpty(leftDraft[field]) ? 'tonal' : 'outlined'">
                <v-card-item>
                  <div class="d-flex align-center justify-space-between ga-2">
                    <div class="text-body-2 font-weight-bold">{{ field }}</div>
                    <v-btn
                      v-if="!READ_ONLY_FIELDS.has(field)"
                      size="small"
                      variant="text"
                      icon="mdi-pencil"
                      @click="openEditDialog(field)"
                    />
                  </div>
                  <div class="field-value mt-2">{{ formatValue(leftDraft[field]) }}</div>
                </v-card-item>
              </v-card>
            </v-col>

            <v-col cols="6" class="px-1 py-1">
              <v-card variant="outlined">
                <v-card-item>
                  <div class="d-flex align-center justify-space-between ga-2">
                    <div class="text-body-2 font-weight-bold">{{ field }}</div>
                    <v-btn
                      v-if="!READ_ONLY_FIELDS.has(field)"
                      size="small"
                      variant="text"
                      icon="mdi-arrow-left"
                      @click="copyField(field)"
                    />
                  </div>
                  <div class="field-value mt-2">{{ formatValue(compareDay[field]) }}</div>
                </v-card-item>
              </v-card>
            </v-col>
          </v-row>
        </div>
      </div>
    </v-card>

    <v-dialog v-model="editDialogOpen" fullscreen>
      <v-card>
        <v-toolbar>
          <v-toolbar-title>Редактировать {{ editField }}</v-toolbar-title>
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" @click="closeEditDialog" />
        </v-toolbar>

        <v-card-text class="pa-4">
          <v-btn-toggle v-model="editMode" mandatory color="primary" class="mb-4">
            <v-btn value="html">HTML</v-btn>
            <v-btn value="quill">Quill</v-btn>
          </v-btn-toggle>

          <v-textarea
            v-if="editMode === 'html'"
            v-model="editValue"
            label="HTML"
            auto-grow
            rows="16"
            variant="outlined"
          />

          <quill-editor
            v-else
            v-model:content="editValue"
            content-type="html"
            theme="snow"
            class="quill-full"
          />
        </v-card-text>

        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="outlined" @click="closeEditDialog">Отмена</v-btn>
          <v-btn color="primary" @click="applyEdit">Применить</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore'
import { db } from '@/plugins/firebase'
import { WEEKDAY_LABEL_MAP } from '@/constants/liturgical'

const FIELDS = [
  '_dayOfWeek', '_periodType', '_periodWeekNumber', '_dayName',
  'invitatoriumAnt', 'officeOfReadingsHymn', 'officeOfReadingsAnt1', 'officeOfReadingsAnt2', 'officeOfReadingsAnt3',
  'officeOfReadingsPs1', 'officeOfReadingsPs2', 'officeOfReadingsPs3', 'officeOfReadingsVers', 'officeOfReadingsR1',
  'officeOfReadingsR2', 'officeOfReadingsTeDeum', 'officeOfReadingsPr', 'laudesHymn', 'laudesAnt1', 'laudesAnt2',
  'laudesAnt3', 'laudesPs1', 'laudesPs2', 'laudesPs3', 'laudesR', 'laudesAntBen', 'laudesInter', 'laudesPr',
  'sext1Hymn', 'sext1Ant1', 'sext1Ant2', 'sext1Ant3', 'sext1Ps1', 'sext1Ps2', 'sext1Ps3', 'sext1R', 'sext1Pr',
  'sext2Hymn', 'sext2Ant1', 'sext2Ant2', 'sext2Ant3', 'sext2Ps1', 'sext2Ps2', 'sext2Ps3', 'sext2R', 'sext2Pr',
  'sext3Hymn', 'sext3Ant1', 'sext3Ant2', 'sext3Ant3', 'sext3Ps1', 'sext3Ps2', 'sext3Ps3', 'sext3R', 'sext3Pr',
  'vesperHymn', 'vesperAnt1', 'vesperAnt2', 'vesperAnt3', 'vesperPs1', 'vesperPs2', 'vesperPs3', 'vesperR',
  'vesperAntMag', 'vesperInter', 'vesperPr', 'vesper1Hymn', 'vesper1Ant1', 'vesper1Ant2', 'vesper1Ant3',
  'vesper1Ps1', 'vesper1Ps2', 'vesper1Ps3', 'vesper1R', 'vesper1AntMag', 'vesper1Inter', 'vesper1Pr',
]

const READ_ONLY_FIELDS = new Set(['_dayOfWeek', '_periodType', '_periodWeekNumber'])

const selectedSlot = ref(null)
const selectedCompareYear = ref(2024)
const compareYears = [2025, 2024, 2023, 2022, 2021, 2020, 2019]

const allOrdinaryDocs = ref([])
const fixedDaysMap = ref(new Map())

const leftDraft = ref(buildEmptyDay())
const leftOriginal = ref(buildEmptyDay())
const compareDay = ref(buildEmptyDay())
const editableChecked = ref(false)

const editDialogOpen = ref(false)
const editField = ref('')
const editValue = ref('')
const editMode = ref('html')
const saving = ref(false)

const selectedSlotLabel = computed(() => {
  if (!selectedSlot.value) return ''
  return `${selectedSlot.value.week} неделя — ${WEEKDAY_LABEL_MAP[selectedSlot.value.day] || ''}`
})

const weekGroups = computed(() => {
  const groups = []
  for (let week = 1; week <= 34; week += 1) {
    const days = []
    for (let day = 1; day <= 7; day += 1) {
      if ((week === 1 || week === 34) && day === 1) continue
      const key = buildDayId('ordinary', week, day)
      const fixedDoc = fixedDaysMap.value.get(key)
      days.push({
        key,
        week,
        day,
        label: `${week} неделя — ${WEEKDAY_LABEL_MAP[day] || day}`,
        checked: Boolean(fixedDoc?.checked),
      })
    }
    groups.push({ week, days })
  }
  return groups
})

watch(selectedCompareYear, () => {
  if (selectedSlot.value) loadDayData()
})

onMounted(async () => {
  await loadIndexData()
})

async function loadIndexData() {
  const ordinaryQ = query(collection(db, 'ordinaryTmp'), where('_periodType', '==', 'ordinary'))
  const fixedSnap = await getDocs(collection(db, 'fixedDays'))
  const ordinarySnap = await getDocs(ordinaryQ)

  allOrdinaryDocs.value = ordinarySnap.docs.map((item) => ({ id: item.id, ...item.data() }))
  fixedDaysMap.value = new Map(fixedSnap.docs.map((item) => [item.id, item.data()]))
}

function buildDayId(periodType, week, day) {
  return `${periodType}-w${week}-d${day}`
}

function buildEmptyDay() {
  return Object.fromEntries(FIELDS.map((field) => [field, '']))
}

function openDay(slot) {
  selectedSlot.value = slot
  selectedCompareYear.value = 2024
  loadDayData()
}

function closeDay() {
  selectedSlot.value = null
}

function normalizeYear(item) {
  const raw = Number(item?._year ?? item?.year ?? item?._liturgicalYear ?? 0)
  if (raw >= 19 && raw <= 25) return raw + 2000
  return raw
}

function findDayBySlot(year) {
  if (!selectedSlot.value) return null
  return allOrdinaryDocs.value.find((item) => (
    item?._periodType === 'ordinary'
    && Number(item?._periodWeekNumber) === Number(selectedSlot.value.week)
    && Number(item?._dayOfWeek) === Number(selectedSlot.value.day)
    && normalizeYear(item) === Number(year)
  )) || null
}

function mergeWithDefaults(source) {
  const day = buildEmptyDay()
  FIELDS.forEach((field) => {
    day[field] = source?.[field] ?? ''
  })
  return day
}

function loadDayData() {
  const selected = selectedSlot.value
  if (!selected) return

  const fixedId = buildDayId('ordinary', selected.week, selected.day)
  const fixedDoc = fixedDaysMap.value.get(fixedId) || null

  const doc2025 = findDayBySlot(2025)
  const fallback = {
    _periodType: 'ordinary',
    _periodWeekNumber: selected.week,
    _dayOfWeek: selected.day,
  }

  const leftSource = fixedDoc || doc2025 || fallback
  leftDraft.value = mergeWithDefaults(leftSource)
  leftOriginal.value = mergeWithDefaults(leftSource)
  editableChecked.value = Boolean(fixedDoc?.checked)

  const compareSource = selectedCompareYear.value === 2025
    ? (fixedDoc || doc2025 || fallback)
    : (findDayBySlot(selectedCompareYear.value) || fallback)

  compareDay.value = mergeWithDefaults(compareSource)
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '— пусто —'
  return String(value)
}

function isEmpty(value) {
  return value === null || value === undefined || String(value).trim() === ''
}

function openEditDialog(field) {
  editField.value = field
  editValue.value = String(leftDraft.value[field] ?? '')
  editMode.value = 'html'
  editDialogOpen.value = true
}

function closeEditDialog() {
  editDialogOpen.value = false
  editField.value = ''
  editValue.value = ''
}

function applyEdit() {
  if (!editField.value) return
  leftDraft.value[editField.value] = editValue.value
  closeEditDialog()
}

function copyField(field) {
  leftDraft.value[field] = compareDay.value[field]
}

function copyAllFromCompare() {
  FIELDS.forEach((field) => {
    if (!READ_ONLY_FIELDS.has(field)) {
      leftDraft.value[field] = compareDay.value[field]
    }
  })
}

function undoAllChanges() {
  leftDraft.value = { ...leftOriginal.value }
}

async function saveDay() {
  if (!selectedSlot.value || saving.value) return
  saving.value = true
  try {
    const week = Number(leftDraft.value._periodWeekNumber || selectedSlot.value.week)
    const day = Number(leftDraft.value._dayOfWeek || selectedSlot.value.day)
    const periodType = leftDraft.value._periodType || 'ordinary'

    const payload = {
      ...Object.fromEntries(FIELDS.map((field) => [field, leftDraft.value[field] ?? ''])),
      _periodType: periodType,
      _periodWeekNumber: week,
      _dayOfWeek: day,
      checked: Boolean(editableChecked.value),
    }

    const id = buildDayId(periodType, week, day)
    await setDoc(doc(db, 'fixedDays', id), payload)
    fixedDaysMap.value.set(id, payload)
    leftOriginal.value = { ...leftDraft.value }
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.ordinary-admin {
  min-height: 100%;
}

.compare-table-wrapper {
  width: 100%;
}

.compare-scroll {
  max-height: calc(100vh - 250px);
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
}

.field-value {
  white-space: pre-wrap;
  word-break: break-word;
}

.quill-full :deep(.ql-editor) {
  min-height: calc(100vh - 260px);
}

@media (max-width: 960px) {
  .header-row {
    display: none;
  }

  .field-row {
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    padding-bottom: 8px;
    margin-bottom: 8px;
  }
}
</style>
