<template>
  <v-container class="reading-editor">
    <header class="reading-editor__header">
      <v-btn
        icon="mdi-arrow-left"
        variant="text"
        aria-label="Назад да чытанняў"
        @click="goBack"
      />
      <div>
        <p class="reading-editor__eyebrow">Літургія слова</p>
        <h1>{{ isNew ? 'Новыя чытанні' : 'Рэдагаванне чытанняў' }}</h1>
      </div>
      <v-spacer />
      <v-btn
        color="primary"
        rounded="pill"
        prepend-icon="mdi-content-save-outline"
        :loading="saving"
        :disabled="loading"
        class="text-none"
        @click="save"
      >
        Захаваць
      </v-btn>
    </header>

    <div v-if="loading" class="reading-editor__loading">
      <v-progress-circular indeterminate color="primary" size="54" />
      <span>Загрузка чытанняў...</span>
    </div>

    <v-alert v-else-if="loadError" type="error" variant="tonal">
      {{ loadError }}
    </v-alert>

    <div v-else-if="setsDraft">
      <v-alert v-if="validationErrors.length" type="warning" variant="tonal" class="mb-5" closable @click:close="validationErrors = []">
        <div class="font-weight-bold mb-2">Праверце наборы чытанняў</div>
        <ul class="pl-5">
          <li v-for="message in validationErrors" :key="message">{{ message }}</li>
        </ul>
      </v-alert>
      <section class="reading-editor__section-heading">
        <div>
          <p class="reading-editor__eyebrow">{{ draft.title || original.title }}</p>
          <h2>Наборы чытанняў Імшы</h2>
        </div>
        <v-btn variant="tonal" rounded="pill" class="text-none" :prepend-icon="showPreview ? 'mdi-pencil' : 'mdi-eye-outline'" @click="showPreview = !showPreview">
          {{ showPreview ? 'Рэдагаваць' : 'Папярэдні прагляд' }}
        </v-btn>
      </section>
      <v-alert v-if="changedFields.length" type="info" variant="tonal" density="compact" class="mb-4">
        Зменена ў адносінах да імпарту з крыніцы: {{ changedFields.join(', ') }}
      </v-alert>
      <ParsedReadingCard v-if="showPreview && previewReading" :reading="previewReading" class="mb-5" />
      <MassReadingSetsEditor
        v-else
        v-model:active="activeSetIndex"
        :model-value="setsDraft"
        :original="setsOriginal"
        @reset-set="resetSet"
      />
      <div class="reading-editor__footer">
        <v-btn variant="text" rounded="pill" class="text-none" @click="goBack">Адмяніць</v-btn>
        <v-btn color="primary" rounded="pill" prepend-icon="mdi-content-save-outline" :loading="saving" class="text-none" @click="save">
          Захаваць наборы
        </v-btn>
      </div>
    </div>

    <v-form v-else @submit.prevent="save">
      <div v-if="!isNew" class="d-flex justify-end mb-3">
        <v-btn variant="text" class="text-none" prepend-icon="mdi-format-list-group" @click="startStructuredSets">
          Перайсці на структураваныя наборы (вігілія / дзень, цыклы, ролі)
        </v-btn>
      </div>
      <v-alert
        v-if="validationErrors.length"
        type="warning"
        variant="tonal"
        class="mb-5"
        closable
        @click:close="validationErrors = []"
      >
        <div class="font-weight-bold mb-2">Праверце абавязковыя палі</div>
        <ul class="pl-5">
          <li v-for="message in validationErrors" :key="message">{{ message }}</li>
        </ul>
      </v-alert>

      <v-card class="reading-editor__card mb-5" elevation="0">
        <v-card-title>Для якога дня</v-card-title>
        <v-card-subtitle>
          Рэдактар сам захавае тэхнічную прывязку. Тут дастаткова выбраць зразумелы тып дня.
        </v-card-subtitle>
        <v-card-text>
          <v-row>
            <v-col cols="12" md="8">
              <v-text-field
                v-model="draft.title"
                label="Назва дня або святкавання"
                variant="outlined"
                hide-details="auto"
              />
            </v-col>
            <v-col cols="12" md="4">
              <v-select
                v-model="draft.year"
                :items="cycleOptions"
                label="Літургічны цыкл"
                variant="outlined"
                hide-details="auto"
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-select
                v-model="draft.sourceType"
                :items="sourceOptions"
                label="Тып дня"
                variant="outlined"
                hide-details="auto"
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                v-model="draft.variant"
                label="Асобны варыянт (неабавязкова)"
                placeholder="Напрыклад: vigil"
                variant="outlined"
                hint="Патрэбна толькі калі ў аднаго святкавання ёсць асобныя наборы чытанняў."
                persistent-hint
              />
            </v-col>
          </v-row>

          <v-alert v-if="draft.sourceType === 'linked'" type="info" variant="tonal" class="mt-3">
            Чытанні прывязаны да дня, з якога вы адкрылі рэдактар. Тэхнічны ідэнтыфікатар змяняць не трэба.
          </v-alert>

          <v-row v-else-if="draft.sourceType === 'period'" class="mt-1">
            <v-col cols="12" md="4">
              <v-select
                v-model="draft.periodType"
                :items="periodOptions"
                label="Літургічны перыяд"
                variant="outlined"
                hide-details="auto"
              />
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field
                v-model.number="draft.periodWeekNumber"
                label="Тыдзень"
                type="number"
                variant="outlined"
                hide-details="auto"
              />
            </v-col>
            <v-col cols="12" md="4">
              <v-select
                v-model="draft.dayOfWeek"
                :items="dayOptions"
                label="Дзень тыдня"
                variant="outlined"
                hide-details="auto"
              />
            </v-col>
          </v-row>

          <v-row v-else-if="draft.sourceType === 'date'" class="mt-1">
            <v-col cols="12" md="6">
              <v-text-field
                v-model="draft.date"
                label="Каляндарная дата"
                placeholder="ДД.ММ"
                variant="outlined"
                hint="Напрыклад: 25.12"
                persistent-hint
              />
            </v-col>
          </v-row>

          <v-row v-else-if="draft.sourceType === 'feast'" class="mt-1">
            <v-col cols="12" md="8">
              <v-select
                v-model="draft.feast"
                :items="feastOptions"
                label="Рухомае свята"
                variant="outlined"
                hide-details="auto"
              />
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <section class="reading-editor__section-heading">
        <div>
          <p class="reading-editor__eyebrow">Асноўныя тэксты</p>
          <h2>Чытанні</h2>
        </div>
        <v-btn
          variant="tonal"
          rounded="pill"
          prepend-icon="mdi-plus"
          class="text-none"
          @click="addReadingSection"
        >
          Дадаць яшчэ адно
        </v-btn>
      </section>

      <v-expansion-panels v-model="openReadingPanels" multiple class="reading-editor__panels mb-5">
        <v-expansion-panel
          v-for="section in sortedReadingSections"
          :key="section.key"
          :value="section.key"
          class="reading-editor__panel"
          elevation="0"
        >
          <v-expansion-panel-title>
            <div class="reading-editor__panel-title">
              <span>{{ readingSectionLabel(section.key) }}</span>
              <span v-if="section.bible" class="reading-editor__reference">{{ section.bible }}</span>
            </div>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-row>
              <v-col cols="12" md="4">
                <v-text-field v-model="section.bible" label="Біблійная спасылка" variant="outlined" />
              </v-col>
              <v-col cols="12" md="8">
                <v-text-field
                  v-model="section.comment"
                  label="Кароткі сэнсавы загаловак"
                  variant="outlined"
                />
              </v-col>
              <v-col cols="12">
                <v-text-field
                  v-model="section.title"
                  label="Літургічны ўступ"
                  placeholder="Чытанне кнігі..."
                  variant="outlined"
                />
              </v-col>
              <v-col cols="12">
                <label class="reading-editor__field-label">Тэкст</label>
                <quill-editor
                  v-model:content="section.text"
                  content-type="html"
                  theme="snow"
                  toolbar="essential"
                />
              </v-col>
            </v-row>
            <div v-for="(alternative, index) in section.alternatives || []" :key="index" class="mt-5">
              <div class="d-flex align-center justify-space-between mb-3">
                <strong>Альтэрнатыўнае чытанне {{ index + 1 }}</strong>
                <v-btn variant="text" color="error" @click="section.alternatives.splice(index, 1)">Прыбраць</v-btn>
              </div>
              <v-text-field v-model="alternative.bible" label="Біблійная спасылка" variant="outlined" />
              <v-text-field v-model="alternative.comment" label="Кароткі сэнсавы загаловак" variant="outlined" />
              <v-text-field v-model="alternative.title" label="Літургічны ўступ" variant="outlined" />
              <v-textarea v-model="alternative.text" label="Тэкст" rows="5" auto-grow variant="outlined" />
            </div>
            <v-btn variant="text" prepend-icon="mdi-plus" class="mt-3" @click="addAlternative(section)">Дадаць альтэрнатыўнае чытанне</v-btn>
            <div v-if="section.key !== 'reading1'" class="d-flex justify-end mt-3">
              <v-btn
                color="error"
                variant="text"
                prepend-icon="mdi-delete-outline"
                class="text-none"
                @click="removeReadingSection(section.key)"
              >
                Прыбраць гэта чытанне
              </v-btn>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <v-card class="reading-editor__card mb-5" elevation="0">
        <v-card-title>Секвенцыя</v-card-title>
        <v-card-text>
          <v-textarea v-model="draft.sequence.text" label="Тэкст секвенцыі (калі ёсць)" rows="6" auto-grow variant="outlined" />
        </v-card-text>
      </v-card>

      <v-card class="reading-editor__card mb-5" elevation="0">
        <v-card-title>Рэспансарыйны псальм</v-card-title>
        <v-card-text>
          <v-row>
            <v-col cols="12" md="5">
              <v-text-field v-model="draft.psalm.bible" label="Спасылка на псальм" variant="outlined" />
            </v-col>
            <v-col cols="12" md="7">
              <v-text-field v-model="draft.psalm.chorus" label="Рэфрэн" variant="outlined" />
            </v-col>
            <v-col cols="12">
              <v-text-field
                v-model="draft.psalm.altChorus"
                label="Альтэрнатыўны рэфрэн (неабавязкова)"
                variant="outlined"
              />
            </v-col>
          </v-row>

          <div class="reading-editor__verses">
            <div v-for="(verse, index) in draft.psalm.verses" :key="index" class="reading-editor__verse">
              <v-textarea
                v-model="draft.psalm.verses[index]"
                :label="`Страфа ${index + 1}`"
                rows="3"
                auto-grow
                variant="outlined"
                hide-details="auto"
              />
              <v-btn
                v-if="draft.psalm.verses.length > 1"
                icon="mdi-close"
                size="small"
                variant="text"
                aria-label="Прыбраць страфу"
                @click="draft.psalm.verses.splice(index, 1)"
              />
            </div>
          </div>
          <v-btn variant="text" prepend-icon="mdi-plus" class="text-none" @click="draft.psalm.verses.push('')">
            Дадаць страфу
          </v-btn>
        </v-card-text>
      </v-card>

      <v-card class="reading-editor__card mb-5" elevation="0">
        <v-card-title>Спеў перад Евангеллем</v-card-title>
        <v-card-text>
          <v-row>
            <v-col cols="12" md="4">
              <v-text-field
                v-model="draft.alleluia.bible"
                label="Біблійная спасылка (неабавязкова)"
                variant="outlined"
              />
            </v-col>
            <v-col cols="12" md="8">
              <v-textarea v-model="draft.alleluia.verse" label="Верш" rows="3" auto-grow variant="outlined" />
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <v-card class="reading-editor__card mb-5" elevation="0">
        <v-card-title>Евангелле</v-card-title>
        <v-card-text>
          <v-row>
            <v-col cols="12" md="4">
              <v-text-field v-model="draft.gospel.bible" label="Біблійная спасылка" variant="outlined" />
            </v-col>
            <v-col cols="12" md="8">
              <v-text-field
                v-model="draft.gospel.comment"
                label="Кароткі сэнсавы загаловак"
                variant="outlined"
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                v-model="draft.gospel.title"
                label="Літургічны ўступ"
                placeholder="+ Чытанне святога Евангелля паводле..."
                variant="outlined"
              />
            </v-col>
            <v-col cols="12">
              <label class="reading-editor__field-label">Тэкст Евангелля</label>
              <v-textarea
                v-if="draft.gospel.italicLines?.length"
                v-model="draft.gospel.text"
                rows="12"
                auto-grow
                variant="outlined"
              />
              <quill-editor
                v-else
                v-model:content="draft.gospel.text"
                content-type="html"
                theme="snow"
                toolbar="essential"
              />
            </v-col>
            <v-col v-if="draft.gospel.italicLines?.length" cols="12">
              <v-textarea v-model="gospelItalicLines" label="Радкі курсівам (па адным у радку)" rows="5" auto-grow variant="outlined" />
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <div class="reading-editor__footer">
        <v-btn variant="text" rounded="pill" class="text-none" @click="goBack">Адмяніць</v-btn>
        <v-btn
          type="submit"
          color="primary"
          rounded="pill"
          prepend-icon="mdi-content-save-outline"
          :loading="saving"
          class="text-none"
        >
          Захаваць чытанні
        </v-btn>
      </div>
    </v-form>
  </v-container>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { QuillEditor } from '@vueup/vue-quill';
