<template>
  <v-container>
    <h1 class="text-h4 mb-4">Кіраванне чытаннямі</h1>

    <v-card class="mb-6" variant="outlined">
      <v-card-title>Reading management</v-card-title>
      <v-card-subtitle class="mt-2">Загрузіць, змяніць або стварыць чытанне па параметрах</v-card-subtitle>
      <v-card-text>
        <v-form @submit.prevent="addTestReading">
          <v-row>
            <v-col cols="12" md="4">
              <v-select
                v-model="formData.cycle"
                :items="cycleOptions"
                label="Цыкл"
                variant="outlined"
                clearable
                hint="Апцыянальна. Па змоўчанні — без цыкла"
                persistent-hint
              ></v-select>
            </v-col>

            <v-col cols="12" md="4">
              <v-select
                v-model="formData.type"
                :items="typeOptions"
                label="Тып ідэнтыфікацыі"
                variant="outlined"
                required
                @update:model-value="onTypeChange"
              ></v-select>
            </v-col>

            <v-col cols="12" md="4" class="d-flex align-center">
              <v-btn type="button" color="secondary" variant="outlined" block :loading="loadingExisting" @click="loadByParams()">
                Загрузіць па параметрах
              </v-btn>
            </v-col>
          </v-row>

          <div v-if="formData.type === 'period'">
            <v-row>
              <v-col cols="12" md="4">
                <v-select
                  v-model="formData._periodType"
                  :items="periodTypeOptions"
                  label="Тып перыяду"
                  variant="outlined"
                  required
                ></v-select>
              </v-col>
              <v-col cols="12" md="4">
                <v-text-field
                  v-model.number="formData._periodWeekNumber"
                  label="Нумар тыдня"
                  type="number"
                  variant="outlined"
                  required
                ></v-text-field>
              </v-col>
              <v-col cols="12" md="4">
                <v-select
                  v-model.number="formData._dayOfWeek"
                  :items="dayOfWeekOptions"
                  label="Дзень тыдня"
                  variant="outlined"
                  required
                ></v-select>
              </v-col>
            </v-row>
          </div>

          <div v-if="formData.type === 'date'">
            <v-row>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="formData._date"
                  label="Дата (YYYY-MM-DD)"
                  type="date"
                  variant="outlined"
                  required
                ></v-text-field>
              </v-col>
            </v-row>
          </div>

          <div v-if="formData.type === 'feast'">
            <v-row>
              <v-col cols="12" md="6">
                <v-select
                  v-model="formData.feastId"
                  :items="feastIdOptions"
                  label="ID свята"
                  variant="outlined"
                  required
                  @update:model-value="onFeastIdChange"
                ></v-select>
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="formData.feastName"
                  label="Ключ свята (_feast)"
                  variant="outlined"
                  required
                ></v-text-field>
              </v-col>
            </v-row>
          </div>

          <v-divider class="my-4" />

          <div class="mb-4">
            <label class="text-caption text-medium-emphasis mb-2 d-block">Тэкст чытання</label>
            <quill-editor
              v-model:content="formData.text"
              contentType="html"
              theme="snow"
              toolbar="essential"
            />
          </div>

          <v-btn type="submit" color="primary" :loading="adding" block>
            {{ formData.existingId ? 'Захаваць змены' : 'Стварыць чытанне' }}
          </v-btn>
        </v-form>
      </v-card-text>
    </v-card>

    <v-card class="mb-6" variant="outlined">
      <v-card-title>Пошук недастаючых чытанняў па перыядах</v-card-title>
      <v-card-text>
        <v-btn color="primary" :loading="searchingMissing" @click="findMissingPeriodReadings" block>
          Знайсці недастаючыя чытанні
        </v-btn>

        <v-alert v-if="searchedMissing && missingPeriodReadings.length === 0" type="success" class="mt-4">
          Усе перыядычныя дні маюць чытанні.
        </v-alert>

        <v-list v-if="missingPeriodReadings.length > 0" class="mt-4">
          <v-list-item
            v-for="item in missingPeriodReadings"
            :key="item.key"
            :title="`${item._periodType}, тыдзень ${item._periodWeekNumber}, дзень ${item._dayOfWeek}`"
            :subtitle="item._dayName || item._date || item.id"
            :active="selectedMissingKey === item.key"
            @click="selectMissingPeriodItem(item)"
          >
            <template #append>
              <v-icon icon="mdi-arrow-up-bold-circle-outline" />
            </template>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>

    <NotificationSnackbar />
  </v-container>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useReadings } from '@/composables/useReadings';
