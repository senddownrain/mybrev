<template>
  <div class="sets-editor">
    <div class="sets-editor__tabs">
      <v-chip-group v-model="activeIndex" mandatory column selected-class="text-primary">
        <v-chip v-for="(set, index) in model.sets" :key="index" :value="index" variant="outlined" class="sets-editor__tab">
          {{ set.label || set.id }}<span v-if="set.default">&nbsp;★</span>
        </v-chip>
      </v-chip-group>
      <v-btn variant="text" prepend-icon="mdi-plus" class="text-none" @click="addSet">Набор</v-btn>
    </div>

    <v-card v-if="set" class="reading-editor__card mb-4" elevation="0">
      <v-card-text>
        <v-row dense>
          <v-col cols="12" md="5"><v-text-field v-model="set.label" label="Назва набору (як у крыніцы)" variant="outlined" /></v-col>
          <v-col cols="6" md="2"><v-text-field v-model="set.id" label="id" variant="outlined" /></v-col>
          <v-col cols="6" md="3"><v-select v-model="set.context" :items="contextOptions" label="Кантэкст" variant="outlined" clearable /></v-col>
          <v-col cols="12" md="2"><v-checkbox v-model="set.default" label="Па змаўчанні" hide-details @update:model-value="markDefault" /></v-col>
          <v-col cols="12" md="6"><v-checkbox v-model="set.referenceOnly" label="Толькі цытаты (без тэксту)" hide-details /></v-col>
          <v-col cols="12" md="6">
            <v-select v-model="model.flatSet" :items="flatOptions" label="Набор для старых праграм (плоскія палі)" variant="outlined" hide-details />
          </v-col>
          <v-col cols="12"><v-text-field v-model="set.note" label="Заўвага крыніцы" variant="outlined" hide-details /></v-col>
          <v-col cols="12">
            <v-text-field :model-value="set.source?.url || ''" label="Крыніца (provenance)" variant="outlined" readonly hide-details />
          </v-col>
        </v-row>
        <div class="d-flex flex-wrap gap-2 mt-3">
          <v-btn variant="text" class="text-none" prepend-icon="mdi-undo" :disabled="!setChanged" @click="$emit('reset-set', activeIndex)">Адмяніць змены набору</v-btn>
          <v-btn variant="text" color="error" class="text-none" prepend-icon="mdi-delete-outline" :disabled="model.sets.length < 2" @click="removeSet">Выдаліць набор</v-btn>
        </div>
      </v-card-text>
    </v-card>

    <div v-if="set">
      <v-card v-for="(section, index) in set.sections" :key="index" class="reading-editor__card mb-3" elevation="0">
        <v-card-title class="sets-editor__section-title">
          <span>{{ sectionTitle(section) }}</span>
          <v-spacer />
          <v-btn icon="mdi-arrow-up" size="small" variant="text" aria-label="Вышэй" @click="move(index, -1)" />
          <v-btn icon="mdi-arrow-down" size="small" variant="text" aria-label="Ніжэй" @click="move(index, 1)" />
          <v-btn icon="mdi-close" size="small" variant="text" aria-label="Прыбраць" @click="set.sections.splice(index, 1)" />
        </v-card-title>
        <v-card-text>
          <v-row dense>
            <v-col v-if="section.kind !== 'rubric'" cols="6" md="3"><v-text-field v-model="section.role" label="Слот" variant="outlined" hide-details /></v-col>
            <v-col v-if="section.kind !== 'rubric'" cols="6" md="2"><v-select v-model="section.cycle" :items="cycleOptions" label="Цыкл" variant="outlined" clearable hide-details /></v-col>
            <v-col v-if="section.kind !== 'rubric'" cols="12" md="7"><v-text-field v-model="section.bible" label="Біблійная спасылка" variant="outlined" hide-details /></v-col>

            <template v-if="section.kind === 'reading' || section.kind === 'gospel'">
              <v-col cols="12" md="6"><v-text-field v-model="section.comment" label="Кароткі загаловак" variant="outlined" hide-details /></v-col>
              <v-col cols="12" md="6"><v-text-field v-model="section.title" label="Літургічны ўступ" variant="outlined" hide-details /></v-col>
              <v-col v-if="!set.referenceOnly && section.passion" cols="12">
                <v-textarea
                  :model-value="passionMarkup(section)"
                  label="Мука Пана па ролях (Ев. / Е. / І. / Л.; # загаловак; > рубрыка; блокі праз пусты радок)"
                  rows="10" auto-grow variant="outlined"
                  @update:model-value="(value) => setPassion(section, value)"
                />
              </v-col>
              <v-col v-else-if="!set.referenceOnly" cols="12">
                <v-textarea v-model="section.text" label="Тэкст (дазволены HTML: p, br, em, strong)" rows="6" auto-grow variant="outlined" hide-details />
                <v-btn v-if="section.kind === 'gospel'" variant="text" size="small" class="text-none mt-1" @click="setPassion(section, section.text || '')">Размеціць па ролях</v-btn>
              </v-col>
              <v-col v-if="!set.referenceOnly" cols="12" md="6">
                <v-text-field v-model="section.conclusion" label="Заканчэнне («Гэта слова Божае.»; пуста — не гаворыцца)" variant="outlined" hide-details />
              </v-col>
              <v-col cols="12">
                <div v-for="(alternative, altIndex) in section.alternatives || []" :key="altIndex" class="sets-editor__alternative">
                  <v-text-field v-model="alternative.bible" label="Або: спасылка" variant="outlined" density="compact" hide-details />
                  <v-text-field v-if="!set.referenceOnly" v-model="alternative.title" label="Літургічны ўступ" variant="outlined" density="compact" hide-details />
                  <v-textarea v-if="!set.referenceOnly" v-model="alternative.text" label="Тэкст" rows="3" auto-grow variant="outlined" density="compact" hide-details />
                  <v-btn variant="text" size="small" color="error" @click="section.alternatives.splice(altIndex, 1)">Прыбраць</v-btn>
                </div>
                <v-btn variant="text" size="small" prepend-icon="mdi-plus" class="text-none" @click="(section.alternatives ||= []).push({ bible: '', title: '', text: '' })">Альтэрнатыва («або»)</v-btn>
              </v-col>
            </template>

            <template v-else-if="section.kind === 'psalm' && !set.referenceOnly">
              <v-col cols="12" md="6"><v-text-field v-model="section.chorus" label="Рэфрэн" variant="outlined" hide-details /></v-col>
              <v-col cols="12" md="6"><v-text-field v-model="section.altChorus" label="Або (рэфрэн)" variant="outlined" hide-details /></v-col>
              <v-col cols="12">
                <v-textarea
                  :model-value="(section.verses || []).join('\n\n')"
                  label="Строфы (праз пусты радок)" rows="8" auto-grow variant="outlined" hide-details
                  @update:model-value="(value) => { section.verses = String(value).split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean); }"
                />
              </v-col>
            </template>

            <template v-else-if="section.kind === 'acclamation' && !set.referenceOnly">
              <v-col cols="12" md="5"><v-text-field v-model="section.acclamation" label="Акламацыя" variant="outlined" hide-details /></v-col>
              <v-col cols="12" md="7"><v-textarea v-model="section.verse" label="Верш" rows="3" auto-grow variant="outlined" hide-details /></v-col>
            </template>

            <template v-else-if="section.kind === 'sequence' && !set.referenceOnly">
              <v-col cols="12"><v-textarea v-model="section.text" label="Секвенцыя" rows="8" auto-grow variant="outlined" hide-details /></v-col>
            </template>

            <template v-else-if="section.kind === 'rubric'">
              <v-col cols="12"><v-textarea v-model="section.text" label="Рубрыка / каментар" rows="2" auto-grow variant="outlined" hide-details /></v-col>
            </template>
          </v-row>
        </v-card-text>
      </v-card>

      <div class="d-flex flex-wrap gap-2 mb-6">
        <v-btn v-for="kind in sectionKinds" :key="kind.value" variant="tonal" size="small" class="text-none" prepend-icon="mdi-plus" @click="set.sections.push(emptySection(kind.value))">
          {{ kind.title }}
        </v-btn>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { SET_CONTEXTS } from '@/utils/massReadingSets';