import '@vueup/vue-quill/dist/vue-quill.snow.css';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query as firestoreQuery,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import MassReadingSetsEditor from '@/components/admin/MassReadingSetsEditor.vue';
import ParsedReadingCard from '@/components/readings/ParsedReadingCard.vue';
import { readingViewOfSet } from '@/utils/massReadingSets';
import {
  buildSetsPayload,
  changedSetFields,
  createSetsDraft,
  linkedProjectionUpdates,
  sanitizeSetsDraft,
  setFromLegacy,
  validateSetsDraft,
} from '@/utils/massReadingSetsEditor';
import { db } from '@/plugins/firebase';
import { FEAST_NAME_MAP } from '@/constants/liturgicalFeastsMap';
import { useNotifier } from '@/composables/useNotifier';
import {
  buildParsedReadingPayload,
  createAdditionalReadingSection,
  createParsedReadingDraft,
  suggestParsedReadingDocumentId,
  validateParsedReadingDraft,
} from '@/utils/parsedReadingEditor';
import moment from '@/utils/moment-be';

const route = useRoute();
const router = useRouter();
const { notifySuccess, notifyError } = useNotifier();

const documentId = computed(() => String(route.params.id || 'new'));
const isNew = computed(() => documentId.value === 'new');
const loading = ref(true);
const saving = ref(false);
const loadError = ref('');
const validationErrors = ref([]);
const original = ref({});
const draft = ref(createParsedReadingDraft());
const gospelItalicLines = computed({
  get: () => (draft.value.gospel.italicLines || []).join('\n'),
  set: (value) => { draft.value.gospel.italicLines = String(value).split('\n').map((line) => line.trim()).filter(Boolean); },
});
const openReadingPanels = ref(['reading1']);

