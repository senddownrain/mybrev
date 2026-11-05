<template>
  <button type="button" class="document-back" @click="goBack">
    <PhArrowLeft :size="19" aria-hidden="true" />Назад
  </button>
</template>
<script setup>
import { PhArrowLeft } from '@phosphor-icons/vue';
import { useRouter } from 'vue-router';
const router = useRouter();
function goBack() {
  const previous = router.options.history.state.back;
  if (typeof previous === 'string' && previous.startsWith('/') && !previous.startsWith('//')) router.back();
  else router.push({ name: 'Sources' });
}
</script>
<style scoped>
.document-back { display: inline-flex; align-items: center; gap: 7px; min-height: 44px; color: var(--chrome-accent); font: inherit; }
.document-back:focus-visible { outline: 2px solid var(--chrome-accent); outline-offset: 3px; }
</style>
