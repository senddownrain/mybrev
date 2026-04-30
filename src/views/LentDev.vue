<template>
  <v-container fluid class="pa-4 lent-admin">
    <v-toolbar density="comfortable" rounded="lg" class="mb-4">
      <template v-if="!selectedSlot">
        <v-toolbar-title>Полный Lent</v-toolbar-title>
      </template>
      <template v-else>
        <v-btn variant="text" prepend-icon="mdi-arrow-left" @click="closeDay">Закрыть</v-btn>
        <v-toolbar-title>{{ selectedSlotLabel }}</v-toolbar-title>
        <v-btn color="primary" :loading="saving" @click="saveDay">Сохранить</v-btn>
      </template>
    </v-toolbar>

    <v-card v-if="!selectedSlot" rounded="lg" class="pa-4">
      <v-alert type="info" variant="tonal" class="mb-4">
        5 недель + нулевая неделя. Пепельная среда и Вербное воскресенье исключены.
      </v-alert>

      <v-expansion-panels v-model="openedWeeks" multiple>
        <v-expansion-panel v-for="week in weekGroups" :key="week.week" :value="week.week">
          <v-expansion-panel-title>
            <div class="d-flex align-center justify-space-between w-100 pr-2">
              <span :class="week.allChecked ? 'text-success font-weight-bold' : ''">Неделя {{ week.week }}</span>
              <v-chip
                size="x-small"
                :color="week.allChecked ? 'success' : 'default'"
                :variant="week.allChecked ? 'tonal' : 'outlined'"
              >
                {{ week.checkedCount }}/{{ week.totalCount }}
              </v-chip>
            </div>
          </v-expansion-panel-title>
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
        <v-col cols="12" md="4" lg="3">
          <v-select v-model="selectedCompareYear" :items="compareYears" label="Год для сравнения" density="compact" variant="outlined">
            <template #item="{ props, item }">
              <v-list-item v-bind="props">
                <template #append>
                  <v-chip
                    v-if="selectedSlot && yearDiffCount(item.raw)"
                    size="x-small"
                    color="warning"
                    variant="tonal"
                  >
                    {{ yearDiffCount(item.raw) }}
                  </v-chip>
                </template>
              </v-list-item>
            </template>
          </v-select>
        </v-col>
        <v-col cols="12" md="4" lg="3">
          <v-checkbox v-model="editableChecked" label="Проверен (fixedDays)" hide-details />
        </v-col>
        <v-col cols="12" md="4" lg="6" class="d-flex ga-2 justify-md-end">
          <v-menu location="bottom end">
            <template #activator="{ props }">
              <v-btn
                v-bind="props"
                size="small"
                color="secondary"
                variant="outlined"
                prepend-icon="mdi-dots-horizontal"
              >
                Действия
              </v-btn>
            </template>
            <v-list density="compact">
              <v-list-item prepend-icon="mdi-content-copy" title="Копировать всё" @click="copyAllFromCompare" />
              <v-list-item prepend-icon="mdi-content-save" title="Сохранить шаблон" @click="openSaveTemplateDialog" />
              <v-list-item prepend-icon="mdi-database-import" title="Подгрузить шаблон" @click="openLoadTemplateDialog" />
              <v-list-item
                prepend-icon="mdi-restore"
                title="Откатить шаблон"
                :disabled="!templateAppliedSnapshot"
                @click="rollbackTemplateApply"
              />
              <v-list-item prepend-icon="mdi-undo" title="Отменить всё" @click="undoAllChanges" />
            </v-list>
          </v-menu>
          <v-btn color="primary" size="small" :loading="saving" @click="saveDay">Сохранить</v-btn>
        </v-col>
      </v-row>
      <v-alert
        v-if="emptyHighlightFields.length"
        type="warning"
        variant="tonal"
        density="comfortable"
        class="mb-3"
      >
        <div class="font-weight-medium mb-1">
          Есть пустые поля (кроме исключений): {{ emptyHighlightFields.length }}
        </div>
        <div class="d-flex flex-wrap ga-1">
          <v-chip
            v-for="field in emptyHighlightFields"
            :key="`empty-${field}`"
            size="small"
            color="warning"
            variant="outlined"
          >
            {{ field }}
          </v-chip>
        </div>
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
          <v-expansion-panels v-model="openedGroupKeys" multiple>
            <v-expansion-panel
              v-for="group in FIELD_GROUPS"
              :key="group.key"
              :value="group.key"
            >
              <v-expansion-panel-title>
                <div class="d-flex align-center justify-space-between w-100 pr-2">
                  <span>{{ group.title }}</span>
                  <v-chip size="x-small" color="primary" variant="tonal">{{ groupDiffCount(group.fields) }} отличий</v-chip>
                </div>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <v-row
                  v-for="field in group.fields"
                  :key="field"
                  class="field-row"
                  no-gutters
                >
                  <v-col cols="6" class="px-1 py-1">
                    <v-card :color="leftCardColor(field)" :variant="leftCardVariant(field)">
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
                        <div class="field-value mt-2 line-clamp-2">{{ formatPreviewValue(leftDraft[field]) }}</div>
                      </v-card-item>
                    </v-card>
                  </v-col>

                  <v-col cols="6" class="px-1 py-1">
                    <v-card :color="isDifferent(field) ? 'warning' : undefined" :variant="isDifferent(field) ? 'tonal' : 'outlined'">
                      <v-card-item>
                        <div class="d-flex align-center justify-space-between ga-2">
                          <div class="text-body-2 font-weight-bold">{{ field }}</div>
                          <v-btn
                            v-if="canCopyField(field)"
                            size="small"
                            variant="text"
                            icon="mdi-arrow-left"
                            @click="copyField(field)"
                          />
                        </div>
                        <div class="field-value mt-2 line-clamp-2">{{ formatPreviewValue(compareDay[field]) }}</div>
                      </v-card-item>
                    </v-card>
                  </v-col>
                </v-row>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
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

    <v-dialog v-model="saveTemplateDialogOpen" fullscreen>
      <v-card>
        <v-toolbar>
          <v-toolbar-title>Сохранить шаблон</v-toolbar-title>
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" @click="closeSaveTemplateDialog" />
        </v-toolbar>
        <v-card-text class="pa-4">
          <v-text-field
            v-model="templateTitleInput"
            label="Название шаблона"
            variant="outlined"
            hint="Можно изменить автосгенерированное название перед сохранением"
            persistent-hint
          />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="outlined" @click="closeSaveTemplateDialog">Отмена</v-btn>
          <v-btn color="primary" :loading="templateSaving" @click="saveTemplate">Сохранить</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="loadTemplateDialogOpen" fullscreen>
      <v-card>
        <v-toolbar>
          <v-toolbar-title>Подгрузить шаблон</v-toolbar-title>
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" @click="closeLoadTemplateDialog" />
        </v-toolbar>
        <v-card-text class="pa-4">
          <v-list v-if="templatesList.length" lines="two" density="comfortable">
            <template v-for="group in groupedTemplates" :key="group.period">
              <v-list-subheader>{{ group.period }}</v-list-subheader>
              <v-list-item
                v-for="template in group.items"
                :key="template.id"
                :title="template.title || template.id"
                :subtitle="`нед. ${template._periodWeekNumber ?? '-'} • день ${template._dayOfWeek ?? '-'} • ID: ${template.id}`"
                :active="selectedTemplateId === template.id"
                rounded="lg"
                @click="selectedTemplateId = template.id"
              >
                <template #append>
                  <v-icon v-if="selectedTemplateId === template.id" color="primary">mdi-check-circle</v-icon>
                </template>
              </v-list-item>
            </template>
          </v-list>
          <v-alert v-else type="info" variant="tonal">
            В коллекции <code>tmpTemplates</code> пока нет шаблонов.
          </v-alert>
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="outlined" @click="closeLoadTemplateDialog">Отмена</v-btn>
          <v-btn color="primary" :disabled="!selectedTemplateId" @click="applySelectedTemplate">
            Применить шаблон
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { addDoc, collection, doc, getDocs, setDoc } from 'firebase/firestore'
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
const EMPTY_HIGHLIGHT_EXCLUDED = new Set([
  'officeOfReadingsTeDeum',
  'vesper1Hymn',
  'vesper1Ant1',
  'vesper1Ant2',
  'vesper1Ant3',
  'vesper1Ps1',
  'vesper1Ps2',
  'vesper1Ps3',
  'vesper1R',
  'vesper1AntMag',
  'vesper1Inter',
  'vesper1Pr',
])
const TEMPLATE_FIELDS = [
  '_dayOfWeek', '_periodType', '_periodWeekNumber',
  '_weekDay',
  'invitatoriumAnt',
  'officeOfReadingsHymn', 'officeOfReadingsAnt1', 'officeOfReadingsAnt2', 'officeOfReadingsAnt3',
  'officeOfReadingsPs1', 'officeOfReadingsPs2', 'officeOfReadingsPs3',
  'laudesHymn', 'laudesAnt1', 'laudesAnt2', 'laudesAnt3',
  'laudesPs1', 'laudesPs2', 'laudesPs3',
  'sext1Hymn',
  'sext1Ps1', 'sext1Ps2', 'sext1Ps3',
  'sext2Hymn',
  'sext2Ps1', 'sext2Ps2', 'sext2Ps3',
  'sext3Hymn',
  'sext3Ps1', 'sext3Ps2', 'sext3Ps3',
  'vesperHymn', 'vesperAnt1', 'vesperAnt2', 'vesperAnt3',
  'vesperPs1', 'vesperPs2', 'vesperPs3',
]
const FIELD_GROUPS = [
  {
    key: 'base',
    title: 'Базовые поля',
    fields: ['_periodType', '_periodWeekNumber', '_dayOfWeek', '_dayName'],
  },
  {
    key: 'invitatorium',
    title: 'Инвитаторий',
    fields: ['invitatoriumAnt'],
  },
  {
    key: 'readings',
    title: 'Час чтений',
    fields: [
      'officeOfReadingsHymn', 'officeOfReadingsAnt1', 'officeOfReadingsAnt2', 'officeOfReadingsAnt3',
      'officeOfReadingsPs1', 'officeOfReadingsPs2', 'officeOfReadingsPs3', 'officeOfReadingsVers', 'officeOfReadingsR1',
      'officeOfReadingsR2', 'officeOfReadingsTeDeum', 'officeOfReadingsPr',
    ],
  },
  {
    key: 'laudes',
    title: 'Лауды',
    fields: [
      'laudesHymn', 'laudesAnt1', 'laudesAnt2', 'laudesAnt3', 'laudesPs1', 'laudesPs2', 'laudesPs3',
      'laudesR', 'laudesAntBen', 'laudesInter', 'laudesPr',
    ],
  },
  {
    key: 'sext1',
    title: 'Терция',
    fields: ['sext1Hymn', 'sext1Ant1', 'sext1Ant2', 'sext1Ant3', 'sext1Ps1', 'sext1Ps2', 'sext1Ps3', 'sext1R', 'sext1Pr'],
  },
  {
    key: 'sext2',
    title: 'Секста',
    fields: ['sext2Hymn', 'sext2Ant1', 'sext2Ant2', 'sext2Ant3', 'sext2Ps1', 'sext2Ps2', 'sext2Ps3', 'sext2R', 'sext2Pr'],
  },
  {
    key: 'sext3',
    title: 'Нона',
    fields: ['sext3Hymn', 'sext3Ant1', 'sext3Ant2', 'sext3Ant3', 'sext3Ps1', 'sext3Ps2', 'sext3Ps3', 'sext3R', 'sext3Pr'],
  },
  {
    key: 'vesper',
    title: 'Вечерня',
    fields: ['vesperHymn', 'vesperAnt1', 'vesperAnt2', 'vesperAnt3', 'vesperPs1', 'vesperPs2', 'vesperPs3', 'vesperR', 'vesperAntMag', 'vesperInter', 'vesperPr'],
  },
  {
    key: 'vesper1',
    title: 'Первая вечерня',
    fields: ['vesper1Hymn', 'vesper1Ant1', 'vesper1Ant2', 'vesper1Ant3', 'vesper1Ps1', 'vesper1Ps2', 'vesper1Ps3', 'vesper1R', 'vesper1AntMag', 'vesper1Inter', 'vesper1Pr'],
  },
]