import {
  changedSetFields, emptySection, emptySet, markupToPassion, moveItem, passionToMarkup,
} from '@/utils/massReadingSetsEditor';

const props = defineProps({
  modelValue: { type: Object, required: true },
  original: { type: Object, default: null },
});
defineEmits(['reset-set']);
const activeIndex = defineModel('active', { type: Number, default: 0 });

const model = computed(() => props.modelValue);
const set = computed(() => model.value.sets[activeIndex.value] || null);
const setChanged = computed(() => changedSetFields(props.original?.sets?.[activeIndex.value], set.value).length > 0);
const contextOptions = SET_CONTEXTS;
const cycleOptions = ['A', 'B', 'C'];
const flatOptions = computed(() => [{ title: 'Няма', value: null }, ...model.value.sets.map((item) => ({ title: item.label || item.id, value: item.id }))]);
const sectionKinds = [
  { value: 'reading', title: 'Чытанне' },
  { value: 'psalm', title: 'Псальм' },
  { value: 'sequence', title: 'Секвенцыя' },
  { value: 'acclamation', title: 'Спеў перад Евангеллем' },
  { value: 'gospel', title: 'Евангелле' },
  { value: 'rubric', title: 'Рубрыка' },
];
// Role markup is edited as text; the structure is rebuilt on every change.
const markupCache = ref(new WeakMap());

