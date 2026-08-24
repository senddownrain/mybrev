<template>
  <v-app-bar flat color="transparent" class="floating-ora-bar">
    <v-app-bar-nav-icon class="ora-circle-btn" aria-label="Назад" @click="goBack">
      <PhArrowLeft :size="21" />
    </v-app-bar-nav-icon>

    <v-app-bar-title class="ora-bar-title">{{ topBarTitle }}</v-app-bar-title>

    <v-btn icon variant="flat" class="ora-circle-btn ora-action-start" aria-label="Налады тэксту" @click="toggleSettingsSheet">
      <PhTextAa :size="21" />
    </v-btn>

    <v-btn
      v-if="auth && auth.isAdmin"
      icon
      variant="flat"
      class="ora-circle-btn"
      :class="{ 'ora-circle-btn--confirm': isEditingReading }"
      :aria-label="isEditingReading ? 'Захаваць' : 'Рэдагаваць'"
      @click="onEditClick"
    >
      <PhCheck v-if="isEditingReading" :size="21" />
      <PhPencilSimple v-else :size="21" />
    </v-btn>
  </v-app-bar>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAppBar } from '@/composables/useAppBar';
import { useAuthStore } from '@/stores/auth.js';
import { useUiStore } from '@/stores/ui';
import { PhArrowLeft, PhCheck, PhPencilSimple, PhTextAa } from '@phosphor-icons/vue';

const router = useRouter();
const route = useRoute();
const { toggleSettingsSheet } = useAppBar();
const auth = useAuthStore();
const uiStore = useUiStore();

const isEditingReading = computed(() => route.name === 'ReadingEditor');

const isOnReadingRoute = computed(() => {
  const name = route.name;
  return name === 'reading' || name === 'ReadingEditor';
});

const topBarTitle = computed(() => {
  const titles = {
    oras: 'Літургія дня',
    reading: 'Чытанні',
    ReadingEditor: 'Рэдагаванне чытання',
    invitatorium: 'Заклік',
    morning: 'Агульная гадзіна',
    laudes: 'Ютрань',
    lectionis: 'Гадзіна чытанняў',
    terz: 'Трэцяя гадзіна',
    sext: 'Шостая гадзіна',
    non: 'Дзевятая гадзіна',
    vesper: 'Нешпары',
    completorium: 'Камплета',
  };

  return titles[route.name] || 'Літургія';
});

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
    if (currentName === 'reading') {
      router.push({
        name: 'ReadingEditor',
        params: { day, id, readingId },
      });
      return;
    }

    // если уже в ReadingEditor и флаг true — это клик по галочке: шлём сигнал "сохранить"
    if (currentName === 'ReadingEditor') {
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

<style scoped>
.floating-ora-bar {
  background: transparent !important;
  box-shadow: none !important;
}

.floating-ora-bar :deep(.v-toolbar__content) {
  gap: 8px;
  padding: 8px 12px;
}

.floating-ora-bar :deep(.v-toolbar__prepend),
.floating-ora-bar :deep(.v-toolbar__append) {
  margin-inline: 0;
}

.floating-ora-bar :deep(.v-toolbar__append) {
  gap: 8px;
}

.ora-circle-btn {
  width: 48px !important;
  height: 48px !important;
  min-width: 48px !important;
  flex: 0 0 48px !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 50% !important;
  background: #1f1f1f !important;
  color: rgba(255, 255, 255, 0.9) !important;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2) !important;
  transition: transform 0.16s ease, opacity 0.16s ease !important;
}

.ora-circle-btn:active {
  opacity: 0.72;
  transform: scale(0.94);
}

.ora-circle-btn--confirm {
  background: rgb(var(--v-theme-primary)) !important;
  color: rgb(var(--v-theme-on-primary)) !important;
}

.ora-action-start {
  margin-left: auto !important;
}

.ora-bar-title {
  position: absolute;
  left: 50%;
  width: auto;
  max-width: calc(100% - 176px);
  margin-inline-start: 0 !important;
  overflow: hidden;
  font-size: 1rem;
  font-weight: 650;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  transform: translateX(-50%);
  pointer-events: none;
}

@media (max-width: 359px) {
  .floating-ora-bar :deep(.v-toolbar__content) {
    gap: 6px;
    padding-inline: 10px;
  }

  .ora-circle-btn {
    width: 44px !important;
    height: 44px !important;
    min-width: 44px !important;
    flex-basis: 44px !important;
  }

  .ora-bar-title {
    max-width: calc(100% - 176px);
    font-size: 0.92rem;
  }
}
</style>
