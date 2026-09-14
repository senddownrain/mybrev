<template>
  <v-container class="prayers-list-container songs-list-container" :class="{ 'songs-list-container--compact': settings.songCompactList }">
    <header class="prayers-page-header"><div class="prayers-page-eyebrow">Пілігрымкавы</div><h1 class="prayers-page-title">Спеўнік</h1></header>
    <v-alert v-if="store.error" type="warning" variant="tonal" class="mb-4">
      Не атрымалася загрузіць змены. Даступная захаваная падборка.
      <v-btn variant="text" :loading="store.isLoading" @click="store.init({ fresh: true })">Паўтарыць</v-btn>
    </v-alert>
    <div v-if="tags.length" class="songs-toolbar"><v-chip v-for="tag in tags" :key="tag" closable @click:close="tags = tags.filter((item) => item !== tag)">{{ tag }}</v-chip></div>
    <p class="text-caption mb-3" aria-live="polite">Спеваў: {{ filtered.length }}</p>
    <v-list lines="one" bg-color="transparent" class="prayer-options-list">
      <v-list-item v-for="song in filtered" :key="song.id" :to="{ name: 'SongView', params: { id: song.id } }" class="prayer-list-item">
        <template #prepend><span class="prayer-list-item__icon-wrap" :class="{ 'prayer-list-item__icon-wrap--favorite': settings.favoriteSongs.includes(song.id) }"><v-btn size="small" :icon="settings.favoriteSongs.includes(song.id) ? 'mdi-heart' : 'mdi-heart-outline'" :color="settings.favoriteSongs.includes(song.id) ? 'red' : undefined" variant="text" :aria-label="settings.favoriteSongs.includes(song.id) ? 'Выдаліць з абраных' : 'Дадаць у абраныя'" @click.stop.prevent="settings.toggleFavoriteSong(song.id)" /></span></template>
        <v-list-item-title class="prayer-title-text">{{ song.title }}</v-list-item-title>
        <div v-if="!settings.songCompactList && getSongTags(song).length" class="song-tags"><v-chip v-for="tag in getSongTags(song)" :key="tag" class="prayer-tag" variant="tonal" size="x-small">{{ tag }}</v-chip></div>
        <template #append><div class="prayer-list-item__actions"><v-btn v-if="auth.isAdmin" icon="mdi-pencil" size="small" variant="text" aria-label="Рэдагаваць спеў" @click.stop.prevent="router.push({ name: 'AdminSongEdit', params: { id: song.id } })" /><v-icon class="prayer-list-item__arrow" icon="mdi-chevron-right" size="24" /></div></template>
      </v-list-item>
    </v-list>
    <p v-if="!filtered.length" class="songs-empty">{{ favoritesOnly ? 'Няма абраных спеваў для гэтых фільтраў.' : 'Спевы не знойдзены.' }}</p>
    <v-btn v-if="auth.isAdmin" :to="{ name: 'AdminSongAdd' }" position="fixed" location="bottom right" size="large" rounded="pill" class="add-prayer-btn add-song-btn text-none" aria-label="Новы спеў"><PhPlus :size="24" aria-hidden="true" /><span class="add-song-label">Новы спеў</span></v-btn>
    <form class="prayer-search-dock" role="search" @submit.prevent>
      <PhMagnifyingGlass :size="23" class="prayer-search-icon" aria-hidden="true" />
      <input v-model="query" type="search" class="prayer-search-input" placeholder="Пошук спеваў" aria-label="Пошук спеваў" autocomplete="off" enterkeyhint="search" @keydown.esc="query = ''" />
      <button v-if="query" type="button" class="search-dock-action" aria-label="Ачысціць пошук" @click="query = ''"><PhX :size="19" /></button>
      <button type="button" class="search-dock-action filter-dock-action" :class="{ 'search-dock-action--active': tags.length > 0 }" :aria-label="`Фільтр па тэгах: ${tags.length}`" @click="filterOpen = true"><PhSlidersHorizontal :size="21" /><span v-if="tags.length" class="filter-count">{{ tags.length }}</span></button>
    </form>
    <v-bottom-sheet v-model="filterOpen">
      <v-card class="songs-sheet" rounded="t-xl"><v-card-title class="d-flex align-center">Фільтр па тэгах<v-spacer /><v-btn icon="mdi-close" variant="text" aria-label="Закрыць фільтр" @click="filterOpen = false" /></v-card-title><v-card-text>
        <v-checkbox v-model="favoritesOnly" label="Толькі абраныя спевы" hide-details color="primary" class="mb-3" />
        <p v-if="!store.allTags.length">Тэгі з’явяцца пасля дадання ў рэдактары спеваў.</p>
        <v-chip-group v-model="tags" multiple column><v-chip v-for="tag in store.allTags" :key="tag" :value="tag" filter>{{ tag }}</v-chip></v-chip-group>
      </v-card-text><v-card-actions><v-btn @click="tags = []">Скінуць</v-btn><v-spacer /><v-btn variant="flat" @click="filterOpen = false">Паказаць спевы</v-btn></v-card-actions></v-card>
    </v-bottom-sheet>
    <v-bottom-sheet v-model="ui.songSettingsOpen"><v-card class="songs-sheet" rounded="t-xl"><v-card-title class="d-flex align-center">Налады спеўніка<v-spacer /><v-btn icon="mdi-close" variant="text" aria-label="Закрыць налады" @click="ui.songSettingsOpen = false" /></v-card-title><v-card-text><SongSettings /></v-card-text></v-card></v-bottom-sheet>
  </v-container>
</template>
<script setup>
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { PhMagnifyingGlass, PhPlus, PhSlidersHorizontal, PhX } from '@phosphor-icons/vue';
import { useSongsStore } from '@/stores/songs';
import { useSettingsStore } from '@/stores/settings';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { getSongTags } from '@/constants/songTags';
import { filterSongs } from '@/utils/songChords';
import SongSettings from '@/components/songs/SongSettings.vue';
import '@/styles/songs.scss';
const store = useSongsStore();
const settings = useSettingsStore();
const auth = useAuthStore();
const ui = useUiStore();
const router = useRouter();
const { searchQuery: query, selectedTags: tags, favoritesOnly } = storeToRefs(store);
const filterOpen = ref(false);
const filtered = computed(() => filterSongs(store.songs, { query: query.value, tags: tags.value, favorites: settings.favoriteSongs, favoritesOnly: favoritesOnly.value }));
store.init();
</script>
<style scoped src="@/styles/prayers-list.css"></style>
<style scoped src="@/styles/prayer-reading.css"></style>
<style scoped>
.songs-list-container--compact .prayer-options-list { gap: 6px; }
.songs-list-container--compact .prayer-list-item { min-height: 56px; padding: 6px 10px 6px 12px !important; border-radius: 16px !important; }
.songs-list-container--compact .prayer-list-item__icon-wrap { width: 36px; height: 36px; border-radius: 12px; }
.songs-list-container--compact .prayer-title-text { font-size: 1rem !important; line-height: 1.3 !important; }
.songs-list-container--compact :deep(.v-list-item__prepend) { margin-inline-end: 8px; }
</style>
