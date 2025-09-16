<template>
  <v-container fluid>
    <v-row>
      <!-- Левая колонка -->
      <v-col cols="12" md="6" lg="5">
        <div class="sticky-panel">
          <h1 class="text-h5 font-weight-light mb-4">Выберыце дату</h1>
          <v-date-picker v-model="selectedDate" @update:model-value="runTest" color="primary" show-adjacent-months hide-header></v-date-picker>
<!-- КАРТОЧКА АУДИТА -->
          <v-card variant="tonal" class="mt-6">
            <v-card-text>
              <div class="text-h6">1. Аўдыт базы дадзеных</div>
              <div class="text-caption mb-2">Знайсці адсутныя запісы за выбраны год.</div>
              <v-btn @click="runYearAudit" :loading="audit.inProgress" color="primary" block>
                Праверыць {{ selectedYear }} год
              </v-btn>
              <v-progress-linear v-if="audit.inProgress" :model-value="audit.progress" color="primary" class="mt-2"></v-progress-linear>
            </v-card-text>
          </v-card>
          
          <!-- ✅ КАРТОЧКА ИМПОРТА (появляется после аудита) -->
          <!-- <v-card v-if="missingDaysForImport.length > 0" variant="tonal" class="mt-6" color="orange-darken-3">
            <v-card-text>
              <div class="text-h6">2. Імпарт адсутных дзён</div>
              <div class="text-caption mb-2">Знойдзена {{ missingDaysForImport.length }} элементаў. Гатова да імпарту са старой базы.</div>
              <v-btn @click="runImport" :loading="importState.inProgress" color="orange" block>
                Пачаць імпарт
              </v-btn>
            </v-card-text>
          </v-card> -->

          <div v-if="results" class="mt-4">
            <v-card variant="outlined" class="mb-4">
              <v-card-item><v-card-title>Кантэкст перыяду</v-card-title></v-card-item>
              <v-divider></v-divider>
              <v-card-text><pre class="data-block">{{ cleanContext }}</pre></v-card-text>
            </v-card>

            <v-expansion-panels>
              <v-expansion-panel title="Паказаць зыходныя дадзеныя для разлікаў">
                <v-expansion-panel-text class="pt-2">
                  <h3 class="text-subtitle-1 mt-2">Параметры запыту дня перыяду</h3>
                  <pre class="data-block">{{ cleanQueryParams }}</pre>

                  <h3 class="text-subtitle-1 mt-4">Налады года (YearOptions)</h3>
                  <pre class="data-block">{{ cleanRawOptions }}</pre>

                  <h3 class="text-subtitle-1 mt-4">Разлічаныя дынамічныя святы</h3>
                  <pre class="data-block">{{ cleanDynamicDates }}</pre>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </div>
        </div>
      </v-col>

      <!-- Правая колонка -->
      <v-col cols="12" md="6" lg="7">
        
        <!-- <v-card variant="tonal" class="mt-6" color="orange-darken-3">
  <v-card-text>
    <div class="text-h6">Імпарт адсутных дзён</div>
    <div class="text-caption mb-2">Знайсці і дадаць {{ missingDaysForImport.length }} элементаў са старой базы.</div>
    <v-btn @click="runImport" :loading="importState.inProgress" color="orange" block>
      Пачаць імпарт
    </v-btn>
  </v-card-text>
</v-card>
<div v-if="importState.report" class="mb-8">
  <h1 class="text-h4 font-weight-light">Справаздача па імпарту</h1>
  
  <v-card class="mt-4" color="green-darken-4">
    <v-card-title>Паспяхова дададзена: {{ importState.report.added.length }}</v-card-title>
    <v-list v-if="importState.report.added.length > 0" bg-color="transparent">
      <v-list-item v-for="(item, i) in importState.report.added" :key="i" :title="item.date" :subtitle="item.found"></v-list-item>
    </v-list>
  </v-card>
  
  <v-card class="mt-4" color="red-darken-4">
    <v-card-title>Не знойдзена ў старой базе: {{ importState.report.notFound.length }}</v-card-title>
    <v-list v-if="importState.report.notFound.length > 0" bg-color="transparent">
      <v-list-item v-for="(item, i) in importState.report.notFound" :key="i" :title="item.date" :subtitle="item.searchCriteria"></v-list-item>
    </v-list>
  </v-card>
