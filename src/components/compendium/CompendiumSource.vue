<template>
  <footer class="prayer-source compendium-source">
    <span class="prayer-source__label">Крыніца:</span>
    <span class="prayer-source__content">
      <a :href="COMPENDIUM_SOURCE_URL" target="_blank" rel="noopener noreferrer">{{ COMPENDIUM_FULL_TITLE }}, {{ COMPENDIUM_SOURCE_HOST }}</a><template v-if="copyright.length">. {{ copyright.join('. ') }}</template>
    </span>
  </footer>
</template>
<script setup>
import { computed } from 'vue';
import { useCompendiumStore } from '@/stores/compendium';
import { COMPENDIUM_FULL_TITLE, COMPENDIUM_SOURCE_HOST, COMPENDIUM_SOURCE_URL } from '@/constants/compendium';
const store = useCompendiumStore();
const copyright = computed(() => store.meta?.copyright || []);
</script>
<style scoped src="@/styles/prayer-reading.css"></style>
