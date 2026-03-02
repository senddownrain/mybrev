<template>
  <div>
    <v-app-bar color="primary" app>
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title>{{ isNew ? 'Стварэнне новага дня' : 'Рэдагаванне дня' }}</v-toolbar-title>
      <v-spacer></v-spacer>
      <v-btn 
        v-if="!isNew" 
        @click="createCopy" 
        variant="text" 
        class="mr-2"
        prepend-icon="mdi-content-copy"
      >
        Стварыць копію
      </v-btn>
      <v-btn @click="saveChanges" :loading="saving" variant="text">Захаваць</v-btn>
    </v-app-bar>

    <div v-if="pending || loadingDuplicate" class="d-flex justify-center align-center" style="height: 80vh;">
      <v-progress-circular indeterminate color="primary" size="64"></v-progress-circular>
      <p v-if="loadingDuplicate" class="ml-4">Дубліраванне дня...</p>
    </div>

    <v-container v-else-if="dayData">
      <v-card class="mb-6">
        <v-card-text>
          <v-row>
            <v-col cols="12" md="4">
              <v-select v-model="simpleFields.period" :items="periodOptions" label="Літургічны перыяд" clearable hide-details variant="outlined" density="compact"></v-select>
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field v-model.number="simpleFields.weekNumber" label="Нумар тыдня" type="number" :disabled="!simpleFields.period" hide-details variant="outlined" density="compact"></v-text-field>
            </v-col>
            <v-col cols="12" md="4">
              <v-select v-model="simpleFields.dayOfWeek" :items="dayOfWeekOptions" label="Дзень тыдня" :disabled="!simpleFields.period" hide-details variant="outlined" density="compact"></v-select>
            </v-col>
          </v-row>
          <v-row>
            <v-col cols="12" md="6">
              <v-text-field v-model="dayData._feastName" label="Назва свята (калі ёсць)" hide-details variant="outlined" density="compact"></v-text-field>
            </v-col>
            <v-col cols="12" md="3">
              <v-text-field v-model="dayData._psalmWeek" label="Тыдзень псалтыра" hide-details variant="outlined" density="compact"></v-text-field>
            </v-col>
             <v-col cols="12" md="3">
              <v-checkbox v-model="dayData.allowedAlleluia" label="Дазволена 'Аллелюя'" hide-details density="compact"></v-checkbox>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>
      
      <v-expansion-panels variant="accordion" v-model="panel">
        <v-expansion-panel title="Каментар і Заклік">
          <v-expansion-panel-text class="pa-1">
             <v-row no-gutters>
                <InlineEditor v-model="dayData.feastComment" fieldTitle="Каментар да свята" />
                <InlineEditor v-model="dayData.invitatoriumAnt" fieldTitle="Антыфона да Закліку" />
            </v-row>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <v-expansion-panel title="Гадзіна Чытанняў">
          <v-expansion-panel-text class="pa-1">
            <v-row no-gutters>
                <InlineEditor v-model="dayData.officeOfReadingsHymn" fieldTitle="Гімн (ГЧ)" />
                <InlineEditor v-model="dayData.officeOfReadingsAnt1" fieldTitle="Антыфона 1 (ГЧ)" />
                <InlineEditor v-model="dayData.officeOfReadingsPs1" fieldTitle="Псалом 1 (ГЧ)" />
                <InlineEditor v-model="dayData.officeOfReadingsAnt2" fieldTitle="Антыфона 2 (ГЧ)" />
                <InlineEditor v-model="dayData.officeOfReadingsPs2" fieldTitle="Псалом 2 (ГЧ)" />
                <InlineEditor v-model="dayData.officeOfReadingsAnt3" fieldTitle="Антыфона 3 (ГЧ)" />
                <InlineEditor v-model="dayData.officeOfReadingsPs3" fieldTitle="Псалом 3 (ГЧ)" />
                <InlineEditor v-model="dayData.officeOfReadingsVers" fieldTitle="Верш (ГЧ)" />
                <InlineEditor v-model="dayData.officeOfReadingsR1" fieldTitle="Чытанне 1 (ГЧ)" />
                <InlineEditor v-model="dayData.officeOfReadingsR2" fieldTitle="Чытанне 2 (ГЧ)" />
                <InlineEditor v-model="dayData.officeOfReadingsPr" fieldTitle="Малітва (ГЧ)" />
            </v-row>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <v-expansion-panel title="Ютрань">
          <v-expansion-panel-text class="pa-1">
            <v-row no-gutters>
                <InlineEditor v-model="dayData.laudesHymn" fieldTitle="Гімн (Ютрань)" />
                <InlineEditor v-model="dayData.laudesAnt1" fieldTitle="Антыфона 1 (Ютрань)" />
                <InlineEditor v-model="dayData.laudesPs1" fieldTitle="Псалом 1 (Ютрань)" />
                <InlineEditor v-model="dayData.laudesAnt2" fieldTitle="Антыфона 2 (Ютрань)" />
                <InlineEditor v-model="dayData.laudesPs2" fieldTitle="Псалом 2 (Ютрань)" />
                <InlineEditor v-model="dayData.laudesAnt3" fieldTitle="Антыфона 3 (Ютрань)" />
                <InlineEditor v-model="dayData.laudesPs3" fieldTitle="Псалом 3 (Ютрань)" />
                <InlineEditor v-model="dayData.laudesR" fieldTitle="Кароткае чытанне (Ютрань)" />
                <InlineEditor v-model="dayData.laudesAntBen" fieldTitle="Антыфона да Песні Захарыі" />
                <InlineEditor v-model="dayData.laudesInter" fieldTitle="Просьбы (Ютрань)" />
                <InlineEditor v-model="dayData.laudesPr" fieldTitle="Малітва (Ютрань)" />
            </v-row>
          </v-expansion-panel-text>
        </v-expansion-panel>
        
        <v-expansion-panel title="Дзённыя малітвы">
          <v-expansion-panel-text class="pa-1">
              <v-row no-gutters>
                <v-col cols="12"><v-divider class="my-3"><v-chip size="small">Малітва перад поўднем (Terz)</v-chip></v-divider></v-col>
                <InlineEditor v-model="dayData.sext1Hymn" fieldTitle="Гімн (Terz)" />
                <InlineEditor v-model="dayData.sext1R" fieldTitle="Кароткае чытанне (Terz)" />
                <InlineEditor v-model="dayData.sext1Pr" fieldTitle="Малітва (Terz)" />
                
                <v-col cols="12"><v-divider class="my-3"><v-chip size="small">Малітва апоўдні (Sext)</v-chip></v-divider></v-col>
                <InlineEditor v-model="dayData.sext2Hymn" fieldTitle="Гімн (Sext)" />
                <InlineEditor v-model="dayData.sext2R" fieldTitle="Кароткае чытанне (Sext)" />
                <InlineEditor v-model="dayData.sext2Pr" fieldTitle="Малітва (Sext)" />
              
                <v-col cols="12"><v-divider class="my-3"><v-chip size="small">Малітва пасля поўдня (Non)</v-chip></v-divider></v-col>
                <InlineEditor v-model="dayData.sext3Hymn" fieldTitle="Гімн (Non)" />
                <InlineEditor v-model="dayData.sext3R" fieldTitle="Кароткае чытанне (Non)" />
                <InlineEditor v-model="dayData.sext3Pr" fieldTitle="Малітва (Non)" />

                <v-col cols="12"><v-divider class="my-3"><v-chip size="small">Агульныя псалмы для дзённых малітваў</v-chip></v-divider></v-col>
                <InlineEditor v-model="dayData.sext1Ant1" fieldTitle="Антыфона 1 (агульная)" />
                <InlineEditor v-model="dayData.sext1Ps1" fieldTitle="Псалом 1 (агульны)" />
                <InlineEditor v-model="dayData.sext1Ant2" fieldTitle="Антыфона 2 (агульная)" />
                <InlineEditor v-model="dayData.sext1Ps2" fieldTitle="Псалом 2 (агульны)" />
                <InlineEditor v-model="dayData.sext1Ant3" fieldTitle="Антыфона 3 (агульная)" />
                <InlineEditor v-model="dayData.sext1Ps3" fieldTitle="Псалом 3 (агульны)" />
            </v-row>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <v-expansion-panel title="Нешпары">
          <v-expansion-panel-text class="pa-1">
            <v-row no-gutters>
                <InlineEditor v-model="dayData.vesperHymn" fieldTitle="Гімн (Нешпары)" />
                <InlineEditor v-model="dayData.vesperAnt1" fieldTitle="Антыфона 1 (Нешпары)" />
                <InlineEditor v-model="dayData.vesperPs1" fieldTitle="Псалом 1 (Нешпары)" />
                <InlineEditor v-model="dayData.vesperAnt2" fieldTitle="Антыфона 2 (Нешпары)" />
                <InlineEditor v-model="dayData.vesperPs2" fieldTitle="Псалом 2 (Нешпары)" />
                <InlineEditor v-model="dayData.vesperAnt3" fieldTitle="Антыфона 3 (Нешпары)" />
                <InlineEditor v-model="dayData.vesperPs3" fieldTitle="Псалом 3 (Нешпары)" />
                <InlineEditor v-model="dayData.vesperR" fieldTitle="Кароткае чытанне (Нешпары)" />
                <InlineEditor v-model="dayData.vesperAntMag" fieldTitle="Антыфона да Песні Марыі" />
                <InlineEditor v-model="dayData.vesperInter" fieldTitle="Просьбы (Нешпары)" />
                <InlineEditor v-model="dayData.vesperPr" fieldTitle="Малітва (Нешпары)" />
            </v-row>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <v-expansion-panel title="Камплета">
          <v-expansion-panel-text class="pa-1">
            <v-row no-gutters>
                <InlineEditor v-model="dayData.compHymn" fieldTitle="Гімн (Камплета)" />
                <InlineEditor v-model="dayData.compAnt1" fieldTitle="Антыфона 1 (Камплета)" />
                <InlineEditor v-model="dayData.compPs1" fieldTitle="Псалом 1 (Камплета)" />
                <InlineEditor v-model="dayData.compAnt2" fieldTitle="Антыфона 2 (Камплета)" />
                <InlineEditor v-model="dayData.compPs2" fieldTitle="Псалом 2 (Камплета)" />
                <InlineEditor v-model="dayData.compR" fieldTitle="Кароткае чытанне (Камплета)" />
                <InlineEditor v-model="dayData.compResp" fieldTitle="Рэспансорый (Камплета)" />
                <InlineEditor v-model="dayData.compAntS" fieldTitle="Антыфона да Песні Сімяона" />
                <InlineEditor v-model="dayData.compPr" fieldTitle="Малітва (Камплета)" />
                <InlineEditor v-model="dayData.compAntM" fieldTitle="Антыфона да Найсвяцейшай Панны Марыі" />
            </v-row>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-container>
  </div>