</div>
<v-divider v-if="importState.report" class="my-8"></v-divider> -->

        <!-- ✅ ОБЛАСТЬ ДЛЯ ВЫВОДА РЕЗУЛЬТАТОВ АУДИТА -->
        <div v-if="audit.results" class="mb-8">
          <h1 class="text-h4 font-weight-light">Вынікі аўдыту {{ selectedYear }} года</h1>
          
          <v-card class="mt-4">
            <v-card-title>Адсутныя рухомыя святы</v-card-title>
            <v-list v-if="audit.results.feasts.length > 0">
              <v-list-item v-for="feast in audit.results.feasts" :key="feast.name" :title="feast.name" :subtitle="feast.date"></v-list-item>
            </v-list>
            <v-card-text v-else class="text-grey">Усе святы на месцы.</v-card-text>
          </v-card>
          
          <v-card class="mt-4">
            <v-card-title>Адсутныя дні перыядаў</v-card-title>
             <v-list v-if="audit.results.periodDays.length > 0">
              <v-list-item v-for="(day, i) in audit.results.periodDays" :key="i" :subtitle="day.date">
                <v-list-item-title>
                  Тып: {{ day.type }}, Тыдзень: {{ day.week }}, Дзень: {{ day.day }}
                </v-list-item-title>
              </v-list-item>
            </v-list>
            <v-card-text v-else class="text-grey">Усе дні перыядаў на месцы.</v-card-text>
          </v-card>
        </div>
        <!-- Разделитель -->
        <v-divider v-if="audit.results" class="my-8"></v-divider>
        
        <!-- Результаты для одного дня (как было раньше) -->
        <h1 class="text-h4 font-weight-light mb-4">Дыягностыка аднаго дня</h1>
        <div v-if="loading" class="text-center mt-16">
          <v-progress-circular indeterminate size="64"></v-progress-circular>
        </div>
        <div v-else-if="results">
          <!-- ✅ Упрощенный вызов ResultCard. Передаем только данные. -->
          <ResultCard :items="results.diagnostics.periodResult" :currentDate="selectedDate" card-title="1. Знойдзена па перыядзе" empty-text="Адпаведнасцяў па перыядзе не знойдзена." />
          <ResultCard :items="results.diagnostics.fixedFeastResult" :currentDate="selectedDate" card-title="2. Знойдзена па фіксаванай даце" empty-text="Нерухомых святаў на гэты дзень не знойдзена." class="mt-6" />
          <ResultCard :items="results.diagnostics.dynamicFeastsResults" :currentDate="selectedDate" card-title="3. Знойдзена па рухомых святах" empty-text="Рухомых святаў на гэты дзень не знойдзена." class="mt-6" />
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
// ✅ Весь <script setup> остается без изменений с прошлого раза.
// Он корректно запускает тесты и передает данные.
import { ref, computed, reactive } from 'vue';
import moment from 'moment';
import { useLiturgicalDay } from '@/composables/useLiturgicalDay';
import ResultCard from '@/components/admin/ResultCard.vue';

import { useDataImporter } from '@/composables/useDataImporter';
const { importMissingDays } = useDataImporter();


const { runLiturgicalDiagnostics, getLiturgicalOptionsForDate, auditYear } = useLiturgicalDay();
const selectedDate = ref(new Date());
const selectedYear = computed(() => moment(selectedDate.value).year());

const loading = ref(false);
const results = ref(null);
const liturgicalContext = ref({});

const audit = reactive({
  inProgress: false,
  progress: 0,
  results: null,
});


const importState = reactive({
  inProgress: false,
  report: null
});
const missingDaysForImport = ref([]);


// ✅ Новая функция для запуска аудита
const runYearAudit = async () => {
  audit.inProgress = true;
  audit.progress = 0;
  audit.results = null;
  results.value = null; // Очищаем и результаты одиночного теста
  try {
    const auditResults = await auditYear(selectedYear.value, (p) => { audit.progress = p; });
    audit.results = auditResults;
    // ✅ СВЯЗУЮЩЕЕ ЗВЕНО! Заполняем список для импорта из результатов аудита
    if (auditResults && auditResults.periodDays.length > 0) {
      missingDaysForImport.value = auditResults.periodDays;
    }
  } catch (error) {
    console.error("Ошибка при аудите года:", error);
    alert("Адбылася памылка падчас аўдыту. Глядзіце кансоль.");
  } finally {
    audit.inProgress = false;
  }
};

const runTest = async () => {
  if (!selectedDate.value) return;
  loading.value = true;
  results.value = null;
  liturgicalContext.value = {};
  try {
    results.value = await runLiturgicalDiagnostics(selectedDate.value);
    const mainResult = await getLiturgicalOptionsForDate(selectedDate.value);
    liturgicalContext.value = mainResult.context;
  } catch (error) { console.error("Ошибка:", error); } 
  finally { loading.value = false; }
};

const cleanContext = computed(() => JSON.stringify(liturgicalContext.value, null, 2));
const cleanQueryParams = computed(() => {
    if (!results.value?.diagnostics?.periodParams) return '{}';
    return JSON.stringify(results.value.diagnostics.periodParams, null, 2);
});
const cleanRawOptions = computed(() => {
    if (!results.value?.rawOptions?.yearOptions) return '{}';
    return JSON.stringify(results.value.rawOptions.yearOptions, null, 2);
});
const cleanDynamicDates = computed(() => {
    if (!results.value?.rawOptions?.dynamicDates) return '{}';
    const formatted = {};
    const datesObj = results.value.rawOptions.dynamicDates;
    for (const key in datesObj) {
        if (datesObj[key] && datesObj[key].format) {
            formatted[key] = datesObj[key].format('YYYY-MM-DD');
        }
    }
    return JSON.stringify(formatted, null, 2);
});

runTest();

// Внутри <script setup>
const runImport = async () => {
  importState.inProgress = true;
  importState.report = null;
  try {
    importState.report = await importMissingDays(missingDaysForImport.value);
  } catch (e) {
    alert("Ошибка во время импорта: " + e.message);
    console.error(e);
  } finally {
    importState.inProgress = false;
  }
};

</script>

<style scoped>
.sticky-panel { position: sticky; top: 80px; height: calc(100vh - 100px); overflow-y: auto; padding-right: 16px; }
pre { white-space: pre-wrap; word-wrap: break-word; font-size: 0.8em; padding: 8px; border-radius: 4px; display: block; background-color: rgba(255,255,255,0.05); }
</style>