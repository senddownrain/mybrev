<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="560px"
    scrollable
    class="category-dialog"
  >
    <v-card class="category-dialog-card">
      <header class="dialog-header">
        <div class="dialog-heading">
          <span class="dialog-icon"><PhFolderPlus :size="24" /></span>
          <div>
            <span class="dialog-eyebrow">Малітвы</span>
            <h2>Новая катэгорыя</h2>
          </div>
        </div>
        <button
          type="button"
          class="close-button"
          aria-label="Закрыць"
          @click="$emit('update:modelValue', false)"
        >
          <PhX :size="20" />
        </button>
      </header>

      <v-card-text class="dialog-content">
        <p class="dialog-intro">Дайце катэгорыі назву і абярыце тэгі, па якіх будуць сабраныя малітвы.</p>
        <v-form class="category-form" @submit.prevent="onAddCategory">
          <label class="field-label" for="category-name">Назва катэгорыі</label>
          <v-text-field
            id="category-name"
            v-model="newCategory.name"
            placeholder="Напрыклад, На раніцу"
            variant="solo"
            flat
            hide-details
            class="category-field"
            required
          />
          <div class="tag-label-row">
            <label class="field-label" for="category-tags">Тэгі для фільтрацыі</label>
            <span class="selection-count">Абрана: {{ newCategory.tags.length }}</span>
          </div>

          <div class="tag-picker">
            <div v-if="newCategory.tags.length" class="selected-tags" aria-label="Абраныя тэгі">
              <button
                v-for="tag in newCategory.tags"
                :key="tag"
                type="button"
                class="selected-tag"
                :aria-label="`Прыбраць тэг ${tag}`"
                @click="removeTag(tag)"
              >
                <span>{{ tag }}</span>
                <PhX :size="14" weight="bold" />
              </button>
            </div>
            <p v-else class="selection-hint">Абярыце адзін або некалькі тэгаў са спіса.</p>

            <div class="tag-search">
              <PhMagnifyingGlass :size="18" aria-hidden="true" />
              <input
                id="category-tags"
                v-model="tagQuery"
                type="search"
                placeholder="Знайсці тэг"
                autocomplete="off"
                @keydown.enter.prevent="onTagSearchEnter"
              >
              <button v-if="tagQuery" type="button" aria-label="Ачысціць пошук" @click="tagQuery = ''">
                <PhX :size="16" />
              </button>
            </div>

            <div class="tag-options" role="group" aria-label="Даступныя тэгі">
              <button
                v-for="tag in filteredTags"
                :key="tag"
                type="button"
                class="tag-option"
                :class="{ 'tag-option--selected': isTagSelected(tag) }"
                :aria-pressed="isTagSelected(tag)"
                @click="toggleTag(tag)"
              >
                <span class="tag-check"><PhCheck v-if="isTagSelected(tag)" :size="14" weight="bold" /></span>
                <span>{{ tag }}</span>
              </button>

              <button v-if="canCreateTag" type="button" class="create-tag" @click="addTag(tagQuery, true)">
                <span class="tag-check"><PhPlus :size="14" weight="bold" /></span>
                Дадаць «{{ tagQuery.trim() }}»
              </button>

              <p v-if="isLoading && !availableTags.length" class="empty-tags">Загрузка тэгаў…</p>
              <p v-else-if="!filteredTags.length && !canCreateTag" class="empty-tags">Нічога не знойдзена</p>
            </div>
          </div>
        </v-form>
      </v-card-text>

      <footer class="dialog-actions">
        <button type="button" class="cancel-button" @click="$emit('update:modelValue', false)">Скасаваць</button>
        <button type="button" class="submit-button" :disabled="!isValid" @click="onAddCategory">
          <PhPlus :size="18" weight="bold" />
          Дадаць
        </button>
      </footer>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { PhCheck, PhFolderPlus, PhMagnifyingGlass, PhPlus, PhX } from '@phosphor-icons/vue';
import { useSettingsStore } from '@/stores/settings';
import { usePrayers } from '@/composables/usePrayers';
import { useNotifier } from '@/composables/useNotifier';
import { validateCategory } from '@/utils/validators';

const props = defineProps({ modelValue: Boolean });
const emit = defineEmits(['update:modelValue', 'category-added']);

const settings = useSettingsStore();
const { allTags, isLoading, init: initPrayers } = usePrayers();
const { notifySuccess, notifyError } = useNotifier();
const newCategory = ref({ name: '', tags: [] });
const tagQuery = ref('');

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen && !allTags.value.length) initPrayers();
  },
);

const availableTags = computed(() => [...new Set(allTags.value || [])]
  .map((tag) => String(tag).trim())
  .filter(Boolean)
  .sort((a, b) => a.localeCompare(b, 'be', { sensitivity: 'base' })));