// Structured Mass reading sets (`massReadings`): edited as a whole draft;
// «Адмяніць» drops it, «Адмяніць змены набору» restores one set.
const setsDraft = ref(null);
const setsOriginal = ref(null);
const activeSetIndex = ref(0);
const showPreview = ref(false);
const changedFields = computed(() => (setsDraft.value
  ? setsDraft.value.sets.flatMap((set, index) => changedSetFields(setsOriginal.value?.sets?.[index], set).map((field) => `${set.id}.${field}`))
  : []));
const previewReading = computed(() => {
  if (!setsDraft.value) return null;
  const clean = sanitizeSetsDraft(setsDraft.value);
  const set = clean.sets[activeSetIndex.value];
  return set ? readingViewOfSet({ id: documentId.value, title: original.value.title }, set, String(route.query.year || '')) : null;
});

function resetSet(index) {
  const source = setsOriginal.value?.sets?.[index];
  if (source) setsDraft.value.sets[index] = JSON.parse(JSON.stringify(source));
}

function startStructuredSets() {
  const set = setFromLegacy(original.value);
  setsDraft.value = { schema: 1, flatSet: set.id, sets: [set] };
  setsOriginal.value = { schema: 1, flatSet: set.id, sets: [] };
  activeSetIndex.value = 0;
}

