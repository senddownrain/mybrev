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
          <label class="field-label" for="category-tags">Тэгі для фільтрацыі</label>
          <v-combobox
            id="category-tags"
            v-model="newCategory.tags"
            :items="allTags"
            placeholder="Абярыце або ўвядзіце тэгі"
            variant="solo"
            flat
            hide-details
            class="category-field"
            multiple
            chips
            clearable
            required
          />
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
import { ref, computed } from 'vue';
import { PhFolderPlus, PhPlus, PhX } from '@phosphor-icons/vue';
import { useSettingsStore } from '@/stores/settings';
import { usePrayers } from '@/composables/usePrayers';
import { useNotifier } from '@/composables/useNotifier';
import { validateCategory } from '@/utils/validators';

defineProps({ modelValue: Boolean });
const emit = defineEmits(['update:modelValue', 'category-added']);

const settings = useSettingsStore();
const { allTags } = usePrayers();
const { notifySuccess, notifyError } = useNotifier();
const newCategory = ref({ name: '', tags: [] });

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
    // Закрываем диалог
    emit('update:modelValue', false);
    // Также эмитим событие для совместимости
    emit('category-added');
  } catch (error) {
    notifyError(error.message || 'Памылка пры дадаванні катэгорыі');
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
}
</style>

