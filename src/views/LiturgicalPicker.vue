<template>
  <v-container>
    <h1 class="text-h5 font-weight-light mb-4">Літургічны каляндар на год {{ selectedYear }}</h1>

    <!-- Блок выбора года -->
    <div class="d-flex align-center mb-4">
      <div class="text-h6 mr-2">Год {{ selectedYear }}</div>
      <v-btn
        icon="mdi-pencil"
        size="small"
        variant="text"
        @click="isYearEditing = !isYearEditing"
        :color="isYearEditing ? 'primary' : 'default'"
      >
        <v-icon size="small">mdi-pencil</v-icon>
      </v-btn>
    </div>

    <!-- Дропдаун выбора года (показывается только в режиме редактирования) -->
    <v-select
      v-if="isYearEditing"
      v-model="selectedYear"
      :items="availableYears"
      label="Выберите год"
      variant="outlined"
      density="compact"
      class="mb-4"
      hide-details
      @update:model-value="isYearEditing = false"
    ></v-select>

    <!-- Вкладки -->
    <v-tabs v-model="activeTab" class="mb-4">
      <v-tab value="period">Перыяд</v-tab>
      <v-tab value="feasts">Святы</v-tab>
    </v-tabs>

    <!-- Вкладка Период -->
    <v-window v-model="activeTab">
      <v-window-item value="period">
        <PeriodPicker
          :year="selectedYear"
          @day-selected="handleDaySelected"
        />
      </v-window-item>

      <!-- Вкладка Святы -->
      <v-window-item value="feasts">
        <FeastsPicker
          :year="selectedYear"
          @feast-selected="handleFeastSelected"
        />
      </v-window-item>
    </v-window>
  </v-container>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useCalendarStore } from '@/stores/calendar';
import PeriodPicker from '@/components/liturgical/PeriodPicker.vue';
import FeastsPicker from '@/components/liturgical/FeastsPicker.vue';
import moment from '@/utils/moment-be';


const router = useRouter();
const calendarStore = useCalendarStore();

const selectedYear = ref(new Date().getFullYear());
const activeTab = ref('period');
const isYearEditing = ref(false);

// Вычисляем текущий литургический год
const currentLiturgicalYear = computed(() => {
  const now = moment();
  const year = now.year();
  // Литургический год начинается с первого воскресенья Адвента
  // Упрощенно: если мы после сентября, то литургический год уже начался
  if (now.month() >= 8) { // Сентябрь = 8
    return year + 1;
  }
  return year;
});

// Получаем доступные годы из Firestore
const availableYears = ref([]);

onMounted(async () => {
  selectedYear.value = currentLiturgicalYear.value;
  // Загружаем доступные годы из Firestore
  const years = await calendarStore.getAvailableYears();
  if (years.length > 0) {
    availableYears.value = years;
    // Если текущий литургический год не в списке, добавляем его
    if (!years.includes(currentLiturgicalYear.value)) {
      availableYears.value.unshift(currentLiturgicalYear.value);
    }
  } else {
    // Fallback: если нет годов в базе, используем диапазон
    const currentYear = new Date().getFullYear();
    availableYears.value = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  }
});

function handleDaySelected({ dayId, date }) {
  if (dayId && date) {
    router.push(`/day/${date}/ora/${dayId}`);
  }
}

function handleFeastSelected({ dayId, date }) {
  if (dayId && date) {
    router.push(`/day/${date}/ora/${dayId}`);
  }
}
</script>

