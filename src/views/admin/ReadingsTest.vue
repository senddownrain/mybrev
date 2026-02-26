<template>
  <v-container>
    <h1 class="text-h4 mb-4">Кіраванне чытаннямі</h1>

    <!-- Форма добавления чтения -->
    <v-card class="mb-6" variant="outlined">
      <v-card-title>Дадаць чытанне</v-card-title>
      <v-card-subtitle class="mt-2">Выберыце спосаб ідэнтыфікацыі і ўвядзіце тэкст чытання</v-card-subtitle>
      <v-card-text>
        <v-form @submit.prevent="addTestReading">
          <v-row>
            <v-col cols="12" md="6">
              <v-select
                v-model="formData.cycle"
                :items="cycleOptions"
                label="Цыкл"
                variant="outlined"
                required
              ></v-select>
            </v-col>
            
            <v-col cols="12" md="6">
              <v-select
                v-model="formData.type"
                :items="typeOptions"
                label="Тып ідэнтыфікацыі"
                variant="outlined"
                required
                @update:model-value="onTypeChange"
              ></v-select>
            </v-col>
          </v-row>

          <!-- Вариант 1: По периоду -->
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

          <!-- Вариант 2: По дате -->
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

          <!-- Вариант 3: По празднику -->
          <div v-if="formData.type === 'feast'">
            <v-row>
              <v-col cols="12" md="4">
                <v-select
                  v-model="formData.feastId"
                  :items="feastIdOptions"
                  label="ID свята"
                  variant="outlined"
                  required
                  @update:model-value="onFeastIdChange"
                ></v-select>
              </v-col>
              <v-col cols="12" md="4">
                <v-text-field
                  v-model="formData.feastName"
                  label="Назва свята"
                  variant="outlined"
                  required
                ></v-text-field>
              </v-col>
              <v-col cols="12" md="4">
                <v-text-field
                  v-model="formData.feastDate"
                  label="Дата свята (YYYY-MM-DD)"
                  type="date"
                  variant="outlined"
                  required
                ></v-text-field>
              </v-col>
            </v-row>
          </div>

          <!-- Текст чтения -->
          <v-row>
            <v-col cols="12">
              <v-textarea
                v-model="formData.text"
                label="Тэкст чытання (HTML)"
                variant="outlined"
                rows="10"
                required
              ></v-textarea>
            </v-col>
          </v-row>

          <v-btn
            type="submit"
            color="primary"
            :loading="adding"
            block
          >
            Дадаць чытанне
          </v-btn>
        </v-form>
      </v-card-text>
    </v-card>

    <!-- Тест поиска -->
    <v-card class="mb-6" variant="outlined">
      <v-card-title>Тэст пошуку</v-card-title>
      <v-card-text>
        <v-row>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="searchDate"
              label="Дата для пошуку"
              type="date"
              variant="outlined"
            ></v-text-field>
          </v-col>
          <v-col cols="12" md="6" class="d-flex align-center">
            <v-btn
              color="primary"
              @click="testSearch"
              :loading="searching"
              block
            >
              Знайсці чытанні
            </v-btn>
          </v-col>
        </v-row>

        <div v-if="searchResults.length > 0" class="mt-4">
          <h3 class="text-h6 mb-2">Вынікі пошуку ({{ searchResults.length }})</h3>
          <v-list>
            <v-list-item
              v-for="result in searchResults"
              :key="result.id"
              :title="`ID: ${result.id}`"
              :subtitle="getResultSubtitle(result)"
            >
              <template v-slot:append>
                <v-btn
                  icon="mdi-delete"
                  variant="text"
                  color="error"
                  size="small"
                  @click="deleteReadingItem(result.id)"
                ></v-btn>
              </template>
            </v-list-item>
          </v-list>
        </div>

        <v-alert v-else-if="searched && !searching" type="info" class="mt-4">
          Чытанні не знойдзены
        </v-alert>
      </v-card-text>
    </v-card>

    <!-- Отображение найденного чтения -->
    <v-card v-if="selectedReading" variant="outlined">
      <v-card-title>Выбранае чытанне</v-card-title>
      <v-card-text>
        <v-chip class="mb-2" color="primary">{{ selectedReading.cycle }}</v-chip>
        <div class="prayer-content-area mt-4" v-html="selectedReading.text"></div>
      </v-card-text>
    </v-card>

    <!-- Уведомления -->
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

const { addReading, loadReadingsForDate, deleteReading } = useReadings();
const { notifySuccess, notifyError } = useNotifier();
const route = useRoute();

