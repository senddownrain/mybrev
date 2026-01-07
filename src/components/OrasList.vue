<template>
  <v-container>
    <div v-if="dayData" class="mb-5">
      <h1 class="text-h4 font-weight-light text-center mb-1">
        {{ dayData._feastName || getPeriodTitle(dayData) }}
      </h1>
      <p
        v-if="dayData._feastType || dayData._psalmWeek"
        class="text-subtitle-1 text-grey text-center"
      >
        {{ dayData._feastType ? `Ранг: ${getRankName(dayData._feastType)}` : `Псалтыр: ${dayData._psalmWeek} тыдз.` }}
      </p>
    </div>

    <div v-if="loadingOra" class="text-center mt-16">
      <v-progress-circular indeterminate color="primary" size="64"></v-progress-circular>
    </div>

    <!-- Если есть чтения — показываем особый элемент "Чытанні" перед списком гадзін -->
    <v-list v-else-if="dayData" lines="three" bg-color="transparent">
     <!-- Блок "Чытанні" -->
  <template v-if="readingItem">
    <v-list-item
      :to="readingItem.path"
      class="mb-4 reading-card"
      rounded="lg"
      border
    >
      <template #prepend>
        <v-avatar color="deep-purple-lighten-4" size="40">
          <v-icon color="deep-purple-darken-3">mdi-book-open-variant</v-icon>
        </v-avatar>
      </template>
      <v-list-item-title class="reading-title">
        Чытанні
      </v-list-item-title>
      <template #append>
        <v-icon icon="mdi-chevron-right" size="large" class="ml-1"></v-icon>
      </template>
    </v-list-item>
    <v-divider class="mb-2"></v-divider>
  </template>


      <div v-for="(ora, index) in oras" :key="ora.name">
        <v-list-item :to="ora.path">
          <template v-slot:prepend>
            <v-icon :icon="ora.icon" size="large"></v-icon>
          </template>
          <v-list-item-title class="text-h6 font-weight-regular mb-1">
            {{ ora.title }}
          </v-list-item-title>
          <template v-slot:append>
            <v-icon icon="mdi-chevron-right" size="large"></v-icon>
          </template>
        </v-list-item>
        <v-divider v-if="index < oras.length - 1"></v-divider>
      </div>
    </v-list>

    <v-alert v-else type="error" prominent border="start">
      Не атрымалася загрузіць дадзеныя для гэтага дня. Магчыма, дакумент быў выдалены.
    </v-alert>
  </v-container>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useDocument } from 'vuefire';
import { doc } from 'firebase/firestore';
import moment from '@/utils/moment-be';

import { db } from '@/plugins/firebase';
import { useLiturgicalContent } from '@/composables/useLiturgicalContent';
import { logger } from '@/utils/logger';

const route = useRoute();
const { getLiturgicalContentForDate } = useLiturgicalContent();

const { day: dateParam, id: dayId } = route.params;

const dayDocRef = doc(db, 'days', dayId);
const { data: dayData, pending: loadingDay } = useDocument(dayDocRef);

const readings = ref([]);
const loadingReadings = ref(true);

const loadingOra = computed(() => loadingDay.value || loadingReadings.value);