const selectedSlot = ref(null)
const selectedCompareYear = ref(2024)
const compareYears = [2025, 2024, 2023, 2022, 2021, 2020]
const LENT_WEEK_ZERO_STARTS = {
  2020: '2020-02-26',
  2021: '2021-02-17',
  2022: '2022-03-02',
  2023: '2023-02-22',
  2024: '2024-02-14',
  2025: '2025-03-05',
}

const allOrdinaryDocs = ref([])
const fixedDaysMap = ref(new Map())
const weekZeroByYear = ref(new Map())

const leftDraft = ref(buildEmptyDay())
const leftOriginal = ref(buildEmptyDay())
const compareDay = ref(buildEmptyDay())
const editableChecked = ref(false)

const editDialogOpen = ref(false)
const editField = ref('')
const editValue = ref('')
const editMode = ref('html')
const saving = ref(false)
const saveTemplateDialogOpen = ref(false)
const loadTemplateDialogOpen = ref(false)
const templateTitleInput = ref('')
const templateSaving = ref(false)
const templatesList = ref([])
const groupedTemplates = computed(() => {
  const groups = new Map()
  templatesList.value.forEach((item) => {
    const period = String(item?._periodType || 'without-period')
    const list = groups.get(period) || []
    list.push(item)
    groups.set(period, list)
  })

  return Array.from(groups.entries()).map(([period, items]) => ({
    period,
    items: items.slice().sort((a, b) => {
      const w = Number(a?._periodWeekNumber || 0) - Number(b?._periodWeekNumber || 0)
      if (w !== 0) return w
      return Number(a?._dayOfWeek || 0) - Number(b?._dayOfWeek || 0)
    }),
  }))
})
const selectedTemplateId = ref('')
const templateAppliedSnapshot = ref(null)
const openedGroupKeys = ref([])
const openedWeeks = ref(Array.from({ length: 6 }, (_, i) => i))

