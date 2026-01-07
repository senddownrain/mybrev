<template>
  <div>
    <!-- Подсказка -->
    <p class="text-body-2 text-grey mb-4">
      Знайдзіце свята па назве, даце або тыпе.
    </p>

    <!-- Поисковая строка -->
    <v-text-field
      v-model="searchQuery"
      label="Пошук свята"
      prepend-inner-icon="mdi-magnify"
      variant="outlined"
      density="compact"
      hide-details
      class="mb-4"
      :disabled="loading"
    ></v-text-field>


    <!-- Список святых -->
    <div v-if="loading" class="text-center pa-8">
      <v-progress-circular indeterminate color="primary"></v-progress-circular>
    </div>

    <v-list v-else-if="filteredFeasts.length > 0" lines="two">
      <v-list-item
        v-for="feast in filteredFeasts"
        :key="feast.id"
        @click="selectFeast(feast)"
        class="mb-2"
        border
        rounded
      >
        <template v-slot:prepend>
          <v-avatar
            :color="feast.isDynamic ? 'purple' : 'grey'"
            size="24"
            class="mr-2"
          >
            <v-icon
              :icon="feast.isDynamic ? 'mdi-calendar-clock' : 'mdi-calendar'"
              size="16"
              color="white"
            ></v-icon>
          </v-avatar>
        </template>

        <v-list-item-title>
          <span v-html="feast._feastName || feast._dayName || 'Свята'"></span>
        </v-list-item-title>

        <v-list-item-subtitle>
          <div v-if="feast.isFixed && feast._date">
            {{ formatFixedDate(feast._date) }} — Нерухомае
            <span v-if="feast._feastType">, {{ getRankName(feast._feastType) }}</span>
          </div>
          <div v-else-if="feast.isDynamic">
            <span v-if="getFeastDate(feast)">
              Дата ў {{ year }} годзе: {{ getFeastDate(feast) }} — Рухомае
            </span>
            <span v-else>Рухомае</span>
            <span v-if="feast._feastType">, {{ getRankName(feast._feastType) }}</span>
          </div>
          <div v-else>
            <span v-if="feast._feastType">{{ getRankName(feast._feastType) }}</span>
          </div>
        </v-list-item-subtitle>
      </v-list-item>
    </v-list>

    <div v-else class="text-center pa-8 text-grey">
      <v-icon size="48">mdi-book-remove-outline</v-icon>
      <p class="mt-2">Святы не знойдзены</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useLiturgicalDay } from '@/composables/useLiturgicalDay';
import { useCalendarStore } from '@/stores/calendar';
import { logger } from '@/utils/logger';
import moment from '@/utils/moment-be';

const props = defineProps({
  year: {
    type: Number,
    required: true
  }
});

const emit = defineEmits(['feast-selected']);

const { getAllFeasts, feastNameMap } = useLiturgicalDay();
const calendarStore = useCalendarStore();

const searchQuery = ref('');
const allFeasts = ref([]);
const loading = ref(false);

// Загружаем все праздники при монтировании
onMounted(async () => {
  await loadFeasts();
});

watch(() => props.year, async () => {
  await loadFeasts();
});

async function loadFeasts() {
  loading.value = true;
  try {
    allFeasts.value = await getAllFeasts(props.year);
  } catch (error) {
    logger.error('Памылка пры загрузцы святаў:', error);
  } finally {
    loading.value = false;
  }
}

const filteredFeasts = computed(() => {
  if (!allFeasts.value || !Array.isArray(allFeasts.value)) return [];
  let filtered = [...allFeasts.value];

  // Поиск (работает даже во время загрузки)
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim();
    filtered = filtered.filter(feast => {
      // Убираем HTML теги для поиска
      const nameHtml = feast._feastName || '';
      const name = nameHtml.replace(/<[^>]*>/g, '').toLowerCase();
      const dayName = (feast._dayName || '').toLowerCase();
      const date = feast._date || '';

      return name.includes(query) ||
             dayName.includes(query) ||
             date.includes(query);
    });
  }

  // Сортируем по дате или имени
  filtered.sort((a, b) => {
    const dateA = getFeastDate(a);
    const dateB = getFeastDate(b);

    if (dateA && dateB) {
      return moment(dateA, 'DD.MM.YYYY').valueOf() - moment(dateB, 'DD.MM.YYYY').valueOf();
    }

    const nameA = (a._feastName || '').toLowerCase();
    const nameB = (b._feastName || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return filtered;
});

function getFeastDate(feast) {
  if (feast.isFixed && feast._date) {
    // Для нерухомых - добавляем год
    const [day, month] = feast._date.split('.');
    return `${day}.${month}.${props.year}`;
  }
  
  if (feast.isDynamic) {
    // Для рухомых - получаем из dynamicDates
    const dynamicDates = calendarStore.dynamicDatesForYear(props.year).value || {};
    for (const [key, date] of Object.entries(dynamicDates)) {
      if (feastNameMap[key] === feast._feast) {
        return date.format('DD.MM.YYYY');
      }
    }
  }
  
  return null;
}

function formatFixedDate(dateStr) {
  // Форматируем дату из формата D.M или DD.MM в DD.MM
  const parts = dateStr.split('.');
  if (parts.length === 2) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    return `${day}.${month}`;
  }
  return dateStr;
}

function getRankName(rank) {
  const rankMap = {
    solemnity: 'Урачыстасць',
    feast: 'Свята',
    memorial: 'Успамін'
  };
  return rankMap[rank] || rank;
}

function selectFeast(feast) {
  const date = getFeastDate(feast);
  if (!date) {
    // Если дата неизвестна, используем текущую дату
    const dateStr = moment().format('YYYY-MM-DD');
    emit('feast-selected', {
      dayId: feast.id,
      date: dateStr
    });
  } else {
    // Преобразуем DD.MM.YYYY в YYYY-MM-DD
    const dateStr = moment(date, 'DD.MM.YYYY').format('YYYY-MM-DD');
    emit('feast-selected', {
      dayId: feast.id,
      date: dateStr
    });
  }
}
</script>

<style scoped>
/* Исправление обрезки текста в списке святых */
:deep(.v-list-item-title),
:deep(.v-list-item-subtitle) {
  white-space: normal !important;
  word-wrap: break-word !important;
  overflow-wrap: break-word !important;
  word-break: break-word !important;
  text-overflow: unset !important;
  overflow: visible !important;
  max-width: 100% !important;
  line-height: 1.4 !important;
}
</style>

