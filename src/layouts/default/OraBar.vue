<template>
  <v-app-bar flat color="transparent" class="floating-ora-bar">
    <v-app-bar-nav-icon class="ora-circle-btn" aria-label="Назад" @click="goBack">
      <PhArrowLeft :size="21" />
    </v-app-bar-nav-icon>

    <TextScaleControl
      v-if="showTextScaleControl"
      class="ora-action-start"
    />

    <v-btn
      v-if="auth && auth.isAdmin"
      icon
      variant="flat"
      class="ora-circle-btn"
      :class="{ 'ora-action-start': !showTextScaleControl }"
      aria-label="Рэдагаваць"
      @click="onEditClick"
    >
      <PhPencilSimple :size="21" />
    </v-btn>
  </v-app-bar>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import { PhArrowLeft, PhPencilSimple } from '@phosphor-icons/vue';
import TextScaleControl from '@/components/TextScaleControl.vue';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const showTextScaleControl = computed(() => route.name !== 'oras');

const goBack = () => {
  if (window.history.length > 1) {
    router.go(-1);
  } else {
    router.push('/');
  }
};

const onEditClick = () => {
  const dayId = route.params.id;
  if (dayId) {
    router.push({
      name: 'AdminDayEditor',
      params: { id: dayId },
      query: route.params.day ? { date: route.params.day } : {},
    });
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
  background: var(--overlay-surface) !important;
  color: var(--nav-on-surface) !important;
  box-shadow: 0 2px 9px var(--nav-button-shadow) !important;
  transition: transform 0.16s ease, opacity 0.16s ease !important;
  backdrop-filter: blur(18px);
}

.ora-circle-btn:active {
  opacity: 0.72;
  transform: scale(0.94);
}

.ora-circle-btn--confirm {
  background: rgba(var(--chrome-accent-rgb), 0.13) !important;
  color: var(--chrome-accent) !important;
}

.ora-action-start {
  margin-left: auto !important;
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

}
</style>
