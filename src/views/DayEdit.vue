<template>
  <div>
    <!-- Используем стандартный AppBar для навигации -->
    <v-app-bar color="primary">
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title>Рэдагаванне дня</v-toolbar-title>
      <v-spacer></v-spacer>
      <v-btn variant="text" @click="saveChanges">Захаваць</v-btn>
    </v-app-bar>

    <v-container>
      <!-- Здесь будет сам компонент редактирования -->
      <!-- Пока что просто выводим ID для проверки -->
      <v-card v-if="dayId" class="mt-4">
        <v-card-title>Дзень ID: {{ dayId }}</v-card-title>
        <v-card-text>
          <p>Тут будзе форма для рэдагавання ўсіх палёў гэтага дня.</p>
          <p class="mt-4">Напрыклад, мы загрузім дадзеныя з Firestore для гэтага ID і размесцім іх у палях уводу.</p>
        </v-card-text>
      </v-card>
      <v-alert v-else type="error">ID дня не пазначаны.</v-alert>
    </v-container>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';

// Принимаем 'id' из URL как prop благодаря `props: true` в роутере
const props = defineProps({
  id: {
    type: String,
    required: true,
  },
});

const router = useRouter();
const dayId = ref(props.id); // Сохраняем ID в ref

const goBack = () => {
  router.go(-1); // Простая функция "назад"
};

const saveChanges = () => {
  // В будущем здесь будет логика сохранения данных в Firestore
  // This is old unused file - functionality moved to DayEditor.vue
};

onMounted(() => {
  // Removed console.log
  // Здесь можно будет запустить функцию загрузки данных дня из Firestore
});
</script>