import { useNotifier } from '@/composables/useNotifier';
import { FEAST_NAME_MAP } from '@/constants/readings';
import NotificationSnackbar from '@/components/NotificationSnackbar.vue';
import moment from '@/utils/moment-be';
import { db } from '@/plugins/firebase';

const { notifySuccess, notifyError } = useNotifier();
const route = useRoute();

const adding = ref(false);
const loadingExisting = ref(false);
const searchingMissing = ref(false);
const searchedMissing = ref(false);
const missingPeriodReadings = ref([]);
const selectedMissingKey = ref(null);

const formData = ref({
  cycle: null,
  type: 'period',
  _periodType: 'ordinary',
  _periodWeekNumber: 1,
  _dayOfWeek: 1,
  _date: moment().format('YYYY-MM-DD'),
  feastId: 'holyFamily',
  feastName: 'holyfamily',
  existingId: null,
  text: '<h2>Тэставае чытанне</h2><p>Гэта тэставы тэкст для праверкі сістэмы чытанняў.</p>',
});

onMounted(() => {
  const q = route.query;
  if (q.type && ['period', 'date', 'feast'].includes(q.type)) {
    formData.value.type = String(q.type);
  }

  if (q._periodType) formData.value._periodType = String(q._periodType);
  if (q._periodWeekNumber) formData.value._periodWeekNumber = Number(q._periodWeekNumber);
  if (q._dayOfWeek) formData.value._dayOfWeek = Number(q._dayOfWeek);
  if (q._date) formData.value._date = String(q._date);

  if (formData.value.type === 'period' && !formData.value._periodType) {
    formData.value.type = 'date';
  }
});

const cycleOptions = [
  { title: 'A (нядзелі)', value: 'A' },
  { title: 'B (нядзелі)', value: 'B' },
  { title: 'C (нядзелі)', value: 'C' },
  { title: '1 (будні)', value: '1' },
  { title: '2 (будні)', value: '2' },
];

const typeOptions = [
  { title: 'Па перыядзе і дню', value: 'period' },
  { title: 'Па даце', value: 'date' },
  { title: 'Па свяце', value: 'feast' },
];

const periodTypeOptions = [
  { title: 'Адвент', value: 'advent' },
  { title: 'Каляды', value: 'christmas' },
  { title: 'Звычайны перыяд', value: 'ordinary' },
  { title: 'Вялікі пост', value: 'lent' },
  { title: 'Вялікдзень', value: 'easter' },
  { title: 'Вялікі тыдзень', value: 'holyweek' },
];

const dayOfWeekOptions = [
  { title: 'Нядзеля', value: 1 },
  { title: 'Панядзелак', value: 2 },
  { title: 'Аўторак', value: 3 },
  { title: 'Серада', value: 4 },
  { title: 'Чацвер', value: 5 },
  { title: 'Пятніца', value: 6 },
  { title: 'Субота', value: 7 },
];

const feastIdOptions = Object.keys(FEAST_NAME_MAP).map((key) => ({
  title: key,
  value: key,
}));

function onTypeChange() {
  formData.value._periodType = 'ordinary';
  formData.value._periodWeekNumber = 1;
  formData.value._dayOfWeek = 1;
  formData.value._date = moment().format('YYYY-MM-DD');
  formData.value.feastId = 'holyFamily';
  formData.value.feastName = 'holyfamily';
  formData.value.existingId = null;
}