const sourceOptions = computed(() => [
  ...(draft.value.linkedDayId || draft.value.linkedDayIds.length
    ? [{ title: 'Дзень, з якога адкрыты рэдактар', value: 'linked' }]
    : []),
  { title: 'Дзень літургічнага перыяду', value: 'period' },
  { title: 'Каляндарная дата', value: 'date' },
  { title: 'Рухомае свята', value: 'feast' },
]);

const cycleOptions = [
  { title: 'Агульныя для ўсіх цыклаў', value: null },
  { title: 'Нядзельны цыкл A', value: 'A' },
  { title: 'Нядзельны цыкл B', value: 'B' },
  { title: 'Нядзельны цыкл C', value: 'C' },
  { title: 'Будні — год I', value: '1' },
  { title: 'Будні — год II', value: '2' },
];

const periodOptions = [
  { title: 'Адвэнт', value: 'advent' },
  { title: 'Калядны перыяд', value: 'christmas' },
  { title: 'Звычайны перыяд', value: 'ordinary' },
  { title: 'Вялікі пост', value: 'lent' },
  { title: 'Вялікі тыдзень', value: 'holyweek' },
  { title: 'Велікодны перыяд', value: 'easter' },
];

const dayOptions = [
  { title: 'Нядзеля', value: 1 },
  { title: 'Панядзелак', value: 2 },
  { title: 'Аўторак', value: 3 },
  { title: 'Серада', value: 4 },
  { title: 'Чацвер', value: 5 },
  { title: 'Пятніца', value: 6 },
  { title: 'Субота', value: 7 },
];

