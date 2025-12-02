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

const router = useRouter();
const route = useRoute();
const db = useFirestore();
const { success, error: notifyError } = useNotifier();

const dayId = ref(route.params.id);
const isNew = computed(() => dayId.value === 'new');
const saving = ref(false);
const panel = ref();
const loadingDuplicate = ref(false); 

// Для нового дня создаем пустой объект сразу, для существующего - загружаем из Firestore
const dayData = ref({});
const { data: loadedDayData, pending, promise } = useDocument(isNew.value ? null : doc(db, 'days', dayId.value));

// Синхронизируем загруженные данные с dayData
watch(loadedDayData, (newData) => {
  if (newData) {
    dayData.value = newData;
  }
}, { immediate: true });

const simpleFields = reactive({
  period: null,
  weekNumber: null,
  dayOfWeek: null,
});

const periodOptions = [
  { value: 'ordinary', title: 'Звычайны перыяд' },
  { value: 'advent', title: 'Адвэнт' },
  { value: 'christmas', title: 'Перыяд Божага Нараджэння' },
  { value: 'lent', title: 'Вялікі Пост' },
  { value: 'holyweek', title: 'Вялікі тыдзень' },
  { value: 'easter', title: 'Велікодны перыяд' },
];
const dayOfWeekOptions = [
  { value: 1, title: 'Нядзеля' }, { value: 2, title: 'Панядзелак' }, { value: 3, title: 'Аўторак' },
  { value: 4, title: 'Серада' }, { value: 5, title: 'Чацвер' }, { value: 6, title: 'Пятніца' }, { value: 7, title: 'Субота' },
];

const initializeForm = () => {
    if (isNew.value) {
        // Проверяем, есть ли данные копии в sessionStorage
        const copyDataStr = sessionStorage.getItem('dayEditorCopyData');
        
        if (copyDataStr) {
            // Загружаем данные копии
            try {
                const copyData = JSON.parse(copyDataStr);
                dayData.value = copyData;
                
                // Очищаем sessionStorage после использования
                sessionStorage.removeItem('dayEditorCopyData');
                
                // Инициализируем простые поля (они будут пустыми, т.к. мы их очистили при копировании)
                isUpdatingFromWatch.value = true;
                simpleFields.period = null;
                simpleFields.weekNumber = null;
                simpleFields.dayOfWeek = null;
                nextTick(() => {
                  isUpdatingFromWatch.value = false;
                });
                
                success('Копія дня створана. Запоўніце перыяд, тыдзень і дзень тыдня, затым захавайце.');
            } catch (e) {
                logger.error('Памылка пры загрузцы копіі:', e);
                // Если ошибка - создаем пустой день
                createEmptyDay();
            }
        } else {
            // Создаем пустой день
            createEmptyDay();
        }
    } else if (dayData.value) {
        isUpdatingFromWatch.value = true;
        simpleFields.period = dayData.value._periodType;
        simpleFields.weekNumber = dayData.value._periodWeekNumber;
        simpleFields.dayOfWeek = dayData.value._dayOfWeek;
        nextTick(() => {
          isUpdatingFromWatch.value = false;
        });
    }
};

