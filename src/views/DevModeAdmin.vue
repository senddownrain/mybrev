<template>
  <main class="ordinary-admin">
    <header class="topbar">
      <template v-if="!selectedSlot">
        <h1>Полный Ordinary</h1>
      </template>
      <template v-else>
        <button type="button" class="topbar-btn" @click="closeDay">Закрыть</button>
        <h1>{{ selectedSlotLabel }}</h1>
        <button type="button" class="topbar-btn primary" :disabled="saving" @click="saveDay">
          {{ saving ? 'Сохранение...' : 'Сохранить' }}
        </button>
      </template>
    </header>

    <section v-if="!selectedSlot" class="list-view">
      <p class="hint">34 недели, без воскресенья 1-й и 34-й недели.</p>

      <details
        v-for="week in weekGroups"
        :key="week.week"
        class="week-group"
        :open="week.week === 1"
      >
        <summary>Неделя {{ week.week }}</summary>
        <ul>
          <li
            v-for="item in week.days"
            :key="item.key"
            class="day-item"
            :class="item.checked ? 'checked' : 'unchecked'"
            @click="openDay(item)"
          >
            <span>{{ item.label }}</span>
            <input type="checkbox" :checked="item.checked" disabled>
          </li>
        </ul>
      </details>
    </section>

    <section v-else class="detail-view">
      <div class="bulk-actions">
        <label>
          Год для сравнения:
          <select v-model.number="selectedCompareYear" @change="loadDayData">
            <option v-for="year in compareYears" :key="year" :value="year">{{ year }}</option>
          </select>
        </label>
        <button type="button" @click="copyAllFromCompare">Копировать всё</button>
        <button type="button" @click="undoAllChanges">Отменить всё</button>
      </div>

      <div class="columns">
        <article class="column">
          <h2>Источник 2025 (редактируемый)</h2>
          <label class="checked-toggle">
            <input v-model="editableChecked" type="checkbox">
            Проверен
          </label>

          <div v-for="field in FIELDS" :key="`left-${field}`" class="field-card" :class="{ empty: isEmpty(leftDraft[field]) }">
            <div class="field-head">
              <strong>{{ field }}</strong>
              <button
                v-if="!READ_ONLY_FIELDS.has(field)"
                type="button"
                class="mini"
                @click="openEditDialog(field)"
              >
                ✏️
              </button>
            </div>
            <p class="field-value two-lines">{{ formatValue(leftDraft[field]) }}</p>
          </div>

          <button type="button" class="save-bottom" :disabled="saving" @click="saveDay">
            {{ saving ? 'Сохранение...' : 'Сохранить' }}
          </button>
        </article>

        <article class="column">
          <h2>Сравнение: {{ selectedCompareYear }}</h2>
          <div v-for="field in FIELDS" :key="`right-${field}`" class="field-card">
            <div class="field-head">
              <strong>{{ field }}</strong>
              <button
                v-if="!READ_ONLY_FIELDS.has(field)"
                type="button"
                class="mini"
                @click="copyField(field)"
              >
                ⬅️
              </button>
            </div>
            <p class="field-value two-lines">{{ formatValue(compareDay[field]) }}</p>
          </div>
        </article>
      </div>
    </section>

    <dialog :open="Boolean(editField)" class="edit-dialog">
      <form method="dialog" class="edit-form" @submit.prevent="applyEdit">
        <h3>Редактировать {{ editField }}</h3>
        <textarea v-model="editValue" rows="8" />
        <div class="edit-actions">
          <button type="button" @click="closeEditDialog">Отмена</button>
          <button type="submit" class="primary">Применить</button>
        </div>
      </form>
    </dialog>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
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

const editField = ref('')
const editValue = ref('')
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

onMounted(async () => {
  await loadIndexData()
})

async function loadIndexData() {
  const ordinaryQ = query(collection(db, 'ordinaryTmp'), where('_periodType', '==', 'ordinary'))
  const fixedSnap = await getDocs(collection(db, 'fixedDays'))
  const ordinarySnap = await getDocs(ordinaryQ)

  allOrdinaryDocs.value = ordinarySnap.docs.map((item) => ({ id: item.id, ...item.data() }))
  fixedDaysMap.value = new Map(
    fixedSnap.docs.map((item) => [item.id, item.data()]),
  )
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
  return Number(item?._year || item?.year || item?._liturgicalYear || 0)
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

  const doc2025 = findDayBySlot(2025)
  const fallback = {
    _periodType: 'ordinary',
    _periodWeekNumber: selected.week,
    _dayOfWeek: selected.day,
  }
  leftDraft.value = mergeWithDefaults(doc2025 || fallback)
  leftOriginal.value = mergeWithDefaults(doc2025 || fallback)

  const fixedId = buildDayId('ordinary', selected.week, selected.day)
  editableChecked.value = Boolean(fixedDaysMap.value.get(fixedId)?.checked)

  const compare = findDayBySlot(selectedCompareYear.value)
  compareDay.value = mergeWithDefaults(compare || fallback)
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
}

function closeEditDialog() {
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
      _year: 2025,
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
.ordinary-admin { padding: 16px; }
.topbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
.topbar-btn { border: 1px solid #ccc; border-radius: 8px; padding: 8px 12px; }
.topbar-btn.primary, .primary { background: #1f7a1f; color: #fff; border-color: #1f7a1f; }
.hint { margin-bottom: 12px; }
.week-group { margin-bottom: 10px; border: 1px solid #ddd; border-radius: 8px; padding: 8px; }
.week-group summary { cursor: pointer; font-weight: 600; }
.week-group ul { list-style: none; padding: 8px 0 0; margin: 0; display: grid; gap: 6px; }
.day-item { border: 1px solid #ccc; border-radius: 8px; padding: 8px; display: flex; justify-content: space-between; cursor: pointer; }
.day-item.checked { background: #dff3df; border-color: #60b060; }
.day-item.unchecked { background: #fde1e1; border-color: #c75b5b; }
.bulk-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
.columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.column { border: 1px solid #ddd; border-radius: 10px; padding: 12px; max-height: calc(100vh - 160px); overflow: auto; }
.checked-toggle { display: block; margin: 8px 0 12px; }
.field-card { border: 1px solid #d9d9d9; border-radius: 8px; padding: 8px; margin-bottom: 8px; }
.field-card.empty { border-color: #c75b5b; background: #fff1f1; }
.field-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.field-value { margin: 6px 0 0; white-space: pre-wrap; }
.two-lines {
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.mini { border: 1px solid #ccc; border-radius: 6px; padding: 2px 8px; }
.save-bottom { width: 100%; margin-top: 8px; padding: 9px; border-radius: 8px; }
.edit-dialog { border: 1px solid #ddd; border-radius: 10px; max-width: 760px; width: min(760px, 95vw); }
.edit-form { display: grid; gap: 10px; }
.edit-form textarea { width: 100%; }
.edit-actions { display: flex; justify-content: flex-end; gap: 8px; }

@media (max-width: 900px) {
  .columns { grid-template-columns: 1fr; }
}
</style>