const filteredTags = computed(() => {
  const query = tagQuery.value.trim().toLocaleLowerCase('be');
  if (!query) return availableTags.value;
  return availableTags.value.filter((tag) => tag.toLocaleLowerCase('be').includes(query));
});

const canCreateTag = computed(() => {
  const query = tagQuery.value.trim();
  if (!query) return false;
  return !availableTags.value.some((tag) => tag.localeCompare(query, 'be', { sensitivity: 'base' }) === 0)
    && !newCategory.value.tags.some((tag) => tag.localeCompare(query, 'be', { sensitivity: 'base' }) === 0);
});

const isValid = computed(() => {
  const validation = validateCategory(newCategory.value);
  return validation === true;
});

function onAddCategory() {
  const validation = validateCategory(newCategory.value);
  if (validation !== true) {
    notifyError(validation);
    return;
  }
  
  try {
    settings.addCategory({ ...newCategory.value });
    notifySuccess('Катэгорыя дададзена');
    newCategory.value = { name: '', tags: [] };
    tagQuery.value = '';
    // Закрываем диалог
    emit('update:modelValue', false);
    // Также эмитим событие для совместимости
    emit('category-added');
  } catch (error) {
    notifyError(error.message || 'Памылка пры дадаванні катэгорыі');
  }
}

function isTagSelected(tag) {
  return newCategory.value.tags.includes(tag);
}

function addTag(tag, clearQuery = false) {
  const normalizedTag = String(tag).trim();
  if (!normalizedTag || isTagSelected(normalizedTag)) return;
  newCategory.value.tags.push(normalizedTag);
  if (clearQuery) tagQuery.value = '';
}

function removeTag(tag) {
  newCategory.value.tags = newCategory.value.tags.filter((item) => item !== tag);
}

function toggleTag(tag) {
  if (isTagSelected(tag)) removeTag(tag);
  else addTag(tag);
}

function onTagSearchEnter() {
  if (canCreateTag.value) {
    addTag(tagQuery.value, true);
    return;
  }
  if (filteredTags.value.length === 1 && !isTagSelected(filteredTags.value[0])) {
    addTag(filteredTags.value[0]);
  }
}
</script>

<style scoped>
.category-dialog-card {
  overflow: hidden;
  border: 1px solid var(--nav-border);
  border-radius: 26px !important;
  background:
    radial-gradient(circle at 92% 0, rgba(var(--devotional-rgb), 0.14), transparent 220px),
    var(--overlay-surface);
  color: var(--nav-on-surface);
  box-shadow: 0 22px 60px var(--nav-shadow);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px 16px;
}

.dialog-heading {
  display: flex;
  align-items: center;
  gap: 13px;
}

.dialog-icon,
.close-button {
  display: grid;
  place-items: center;
  color: var(--nav-on-surface);
}

.dialog-icon {
  flex: 0 0 46px;
  width: 46px;
  height: 46px;
  border-radius: 15px;
  border: 1px solid rgba(var(--devotional-rgb), 0.18);
  background: var(--devotional-soft);
  color: var(--devotional-accent);
}

.dialog-eyebrow,
.field-label {
  color: var(--nav-muted);
  font-size: .69rem;
  font-weight: 800;
  letter-spacing: .11em;
  text-transform: uppercase;
}

.dialog-eyebrow {
  color: var(--devotional-accent);
}

.dialog-heading h2 {
  margin: 2px 0 0;
  font-size: 1.25rem;
  font-family: var(--reader-display-font-family);
  font-weight: 780;
  line-height: 1.15;
  letter-spacing: -.025em;
}

.close-button,
.cancel-button,
.submit-button {
  border: 0;
  font: inherit;
  cursor: pointer;
}

.close-button {
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  border-radius: 13px;
  background: transparent;
  transition: background .18s ease, transform .16s ease;
}

.close-button:hover { background: var(--nav-active); }
.close-button:active, .cancel-button:active, .submit-button:active { transform: scale(.97); }

.dialog-content { padding: 0 22px 22px !important; }
.dialog-intro { margin: 0 0 20px; color: var(--nav-muted); font-size: .88rem; line-height: 1.5; }
.category-form { display: grid; gap: 9px; }
.field-label:not(:first-child) { margin-top: 10px; }
.tag-label-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 10px; }
.selection-count { color: var(--devotional-accent); font-size: .72rem; font-weight: 750; }

.category-field :deep(.v-field) {
  min-height: 52px;
  border: 1px solid var(--nav-border);
  border-radius: 16px;
  background: var(--nav-active) !important;
  color: var(--nav-on-surface);
  box-shadow: none !important;
}

