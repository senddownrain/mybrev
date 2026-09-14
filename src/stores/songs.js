import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { getSavedSongs, initialSongs, saveSong } from '@/services/songService';
import { publicContentCache, publicContentKey } from '@/utils/publicContentCache';
import { getSongTags, SONGS_CACHE_VERSION } from '@/constants/songTags';

export const useSongsStore = defineStore('songs', () => {
  const songs = ref(publicContentCache.peek(publicContentKey('songs', SONGS_CACHE_VERSION)) || initialSongs);
  const isLoading = ref(false);
  const error = ref(null);
  const searchQuery = ref('');
  const selectedTags = ref([]);
  const favoritesOnly = ref(false);
  let pending;
  let initialized = false;
  const allTags = computed(() => [...new Set(songs.value.flatMap(getSongTags))].sort((a, b) => a.localeCompare(b, 'be')));
  async function init(options = {}) {
    if (pending) return pending;
    if (initialized && !options.fresh) return;
    isLoading.value = true;
    error.value = null;
    pending = (async () => {
      try { songs.value = await getSavedSongs(options); initialized = true; }
      catch (err) { error.value = err; }
      finally { isLoading.value = false; pending = null; }
    })();
    return pending;
  }
  async function save(id, data, options) {
    const song = await saveSong(id, data, options);
    songs.value = [...songs.value.filter((item) => item.id !== song.id), song];
    return song;
  }
  return { songs, isLoading, error, allTags, searchQuery, selectedTags, favoritesOnly, init, save };
});
