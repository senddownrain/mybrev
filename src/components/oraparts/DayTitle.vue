<template>
  <!-- Используем наш глобальный класс для автоматического применения стилей -->
  <div class="prayer-content-area text-center mb-6 day-title-container">
    
    <!-- Индикатор загрузки -->
    <v-skeleton-loader v-if="loading" type="heading, subtitle"></v-skeleton-loader>

    <!-- Основной контент, когда данные загружены -->
    <div v-else-if="dayData" class="day-title-content">
      <!-- 1. Полная дата -->
               <div class="text-subtitle-1 text-grey-darken-1" v-html="formattedDate"></div>
        
      
      <!-- 2. Название праздника или дня периода -->
      <h1 class="text-h4 font-weight-light mt-1">
        {{ dayData._feastName || getPeriodTitle(dayData) }}
      </h1>
      
      <!-- 3. Ранг праздника или псалтырь -->
      <p v-if="dayData._feastType || dayData._psalmWeek" class="text-subtitle-1 mt-1">
        {{ dayData._feastType ? `${getRankName(dayData._feastType)}` : `${dayData._psalmWeek}` }}
      </p>

<div v-if="dayData.feastComment" lass="text-subtitle-1 mt-1" v-html="dayData.feastComment"></div>
     
    </div>

    <!-- Сообщение, если данные не загрузились -->
    <div v-else class="text-grey">
      Немагчыма вызначыць назву дня
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useDocument } from 'vuefire';
import { doc, getFirestore } from 'firebase/firestore';
import moment from '@/utils/moment-be';
import { db } from '@/plugins/firebase';
import { PERIOD_LABEL_MAP, WEEKDAY_LABEL_MAP, FEAST_TYPE_LABEL_MAP } from '@/constants/liturgical';
const route = useRoute();
//const db = getFirestore();

// --- Загрузка данных дня ---
// Получаем ID дня из URL
const dayId = route.params.id; 
// Загружаем документ
const dayDocRef = doc(db, 'days', dayId);
const { data: dayData, pending: loading } = useDocument(dayDocRef);

// --- Форматирование даты ---
// Берем полную дату из параметра URL (:day) и форматируем ее
const formattedDate = computed(() => {
  if (!route.params.day) return '';
  // Используем массив форматов для надежности, как мы делали раньше
  const mDate = moment(route.params.day, ['YYYY-MM-DD', 'DD-MM-YYYY']);
  if (!mDate.isValid()) return '';
  // Форматируем в красивый вид, например, "18 верасня 2025 г."
  const dateStr = mDate.format('D MMM YYYY г.');
  return dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
});

// Перевод ранга на белорусский
const getRankName = (rank) => FEAST_TYPE_LABEL_MAP[rank] || rank;

// Формирование заголовка для дня периода
const getPeriodTitle = (day) => {
  if (!day || !day._periodType) return 'Літургія Гадзінаў';

  const periodName = PERIOD_LABEL_MAP[day._periodType] || 'Перыяд';
  const dayName = WEEKDAY_LABEL_MAP[day._dayOfWeek] || '';

  return `${periodName}, ${day._periodWeekNumber} тыдзень, ${dayName}`;
};
</script>

<style scoped>
/* Запрещаем выделение текста и появление каретки в заголовке дня */
.day-title-container {
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.day-title-content {
  pointer-events: none;
}

.day-title-content * {
  pointer-events: none;
}

/* Масштабирование текста заголовка дня */
.day-title-container,
.day-title-container * {
  font-family: var(--app-font-family, sans-serif) !important;
}

.day-title-container h1,
.day-title-container .text-h4 {
  font-size: calc(2rem * var(--font-size-multiplier, 1)) !important;
  line-height: 1.3 !important;
}

.day-title-container .text-subtitle-1 {
  font-size: calc(0.875rem * var(--font-size-multiplier, 1)) !important;
}

.day-title-content div,
.day-title-content p {
  font-size: calc(0.875rem * var(--font-size-multiplier, 1)) !important;
}

@media (max-width: 600px) {
  .day-title-container {
    padding: 0 8px;
    margin-bottom: 16px;
  }

  .day-title-container h1,
  .day-title-container .text-h4 {
    font-size: calc(1.3rem * var(--font-size-multiplier, 1)) !important;
    line-height: 1.3 !important;
  }

  .day-title-container .text-subtitle-1 {
    font-size: calc(0.85rem * var(--font-size-multiplier, 1)) !important;
  }
}
</style>