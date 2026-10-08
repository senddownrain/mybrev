<template>
  <v-app 
    :style="{ 
      '--reader-font-family': settings.fontFamily,
      '--font-size-multiplier': settings.fontSizeMultiplier 
    }"
  >
    <v-main :class="{ 'has-bottom-nav': hasBottomNav }">
      <router-view v-if="!hideLayoutTopNav" name="topNav" />
      <router-view />
      <NextHourLink />
      <BackToTop v-if="isHour" />

      <router-view name="bottomNav" />

      <TextSettingsSheet />
      
      <NotificationSnackbar />
    </v-main>
  </v-app>
</template>

<script setup>
  import { computed } from 'vue';
  import { useRoute } from 'vue-router';
  import TextSettingsSheet from '@/components/TextSettingsSheet.vue';
  import NotificationSnackbar from '@/components/NotificationSnackbar.vue';
  import BackToTop from '@/components/BackToTop.vue';
  import { providePsalmody } from '@/composables/usePsalmody';
  import { provideLiturgicalHours } from '@/composables/useLiturgicalHours';
  import NextHourLink from '@/components/liturgical/NextHourLink.vue';
  import { useSettingsStore } from '@/stores/settings.js';
  
  const settings = useSettingsStore();
  const route = useRoute();
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
</style>
