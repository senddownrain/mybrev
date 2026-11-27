<template>
  <v-app 
    :style="{ 
      '--reader-font-family': settings.fontFamily,
      '--font-size-multiplier': settings.fontSizeMultiplier 
    }"
  >
    <v-main :class="{ 'has-bottom-nav': hasBottomNav }">
      <router-view v-if="!hideLayoutTopNav" name="topNav" />
      <v-alert v-if="loadError" class="ma-4" type="warning" variant="tonal" role="alert">
        <p>{{ loadError.message }}</p>
        <v-btn variant="text" @click="loadError.retry">Паўтарыць</v-btn>
      </v-alert>
      <router-view />
      <NextHourLink />
      <FeedbackPrompt class="ora-feedback" />
      <BackToTop v-if="isHour" />

      <router-view name="bottomNav" />

      
      <NotificationSnackbar />
    </v-main>
  </v-app>
</template>

<script setup>
  import { computed, provide, shallowRef } from 'vue';
  import { useRoute } from 'vue-router';
  import NotificationSnackbar from '@/components/NotificationSnackbar.vue';
  import BackToTop from '@/components/BackToTop.vue';
  import { providePsalmody } from '@/composables/usePsalmody';
  import { provideLiturgicalHours } from '@/composables/useLiturgicalHours';
  import { hourLoadError } from '@/composables/useResolvedLiturgicalDay';
  import NextHourLink from '@/components/liturgical/NextHourLink.vue';
  import FeedbackPrompt from '@/components/common/FeedbackPrompt.vue';
  import { useSettingsStore } from '@/stores/settings.js';
  
  const settings = useSettingsStore();
  const route = useRoute();
  const loadError = shallowRef(null);
  provide(hourLoadError, loadError);
  providePsalmody(route);
  provideLiturgicalHours();
  const isHour = computed(() => route.name !== 'oras');
  const hideLayoutTopNav = computed(() => route.matched.some((record) => record.meta?.hideLayoutTopNav));
  const hasBottomNav = computed(() => route.matched.some((record) => record.meta?.hasBottomNav));
</script>

<style scoped>
.has-bottom-nav {
  padding-bottom: 92px;
}

/* After the next-hour action, the quiet feedback divider ends the reading flow.
   Keep clear of the floating back-to-top control and the system safe area. */
:deep(.ora-feedback) {
  margin-top: 18px;
  margin-bottom: calc(88px + env(safe-area-inset-bottom, 0px));
}
</style>