const feastLabels = {
  holyFamily: 'Святая Сям’я',
  baptismOfLord: 'Хрост Пана',
  holyTrinity: 'Найсвяцейшая Тройца',
  christKing: 'Хрыстус, Валадар Сусвету',
  sacredHeartOfJesus: 'Найсвяцейшае Сэрца Езуса',
  immaculateHeartOfMary: 'Беззаганнае Сэрца Марыі',
  christTheHighPriest: 'Хрыстус, Найвышэйшы і Вечны Святар',
  ashWednesday: 'Папяльцовая серада',
  easterSunday: 'Велікодная нядзеля',
  pentecost: 'Спасланне Духа Святога',
  maryMotherChurch: 'Марыя, Маці Касцёла',
  palmSunday: 'Пальмовая нядзеля',
  corpusChristi: 'Найсвяцейшае Цела і Кроў Хрыста',
  ascension: 'Унебаўшэсце Пана',
};

const feastOptions = Object.entries(FEAST_NAME_MAP).map(([key, value]) => ({
  title: feastLabels[key] || key,
  value,
}));

const sortedReadingSections = computed(() => [...draft.value.readingSections].sort(
  (left, right) => Number(left.key.replace('reading', '')) - Number(right.key.replace('reading', '')),
));

function normalizedSeedDate(value) {
  const parsed = moment(String(value || ''), ['YYYY-MM-DD', 'DD.MM', 'D.M'], true);
  return parsed.isValid() ? parsed.format('DD.MM') : '';
}

