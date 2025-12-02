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

defineProps({ modelValue: Boolean });
const emit = defineEmits(['update:modelValue']);

const settings = useSettingsStore();
const { allTags } = usePrayers();
const { notifySuccess, notifyError } = useNotifier();
const newCategory = ref({ name: '', tags: [] });

const isValid = computed(() => {
  return newCategory.value.name.trim() && newCategory.value.tags.length > 0;
});

function onAddCategory() {
  if (!isValid.value) {
    notifyError('Запоўніце ўсе палі');
    return;
  }
  
  settings.addCategory({ ...newCategory.value });
  notifySuccess('Катэгорыя дададзена');
  newCategory.value = { name: '', tags: [] };
  emit('update:modelValue', false);
}
</script>

