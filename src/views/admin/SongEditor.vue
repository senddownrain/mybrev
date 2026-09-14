<template>
  <v-container class="songs-page song-editor">
    <div class="songs-eyebrow">Пілігрымкавы спеўнік</div>
    <h1>{{ id ? 'Рэдагаваць спеў' : 'Новы спеў' }}</h1>
    <v-progress-linear v-if="loading" indeterminate />
    <v-alert v-if="error" type="error" class="mb-5">{{ error }}<v-btn v-if="!ready" variant="text" :loading="loading" @click="loadSong(id)">Паўтарыць</v-btn></v-alert>
    <v-form v-if="ready" @submit.prevent="save">
      <v-text-field v-model="form.title" label="Назва спеву" variant="outlined" :rules="[required]" />
      <v-select v-model="form.tag" :items="TAGS_LIST" item-title="title" item-value="id" label="Катэгорыі спеву" multiple chips closable-chips variant="outlined" />
      <v-combobox v-model="form.tags" :items="store.allTags" label="Тэгі спеву" hint="Увядзіце новы тэг і націсніце Enter" persistent-hint multiple chips closable-chips variant="outlined" class="mb-5" />
      <v-text-field v-model="form.source" label="Крыніца" variant="outlined" />
      <v-tabs v-model="mode" color="primary" class="mb-4"><v-tab value="text">Тэкст</v-tab><v-tab value="chords">Тэкст з акордамі</v-tab></v-tabs>
      <p v-if="mode === 'chords'" class="text-caption mb-4">Акорды ў правым полі адпавядаюць радкам тэксту. Захоўвайце пустыя радкі. Прыпевы і заўвагі ў полі акордаў таксама захоўваюцца.</p>
      <div class="song-editor-fields" :class="{ 'song-editor-fields--chords': mode === 'chords' }">
        <v-textarea v-model="form.text" label="Тэкст спеву" variant="outlined" rows="18" :rules="[required]" />
        <v-textarea v-if="mode === 'chords'" v-model="form.chord" label="Акорды па радках" variant="outlined" rows="18" class="song-editor-chords" spellcheck="false" />
      </div>
      <div class="songs-toolbar"><v-btn variant="tonal" @click="preview = !preview">{{ preview ? 'Схаваць перадпрагляд' : 'Перадпрагляд' }}</v-btn></div>
      <v-card v-if="preview" variant="outlined" class="pa-5 mb-5"><SongText :song="form" :show-chords="mode === 'chords'" :layout="settings.songChordLayout" /></v-card>
      <div class="songs-toolbar"><v-btn type="submit" color="primary" variant="flat" :loading="saving" :disabled="loading">Захаваць спеў</v-btn><v-btn :to="id ? { name: 'SongView', params: { id } } : { name: 'Songs' }" :disabled="saving" variant="text">Скасаваць</v-btn></div>
    </v-form>
    <v-dialog v-model="leaveOpen" max-width="420"><v-card title="Ёсць незахаваныя змены" text="Пакінуць рэдактар і страціць гэтыя змены?"><v-card-actions><v-btn @click="resolveLeave(false)">Застацца</v-btn><v-spacer /><v-btn color="error" @click="resolveLeave(true)">Пакінуць</v-btn></v-card-actions></v-card></v-dialog>
  </v-container>
</template>
<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router';
import { useSongsStore } from '@/stores/songs';
import { useSettingsStore } from '@/stores/settings';
import { useNotifier } from '@/composables/useNotifier';
import { normalizeSong } from '@/utils/songChords';
import { TAGS_LIST } from '@/constants/songTags';
import SongText from '@/components/songs/SongText.vue';
import '@/styles/songs.scss';
const props = defineProps({ id: { type: String, default: '' } });
const router = useRouter();
const store = useSongsStore();
const settings = useSettingsStore();
const { notifySuccess } = useNotifier();
const form = reactive({ title: '', text: '', chord: '', tag: [], tags: [], source: 'Супольнасць "Мы разам" holysong.ru' });
const mode = ref('text');
const preview = ref(false);
const saving = ref(false);
const loading = ref(false);
const ready = ref(false);
const error = ref('');
const baseline = ref('');
const leaveOpen = ref(false);
let leaveResolver;
const required = (value) => !!String(value || '').trim() || 'Абавязковае поле';
const serialized = () => JSON.stringify(normalizeSong(form));
const dirty = computed(() => ready.value && serialized() !== baseline.value);
async function loadSong(id) {
  ready.value = false;
  error.value = '';
  loading.value = true;
  await store.init(id ? { fresh: true, requireFresh: true } : {});
  // A route may change while loading the previous song.
  if (id !== props.id) return;
  if (id && store.error) { error.value = 'Не атрымалася загрузіць актуальны спеў для рэдагавання.'; loading.value = false; return; }
  const song = id ? store.songs.find((item) => item.id === id) : null;
  if (id && !song) { error.value = 'Спеў не знойдзены. Праверце загрузку падборкі.'; loading.value = false; return; }
  Object.assign(form, song ? normalizeSong(song) : { title: '', text: '', chord: '', tag: [], tags: [], source: 'Супольнасць "Мы разам" holysong.ru' });
  mode.value = form.chord ? 'chords' : 'text';
  baseline.value = serialized();
  ready.value = true;
  loading.value = false;
}
watch(() => props.id, loadSong, { immediate: true });
async function save() {
  if (saving.value || !ready.value) return;
  error.value = '';
  if (!form.title.trim() || !form.text.trim()) { error.value = 'Увядзіце назву і тэкст спеву.'; return; }
  saving.value = true;
  try {
    const song = await store.save(props.id, form, { creating: !props.id });
    baseline.value = serialized();
    notifySuccess('Спеў захаваны');
    saving.value = false;
    await router.push({ name: 'SongView', params: { id: song.id } });
  } catch (err) { error.value = err.message || 'Не атрымалася захаваць спеў.'; }
  finally { saving.value = false; }
}
function resolveLeave(leave) { leaveOpen.value = false; leaveResolver?.(leave); leaveResolver = null; }
function confirmLeave() {
  if (saving.value) return false;
  if (!dirty.value) return true;
  leaveOpen.value = true;
  return new Promise((resolve) => { leaveResolver = resolve; });
}
onBeforeRouteLeave(confirmLeave);
onBeforeRouteUpdate(confirmLeave);
watch(leaveOpen, (open) => { if (!open && leaveResolver) resolveLeave(false); });
function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue = ''; } }
window.addEventListener('beforeunload', beforeUnload);
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));
</script>
<style scoped>
.song-editor { max-width: 1100px !important; }
.song-editor-fields--chords { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, .7fr); gap: 16px; }
.song-editor :deep(textarea) { font-size: 1rem; line-height: 1.6; white-space: pre; overflow-x: auto; }
.song-editor-chords :deep(textarea) { font-family: ui-monospace, monospace; }
@media (max-width: 600px) { .song-editor-fields--chords { grid-template-columns: 1fr; } }
</style>