</template>

<script setup>
import { ref, reactive, watch, computed, onMounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDocument, useFirestore } from 'vuefire';
import { doc, setDoc, addDoc, collection, getDoc } from 'firebase/firestore';
import InlineEditor from '@/components/admin/InlineEditor.vue';
import { useNotifier } from '@/composables/useNotifier';
import { logger } from '@/utils/logger';
import { retryFirestore } from '@/utils/retry';
import { PERIOD_LABEL_MAP, WEEKDAY_LABEL_MAP } from '@/constants/liturgical';
import { DAY_EDITOR_FIELDS, DAY_EDITOR_COPY_CLEARED_FIELDS } from '@/constants/days';

const SESSION_KEY_COPY = 'dayEditorCopyData';

const router = useRouter();
const route = useRoute();
const db = useFirestore();
const { success, error: notifyError } = useNotifier();

// Реактивно от маршрута
const dayId = computed(() => route.params.id);
const isNew = computed(() => dayId.value === 'new');
const saving = ref(false);
const panel = ref();
const loadingDuplicate = ref(false);
const isUpdatingFromWatch = ref(false);

const dayData = ref({});
const dayDocRef = computed(() => (isNew.value ? null : doc(db, 'days', dayId.value)));
const { data: loadedDayData, pending, promise } = useDocument(dayDocRef);