function sectionTitle(section) {
  const names = { reading: 'Чытанне', psalm: 'Псальм', acclamation: 'Спеў перад Евангеллем', sequence: 'Секвенцыя', gospel: 'Евангелле', rubric: 'Рубрыка' };
  return [names[section.kind] || section.kind, section.role && section.role !== section.kind ? section.role : '', section.cycle ? `цыкл ${section.cycle}` : '']
    .filter(Boolean).join(' · ');
}

function passionMarkup(section) {
  return markupCache.value.get(section) ?? passionToMarkup(section.passion);
}

function setPassion(section, value) {
  markupCache.value.set(section, value);
  section.passion = markupToPassion(value);
  section.text = '';
}

function move(index, delta) {
  set.value.sections = moveItem(set.value.sections, index, index + delta);
}

function markDefault(value) {
  if (value) model.value.sets.forEach((item) => { if (item !== set.value) delete item.default; });
}

function addSet() {
  model.value.sets.push(emptySet(model.value.sets));
  activeIndex.value = model.value.sets.length - 1;
}

function removeSet() {
  model.value.sets.splice(activeIndex.value, 1);
  activeIndex.value = 0;
}
</script>

<style scoped>
.sets-editor__tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.sets-editor__tab { height: auto; min-height: 44px; max-width: 100%; padding-block: 8px; }
.sets-editor__tab :deep(.v-chip__content) { white-space: normal; overflow-wrap: anywhere; }
.sets-editor__tabs :deep(.v-chip-group) { min-width: 0; max-width: 100%; }

.sets-editor__section-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  font-size: 1rem;
}
.sets-editor__section-title > span { flex: 1 0 100%; min-width: 0; }

.sets-editor__alternative {
  display: grid;
  gap: 10px;
  margin-bottom: 14px;
  padding: 12px 0 0 12px;
  border-left: 2px solid var(--nav-border);
}

.gap-2 {
  gap: 8px;
}
</style>