.category-field :deep(.v-field--focused) {
  border-color: rgba(var(--devotional-rgb), .72);
  box-shadow: 0 0 0 3px rgba(var(--devotional-rgb), .12) !important;
}

.category-field :deep(.v-field__input) { min-height: 52px; padding-inline: 15px; font-size: .9rem; }
.category-field :deep(.v-chip) { background: var(--nav-surface); color: var(--nav-on-surface); }

.tag-picker { overflow: hidden; border: 1px solid var(--nav-border); border-radius: 18px; background: var(--nav-active); }
.selected-tags { display: flex; flex-wrap: wrap; gap: 7px; padding: 12px 12px 4px; }
.selected-tag,
.tag-search button,
.tag-option,
.create-tag { border: 0; font: inherit; cursor: pointer; }
.selected-tag { display: flex; align-items: center; gap: 6px; min-height: 32px; padding: 5px 9px 5px 11px; border: 1px solid rgba(var(--devotional-rgb), .2); border-radius: 999px; background: var(--devotional-soft); color: var(--devotional-accent); font-size: .76rem; font-weight: 700; }
.selection-hint { margin: 0; padding: 13px 14px 4px; color: var(--nav-muted); font-size: .77rem; line-height: 1.4; }
.tag-search { display: grid; grid-template-columns: auto minmax(0, 1fr) 32px; align-items: center; gap: 8px; min-height: 46px; margin: 10px 11px; padding-left: 12px; border: 1px solid var(--nav-border); border-radius: 13px; background: var(--nav-surface); color: var(--nav-muted); }
.tag-search:focus-within { border-color: rgba(var(--devotional-rgb), .72); box-shadow: 0 0 0 3px rgba(var(--devotional-rgb), .12); }
.tag-search input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--nav-on-surface); font: inherit; font-size: .86rem; }
.tag-search input::placeholder { color: var(--nav-muted); }
.tag-search input::-webkit-search-cancel-button { display: none; }
.tag-search button { display: grid; width: 32px; height: 32px; place-items: center; border-radius: 10px; background: transparent; color: var(--nav-muted); }
.tag-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; max-height: 210px; overflow-y: auto; padding: 0 11px 11px; scrollbar-width: thin; }
.tag-option,
.create-tag { display: flex; align-items: center; gap: 9px; min-width: 0; min-height: 40px; padding: 8px 10px; border: 1px solid var(--nav-border); border-radius: 12px; background: var(--nav-surface); color: var(--nav-on-surface); font-size: .78rem; text-align: left; transition: border-color .16s ease, background .16s ease, transform .16s ease; }
.tag-option:hover,
.create-tag:hover { border-color: rgba(var(--devotional-rgb), .38); }
.tag-option:active,
.create-tag:active,
.selected-tag:active { transform: scale(.98); }
.tag-option--selected { border-color: rgba(var(--devotional-rgb), .28); background: var(--devotional-soft); color: var(--devotional-accent); font-weight: 720; }
.tag-check { display: grid; flex: 0 0 21px; width: 21px; height: 21px; place-items: center; border: 1px solid var(--nav-border); border-radius: 7px; color: var(--on-devotional-accent); }
.tag-option--selected .tag-check { border-color: var(--devotional-accent); background: var(--devotional-accent); }
.create-tag { grid-column: 1 / -1; color: var(--devotional-accent); font-weight: 720; }
.create-tag .tag-check { border-color: rgba(var(--devotional-rgb), .26); color: var(--devotional-accent); }
.empty-tags { grid-column: 1 / -1; margin: 8px 0 10px; color: var(--nav-muted); font-size: .8rem; text-align: center; }

.dialog-actions {
  display: grid;
  grid-template-columns: 1fr 1.35fr;
  gap: 9px;
  padding: 14px 22px 22px;
  border-top: 1px solid var(--nav-border);
}

.cancel-button,
.submit-button {
  min-height: 48px;
  border-radius: 16px;
  font-size: .86rem;
  font-weight: 750;
  transition: transform .16s ease, opacity .18s ease;
}

.cancel-button { background: var(--nav-active); color: var(--nav-on-surface); }
.submit-button { display: flex; align-items: center; justify-content: center; gap: 7px; background: var(--devotional-accent); color: var(--on-devotional-accent); }
.submit-button:disabled { opacity: .38; cursor: default; }

@media (max-width: 600px) {
  .category-dialog :deep(.v-overlay__content) { width: calc(100% - 24px); margin: 12px; }
  .category-dialog-card { border-radius: 22px !important; }
  .dialog-header { padding: 18px 17px 14px; }
  .dialog-content { padding: 0 17px 18px !important; }
  .dialog-actions { padding: 12px 17px 17px; }
  .tag-options { grid-template-columns: 1fr; max-height: 190px; }
}
</style>