const selectedSlotLabel = computed(() => {
  if (!selectedSlot.value) return ''
  return `${selectedSlot.value.week} неделя — ${WEEKDAY_LABEL_MAP[selectedSlot.value.day] || ''}`
})

const emptyHighlightFields = computed(() => {
  if (!selectedSlot.value) return []
  return FIELDS.filter((field) => (
    !EMPTY_HIGHLIGHT_EXCLUDED.has(field)
    && isEmpty(leftDraft.value[field])
  ))
})

const weekGroups = computed(() => {
  const groups = []
  for (let week = 0; week <= 5; week += 1) {
    const days = []
    let checkedCount = 0
    for (let day = 1; day <= 7; day += 1) {
      if ((week === 0 && (day < 3 || day > 6)) || (week === 5 && day === 1)) continue
      const key = buildDayId('lent', week, day)
      const fixedDoc = fixedDaysMap.value.get(key)
      const checked = Boolean(fixedDoc?.checked)
      if (checked) checkedCount += 1
      days.push({
        key,
        week,
        day,
        label: `${week} неделя — ${WEEKDAY_LABEL_MAP[day] || day}`,
        checked,
      })
    }
    groups.push({
      week,
      days,
      checkedCount,
      totalCount: days.length,
      allChecked: days.length > 0 && checkedCount === days.length,
    })
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
  const fixedSnap = await getDocs(collection(db, 'fixedDays'))
  const ordinarySnap = await getDocs(collection(db, 'lentTmp'))

  allOrdinaryDocs.value = ordinarySnap.docs.map((item) => ({ id: item.id, ...item.data() }))
  fixedDaysMap.value = new Map(fixedSnap.docs.map((item) => [item.id, item.data()]))

  const byYear = new Map()
  allOrdinaryDocs.value
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(String(item.id || '')))
    .forEach((item) => {
      const year = Number(String(item.id).slice(0, 4))
      const startDate = LENT_WEEK_ZERO_STARTS[year]
      if (!startDate || item.id < startDate) return
      const list = byYear.get(year) || []
      list.push(item)
      byYear.set(year, list)
    })

  const resolved = new Map()
  byYear.forEach((items, year) => {
    const sorted = items.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)))
    resolved.set(year, sorted.slice(0, 4))
  })
  weekZeroByYear.value = resolved
}