const adding = ref(false);
const searching = ref(false);
const searched = ref(false);
const searchResults = ref([]);
const selectedReading = ref(null);
const searchDate = ref(moment().format('YYYY-MM-DD'));

const formData = ref({
  cycle: 'A',
  type: 'period',
  _periodType: 'ordinary',
  _periodWeekNumber: 1,
  _dayOfWeek: 1,
  _date: moment().format('YYYY-MM-DD'),
  feastId: 'holyFamily',
  feastName: 'holyfamily',
  feastDate: moment().format('YYYY-MM-DD'),
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
  { title: 'A (воскресенье)', value: 'A' },
  { title: 'B (воскресенье)', value: 'B' },
  { title: 'C (воскресенье)', value: 'C' },
  { title: '1 (будни)', value: '1' },
  { title: '2 (будни)', value: '2' },
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

const feastIdOptions = Object.keys(FEAST_NAME_MAP).map(key => ({
  title: key,
  value: key,
}));

function onTypeChange() {
  // Сброс полей при смене типа
  formData.value._periodType = 'ordinary';
  formData.value._periodWeekNumber = 1;
  formData.value._dayOfWeek = 1;
  formData.value._date = moment().format('YYYY-MM-DD');
  formData.value.feastId = 'holyFamily';
  formData.value.feastName = 'holyfamily';
  formData.value.feastDate = moment().format('YYYY-MM-DD');
}

function onFeastIdChange() {
  // Автоматически заполняем feastName из маппинга
  if (formData.value.feastId && FEAST_NAME_MAP[formData.value.feastId]) {
    formData.value.feastName = FEAST_NAME_MAP[formData.value.feastId];
  }
}

async function addTestReading() {
  adding.value = true;
  
  try {
    const data = {
      cycle: formData.value.cycle,
      text: formData.value.text,
    };

    // Добавляем поля в зависимости от типа
    if (formData.value.type === 'period') {
      data._periodType = formData.value._periodType;
      data._periodWeekNumber = formData.value._periodWeekNumber;
      data._dayOfWeek = formData.value._dayOfWeek;
    } else if (formData.value.type === 'date') {
      data._date = formData.value._date;
    } else if (formData.value.type === 'feast') {
      data.feastId = formData.value.feastId;
      data.feastName = formData.value.feastName;
      data.feastDate = formData.value.feastDate;
    }

    await addReading(data);
    notifySuccess('Чытанне дададзена паспяхова');
    
    // Очистка формы
    formData.value.text = '<h2>Тэставае чытанне</h2><p>Гэта тэставы тэкст для праверкі сістэмы чытанняў.</p>';
  } catch (error) {
    notifyError('Памылка пры даданні чытання: ' + (error.message || error));
  } finally {
    adding.value = false;
  }
}

async function testSearch() {
  searching.value = true;
  searched.value = true;
  searchResults.value = [];
  selectedReading.value = null;

  try {
    const date = searchDate.value ? moment(searchDate.value).toDate() : moment().toDate();
    const results = await loadReadingsForDate(date);
    searchResults.value = results;
    
    if (results.length > 0) {
      selectedReading.value = results[0];
      notifySuccess(`Знойдзена чытанняў: ${results.length}`);
    } else {
      notifyError('Чытанні не знойдзены');
    }
  } catch (error) {
    notifyError('Памылка пошуку: ' + (error.message || error));
  } finally {
    searching.value = false;
  }
}

async function deleteReadingItem(id) {
  if (!confirm('Вы ўпэўнены, што хочаце выдаліць гэтае чытанне?')) {
    return;
  }

  try {
    await deleteReading(id);
    searchResults.value = searchResults.value.filter(r => r.id !== id);
    if (selectedReading.value && selectedReading.value.id === id) {
      selectedReading.value = null;
    }
    notifySuccess('Чытанне выдалена');
  } catch (error) {
    notifyError('Памылка выдалення: ' + (error.message || error));
  }
}

function getResultSubtitle(result) {
  const parts = [];
  
  if (result._periodType) {
    parts.push(`Перыяд: ${result._periodType}, тыдзень ${result._periodWeekNumber}, дзень ${result._dayOfWeek}`);
  }
  if (result._date) {
    parts.push(`Дата: ${result._date}`);
  }
  if (result.feastName) {
    parts.push(`Свята: ${result.feastName}`);
  }
  
  return parts.join(' | ') || 'Без дадатковых параметраў';
}
</script>

<style scoped>
.prayer-content-area {
  font-size: 1.1rem;
  line-height: 1.6;
}
</style>