const simpleFields = reactive({
  period: null,
  weekNumber: null,
  dayOfWeek: null,
});

const periodOptions = Object.entries(PERIOD_LABEL_MAP).map(([value, title]) => ({ value, title }));
const dayOfWeekOptions = Object.entries(WEEKDAY_LABEL_MAP).map(([value, title]) => ({ value: parseInt(value, 10), title }));

/** Заполняет simpleFields из route.query (_periodType, _periodWeekNumber, _dayOfWeek). */
function applyQueryParamsToSimpleFields() {
  const periodType = route.query._periodType;
  const periodWeekNumber = route.query._periodWeekNumber;
  const dayOfWeek = route.query._dayOfWeek;
  if (!periodType || periodWeekNumber == null || dayOfWeek == null) return;
  isUpdatingFromWatch.value = true;
  simpleFields.period = periodType;
  simpleFields.weekNumber = parseInt(periodWeekNumber, 10);
  simpleFields.dayOfWeek = parseInt(dayOfWeek, 10);
  nextTick(() => { isUpdatingFromWatch.value = false; });
}


function applyQueryParamsToDayData() {
  if (!dayData.value) return;

  if (route.query._date) {
    dayData.value._date = String(route.query._date);
  }

  if (route.query._feast) {
    dayData.value._feast = String(route.query._feast);
  }
}