function onFeastIdChange() {
  if (formData.value.feastId && FEAST_NAME_MAP[formData.value.feastId]) {
    formData.value.feastName = FEAST_NAME_MAP[formData.value.feastId];
  }
}

function buildReadingId(data) {
  if (data._periodType && data._periodWeekNumber && data._dayOfWeek) {
    return `${data._periodType}-w${data._periodWeekNumber}-d${data._dayOfWeek}`;
  }

  if (data._feast) {
    return `feast-${data._feast}`;
  }

  if (data._date) {
    const normalizedDate = moment(data._date, 'D.M').format('DD.MM');
    const uid = Math.random().toString(36).slice(2, 8);
    return `${normalizedDate}-${uid}`;
  }

  throw new Error('Не атрымалася сфармаваць ID для чытання');
}

async function loadByParams(options = {}) {
  const { silentNotFound = false } = options;
  loadingExisting.value = true;

  try {
    const conditions = [];

    if (formData.value.cycle) {
      conditions.push(where('cycle', '==', formData.value.cycle));
    }

    if (formData.value.type === 'period') {
      const week = Number(formData.value._periodWeekNumber);
      const day = Number(formData.value._dayOfWeek);
      const baseConditions = [
        where('_periodType', '==', formData.value._periodType),
      ];

      const queryVariants = [
        query(collection(db, 'readings'), ...baseConditions, where('_periodWeekNumber', '==', week), where('_dayOfWeek', '==', day), ...conditions),
        query(collection(db, 'readings'), ...baseConditions, where('_periodWeekNumber', '==', String(week)), where('_dayOfWeek', '==', String(day)), ...conditions),
        query(collection(db, 'readings'), ...baseConditions, where('_periodWeekNumber', '==', week), where('_dayOfWeek', '==', String(day)), ...conditions),
        query(collection(db, 'readings'), ...baseConditions, where('_periodWeekNumber', '==', String(week)), where('_dayOfWeek', '==', day), ...conditions),
      ];

      for (const periodQuery of queryVariants) {
        const snapshot = await getDocs(periodQuery);
        if (!snapshot.empty) {
          const firstDoc = snapshot.docs[0];
          const data = firstDoc.data();
          formData.value.existingId = firstDoc.id;
          formData.value.text = data.text || '';
          formData.value.cycle = data.cycle || null;
          notifySuccess(`Загружана чытанне: ${firstDoc.id}`);
          return true;
        }
      }

      formData.value.existingId = null;
      if (!silentNotFound) {
        notifyError('Па гэтых параметрах чытанне не знойдзена. Можна стварыць новае.');
      }
      return false;
    }

    if (formData.value.type === 'date') {
      conditions.push(where('_date', '==', moment(formData.value._date).format('D.M')));
    } else if (formData.value.type === 'feast') {
      conditions.push(where('_feast', '==', formData.value.feastName?.toLowerCase().trim()));
    }

    const snapshot = await getDocs(query(collection(db, 'readings'), ...conditions));
    if (snapshot.empty) {
      formData.value.existingId = null;
      if (!silentNotFound) {
        notifyError('Па гэтых параметрах чытанне не знойдзена. Можна стварыць новае.');
      }
      return false;
    }

    const firstDoc = snapshot.docs[0];
    const data = firstDoc.data();
    formData.value.existingId = firstDoc.id;
    formData.value.text = data.text || '';
    formData.value.cycle = data.cycle || null;
    notifySuccess(`Загружана чытанне: ${firstDoc.id}`);
    return true;
  } catch (error) {
    notifyError('Памылка загрузкі: ' + (error.message || error));
    return false;
  } finally {
    loadingExisting.value = false;
  }
}

function getPeriodKey(item) {
  const periodType = String(item?._periodType || '').trim().toLowerCase();
  const week = Number(item?._periodWeekNumber);
  const day = Number(item?._dayOfWeek);

  if (!periodType || !Number.isFinite(week) || !Number.isFinite(day) || week < 1 || day < 1) {
    return null;
  }

  return `${periodType}|${week}|${day}`;
}


