<template>
  <v-container>
    <div v-if="dayData" class="mb-5">
      <h1 class="text-h4 font-weight-light text-center mb-1">
        {{ dayData._feastName || getPeriodTitle(dayData) }}
      </h1>
      <p v-if="dayData._feastType || dayData._psalmWeek" class="text-subtitle-1 text-grey text-center">
        {{ dayData._feastType ? `Ранг: ${getRankName(dayData._feastType)}` : `Псалтыр: ${dayData._psalmWeek} тыдз.` }}
      </p>
    </div>

    <div v-if="loading" class="text-center mt-16">
      <v-progress-circular indeterminate color="primary" size="64"></v-progress-circular>
    </div>

    <v-list v-else-if="dayData" lines="three" bg-color="transparent">
      <div v-for="(ora, index) in oras" :key="ora.name">
        <v-list-item
          :to="ora.path"
          class="py-3"
        >
          <template v-slot:prepend>
            <v-icon :icon="ora.icon" size="large" class="mr-5"></v-icon>
          </template>

          <v-list-item-title class="text-h6 font-weight-regular mb-1">
            {{ ora.title }}
          </v-list-item-title>

          <v-list-item-subtitle>
            {{ ora.subtitle }}
          </v-list-item-subtitle>

          <template v-slot:append>
            <v-chip
              :color="ora.tagColor"
              size="small"
              variant="tonal"
              class="ml-4"
            >
              {{ ora.tag }}
            </v-chip>
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
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { useDocument } from 'vuefire';
import { doc, getFirestore } from 'firebase/firestore';

const route = useRoute();
const db = getFirestore();

const { day: dateParam, id: dayId } = route.params;

const dayDocRef = doc(db, 'days', dayId);
const { data: dayData, pending: loading } = useDocument(dayDocRef);

const oras = ref([
  {
    name: 'invitatorium',
    title: 'Заклік (Invitatorium)',
    subtitle: 'Уступная малітва, якая папярэднічае першай малітоўнай гадзіне дня.',
    icon: 'mdi-weather-sunset-up',
    path: `/day/${dateParam}/ora/${dayId}/invitatorium`,
    tag: 'Уступ',
    tagColor: 'blue-grey'
  },
  {
    name: 'laudes',
    title: 'Ютрань (Laudes)',
    subtitle: 'Ранішняя хвала, якая асвячае пачатак дня.',
    icon: 'mdi-weather-sunny',
    path: `/day/${dateParam}/ora/${dayId}/laudes`,
    tag: 'Галоўная',
    tagColor: 'amber-darken-3'
  },
    {
    name: 'lectionis',
    title: 'Гадзіна Чытанняў',
    subtitle: 'Разважанне над Святым Пісаннем і творамі Айцоў Касцёла.',
    icon: 'mdi-book-open-page-variant',
    path: `/day/${dateParam}/ora/${dayId}/lectionis`,
    tag: 'Разважанне',
    tagColor: 'brown'
  },
  {
    name: 'terz',
    title: 'Трэцяя гадзіна',
    subtitle: 'Кароткая малітва сярод раніцы.',
    icon: 'mdi-clock-time-nine-outline',
    path: `/day/${dateParam}/ora/${dayId}/terz`,
    tag: 'Малая',
    tagColor: 'teal'
  },
  {
    name: 'sext',
    title: 'Шостая гадзіна',
    subtitle: 'Кароткая малітва апоўдні.',
    icon: 'mdi-clock-time-twelve-outline',
    path: `/day/${dateParam}/ora/${dayId}/sext`,
    tag: 'Малая',
    tagColor: 'teal'
  },
  {
    name: 'non',
    title: 'Дзевятая гадзіна',
    subtitle: 'Кароткая малітва пасля поўдня.',
    icon: 'mdi-clock-time-three-outline',
    path: `/day/${dateParam}/ora/${dayId}/non`,
    tag: 'Малая',
    tagColor: 'teal'
  },
  {
    name: 'vesper',
    title: 'Нешпары (Vesper)',
    subtitle: 'Вячэрняя хвала, падзяка за пражыты дзень.',
    icon: 'mdi-weather-night',
    path: `/day/${dateParam}/ora/${dayId}/vesper`,
    tag: 'Галоўная',
    tagColor: 'indigo-darken-3'
  },
  {
    name: 'completorium',
    title: 'Камплета (Completorium)',
    subtitle: 'Малітва перад сном, рахунак сумлення.',
    icon: 'mdi-bed-clock',
    path: `/day/${dateParam}/ora/${dayId}/completorium`,
    tag: 'Завяршэнне',
    tagColor: 'deep-purple'
  }
]);

const getRankName = (rank) => {
  const rankMap = {
    solemnity: 'Урачыстасць',
    feast: 'Свята',
    memorial: 'Успамін'
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
    holyweek: 'Вялікі тыдзень'
  };
  const periodName = periodMap[day._periodType] || 'Перыяд';
  const dayOfWeekMap = { '1': 'Нядзеля', '2': 'Панядзелак', '3': 'Аўторак', '4': 'Серада', '5': 'Чацвер', '6': 'Пятніца', '7': 'Субота' };
  const dayName = dayOfWeekMap[day._dayOfWeek] || '';

  return `${periodName}, ${day._periodWeekNumber} тыдзень, ${dayName}`;
};
</script>

<style scoped>
.v-list-item {
  transition: background-color 0.2s ease-in-out;
}
.v-list-item:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.04);
}
</style>