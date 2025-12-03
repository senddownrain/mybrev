<template>
  <v-container class="settings-container">
    <h1 class="text-h4 font-weight-light mb-4">Налады</h1>

    <v-list lines="two" subheader>
      <v-list-subheader>Знешні выгляд</v-list-subheader>

      <v-list-item title="Цёмная тэма">
        <template v-slot:prepend><v-icon>mdi-theme-light-dark</v-icon></template>
        <template v-slot:append>
          <v-switch
            :model-value="settings.currentTheme === 'dark'"
            @update:model-value="settings.setTheme"
            inset color="primary" hide-details
          ></v-switch>
        </template>
      </v-list-item>

      <v-list-item title="Налады тэксту" prepend-icon="mdi-format-font" @click="openTextSettings">
        <template v-slot:append>
          <v-icon>mdi-chevron-right</v-icon>
        </template>
      </v-list-item>

    </v-list>

    <v-card class="mt-6" variant="outlined">
      <v-card-title class="text-subtitle-1">Прыклад тэксту</v-card-title>
      <v-card-text class="prayer-content-area">
        <p>
          <strong>Псалом 1</strong>
        </p>
        <p>
          Шчаслівы чалавек, які не ходзіць па радзе бязбожных,<br>
          і не стаіць на дарозе грэшных,<br>
          і не сядзіць у сябраванні насмешнікаў,
        </p>
        <p>
          але захапляецца законам Пана<br>
          і разважае над ім днём і ноччу.
        </p>
        <p>
          Ён падобны да дрэва, пасаджанага ля патокаў вады,<br>
          якое дае плод у свой час<br>
          і лісце яго не вяніе;<br>
          усё, што ён робіць, паспяховае.
        </p>
      </v-card-text>
    </v-card>

    <v-list lines="two" subheader class="mt-6">
      <v-list-subheader>Катэгорыі малітваў</v-list-subheader>
      
      <v-list-item
        v-for="(category, index) in settings.menuCategories"
        :key="index"
      >
        <v-list-item-title>{{ category.name }}</v-list-item-title>
        <v-list-item-subtitle>
          Фільтр па тэгах: {{ category.tags.join(', ') }}
        </v-list-item-subtitle>
        
        <template v-slot:append>
          <v-btn
            icon="mdi-delete"
            variant="text"
            size="small"
            color="error"
            @click="removeCategory(index)"
          ></v-btn>
        </template>
      </v-list-item>

      <v-list-item>
        <v-list-item-title>
          <v-btn
            color="primary"
            variant="outlined"
            block
            @click="showAddCategoryDialog = true"
          >
            Дадаць катэгорыю
          </v-btn>
        </v-list-item-title>
      </v-list-item>
    </v-list>

    <AddCategoryDialog
      v-model="showAddCategoryDialog"
      @category-added="showAddCategoryDialog = false"
    />
  </v-container>
</template>

<script setup>
import { ref } from 'vue';
import { useSettingsStore } from '@/stores/settings.js';
import { useAppBar } from '@/composables/useAppBar.js';
import { useNotifier } from '@/composables/useNotifier';
import AddCategoryDialog from '@/components/prayers/AddCategoryDialog.vue';

const settings = useSettingsStore();
const { toggleSettingsSheet } = useAppBar();
const { notifySuccess } = useNotifier();
const showAddCategoryDialog = ref(false);

const openTextSettings = () => {
  toggleSettingsSheet();
};

function removeCategory(index) {
  settings.removeCategory(index);
  notifySuccess('Катэгорыя выдалена');
}
</script>

<style scoped>
@media (max-width: 600px) {
  .settings-container {
    padding: 8px 12px !important;
  }

  .settings-container h1 {
    font-size: 1.4rem !important;
    margin-bottom: 16px !important;
  }

  .v-list-item {
    padding: 12px 8px !important;
  }

  .v-card {
    margin-top: 16px !important;
  }
}
</style>