function buildDayId(periodType, week, day) {
  return `${periodType}-w${week}-d${day}`
}

function buildEmptyDay() {
  return Object.fromEntries(FIELDS.map((field) => [field, '']))
}

function openDay(slot) {
  selectedSlot.value = slot
  selectedCompareYear.value = 2025
  templateAppliedSnapshot.value = null
  openedGroupKeys.value = []
  loadDayData()
}

function closeDay() {
  selectedSlot.value = null
}

function normalizeYear(item) {
  const raw = Number(item?._year ?? item?.year ?? item?._liturgicalYear ?? parseDayId(item?.id)?.year ?? 0)
  if (raw >= 19 && raw <= 25) return raw + 2000
  return raw
}

function parseDayId(id) {
  const value = String(id ?? '').trim()

  const ordinaryMatch = value.match(/^lent-w(\d{1,2})-d(\d{1,2})$/i)
  if (ordinaryMatch) {
    return {
      periodType: 'lent',
      week: Number(ordinaryMatch[1]),
      day: Number(ordinaryMatch[2]),
      year: null,
    }
  }

  const yearWeekDayMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (yearWeekDayMatch) {
    return {
      periodType: 'lent',
      year: Number(yearWeekDayMatch[1]),
      week: Number(yearWeekDayMatch[2]),
      day: Number(yearWeekDayMatch[3]),
    }
  }

  return null
}

