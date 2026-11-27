<template>
  <ol class="blocks">
    <li v-for="(block, index) in blocks" :key="index" class="block">
      <div class="block__head">
        <span class="block__type">{{ index + 1 }}. {{ typeLabel(block) }}</span>
        <v-btn icon="mdi-arrow-up" size="x-small" variant="text" :disabled="index === 0" :aria-label="`Блок ${index + 1} вышэй`" @click="move(index, -1)" />
        <v-btn icon="mdi-arrow-down" size="x-small" variant="text" :disabled="index === blocks.length - 1" :aria-label="`Блок ${index + 1} ніжэй`" @click="move(index, 1)" />
        <v-btn icon="mdi-delete-outline" size="x-small" variant="text" color="error" :aria-label="`Выдаліць блок ${index + 1}`" @click="remove(index)" />
      </div>

      <template v-if="block.type === 'section' || block.type === 'prayer'">
        <v-autocomplete
          :model-value="block.prayerId || null" :items="prayerItems" item-title="title" item-value="value" label="Малітва"
          variant="outlined" density="compact" hide-details no-data-text="Нічога не знойдзена"
          @update:model-value="(id) => setPrayer(index, id)"
        />
        <p v-if="block.prayerId && !prayers.has(block.prayerId)" class="block__error">
          Малітва адсутнічае або закрытая: {{ block.prayerId }}
        </p>
        <v-select
          v-if="block.type === 'section'" :model-value="sectionKey(block)" :items="headingItems(block.prayerId)"
          item-title="title" item-value="value" label="Раздзел (загаловак)" variant="outlined" density="compact" hide-details
          class="mt-2" no-data-text="У малітве няма загалоўкаў" @update:model-value="(key) => setSection(index, key)"
        />
      </template>

      <template v-else-if="block.type === 'inline'">
        <v-select
          :model-value="block.kind" :items="kinds" label="Выгляд" variant="outlined" density="compact" hide-details
          @update:model-value="(kind) => patch(index, { kind })"
        />
        <v-textarea
          :model-value="block.text" label="Тэкст" rows="2" auto-grow variant="outlined" density="compact" hide-details class="mt-2"
          @update:model-value="(text) => patch(index, { text })"
        />
      </template>

      <p v-else class="block__note">Тут устаўляюцца блокі выбранага дня.</p>
    </li>
  </ol>
  <p v-if="!blocks.length" class="block__note">Блокаў няма.</p>
  <v-menu>
    <template #activator="{ props: menu }">
      <v-btn v-bind="menu" variant="tonal" size="small" rounded="pill" prepend-icon="mdi-plus" class="text-none">Дадаць блок</v-btn>
    </template>
    <v-list density="compact">
      <v-list-item v-for="item in addable" :key="item.type" :title="item.title" @click="add(item.type)" />
    </v-list>
  </v-menu>
</template>

<script setup>
import { computed } from 'vue';
import { headingsOf } from '@/utils/novena/core.mjs';

const props = defineProps({
  blocks: { type: Array, required: true },
  prayers: { type: Map, required: true },
  template: { type: Boolean, default: false },
});
const emit = defineEmits(['update:blocks']);

const TYPES = { section: 'Раздзел малітвы', prayer: 'Уся малітва', inline: 'Свой тэкст / рубрыка', daySection: 'Малітвы дня' };
const kinds = [{ value: 'text', title: 'Тэкст' }, { value: 'rubric', title: 'Рубрыка' }];
const addable = computed(() => Object.entries(TYPES)
  .filter(([type]) => props.template || type !== 'daySection')
  .map(([type, title]) => ({ type, title })));
const prayerItems = computed(() => [...props.prayers.values()]
  .map((prayer) => ({ value: prayer.id, title: prayer.title }))
  .sort((a, b) => String(a.title).localeCompare(String(b.title), 'be')));

const typeLabel = (block) => TYPES[block.type] || block.type;
const sectionKey = (block) => (block.heading ? JSON.stringify([block.heading, block.occurrence || 1]) : null);
const headingItems = (prayerId) => headingsOf(props.prayers.get(prayerId)?.text).map(({ heading, occurrence }) => ({
  value: JSON.stringify([heading, occurrence]),
  title: `${heading.replace(/^#+\s*|\*\*/g, '')}${occurrence > 1 ? ` (${occurrence})` : ''}`,
}));

const replace = (next) => emit('update:blocks', next);
const patch = (index, change) => replace(props.blocks.map((block, i) => (i === index ? { ...block, ...change } : block)));
const setPrayer = (index, prayerId) => patch(index, props.blocks[index].type === 'section'
  ? { prayerId, heading: '', occurrence: 1 } : { prayerId });
function setSection(index, key) {
  const [heading, occurrence] = JSON.parse(key);
  patch(index, { heading, occurrence });
}
function move(index, step) {
  const next = [...props.blocks];
  const [block] = next.splice(index, 1);
  next.splice(index + step, 0, block);
  replace(next);
}
const remove = (index) => replace(props.blocks.filter((_, i) => i !== index));
function add(type) {
  const empty = {
    section: { type, prayerId: '', heading: '', occurrence: 1 },
    prayer: { type, prayerId: '' },
    inline: { type, kind: 'rubric', text: '' },
    daySection: { type },
  };
  replace([...props.blocks, empty[type]]);
}
</script>

<style scoped>
.blocks { margin: 0 0 10px; padding: 0; list-style: none; }
.block { padding: 10px 0; border-top: 1px solid var(--nav-border); }
.block__head { display: flex; align-items: center; gap: 2px; margin-bottom: 6px; }
.block__type { flex: 1; font-size: .88rem; font-weight: 650; }
.block__note { margin: 0 0 8px; color: var(--nav-muted); font-size: .84rem; }
.block__error { margin: 4px 0 0; color: rgb(var(--v-theme-error)); font-size: .82rem; }
</style>
