<template>
  <div class="song-settings">
    <h3 class="text-subtitle-1">Спіс спеваў</h3>
    <v-switch v-model="settings.songCompactList" color="primary" label="Кампактны спіс" hint="Тонкія радкі без тэгаў" persistent-hint inset />
    <h3 class="text-subtitle-1">Акорды</h3>
    <v-switch v-model="settings.songShowChords" color="primary" label="Паказваць акорды" hide-details inset />
    <v-select v-model="settings.songChordLayout" :items="layouts" label="Пазіцыя акордаў" hide-details variant="outlined" />
  </div>
</template>
<script setup>
import { useSettingsStore } from '@/stores/settings';
const settings = useSettingsStore();
const layouts = [{ title: 'Над радкамі', value: 'above' }, { title: 'Злева ад тэксту', value: 'left' }];
</script>
<style scoped>
.song-settings { display: grid; gap: 18px; }
</style>
