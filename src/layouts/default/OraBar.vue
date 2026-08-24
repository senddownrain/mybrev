<template>
  <v-app-bar flat color="transparent" class="floating-ora-bar">
    <v-app-bar-nav-icon class="ora-circle-btn" aria-label="Назад" @click="goBack">
      <PhArrowLeft :size="21" />
    </v-app-bar-nav-icon>

    <v-app-bar-title
      class="ora-bar-title"
      :class="{ 'ora-bar-title--visible': isAppBarTitleVisible }"
    >
      {{ topBarTitle }}
    </v-app-bar-title>

    <TextScaleControl
      v-if="showTextScaleControl"
      class="ora-action-start"
    />

    <v-btn
      v-if="auth && auth.isAdmin"
      icon
      variant="flat"
      class="ora-circle-btn"
      :class="{
        'ora-circle-btn--confirm': isEditingReading,
        'ora-action-start': !showTextScaleControl,
      }"
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
import { useAuthStore } from '@/stores/auth.js';
import { useUiStore } from '@/stores/ui';
import { useCollapsingAppBar } from '@/composables/useCollapsingAppBar.js';
import { PhArrowLeft, PhCheck, PhPencilSimple } from '@phosphor-icons/vue';
import TextScaleControl from '@/components/TextScaleControl.vue';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const uiStore = useUiStore();
const { isAppBarTitleVisible } = useCollapsingAppBar();

const isEditingReading = computed(() => route.name === 'ReadingEditor');
const showTextScaleControl = computed(() => route.name !== 'oras' && route.name !== 'ReadingEditor');

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
    terz: 'Малітва перад поўднем',
    sext: 'Малітва апоўдні',
    non: 'Малітва пасля поўдня',
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
  border: 1px solid var(--nav-border) !important;
  border-radius: 50% !important;
  background: var(--nav-surface) !important;
  color: var(--nav-on-surface) !important;
  box-shadow: 0 2px 9px var(--nav-button-shadow) !important;
  transition: transform 0.16s ease, opacity 0.16s ease !important;
}

.ora-circle-btn:active {
  opacity: 0.72;
  transform: scale(0.94);
}

.ora-circle-btn--confirm {
  background: var(--nav-active) !important;
  color: var(--nav-on-surface) !important;
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
  opacity: 0;
  transform: translate(-50%, -6px);
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.ora-bar-title--visible {
  opacity: 1;
  transform: translate(-50%, 0);
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