function querySeed() {
  const query = route.query;
  return {
    dayId: String(query.dayId || query.returnDayId || ''),
    date: normalizedSeedDate(query._date),
    feast: String(query.feastName || query.feast || ''),
    periodType: String(query._periodType || query.periodType || 'ordinary'),
    periodWeekNumber: Number(query._periodWeekNumber || query.periodWeekNumber || 1),
    dayOfWeek: Number(query._dayOfWeek || query.dayOfWeek || 1),
    year: String(query.year || ''),
  };
}

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    if (isNew.value) {
      const seed = querySeed();
      draft.value = createParsedReadingDraft({}, seed);
      const requestedType = String(route.query.type || '');
      if (['linked', 'period', 'date', 'feast'].includes(requestedType)) {
        draft.value.sourceType = requestedType;
      }
      if (!draft.value.linkedDayId && draft.value.sourceType === 'linked') {
        draft.value.sourceType = seed.date ? 'date' : 'period';
      }
    } else {
      const snapshot = await getDoc(doc(db, 'readings', documentId.value));
      if (!snapshot.exists()) throw new Error('Гэты набор чытанняў не знойдзены.');
      original.value = snapshot.data();
      draft.value = createParsedReadingDraft(original.value);
      if (original.value.massReadings) {
        setsDraft.value = createSetsDraft(original.value);
        setsOriginal.value = createSetsDraft(original.value);
        const requested = setsDraft.value.sets.findIndex((set) => set.id === String(route.query.set || ''));
        activeSetIndex.value = Math.max(requested, 0);
      }
      openReadingPanels.value = ['reading1'];
    }
  } catch (error) {
    loadError.value = error.message || 'Не ўдалося загрузіць чытанні.';
  } finally {
    loading.value = false;
  }
}

function readingSectionLabel(key) {
  const number = Number(String(key).replace('reading', ''));
  if (number === 1) return 'Першае чытанне';
  if (number === 2) return 'Другое чытанне';
  return `Чытанне ${number}`;
}

function addReadingSection() {
  const section = createAdditionalReadingSection(draft.value.readingSections);
  draft.value.readingSections.push(section);
  openReadingPanels.value.push(section.key);
}

function addAlternative(section) {
  if (!Array.isArray(section.alternatives)) section.alternatives = [];
  section.alternatives.push({ bible: '', comment: '', title: '', text: '' });
}

function removeReadingSection(key) {
  draft.value.readingSections = draft.value.readingSections.filter((section) => section.key !== key);
  openReadingPanels.value = openReadingPanels.value.filter((value) => value !== key);
}

function readingsRoute(targetId = '') {
  const requestedDate = moment(String(route.query.date || route.query._date || ''), [
    'YYYY-MM-DD',
    'DD.MM',
    'D.M',
  ], true);
  const date = requestedDate.isValid()
    ? requestedDate.format('YYYY-MM-DD')
    : moment().format('YYYY-MM-DD');
  const query = {};
  const dayId = draft.value.linkedDayId || String(route.query.dayId || route.query.returnDayId || '');
  if (dayId) query.dayId = dayId;
  if (targetId) query.readingId = targetId;
  if (draft.value.year) query.year = draft.value.year;
  if (setsDraft.value?.sets?.[activeSetIndex.value]) query.set = setsDraft.value.sets[activeSetIndex.value].id;
  return { name: 'ReadingsByDate', params: { date }, query };
}

function goBack() {
  router.push(readingsRoute(isNew.value ? '' : documentId.value));
}

async function saveSets() {
  validationErrors.value = validateSetsDraft(setsDraft.value);
  if (validationErrors.value.length) return;
  saving.value = true;
  try {
    const payload = buildSetsPayload(original.value, setsDraft.value);
    payload.updatedAt = serverTimestamp();
    await setDoc(doc(db, 'readings', documentId.value), payload);
    // Legacy documents that project a set of this one follow the edit.
    const linked = await getDocs(firestoreQuery(collection(db, 'readings'), where('_massReadingsRef.doc', '==', documentId.value)));
    const updates = linkedProjectionUpdates(setsDraft.value, linked.docs.map((item) => ({ id: item.id, ...item.data() })));
    await Promise.all(updates.map((update) => setDoc(doc(db, 'readings', update.id), { ...update.data, updatedAt: serverTimestamp() })));
    notifySuccess(updates.length ? `Чытанні захаваны (і ${updates.length} звязаных дакументаў)` : 'Чытанні захаваны');
    await router.push(readingsRoute(documentId.value));
  } catch (error) {
    notifyError(error.message || 'Не ўдалося захаваць чытанні');
  } finally {
    saving.value = false;
  }
}

