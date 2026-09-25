<template>
  <form class="prayer-search-dock" role="search" @submit.prevent="onSubmit">
    <PhMagnifyingGlass :size="23" class="prayer-search-icon" aria-hidden="true" />
    <input
      v-model="store.searchQuery"
      type="search"
      class="prayer-search-input"
      placeholder="Пошук: слова або нумар"
      aria-label="Пошук у Кампендыі"
      autocomplete="off"
      enterkeyhint="search"
      @keydown.esc="store.searchQuery = ''"
    />
    <button v-if="store.searchQuery" type="button" class="search-dock-action" aria-label="Ачысціць пошук" @click="store.searchQuery = ''"><PhX :size="19" /></button>
  </form>
</template>
<script setup>
import { PhMagnifyingGlass, PhX } from '@phosphor-icons/vue';
import { useRouter } from 'vue-router';
import { useCompendiumStore } from '@/stores/compendium';
const store = useCompendiumStore();
const router = useRouter();
// Enter on an exact question number jumps straight to it.
function onSubmit() {
  const [first] = store.searchResults;
  if (first?.field === 'number') router.push({ name: 'CompendiumQuestion', params: { number: first.question.number } });
}
</script>
<style scoped src="@/styles/prayers-list.css"></style>