function getDocMeta(item) {
  const fromId = parseDayId(item?.id)
  return {
    periodType: item?._periodType ?? fromId?.periodType ?? 'lent',
    week: Number(item?._periodWeekNumber ?? fromId?.week ?? 0),
    day: Number(item?._dayOfWeek ?? fromId?.day ?? 0),
    year: normalizeYear(item),
  }
}

function findDayBySlot(year) {
  if (!selectedSlot.value) return null
  if (Number(selectedSlot.value.week) === 0) {
    const items = weekZeroByYear.value.get(Number(year)) || []
    const idx = Number(selectedSlot.value.day) - 3
    return items[idx] || null
  }
  return allOrdinaryDocs.value.find((item) => {
    const meta = getDocMeta(item)
    return meta.periodType === 'lent'
      && meta.week === Number(selectedSlot.value.week)
      && meta.day === Number(selectedSlot.value.day)
      && meta.year === Number(year)
  }) || null
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

  const fixedId = buildDayId('lent', selected.week, selected.day)
  const fixedDoc = fixedDaysMap.value.get(fixedId) || null

  const doc2025 = findDayBySlot(2025)
  const fallback = {
    _periodType: 'lent',
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

function formatPreviewValue(value) {
  if (value === null || value === undefined || value === '') return '— пусто —'
  const stripped = String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return stripped || '— пусто —'
}

function normalizedCompare(value) {
  return formatPreviewValue(value)
}

function isDifferent(field) {
  return normalizedCompare(leftDraft.value[field]) !== normalizedCompare(compareDay.value[field])
}

function groupDiffCount(fields) {
  return fields.filter((field) => isDifferent(field)).length
}

function leftCardColor(field) {
  if (isEmpty(leftDraft.value[field]) && !EMPTY_HIGHLIGHT_EXCLUDED.has(field)) return 'error'
  if (isDifferent(field)) return 'warning'
  return undefined
}

function leftCardVariant(field) {
  if ((isEmpty(leftDraft.value[field]) && !EMPTY_HIGHLIGHT_EXCLUDED.has(field)) || isDifferent(field)) return 'tonal'
  return 'outlined'
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

function canCopyField(field) {
  return FIELDS.includes(field)
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
  templateAppliedSnapshot.value = null
}

function defaultTemplateTitle() {
  const period = leftDraft.value._periodType || 'lent'
  const day = leftDraft.value._dayOfWeek || selectedSlot.value?.day || ''
  const dayLabel = WEEKDAY_LABEL_MAP[Number(day)] || day || 'День'
  return `${dayLabel}-${period}`
}

function openSaveTemplateDialog() {
  templateTitleInput.value = defaultTemplateTitle()
  saveTemplateDialogOpen.value = true
}

function closeSaveTemplateDialog() {
  saveTemplateDialogOpen.value = false
  templateTitleInput.value = ''
}

async function saveTemplate() {
  if (templateSaving.value) return
  templateSaving.value = true
  try {
    const dayOfWeek = Number(leftDraft.value._dayOfWeek || selectedSlot.value?.day || 0)
    const skipFields = new Set()
    if (dayOfWeek === 7) {
      skipFields.add('vesperAntMag')
    }
    if (dayOfWeek === 1) {
      skipFields.add('vesperAntMag')
      skipFields.add('laudesAntBen')
    }

    const payload = {
      title: String(templateTitleInput.value || defaultTemplateTitle()).trim(),
      ...Object.fromEntries(
        TEMPLATE_FIELDS
          .filter((field) => !skipFields.has(field))
          .map((field) => [field, leftDraft.value[field] ?? '']),
      ),
    }
    await addDoc(collection(db, 'tmpTemplates'), payload)
    closeSaveTemplateDialog()
  } finally {
    templateSaving.value = false
  }
}

async function openLoadTemplateDialog() {
  const snap = await getDocs(collection(db, 'tmpTemplates'))
  templatesList.value = snap.docs.map((item) => ({ id: item.id, ...item.data() }))
  selectedTemplateId.value = groupedTemplates.value[0]?.items?.[0]?.id || ''
  loadTemplateDialogOpen.value = true
}

function closeLoadTemplateDialog() {
  loadTemplateDialogOpen.value = false
  selectedTemplateId.value = ''
}

function applySelectedTemplate() {
  const selected = templatesList.value.find((item) => item.id === selectedTemplateId.value)
  if (!selected) return
  if (!templateAppliedSnapshot.value) {
    templateAppliedSnapshot.value = { ...leftDraft.value }
  }
  TEMPLATE_FIELDS.forEach((field) => {
    leftDraft.value[field] = selected[field] ?? ''
  })
  closeLoadTemplateDialog()
}

function rollbackTemplateApply() {
  if (!templateAppliedSnapshot.value) return
  leftDraft.value = { ...templateAppliedSnapshot.value }
  templateAppliedSnapshot.value = null
}

function getFallbackBySlot() {
  if (!selectedSlot.value) return null
  return {
    _periodType: 'lent',
    _periodWeekNumber: selectedSlot.value.week,
    _dayOfWeek: selectedSlot.value.day,
  }
}

function getCompareSourceByYear(year) {
  if (!selectedSlot.value) return null
  const fixedId = buildDayId('lent', selectedSlot.value.week, selectedSlot.value.day)
  const fixedDoc = fixedDaysMap.value.get(fixedId) || null
  const doc2025 = findDayBySlot(2025)
  const fallback = getFallbackBySlot()
  if (Number(year) === 2025) return fixedDoc || doc2025 || fallback
  return findDayBySlot(Number(year)) || fallback
}

function yearDiffCount(year) {
  if (!selectedSlot.value) return 0
  const source = mergeWithDefaults(getCompareSourceByYear(year) || {})
  return FIELDS.filter((field) => normalizedCompare(leftDraft.value[field]) !== normalizedCompare(source[field])).length
}

async function saveDay() {
  if (!selectedSlot.value || saving.value) return
  saving.value = true
  try {
    const week = Number(leftDraft.value._periodWeekNumber || selectedSlot.value.week)
    const day = Number(leftDraft.value._dayOfWeek || selectedSlot.value.day)
    const periodType = leftDraft.value._periodType || 'lent'

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
.lent-admin {
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

.line-clamp-2 {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
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
