<template>
  <v-container>
    <h1 class="text-h5 font-weight-light mb-4">Катэгорыі ў меню</h1>

    <v-list lines="two">
      <v-list-item
        v-for="(category, index) in settings.menuCategories"
        :key="index"
      >
        <v-list-item-title class="font-weight-bold">
          {{ category.name }}
        </v-list-item-title>
        <v-list-item-subtitle>
          Фільтр па тэгах: {{ category.tags.join(', ') }}
        </v-list-item-subtitle>
        
        <template v-slot:append>
          <v-btn
            icon="mdi-delete"
            variant="text"
            color="error"
            @click="removeCategory(index)"
          ></v-btn>
        </template>
      </v-list-item>
    </v-list>

    <v-btn
      color="primary"
      variant="flat"
      block
      class="mt-4"
      @click="showAddDialog = true"
    >
      ДАДАЦЬ КАТЭГОРЫЮ
    </v-btn>

    <AddCategoryDialog
      v-model="showAddDialog"
      @category-added="handleCategoryAdded"
    />
  </v-container>
</template>

<script setup>
import { ref } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { useNotifier } from '@/composables/useNotifier';
import AddCategoryDialog from '@/components/prayers/AddCategoryDialog.vue';

const settings = useSettingsStore();
const { notifySuccess } = useNotifier();
const showAddDialog = ref(false);

function removeCategory(index) {
  settings.removeCategory(index);
  notifySuccess('Катэгорыя выдалена');
}

function handleCategoryAdded() {
  showAddDialog.value = false;
}
</script>