/** Инициализация для нового дня: копия из sessionStorage или пустой день + query. */
function initializeNewDay() {
  const copyDataStr = sessionStorage.getItem(SESSION_KEY_COPY);
  if (copyDataStr) {
    try {
      const copyData = JSON.parse(copyDataStr);
      dayData.value = copyData;
      sessionStorage.removeItem(SESSION_KEY_COPY);
      isUpdatingFromWatch.value = true;
      simpleFields.period = null;
      simpleFields.weekNumber = null;
      simpleFields.dayOfWeek = null;
      nextTick(() => { isUpdatingFromWatch.value = false; });
      success('Копія дня створана. Запоўніце перыяд, тыдзень і дзень тыдня, затым захавайце.');
    } catch (e) {
      logger.error('Памылка пры загрузцы копіі:', e);
      createEmptyDay();
    }
  } else {
    createEmptyDay();
  }

  applyQueryParamsToSimpleFields();
  applyQueryParamsToDayData();
}

/** Синхронизирует simpleFields из загруженного dayData (режим редактирования). */
function syncSimpleFieldsFromDayData() {
  if (!dayData.value) return;
  isUpdatingFromWatch.value = true;
  simpleFields.period = dayData.value._periodType ?? null;
  simpleFields.weekNumber = dayData.value._periodWeekNumber ?? null;
  simpleFields.dayOfWeek = dayData.value._dayOfWeek ?? null;
  nextTick(() => { isUpdatingFromWatch.value = false; });
}

function createEmptyDay() {
  dayData.value = DAY_EDITOR_FIELDS.reduce((obj, key) => ({ ...obj, [key]: '' }), {});
  dayData.value.allowedAlleluia = true;
}

// Синхронизируем загруженные данные с dayData
watch(loadedDayData, (newData) => {
  if (newData) dayData.value = newData;
}, { immediate: true });