// Функция создания пустого дня
const createEmptyDay = () => {
    const allFields = ["_dayOfWeek", "_periodType", "_periodWeekNumber", "_date", "_feast", "_psalmWeek", "_dayName", "_weekDay", "_weekNum", "_feastName", "_feastType", "allowedAlleluia", "invitatoriumAnt", "invitatoriumPs1", "invitatoriumPs2", "invitatoriumPs3", "invitatoriumPs4", "invitatoriumPs5", "invitatoriumPs6", "feastComment", "officeOfReadingsHymn", "officeOfReadingsAnt1", "officeOfReadingsAnt2", "officeOfReadingsAnt3", "officeOfReadingsPs1", "officeOfReadingsPs2", "officeOfReadingsPs3", "officeOfReadingsVers", "officeOfReadingsR1", "officeOfReadingsR2", "officeOfReadingsTeDeum", "officeOfReadingsPr", "laudesHymn", "laudesAnt1", "laudesAnt2", "laudesAnt3", "laudesPs1", "laudesPs2", "laudesPs3", "laudesR", "laudesAntBen", "laudesInter", "laudesPr", "sext1Hymn", "sext1Ant1", "sext1Ant2", "sext1Ant3", "sext1Ps1", "sext1Ps2", "sext1Ps3", "sext1R", "sext1Pr", "sext2Hymn", "sext2Ant1", "sext2Ant2", "sext2Ant3", "sext2Ps1", "sext2Ps2", "sext2Ps3", "sext2R", "sext2Pr", "sext3Hymn", "sext3Ant1", "sext3Ant2", "sext3Ant3", "sext3Ps1", "sext3Ps2", "sext3Ps3", "sext3R", "sext3Pr", "vesperHymn", "vesperAnt1", "vesperAnt2", "vesperAnt3", "vesperPs1", "vesperPs2", "vesperPs3", "vesperR", "vesperAntMag", "vesperInter", "vesperPr", "compHymn", "compAnt1", "compAnt2", "compPs1", "compPs2", "compR", "compResp", "compAntS", "compPr", "compAntM"];
    dayData.value = allFields.reduce((obj, key) => ({ ...obj, [key]: '' }), {});
    dayData.value.allowedAlleluia = true;
};

onMounted(async () => {
  if (isNew.value) {
    // Для нового дня инициализируем пустой объект сразу
    createEmptyDay();
    
    // Проверяем query params для автозаполнения из PeriodPicker
    const periodType = route.query._periodType;
    const periodWeekNumber = route.query._periodWeekNumber;
    const dayOfWeek = route.query._dayOfWeek;
    
    // Если есть query params - заполняем простые поля
    if (periodType && periodWeekNumber && dayOfWeek) {
      isUpdatingFromWatch.value = true;
      simpleFields.period = periodType;
      simpleFields.weekNumber = parseInt(periodWeekNumber);
      simpleFields.dayOfWeek = parseInt(dayOfWeek);
      nextTick(() => {
        isUpdatingFromWatch.value = false;
      });
    }
    
   const duplicateFromId = route.query.duplicateFrom;
  if (duplicateFromId) {
    // ✅ ЛОГИКА ДУБЛИРОВАНИЯ
    loadingDuplicate.value = true;
    const sourceDocRef = doc(db, 'days', duplicateFromId);
    const sourceDocSnap = await getDoc(sourceDocRef);
    if (sourceDocSnap.exists()) {
      const sourceData = sourceDocSnap.data();
      // Заполняем dayData данными из оригинала, но без ID
      dayData.value = { ...sourceData };
      // Можно добавить "умное" автозаполнение, например, следующий день
      if (dayData.value._dayOfWeek < 7) {
        dayData.value._dayOfWeek++;
      } else {
        dayData.value._dayOfWeek = 1;
        dayData.value._periodWeekNumber++;
      }
    }
    loadingDuplicate.value = false;
  }
  
    // Инициализируем форму после всех проверок
    initializeForm();
  } else {
    // Для существующего дня ждем загрузки
    await promise.value;
    initializeForm();
  }
});

// Флаг для предотвращения циклических обновлений
const isUpdatingFromWatch = ref(false);

// Главная "магия": следим за изменениями в простых полях
// и автоматически обновляем "скрытые" поля в dayData
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

// Функция создания копии дня
const createCopy = () => {
    if (!dayData.value) return;
    
    // Создаем копию данных, очищая ID и поля периода
    const copyData = { ...dayData.value };
    
    // Удаляем ID (чтобы создать новый документ)
    delete copyData.id;
    
    // Очищаем поля периода/недели/дня, чтобы пользователь мог их изменить
    copyData._periodType = '';
    copyData._periodWeekNumber = null;
    copyData._dayOfWeek = null;
    copyData._date = '';
    copyData._dayName = '';
    copyData._weekDay = '';
    copyData._weekNum = '';
    
    // Сохраняем данные копии в sessionStorage
    sessionStorage.setItem('dayEditorCopyData', JSON.stringify(copyData));
    
    // Переходим на страницу создания нового дня
    router.push({ name: 'AdminDayEditor', params: { id: 'new' } });
};
</script>