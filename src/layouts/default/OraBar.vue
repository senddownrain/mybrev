<template>
  <v-app-bar flat>
    <v-app-bar-nav-icon @click="goBack">
      <v-icon>mdi-arrow-left</v-icon>
    </v-app-bar-nav-icon>

    <v-app-bar-title></v-app-bar-title>

    <v-spacer></v-spacer>

    <v-btn icon @click="toggleSettingsSheet">
      <v-icon>mdi-format-font</v-icon>
    </v-btn>

    <v-btn v-if="auth && auth.isAdmin" icon @click="onEditClick">
      <v-icon>
        <!-- если мы на форме редактирования чтения – показываем галочку -->
        {{ isEditingReading ? 'mdi-check' : 'mdi-pencil-outline' }}
      </v-icon>
    </v-btn>
  </v-app-bar>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAppBar } from '@/composables/useAppBar';
import { useAuthStore } from '@/stores/auth.js';
import { useUiStore } from '@/stores/ui';

const router = useRouter();
const route = useRoute();
const { toggleSettingsSheet } = useAppBar();
const auth = useAuthStore();
const uiStore = useUiStore();

const isEditingReading = ref(false);

const isOnReadingRoute = computed(() => {
  const name = route.name;
  return name === 'reading' || name === 'ReadingEditor';
});

// следим за сменой маршрута и сбрасываем флаг, если мы не на форме редактирования чтения
watch(
  () => route.name,
  (name) => {
    if (name !== 'ReadingEditor') {
      isEditingReading.value = false;
    }
  },
  { immediate: true },
);

const goBack = () => {
  if (window.history.length > 1) {
    router.go(-1);
  } else {
    router.push('/');
  }
};

const onEditClick = () => {
  const currentName = route.name;

  // режим работы с чтением
  if (isOnReadingRoute.value) {
    const { day, id, readingId } = route.params;
    if (!day || !id || !readingId) return;

    // если сейчас просмотр чтения или ещё не вошли в режим редактирования —
    // идём в форму
    if (currentName === 'reading' || !isEditingReading.value) {
      router.push({
        name: 'ReadingEditor',
        params: { day, id, readingId },
      });
      isEditingReading.value = true;
      return;
    }

    // если уже в ReadingEditor и флаг true — это клик по галочке: шлём сигнал "сохранить"
    if (currentName === 'ReadingEditor' && isEditingReading.value) {
      uiStore.triggerReadingSave();
      // флаг сбросится, когда роут вернётся с ReadingEditor на reading (watch выше)
      return;
    }
  }

  // не чтение — редактируем сам "day" как раньше
  const dayId = route.params.id;
  if (dayId) {
    router.push({ name: 'AdminDayEditor', params: { id: dayId } });
  }
};
</script>