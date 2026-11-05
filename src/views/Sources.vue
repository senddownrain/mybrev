<template>
  <v-container class="sources-page">
    <main>
      <router-link :to="{ name: 'About' }" class="sources-back">
        <PhArrowLeft :size="19" aria-hidden="true" />
        Пра праграму
      </router-link>
      <h1>Крыніцы і аўтарскія правы</h1>
      <SourceRights />
    </main>
  </v-container>
</template>

<script setup>
import { PhArrowLeft } from '@phosphor-icons/vue';
import SourceRights from '@/components/SourceRights.vue';
</script>

<style scoped>
.sources-page.v-container { width: min(100%, 720px); padding: 12px 20px 36px !important; color: var(--nav-on-surface); }
.sources-page h1 { margin: 10px 0 22px; font-size: clamp(1.4rem, 5vw, 1.8rem); font-weight: 650; line-height: 1.25; }
.sources-back { display: inline-flex; align-items: center; gap: 7px; min-height: 44px; color: var(--chrome-accent); text-decoration: none; }
.sources-back:hover { text-decoration: underline; text-underline-offset: 3px; }
.sources-back:focus-visible { outline: 2px solid var(--chrome-accent); outline-offset: 3px; border-radius: 4px; }
</style>
