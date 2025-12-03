<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="600px"
    scrollable
  >
    <v-card>
      <v-card-title>Дадаць катэгорыю</v-card-title>
      <v-card-text>
        <v-form @submit.prevent="onAddCategory">
          <v-text-field
            v-model="newCategory.name"
            label="Назва катэгорыі"
            variant="outlined"
            class="mb-4"
            required
          ></v-text-field>
          <v-combobox
            v-model="newCategory.tags"
            :items="allTags"
            label="Тэгі для фільтрацыі"
            variant="outlined"
            multiple
            chips
            clearable
            required
          ></v-combobox>
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="$emit('update:modelValue', false)">
          Скасаваць
        </v-btn>
        <v-btn 
          color="primary" 
          variant="flat" 
          @click="onAddCategory"
          :disabled="!isValid"
        >
          Дадаць
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { ref, computed } from 'vue';
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

