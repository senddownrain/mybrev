<template>
  <v-container>
    <!-- СЕКЦИЯ 1: ПАНЕЛЬ ДОБАВЛЕНИЯ НОВОГО ГОДА -->
    <v-card class="mb-8">
      <v-card-title class="pa-4">
        <h1 class="text-h5 font-weight-light">Дадаць новы літургічны год</h1>
      </v-card-title>
      <v-form @submit.prevent="saveNewYear">
        <v-card-text>
          <v-row>
            <!-- Поле ввода года -->
            <v-col cols="12" md="3">
              <v-text-field
                v-model.number="newItem.year"
                label="Год для генерацыі"
                type="number"
                variant="outlined"
                @update:model-value="calculateAllDates"
                class="mb-2"
              ></v-text-field>
              <v-btn block color="primary" variant="tonal" @click="calculateAllDates">Разлічыць даты</v-btn>
            </v-col>

            <!-- Поля с датами -->
            <v-col cols="12" md="9">
              <v-row dense>
                <v-col cols="6" sm="4"><v-text-field v-model="newItem.easterSunday" label="Вялікдзень" type="date" density="compact"></v-text-field></v-col>
                <v-col cols="6" sm="4"><v-text-field v-model="newItem.ashWednesday" label="Папялец" type="date" density="compact"></v-text-field></v-col>
                <v-col cols="6" sm="4"><v-text-field v-model="newItem.pentecost" label="Спасланне Духа" type="date" density="compact"></v-text-field></v-col>
                <v-col cols="6" sm="4"><v-text-field v-model="newItem.ascension" label="Унебаўшэсце" type="date" density="compact"></v-text-field></v-col>
                <v-col cols="6" sm="4"><v-text-field v-model="newItem.corpusChristi" label="Божае Цела" type="date" density="compact"></v-text-field></v-col>
                <v-col cols="6" sm="4"><v-text-field v-model="newItem.firstAdventSunday" label="1-я ндз. Адвэнту" type="date" density="compact"></v-text-field></v-col>
                <v-col cols="12"><v-divider class="my-2"></v-divider></v-col>
                <!-- Поля для рядовых периодов -->
                <v-col cols="6" sm="3"><v-text-field v-model="newItem.ordintaryStart1" label="Пачатак 1-га звыч." type="date" density="compact" readonly></v-text-field></v-col>
                <v-col cols="6" sm="3"><v-text-field v-model="newItem.ordintaryWeeks1" label="Тыдняў у 1-м пер." type="number" density="compact" ></v-text-field></v-col>
                <v-col cols="6" sm="3"><v-text-field v-model="newItem.ordintaryStart2" label="Пачатак 2-га звыч." type="date" density="compact" readonly></v-text-field></v-col>
                <v-col cols="6" sm="3"><v-text-field v-model="newItem.ordintaryWeeks2" label="Пачатк. тыдзень 2-га" type="number" density="compact" ></v-text-field></v-col>
              </v-row>
            </v-col>
          </v-row>
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer></v-spacer>
          <v-btn type="submit" size="large" color="primary" :disabled="!isNewItemValid">Дадаць {{ newItem.year }} год у базу</v-btn>
        </v-card-actions>
      </v-form>
    </v-card>

    <!-- СЕКЦИЯ 2: ТАБЛИЦА ИСНУЮЧИХ ГОДОВ -->
    <v-card>
      <v-card-title class="pa-4"><h2 class="text-h5 font-weight-light">Існуючыя гады ў базе</h2></v-card-title>
      <v-data-table :headers="headers" :items="yearOptions" :loading="loading" item-value="id">
        <template v-slot:item.actions="{ item }"><v-btn icon="mdi-delete" variant="text" size="small" color="error" @click="deleteItem(item)"></v-btn></template>
      </v-data-table>
    </v-card>
  </v-container>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import { useCollection } from 'vuefire';
import { collection, doc, addDoc, deleteDoc, getFirestore } from 'firebase/firestore';
import { useNotifier } from '@/composables/useNotifier';
import { logger } from '@/utils/logger';
import { retryFirestore } from '@/utils/retry';

// --- Инициализация ---
const db = getFirestore();
const yearOptionsRef = collection(db, 'yearOptions');
const { data: yearOptions, pending: loading } = useCollection(yearOptionsRef);

// --- Заголовки для таблицы (используем ваши) ---
const headers = [
  { title: 'Год', key: 'year' },
  { title: 'Папялец', key: 'ashWednesday' },
  { title: 'Вялікдзень', key: 'easterSunday' },
  { title: 'Унеба­ў­шэсце', key: 'ascension' },
  { title: 'Спасланне Духа', key: 'pentecost' },
  { title: 'Божае Цела', key: 'corpusChristi' },
  { title: 'Пачатак 1-га звыч.', key: 'ordintaryStart1' },
  { title: 'Тыдняў 1', key: 'ordintaryWeeks1' },
  { title: 'Пачатак 2-га звыч.', key: 'ordintaryStart2' },
  { title: 'Пачатк. тыдзень 2', key: 'ordintaryWeeks2' },
  { title: '1-я ндз. Адвэнту', key: 'firstAdventSunday' },
  { title: 'Дзеянні', key: 'actions', sortable: false },
];

