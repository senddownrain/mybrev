<template>
  <v-container class="categories-page">
    <header class="categories-page__header">
      <p>Адміністраванне</p>
      <h1>Катэгорыі малітваў</h1>
      <span>Катэгорыя аб’ядноўвае адзін або некалькі тэгаў. Адзначаныя па змаўчанні тэгі дадаюцца да кожнай новай малітвы.</span>
    </header>

    <v-card class="categories-card" elevation="0">
      <div class="categories-card__heading">
        <div><h2>Даступныя катэгорыі</h2><p>{{ settings.menuCategories.length }} катэгорый · {{ availableTags.length }} тэгаў</p></div>
      </div>

      <div v-if="settings.menuCategories.length" class="categories-list">
        <div v-for="(category, index) in settings.menuCategories" :key="category.name" class="category-row">
          <v-checkbox-btn
            :model-value="settings.defaultPrayerCategoryNames.includes(category.name)"
            :aria-label="`Дадаваць катэгорыю ${category.name} па змаўчанні`"
            color="primary"
            @update:model-value="settings.setDefaultPrayerCategory(category.name, $event)"
          />
          <div class="category-row__copy"><strong>{{ category.name }}</strong><span>{{ category.tags.join(' · ') }}</span></div>
          <span v-if="settings.defaultPrayerCategoryNames.includes(category.name)" class="default-badge">Па змаўчанні</span>
          <v-btn icon="mdi-delete-outline" variant="text" color="error" :aria-label="`Выдаліць катэгорыю ${category.name}`" @click="removeCategory(index)" />
        </div>
      </div>
      <p v-else class="empty-message">Пакуль няма катэгорый.</p>
    </v-card>

    <v-card class="categories-card" elevation="0">
      <div class="categories-card__heading"><div><h2>Дадаць катэгорыю</h2><p>Выберыце існуючыя тэгі або ўвядзіце новыя.</p></div></div>
      <v-form class="category-form" @submit.prevent="addCategory">
        <v-text-field v-model="newCategory.name" label="Назва катэгорыі" variant="outlined" />
        <v-combobox v-model="newCategory.tags" :items="availableTags" label="Тэгі" multiple chips closable-chips variant="outlined" />
        <v-btn type="submit" color="primary" rounded="pill" class="text-none" prepend-icon="mdi-plus">Дадаць катэгорыю</v-btn>
      </v-form>
    </v-card>
  </v-container>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useNotifier } from '@/composables/useNotifier';
import { usePrayers } from '@/composables/usePrayers';
import { useSettingsStore } from '@/stores/settings';
import { validateCategory } from '@/utils/validators';

const settings = useSettingsStore();
const { allTags } = usePrayers();
const { notifyError, notifySuccess } = useNotifier();
const newCategory = ref({ name: '', tags: [] });
const availableTags = computed(() => [...new Set(allTags.value)].sort((a, b) => a.localeCompare(b, 'be')));

function addCategory() {
  const category = { name: newCategory.value.name.trim(), tags: [...new Set(newCategory.value.tags.map((tag) => String(tag).trim()).filter(Boolean))] };
  const validation = validateCategory(category);
  if (validation !== true) return notifyError(validation);
  if (settings.menuCategories.some((item) => item.name.toLocaleLowerCase('be') === category.name.toLocaleLowerCase('be'))) {
    return notifyError('Катэгорыя з такой назвай ужо існуе');
  }
  settings.addCategory(category);
  newCategory.value = { name: '', tags: [] };
  notifySuccess('Катэгорыя дададзена');
}

function removeCategory(index) {
  settings.removeCategory(index);
  notifySuccess('Катэгорыя выдалена');
}
</script>

<style scoped>
.categories-page { width: min(100%, 780px); padding: 34px 20px 72px !important; }
.categories-page__header { margin: 0 4px 24px; }
.categories-page__header p { margin: 0 0 8px; color: var(--chrome-accent); font-size: .72rem; font-weight: 800; letter-spacing: .11em; text-transform: uppercase; }
.categories-page__header h1 { margin: 0 0 9px; color: var(--nav-on-surface); font-family: var(--reader-display-font-family); font-size: clamp(1.9rem, 7vw, 2.5rem); line-height: 1.05; }
.categories-page__header span { color: var(--nav-muted); line-height: 1.5; }
.categories-card { margin-bottom: 16px; padding: 20px; border: 1px solid var(--nav-border); border-radius: 22px; background: var(--nav-surface); }
.categories-card__heading h2 { margin: 0; color: var(--nav-on-surface); font-size: 1.08rem; }
.categories-card__heading p, .empty-message { margin: 5px 0 0; color: var(--nav-muted); font-size: .84rem; }
.categories-list { margin-top: 16px; border-top: 1px solid var(--nav-border); }
.category-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 10px; min-height: 68px; border-bottom: 1px solid var(--nav-border); }
.category-row__copy { display: grid; gap: 3px; min-width: 0; }
.category-row__copy strong { color: var(--nav-on-surface); }
.category-row__copy span { overflow-wrap: anywhere; color: var(--nav-muted); font-size: .8rem; }
.default-badge { padding: 4px 8px; border-radius: 99px; background: var(--nav-active); color: var(--chrome-accent); font-size: .69rem; font-weight: 750; white-space: nowrap; }
.category-form { display: grid; gap: 6px; margin-top: 18px; }
@media (max-width: 520px) { .categories-page { padding-inline: 14px !important; } .categories-card { padding: 16px; } .default-badge { display: none; } }
</style>
