<template>
  <v-card variant="outlined">
    <v-card-item>
      <v-card-title>{{ cardTitle }}</v-card-title>
    </v-card-item>
    
    <div v-if="items && items.length > 0">
      <!-- Для каждого элемента в списке будет свой цветной разделитель -->
      <div v-for="item in items" :key="item.id">
        <v-divider :color="getColor(item)" thickness="2" class="border-opacity-75"></v-divider>
        <v-list-item class="py-3" :to="getLink(item.id)">
          <!-- ✅ Заголовок генерируется вашей функцией getTitle -->
          <v-list-item-title class="text-wrap font-weight-bold mb-2">{{ getTitle(item) }}</v-list-item-title>
          
          <!-- ✅ Отображаем все нужные поля -->
          <v-list-item-subtitle class="text-wrap">
            <div class="d-flex flex-wrap ga-3">
              <span v-if="item.id"><strong>ID:</strong> {{ item.id }}</span>
              <span v-if="item._feastName"><strong>_feastName:</strong> {{ item._feastName }}</span>
              <span v-if="item._feastType"><strong>_feastType:</strong> {{ item._feastType }}</span>
              <span v-if="item._periodType"><strong>_periodType:</strong> {{ item._periodType }}</span>
              <span v-if="item._periodWeekNumber"><strong>_periodWeekNumber:</strong> {{ item._periodWeekNumber }}</span>
              <span v-if="item._dayOfWeek"><strong>_dayOfWeek:</strong> {{ item._dayOfWeek }}</span>
              <span v-if="item._psalmWeek"><strong>_psalmWeek:</strong> {{ item._psalmWeek }}</span>
              <span v-if="item._date"><strong>_date:</strong> {{ item._date }}</span>
              <span v-if="item._feast"><strong>_feast:</strong> {{ item._feast }}</span>
            </div>
          </v-list-item-subtitle>

          <template v-slot:append>
            <v-btn icon="mdi-arrow-right" variant="text" :to="getLink(item.id)"></v-btn>
          </template>
        </v-list-item>
      </div>
    </div>
    
    <div v-else>
      <v-divider></v-divider>
      <div class="pa-4 text-grey">
        <v-icon>mdi-information-outline</v-icon>
        <span class="ml-2">{{ emptyText }}</span>
      </div>
    </div>
  </v-card>
</template>

<script setup>
import moment from '@/utils/moment-be';

const props = defineProps({
  items: Array,
  currentDate: Date,
  emptyText: String,
  cardTitle: String, // Переименовал для ясности
});

// ✅ ВАША ЛОГИКА ГЕНЕРАЦИИ ЗАГОЛОВКА - ТЕПЕРЬ ЗДЕСЬ
const getTitle = (day) => {
  if (day.title) return day.title;
  if (day._feastName) return `Свята: ${day._feastName}`;
  
  const periodMap = {
    ordinary: 'Звычайны перыяд',
    advent: 'Адвэнт',
    lent: 'Вялікі Пост',
    easter: 'Велікодны перыяд',
    christmas: 'Перыяд Божага Нараджэння',
    holyweek: 'Вялікі тыдзень',
  };
  const periodName = periodMap[day._periodType] || 'Перыяд';
  
  const dayOfWeekMap = { 1: 'нядзеля', 2: 'панядзелак', 3: 'аўторак', 4: 'серада', 5: 'чацвер', 6: 'пятніца', 7: 'субота' };
  // Используем isoWeekday(), который соответствует формату moment: Пн=1, Вс=7
  const dayName = dayOfWeekMap[day._dayOfWeek] || '';

  return `${periodName}, ${day._periodWeekNumber} тыдзень, ${dayName}`;
};

// ✅ ЛОГИКА ЦВЕТА - ТЕПЕРЬ ЗДЕСЬ И РАБОТАЕТ
const getColor = (item) => {
  const period = item._periodType;
  const colors = { 
    advent: 'purple', 
    lent: 'purple', 
    holyweek: 'purple-darken-2', 
    easter: 'amber', 
    christmas: 'amber', 
    ordinary: 'green' 
  };
  return colors[period] || 'grey-darken-1';
};

const getLink = (id) => {
  const dateStr = moment(props.currentDate).format('YYYY-MM-DD');
  return `/day/${dateStr}/ora/${id}`;
};
</script>

<style scoped>
.ga-3 {
  gap: 12px;
}
</style>