// --- Форма добавления ---
const defaultItem = { year: new Date().getFullYear() + 1, ashWednesday: "", easterSunday: "", ascension: '', pentecost: "", corpusChristi: "", firstAdventSunday: "", ordintaryStart1: "", ordintaryWeeks1: "", ordintaryStart2: '', ordintaryWeeks2: "" };
const newItem = reactive({ ...defaultItem });

const isNewItemValid = computed(() => newItem.year && newItem.easterSunday);

// --- Полный калькулятор ---
const calculateAllDates = () => {
  const y = newItem.year;
  if (!y || y < 1900 || y > 2200) return;
  // --- Вспомогательные функции для работы в UTC ---
  const formatDate = (date) => {
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = date.getUTCDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const addDays = (d, days) => {
    const date = new Date(d);
    date.setUTCDate(date.getUTCDate() + days);
    return date;
  };
  
  // 1. Вычисляем Пасху (католическую) строго в UTC
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easterDate = new Date(Date.UTC(y, month - 1, day));
  
  newItem.easterSunday = formatDate(easterDate);
  
  // 2. Вычисляем все остальные даты относительно Пасхи
  const ashWednesdayDate = addDays(easterDate, -46);
  newItem.ashWednesday = formatDate(ashWednesdayDate);
  newItem.ascension = formatDate(addDays(easterDate, 39));
  newItem.pentecost = formatDate(addDays(easterDate, 49));
  newItem.corpusChristi = formatDate(addDays(easterDate, 60));
  // 3. Вычисляем Адвент
  const christmas = new Date(Date.UTC(y, 11, 25));
  const firstSundayOfAdvent = addDays(christmas, -christmas.getUTCDay() - 21);
  newItem.firstAdventSunday = formatDate(firstSundayOfAdvent);
  // 4. Вычисляем Рядовые периоды
  const epiphany = new Date(Date.UTC(y, 0, 6)); // Богоявление
  let baptismLord = addDays(epiphany, 7 - epiphany.getUTCDay());
  if (baptismLord.getUTCMonth() === 0 && baptismLord.getUTCDate() < 7) {
      baptismLord = addDays(baptismLord, 7); // Если крещение слишком рано, переносим на неделю
  }
  
  const ordinaryStart1Date = addDays(baptismLord, 1); // Начало 1-го периода
  newItem.ordintaryStart1 = formatDate(ordinaryStart1Date);
  const ordinaryEnd1Date = addDays(ashWednesdayDate, -1); // Вторник перед Папяльцом
  
  // Неделя, на которой заканчивается 1-й период.
  // Это номер недели Рядового времени, а не календарной.
  const ordinaryWeeks1 = Math.ceil((ordinaryEnd1Date.getTime() - ordinaryStart1Date.getTime() + (1000 * 60 * 60 * 24)) / (1000 * 60 * 60 * 24 * 7));
  newItem.ordintaryWeeks1 = ordinaryWeeks1;
  // Начало 2-го периода
  const ordinaryStart2Date = addDays(new Date(newItem.pentecost), 1);
  newItem.ordintaryStart2 = formatDate(ordinaryStart2Date);
  
  // Номер недели, с которой возобновляется период
  newItem.ordintaryWeeks2 = ordinaryWeeks1 + 2;
};

// --- CRUD ---
const saveNewYear = async () => {
  // Двойная проверка, хотя кнопка и так должна быть неактивна
  if (!isNewItemValid.value) return;
  try {
    // Создаем новый документ в коллекции 'yearOptions' с данными из формы
    await retryFirestore(() => addDoc(yearOptionsRef, { ...newItem }));
    
    // После успешного добавления:
    success(`Год ${newItem.year} успешно дададзены ў базу.`);
    
    // 1. Сбрасываем форму к значениям по умолчанию
    Object.assign(newItem, defaultItem);
    // 2. Устанавливаем следующий год для удобства
    newItem.year = new Date().getFullYear() + 1;
    // 3. Пересчитываем даты для нового предложенного года
    calculateAllDates();
  } catch (e) {
    logger.error("Памылка дадавання года: ", e);
    notifyError("Не атрымалася дадаць год. Паспрабуйце яшчэ раз.");
  }
};
/**
 * Удаляет выбранный год из Firestore
 */
const { success, error: notifyError } = useNotifier();

const deleteItem = async (item) => {
  // Запрашиваем подтверждение у пользователя
  if (confirm(`Вы сапраўды хочаце выдаліць ${item.year} год? Гэта дзеянне нельга будзе адмяніць.`)) {
    try {
      // Удаляем документ по его ID
      await retryFirestore(() => deleteDoc(doc(db, 'yearOptions', item.id)));
      success(`Год ${item.year} быў паспяхова выдалены.`);
    } catch (e) {
      logger.error("Памылка выдалення года: ", e);
      notifyError("Не атрымалася выдаліць год. Паспрабуйце яшчэ раз.");
    }
  }
};
// --- Первоначальный запуск ---
calculateAllDates();
</script>