// При переходе на "new" (напр. по кнопке «Стварыць копію») onMounted не вызывается — инициализируем здесь
watch(dayId, (newId) => {
  if (newId === 'new') {
    loadingDuplicate.value = false;
    initializeNewDay();
  }
}, { immediate: false });

onMounted(async () => {
  if (isNew.value) {
    const duplicateFromId = route.query.duplicateFrom;
    if (duplicateFromId) {
      loadingDuplicate.value = true;
      try {
        const sourceDocSnap = await getDoc(doc(db, 'days', duplicateFromId));
        if (sourceDocSnap.exists()) {
          const sourceData = sourceDocSnap.data();
          dayData.value = { ...sourceData };
          if (dayData.value._dayOfWeek < 7) {
            dayData.value._dayOfWeek++;
          } else {
            dayData.value._dayOfWeek = 1;
            dayData.value._periodWeekNumber++;
          }
        }
        applyQueryParamsToSimpleFields();
      applyQueryParamsToDayData();
      } finally {
        loadingDuplicate.value = false;
      }
    } else {
      initializeNewDay();
    }
  } else {
    await promise.value;
    syncSimpleFieldsFromDayData();
  }
});

// Следим за простыми полями и синхронизируем в dayData
watch(simpleFields, (newVal) => {
  if (!dayData.value || isUpdatingFromWatch.value) return;
  
  isUpdatingFromWatch.value = true;

  try {
  // Обновляем технические поля
  dayData.value._periodType = newVal.period || '';
  dayData.value._periodWeekNumber = newVal.weekNumber || null;
  dayData.value._dayOfWeek = newVal.dayOfWeek || null;
  
  // Обновляем дублирующиеся и текстовые поля для совместимости
  dayData.value._weekNum = newVal.weekNumber || '';
  const dayNameObj = dayOfWeekOptions.find(d => d.value === newVal.dayOfWeek);
  dayData.value._weekDay = dayNameObj ? dayNameObj.title : '';

  const periodNameObj = periodOptions.find(p => p.value === newVal.period);
  if (periodNameObj && newVal.weekNumber && dayNameObj) {
      dayData.value._dayName = `${periodNameObj.title}, ${newVal.weekNumber} тыдзень`;
  } else {
      dayData.value._dayName = '';
  }
  } finally {
    // Используем nextTick чтобы избежать циклических обновлений
    nextTick(() => {
      isUpdatingFromWatch.value = false;
    });
  }
}, { deep: true });

// Логика сохранения
const saveChanges = async () => {
    saving.value = true;
    try {
        // Убедимся, что boolean-значения сохраняются корректно
        const dataToSave = { ...dayData.value, allowedAlleluia: !!dayData.value.allowedAlleluia };

        if (isNew.value) {
            const docRef = await retryFirestore(
                () => addDoc(collection(db, 'days'), dataToSave)
            );
            success('Дзень паспяхова створаны!');
            router.replace({ name: 'AdminDayEditor', params: { id: docRef.id } });
        } else {
            await retryFirestore(
                () => setDoc(doc(db, 'days', dayId.value), dataToSave, { merge: true })
            );
            success('Змены паспяхова захаваны!');
        }
    } catch (e) {
        logger.error("Памылка захавання:", e);
        notifyError("Адбылася памылка пры захаванні. Паспрабуйце яшчэ раз.");
    } finally {
        saving.value = false;
    }
};

const goBack = () => router.go(-1);

// Создание копии дня (переход на new с данными в sessionStorage)
const createCopy = () => {
  if (!dayData.value) return;
  const copyData = { ...dayData.value };
  delete copyData.id;
  DAY_EDITOR_COPY_CLEARED_FIELDS.forEach((key) => {
    copyData[key] = key === '_periodWeekNumber' ? null : '';
  });
  sessionStorage.setItem(SESSION_KEY_COPY, JSON.stringify(copyData));
  router.push({ name: 'AdminDayEditor', params: { id: 'new' } });
};
</script>