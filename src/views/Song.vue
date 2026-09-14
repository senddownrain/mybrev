<template>
  <v-container class="prayer-view-container">
    <div v-if="song" class="prayer-content-area">
      <article class="prayer-reading-surface">
      <header class="prayer-reading-header">
        <div class="prayer-reading-eyebrow">Пілігрымкавы спеўнік</div>
        <h1 class="prayer-title">{{ song.title }}</h1>
        <div v-if="getSongTags(song).length" class="prayer-tags"><v-chip v-for="tag in getSongTags(song)" :key="tag" class="prayer-tag" variant="tonal" size="small">{{ tag }}</v-chip></div>
      </header>
      <div v-if="settings.songShowChords && song.chord" class="song-transpose-toolbar" role="group" aria-label="Транспанаванне акордаў">
        <v-btn icon="mdi-minus" variant="tonal" size="small" :disabled="transpose <= -12" aria-label="Панізіць на паўтон" @click="transpose--" />
        <span aria-live="polite">{{ transpose > 0 ? '+' : '' }}{{ transpose }} паўтонаў</span>
        <v-btn icon="mdi-plus" variant="tonal" size="small" :disabled="transpose >= 12" aria-label="Павысіць на паўтон" @click="transpose++" />
        <v-btn variant="text" :disabled="transpose === 0" @click="transpose = 0">Арыгінал</v-btn>
      </div>
      <div class="prayer-text"><SongText :song="song" :show-chords="settings.songShowChords && !!song.chord" :layout="settings.songChordLayout" :transpose="transpose" /></div>
      <footer v-if="song.source" class="prayer-source"><span class="prayer-source__label">Крыніца:</span><span class="prayer-source__content">{{ song.source }}</span></footer>
      </article>
    </div>
    <v-progress-linear v-else-if="store.isLoading" indeterminate aria-label="Загрузка спеву" />
    <v-alert v-else type="warning">{{ store.error ? 'Не атрымалася загрузіць спеў.' : 'Спеў не знойдзены.' }}</v-alert>
  </v-container>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import { useSongsStore } from '@/stores/songs';
import { useSettingsStore } from '@/stores/settings';
import { getSongTags } from '@/constants/songTags';
import SongText from '@/components/songs/SongText.vue';
import '@/styles/songs.scss';
const props = defineProps({ id: { type: String, required: true } });
const store = useSongsStore();
const settings = useSettingsStore();
const song = computed(() => store.songs.find((item) => item.id === props.id));
const transpose = ref(0);
watch(() => props.id, () => { transpose.value = 0; });
store.init();
</script>
<style scoped src="@/styles/prayer-reading.css"></style>
