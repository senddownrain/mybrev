<template>
  <v-container fluid>
    <v-row>
      <!-- Левая колонка -->
      <v-col cols="12" md="6" lg="5">
        <div class="sticky-panel">
          <h1 class="text-h5 font-weight-light mb-4">Выберыце дату</h1>
          <v-date-picker v-model="selectedDate" @update:model-value="runTest" color="primary" show-adjacent-months hide-header></v-date-picker>

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
        <h1 class="text-h4 font-weight-light mb-4">Вынікі дыягностыкі</h1>
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
import { ref, computed } from 'vue';
import moment from 'moment';
import { useLiturgicalDay } from '@/composables/useLiturgicalDay';
import ResultCard from '@/components/admin/ResultCard.vue';

const { runLiturgicalDiagnostics, getLiturgicalOptionsForDate } = useLiturgicalDay();
const selectedDate = ref(new Date());
const loading = ref(false);
const results = ref(null);
const liturgicalContext = ref({});

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
</script>

<style scoped>
.sticky-panel { position: sticky; top: 80px; height: calc(100vh - 100px); overflow-y: auto; padding-right: 16px; }
pre { white-space: pre-wrap; word-wrap: break-word; font-size: 0.8em; padding: 8px; border-radius: 4px; display: block; background-color: rgba(255,255,255,0.05); }
</style>