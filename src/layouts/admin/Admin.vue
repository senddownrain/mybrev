<template>
  <v-app 
    :style="{ 
      '--reader-font-family': settings.fontFamily,
      '--font-size-multiplier': settings.fontSizeMultiplier 
    }"
  >
    <v-app-bar v-if="!hideLayoutAppBar" flat class="admin-app-bar">
      <v-app-bar-nav-icon class="admin-nav-button" aria-label="Назад" @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-app-bar-nav-icon>

      <v-app-bar-title class="admin-title" @click="goToAdminHome">
        Панэль адміністратара
      </v-app-bar-title>

      <v-btn class="admin-home-button text-none" aria-label="Да малітоўніка" variant="text" rounded="pill" :to="{ name: 'Today' }">
        <span class="admin-home-label">Да малітоўніка</span>
        <v-icon class="admin-home-icon" icon="mdi-book-open-page-variant" />
      </v-btn>
    </v-app-bar>

    <v-main>
      <router-view />
      <TextSettingsSheet />
      <NotificationSnackbar />
    </v-main>
  </v-app>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import TextSettingsSheet from '@/components/TextSettingsSheet.vue';
import NotificationSnackbar from '@/components/NotificationSnackbar.vue';
import { useSettingsStore } from '@/stores/settings.js';

const settings = useSettingsStore();
const route = useRoute();
const router = useRouter();

const hideLayoutAppBar = computed(() => route.matched.some((record) => record.meta?.hideLayoutAppBar));

const goBack = () => {
  if (window.history.length > 1) {
    router.go(-1);
  } else {
    router.push('/');
  }
};

const goToAdminHome = () => {
  router.push('/admin');
};
</script>

<style scoped>
.admin-app-bar {
  border-bottom: 1px solid var(--nav-border);
  background: color-mix(in srgb, var(--nav-surface) 90%, transparent) !important;
  color: var(--nav-on-surface) !important;
  backdrop-filter: blur(18px);
}

.admin-app-bar :deep(.v-toolbar__content) {
  gap: 8px;
  padding-inline: max(12px, calc((100vw - 1180px) / 2));
}

.admin-nav-button {
  border: 1px solid var(--nav-border);
  background: var(--nav-surface);
}

.admin-title {
  min-width: 0;
  margin-inline-start: 0 !important;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 720;
}

.admin-home-button {
  color: var(--nav-muted);
  font-weight: 650;
}
.admin-home-icon { display: none; }

@media (max-width: 480px) {
  .admin-app-bar :deep(.v-toolbar__content) { gap: 4px; padding-inline: 8px; }
  .admin-nav-button { margin-inline: 0 !important; flex-shrink: 0; }
  .admin-title { font-size: .87rem; }
  .admin-home-button {
    padding-inline: 6px !important;
    min-width: 36px !important;
    flex-shrink: 0;
  }

  .admin-home-label { display: none; }
  .admin-home-icon { display: inline-flex; font-size: 1.25rem; }
}
</style>