const oras = ref([
  {
    name: 'invitatorium',
    title: 'Заклік (Invitatorium)',
    subtitle: 'Уступная малітва, якая папярэднічае першай малітоўнай гадзіне дня.',
    icon: 'mdi-weather-sunset-up',
    path: `/day/${dateParam}/ora/${dayId}/invitatorium`,
    tag: 'Уступ',
    tagColor: 'blue-grey',
  },
  {
    name: 'laudes',
    title: 'Ютрань (Laudes)',
    subtitle: 'Ранішняя хвала, якая асвячае пачатак дня.',
    icon: 'mdi-weather-sunny',
    path: `/day/${dateParam}/ora/${dayId}/laudes`,
    tag: 'Галоўная',
    tagColor: 'amber-darken-3',
  },
  {
    name: 'lectionis',
    title: 'Гадзіна Чытанняў',
    subtitle: 'Разважанне над Святым Пісаннем і творамі Айцоў Касцёла.',
    icon: 'mdi-book-open-page-variant',
    path: `/day/${dateParam}/ora/${dayId}/lectionis`,
    tag: 'Разважанне',
    tagColor: 'brown',
  },
  {
    name: 'terz',
    title: 'Трэцяя гадзіна',
    subtitle: 'Кароткая малітва сярод раніцы.',
    icon: 'mdi-clock-time-nine-outline',
    path: `/day/${dateParam}/ora/${dayId}/terz`,
    tag: 'Малая',
    tagColor: 'teal',
  },
  {
    name: 'sext',
    title: 'Шостая гадзіна',
    subtitle: 'Кароткая малітва апоўдні.',
    icon: 'mdi-clock-time-twelve-outline',
    path: `/day/${dateParam}/ora/${dayId}/sext`,
    tag: 'Малая',
    tagColor: 'teal',
  },
  {
    name: 'non',
    title: 'Дзевятая гадзіна',
    subtitle: 'Кароткая малітва пасля поўдня.',
    icon: 'mdi-clock-time-three-outline',
    path: `/day/${dateParam}/ora/${dayId}/non`,
    tag: 'Малая',
    tagColor: 'teal',
  },
  {
    name: 'vesper',
    title: 'Нешпары (Vesper)',
    subtitle: 'Вячэрняя хвала, падзяка за пражыты дзень.',
    icon: 'mdi-weather-night',
    path: `/day/${dateParam}/ora/${dayId}/vesper`,
    tag: 'Галоўная',
    tagColor: 'indigo-darken-3',
  },
  {
    name: 'completorium',
    title: 'Камплета (Completorium)',
    subtitle: 'Малітва перад сном, рахунак сумлення.',
    icon: 'mdi-bed-clock',
    path: `/day/${dateParam}/ora/${dayId}/completorium`,
    tag: 'Завяршэнне',
    tagColor: 'deep-purple',
  },
]);

// первый найденный reading (если есть)
const readingItem = computed(() => {
  if (!readings.value || readings.value.length === 0) return null;

  // Можно выбрать первый, либо по какому-то приоритету
  const reading = readings.value[0];

  // ссылка на маршрут чтений
  return {
    id: reading.id,
    title: reading.title || 'Чытанні',
    path: `/day/${dateParam}/ora/${dayId}/reading/${reading.id}`,
  };
});

const getRankName = (rank) => {
  const rankMap = {
    solemnity: 'Урачыстасць',
    feast: 'Свята',
    memorial: 'Успамін',
  };
  return rankMap[rank] || rank;
};

const getPeriodTitle = (day) => {
  if (!day || !day._periodType) return 'Літургія Гадзінаў';

  const periodMap = {
    ordinary: 'Звычайны перыяд',
    advent: 'Адвэнт',
    lent: 'Вялікі Пост',
    easter: 'Велікодны перыяд',
    christmas: 'Перыяд Нараджэння Пана',
    holyweek: 'Вялікі тыдзень',
  };

  const periodName = periodMap[day._periodType] || 'Перыяд';

  const dayOfWeekMap = {
    1: 'Нядзеля',
    2: 'Панядзелак',
    3: 'Аўторак',
    4: 'Серада',
    5: 'Чацвер',
    6: 'Пятніца',
    7: 'Субота',
  };

  const dayName = dayOfWeekMap[day._dayOfWeek] || '';

  return `${periodName}, ${day._periodWeekNumber} тыдзень, ${dayName}`;
};

const loadReadings = async () => {
  try {
    loadingReadings.value = true;
    readings.value = [];
    const mDate = moment(dateParam, 'YYYY-MM-DD').startOf('day');
    const result = await getLiturgicalContentForDate(mDate.toDate());
    readings.value = Array.isArray(result.itemsReadings)
      ? result.itemsReadings
      : [];
  } catch (e) {
    logger.error('[OrasList] Памылка пры загрузцы чытанняў:', e);
    readings.value = [];
  } finally {
    loadingReadings.value = false;
  }
};

watch(
  () => route.params.day,
  () => {
    if (dateParam) {
      loadReadings();
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.reading-card {
  background-color: rgba(103, 58, 183, 0.04); /* лёгкі фіялетавы фон */
  transition: background-color 0.2s ease, box-shadow 0.2s ease;
}

.reading-card:hover {
  background-color: rgba(103, 58, 183, 0.08);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

.reading-title {
  font-weight: 500;
  font-size: 1.05rem;
}

.reading-subtitle {
  font-size: 0.9rem;
  opacity: 0.8;
}

/* на маленьких экранах чуть компактнее */
@media (max-width: 600px) {
  .reading-title {
    font-size: 1rem;
  }
  .reading-subtitle {
    font-size: 0.85rem;
  }
}
</style>