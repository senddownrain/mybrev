<template>
  <v-container class="prayer-view-container">
    <div v-if="song" class="prayer-content-area">
      <article class="prayer-reading-surface">
      <header class="prayer-reading-header">
        <div class="prayer-reading-eyebrow">Спеўнік пілігрымковы</div>
        <h1 class="prayer-title">{{ song.title }}</h1>
        <div v-if="getSongTags(song).length" class="prayer-tags"><v-chip v-for="tag in getSongTags(song)" :key="tag" class="prayer-tag" variant="tonal" size="small">{{ tag }}</v-chip></div>
      </header>
      <SongChordControls v-if="hasChords" v-model:show-chords="settings.songShowChords" v-model:layout="settings.songChordLayout" v-model:transpose="transpose" :layout-available="rightFits" />
      <div class="prayer-text"><SongText :song="song" :show-chords="settings.songShowChords && hasChords" :layout="settings.songChordLayout" :transpose="transpose" @right-fits="rightFits = $event" /></div>
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
import SongChordControls from '@/components/songs/SongChordControls.vue';
import SongText from '@/components/songs/SongText.vue';
import '@/styles/songs.scss';
import { trackFeature } from '@/utils/trackFeature';
const props = defineProps({ id: { type: String, required: true } });
const store = useSongsStore();
const settings = useSettingsStore();
const song = computed(() => store.songs.find((item) => item.id === props.id));
const hasChords = computed(() => !!song.value?.chord?.trim());
// Transpose is a per-visit view offset; it is never written to song data.
const transpose = ref(0);
// Whether the text is wide enough for chords on the right; reported by SongText.
const rightFits = ref(true);
watch(() => props.id, () => { transpose.value = 0; });
// Moving away from zero is a real transposition; the reset above lands on zero and is not counted.
watch(transpose, (value) => { if (value !== 0) trackFeature('chord_transpose'); });
store.init();
</script>
<style scoped src="@/styles/prayer-reading.css"></style>