async function addTestReading() {
  adding.value = true;

  try {
    const data = {
      text: formData.value.text?.trim() || '',
      updatedAt: serverTimestamp(),
    };

    if (formData.value.cycle) {
      data.cycle = formData.value.cycle;
    }

    if (formData.value.type === 'period') {
      data._periodType = formData.value._periodType;
      data._periodWeekNumber = Number(formData.value._periodWeekNumber);
      data._dayOfWeek = Number(formData.value._dayOfWeek);
    } else if (formData.value.type === 'date') {
      data._date = moment(formData.value._date).format('D.M');
    } else if (formData.value.type === 'feast') {
      data._feast = formData.value.feastName?.toLowerCase().trim();
    }

    const docId = formData.value.existingId || buildReadingId(data);
    const payload = {
      ...data,
      createdAt: serverTimestamp(),
    };

    if (formData.value.existingId) {
      delete payload.createdAt;
    }

    await setDoc(doc(db, 'readings', docId), payload, { merge: !!formData.value.existingId });
    formData.value.existingId = docId;

    notifySuccess(formData.value.existingId ? 'Чытанне абноўлена' : `Чытанне створана: ${docId}`);
  } catch (error) {
    notifyError('Памылка пры захаванні чытання: ' + (error.message || error));
  } finally {
    loadingExisting.value = false;
  }
}


async function selectMissingPeriodItem(item) {
  selectedMissingKey.value = item.key;
  formData.value.type = 'period';
  formData.value._periodType = item._periodType;
  formData.value._periodWeekNumber = Number(item._periodWeekNumber);
  formData.value._dayOfWeek = Number(item._dayOfWeek);
  formData.value.existingId = null;

  const found = await loadByParams({ silentNotFound: true });
  if (!found) {
    notifyError('Для выбранага перыяду чытанне сапраўды адсутнічае. Можна дадаць уручную.');
  }
}

async function findMissingPeriodReadings() {
  searchingMissing.value = true;
  searchedMissing.value = true;
  missingPeriodReadings.value = [];

  try {
    const periodValues = periodTypeOptions.map((item) => item.value);

    const daySnapshots = await Promise.all(
      periodValues.map((periodType) =>
        getDocs(query(collection(db, 'days'), where('_periodType', '==', periodType))),
      ),
    );

    const allPeriodDays = daySnapshots.flatMap((snapshot) =>
      snapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
    );

    const expectedMap = new Map();
    allPeriodDays.forEach((day) => {
      const key = getPeriodKey(day);
      if (!key) return;
      if (!expectedMap.has(key)) {
        expectedMap.set(key, { ...day, key });
      }
    });

    const readingSnapshots = await Promise.all(
      periodValues.map((periodType) =>
        getDocs(query(collection(db, 'readings'), where('_periodType', '==', periodType))),
      ),
    );

    const existingKeys = new Set();
    readingSnapshots.forEach((snapshot) => {
      snapshot.docs.forEach((docSnap) => {
        const reading = docSnap.data();
        const key = getPeriodKey(reading);
        if (!key) return;
        existingKeys.add(key);
      });
    });

    missingPeriodReadings.value = Array.from(expectedMap.values())
      .filter((day) => !existingKeys.has(day.key))
      .sort((a, b) => {
        if (a._periodType !== b._periodType) return String(a._periodType).localeCompare(String(b._periodType));
        if (a._periodWeekNumber !== b._periodWeekNumber) return Number(a._periodWeekNumber) - Number(b._periodWeekNumber);
        return Number(a._dayOfWeek) - Number(b._dayOfWeek);
      });

    notifySuccess(`Знойдзена недастаючых чытанняў: ${missingPeriodReadings.value.length}`);
  } catch (error) {
    notifyError('Памылка пошуку недастаючых чытанняў: ' + (error.message || error));
  } finally {
    searchingMissing.value = false;
  }
}
</script>

<style scoped>
.prayer-content-area {
  font-size: 1.1rem;
  line-height: 1.6;
}
</style>
