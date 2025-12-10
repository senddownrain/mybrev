<template>
  <v-container class="settings-container">
    <h1 class="text-h4 font-weight-light mb-4">Налады</h1>

    <v-list lines="two" subheader>
      <v-list-subheader>Агульныя налады</v-list-subheader>

      <v-list-item>
        <template v-slot:prepend>
          <v-icon>mdi-lightbulb-outline</v-icon>
        </template>
        <v-list-item-title>Не выключаць экран</v-list-item-title>
        <v-list-item-subtitle>Карысна падчас малітвы або чытання</v-list-item-subtitle>
        <template v-slot:append>
          <v-switch
            :model-value="settings.keepScreenOn"
            @update:model-value="settings.setKeepScreenOn"
            inset
            color="primary"
            hide-details
          ></v-switch>
        </template>
      </v-list-item>

      <v-divider class="my-2"></v-divider>

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

      <v-divider class="my-2"></v-divider>

      <v-list-subheader>Шрыфт праграмы</v-list-subheader>

      <v-list-item>
        <template v-slot:prepend>
          <v-icon>mdi-format-font</v-icon>
        </template>
        <v-list-item-title>Абярыце асноўны шрыфт для інтэрфейсу</v-list-item-title>
      </v-list-item>

      <div class="px-4 pb-2">
        <v-chip-group 
          :model-value="settings.fontFamily" 
          @update:model-value="settings.setFontFamily"
          mandatory
          column
        >
          <v-chip 
            v-for="font in fontOptions" 
            :key="font.value" 
            :value="font.value" 
            variant="outlined" 
            class="ma-1"
            :style="{ fontFamily: font.value }"
            :color="font.value === settings.fontFamily ? 'primary' : undefined"
          >
            <v-icon v-if="font.value === settings.fontFamily" start size="small">mdi-check</v-icon>
            {{ font.title }}
          </v-chip>
        </v-chip-group>
      </div>

      <v-divider class="my-2"></v-divider>

      <v-list-item>
        <template v-slot:prepend>
          <v-icon>mdi-format-font-size-increase</v-icon>
        </template>
        <v-list-item-title>Памер тэксту</v-list-item-title>
        <v-list-item-subtitle>Наладзьце памер шрыфту для чытання</v-list-item-subtitle>
        <template v-slot:append>
          <div class="d-flex align-center">
            <v-btn 
              icon="mdi-minus" 
              variant="text" 
              size="small" 
              @click="settings.decreaseFontSize" 
              :disabled="settings.fontSizeMultiplier <= 0.7"
            ></v-btn>
            <span class="mx-2 font-weight-bold" style="width: 60px; text-align: center;">
              {{ Math.round(settings.fontSizeMultiplier * 100) }}%
            </span>
            <v-btn 
              icon="mdi-plus" 
              variant="text" 
              size="small" 
              @click="settings.increaseFontSize" 
              :disabled="settings.fontSizeMultiplier >= 1.8"
            ></v-btn>
          </div>
        </template>
      </v-list-item>

    </v-list>

    <v-card class="mt-6" variant="outlined">
      <v-card-title class="text-subtitle-1">Прыклад тэксту</v-card-title>
      <v-card-text 
        class="prayer-content-area"
        :style="{ 
          fontFamily: settings.fontFamily,
          fontSize: `${settings.fontSizeMultiplier}em`
        }"
      >
        <p>
          Так будзе выглядаць асноўны тэкст вашай нататкі.
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
import { useNotifier } from '@/composables/useNotifier';
import AddCategoryDialog from '@/components/prayers/AddCategoryDialog.vue';
import { SYSTEM_FONT } from '@/constants/fonts';

const settings = useSettingsStore();
const { notifySuccess } = useNotifier();
const showAddCategoryDialog = ref(false);

const fontOptions = [
  { title: 'Сістэмны', value: SYSTEM_FONT },
  { title: 'Kurale', value: 'Kurale, serif' },
  { title: 'Old Standard TT', value: "'Old Standard TT', serif" },
  { title: 'Pacifico', value: 'Pacifico, cursive' },
  { title: 'Comfortaa', value: 'Comfortaa, sans-serif' },
  { title: 'Yeseva One', value: "'Yeseva One', cursive" },
];

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