async function save() {
  if (setsDraft.value) {
    await saveSets();
    return;
  }
  validationErrors.value = validateParsedReadingDraft(draft.value);
  if (validationErrors.value.length) return;

  saving.value = true;
  try {
    const payload = buildParsedReadingPayload(draft.value, original.value);
    let targetId = documentId.value;

    if (isNew.value) {
      targetId = suggestParsedReadingDocumentId(draft.value)
        || doc(collection(db, 'readings')).id;
      const existing = await getDoc(doc(db, 'readings', targetId));
      if (existing.exists()) {
        throw new Error('Чытанні для гэтага дня і цыкла ўжо існуюць. Адкрыйце іх з экрана чытанняў.');
      }
      payload.createdAt = serverTimestamp();
    }

    payload.updatedAt = serverTimestamp();
    await setDoc(doc(db, 'readings', targetId), payload);
    notifySuccess('Чытанні захаваны');
    await router.push(readingsRoute(targetId));
  } catch (error) {
    notifyError(error.message || 'Не ўдалося захаваць чытанні');
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.reading-editor {
  width: min(100%, 1050px);
  padding: 22px 16px 80px !important;
}

.reading-editor__header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.reading-editor__header h1,
.reading-editor__section-heading h2,
.reading-editor__eyebrow {
  margin: 0;
}

.reading-editor__header h1 {
  font-size: clamp(1.45rem, 4vw, 2rem);
  line-height: 1.15;
}

.reading-editor__eyebrow {
  margin-bottom: 4px;
  color: rgb(var(--v-theme-primary));
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.reading-editor__loading {
  display: grid;
  min-height: 45vh;
  place-items: center;
  align-content: center;
  gap: 16px;
  color: var(--nav-muted);
}

.reading-editor__card,
.reading-editor__panel {
  border: 1px solid var(--nav-border);
  border-radius: 20px !important;
  background: var(--nav-surface);
}

.reading-editor__card :deep(.v-card-title) {
  padding: 20px 20px 4px;
  font-weight: 750;
}

.reading-editor__card :deep(.v-card-subtitle) {
  padding: 0 20px 10px;
  white-space: normal;
}

.reading-editor__card :deep(.v-card-text) {
  padding: 18px 20px 20px;
}

.reading-editor__section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 28px 4px 14px;
}

.reading-editor__panels {
  display: grid;
  gap: 12px;
}

.reading-editor__panel-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  width: 100%;
  gap: 18px;
  padding-right: 12px;
  font-weight: 720;
}

.reading-editor__reference {
  color: var(--nav-muted);
  font-size: 0.78rem;
  font-weight: 600;
}

.reading-editor__field-label {
  display: block;
  margin: 0 0 7px 2px;
  color: var(--nav-muted);
  font-size: 0.78rem;
  font-weight: 650;
}

.reading-editor :deep(.ql-container) {
  min-height: 230px;
  border-color: var(--nav-border);
  border-radius: 0 0 8px 8px;
  font-family: var(--reader-font-family);
  font-size: 1rem;
}

.reading-editor :deep(.ql-toolbar) {
  border-color: var(--nav-border);
  border-radius: 8px 8px 0 0;
}

.reading-editor__verses {
  display: grid;
  gap: 12px;
}

.reading-editor__verse {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 40px;
  gap: 6px;
  align-items: start;
}

.reading-editor__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 8px;
}

@media (max-width: 600px) {
  .reading-editor__header {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .reading-editor__header .v-spacer {
    display: none;
  }

  .reading-editor__header > .v-btn:last-child {
    width: 100%;
  }

  .reading-editor__section-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .reading-editor__section-heading .v-btn,
  .reading-editor__footer .v-btn:last-child {
    flex: 1;
  }
}
</style>
