<template>
  <v-container class="settings-page">
    <header class="settings-hero">
      <div class="settings-eyebrow">Праграма</div>
      <h1>Налады</h1>
      <p>Наладзьце экран і выгляд тэксту так, каб маліцца і чытаць было зручна.</p>
    </header>

    <section class="settings-section" aria-labelledby="general-title">
      <div class="section-heading">
        <span class="section-icon"><PhSlidersHorizontal :size="21" /></span>
        <div><h2 id="general-title">Агульныя</h2><p>Паводзіны праграмы і экрана</p></div>
      </div>
      <div class="setting-row">
        <div class="setting-copy"><strong>Не выключаць экран</strong><span>Карысна падчас малітвы або доўгага чытання</span></div>
        <v-switch :model-value="settings.keepScreenOn" color="primary" hide-details inset aria-label="Не выключаць экран" @update:model-value="settings.setKeepScreenOn" />
      </div>
      <div class="setting-row">
        <div class="setting-copy"><strong>Цёмная тэма</strong><span>Прыглушаны выгляд для вечара і ночы</span></div>
        <v-switch :model-value="settings.currentTheme === 'dark'" color="primary" hide-details inset aria-label="Цёмная тэма" @update:model-value="settings.setTheme" />
      </div>
    </section>

    <section class="settings-section" aria-labelledby="text-title">
      <div class="section-heading">
        <span class="section-icon"><PhTextAa :size="22" /></span>
        <div><h2 id="text-title">Тэкст</h2><p>Шрыфт і памер для чытання</p></div>
      </div>
      <div class="font-picker">
        <span class="control-label">Шрыфт чытання</span>
        <div class="font-options" role="radiogroup" aria-label="Шрыфт чытання">
          <button v-for="font in fontOptions" :key="font.value" type="button" role="radio"
            :aria-checked="font.value === settings.fontFamily"
            :class="{ 'font-option--active': font.value === settings.fontFamily }"
            :style="{ fontFamily: font.value }" @click="settings.setFontFamily(font.value)">
            {{ font.title }}<PhCheck v-if="font.value === settings.fontFamily" :size="16" weight="bold" />
          </button>
        </div>
      </div>
      <div class="text-size-control">
        <div class="setting-copy"><strong>Памер тэксту</strong><span>Змяняецца з крокам у 10%</span></div>
        <div class="stepper" aria-label="Памер тэксту">
          <button type="button" aria-label="Паменшыць тэкст" :disabled="settings.fontSizeMultiplier <= 0.7" @click="settings.decreaseFontSize"><PhMinus :size="18" weight="bold" /></button>
          <strong>{{ Math.round(settings.fontSizeMultiplier * 100) }}%</strong>
          <button type="button" aria-label="Павялічыць тэкст" :disabled="settings.fontSizeMultiplier >= 1.8" @click="settings.increaseFontSize"><PhPlus :size="18" weight="bold" /></button>
        </div>
      </div>
      <div class="text-preview" :style="{ fontFamily: settings.fontFamily, fontSize: `${settings.fontSizeMultiplier}em` }">
        <span>Прыклад</span><p>Божа, прыйдзі мне на дапамогу. Пане, паспяшы да мяне на паратунак.</p>
      </div>
    </section>

    <section class="settings-section" aria-labelledby="categories-title">
      <div class="section-heading">
        <span class="section-icon"><PhFolders :size="22" /></span>
        <div><h2 id="categories-title">Катэгорыі ў меню</h2><p>Ваш асабісты спіс катэгорый малітваў</p></div>
      </div>
      <div v-if="visibleCategories.length" class="category-list">
        <div v-for="category in visibleCategories" :key="category.key" class="category-row">
          <div class="category-copy">
            <div class="category-title-line">
              <strong>{{ category.name }}</strong>
              <span v-if="category.scope === 'global'" class="global-badge">Па змаўчанні</span>
            </div>
            <span>{{ category.tags.join(' · ') }}</span>
          </div>
          <button type="button" class="delete-button" :aria-label="`Прыбраць катэгорыю ${category.name} з меню`" @click="removeCategory(category)"><PhTrash :size="19" /></button>
        </div>
      </div>
      <p v-else class="categories-empty">У меню няма катэгорый.</p>
      <button v-if="settings.hiddenGlobalPrayerCategoryIds.length" type="button" class="restore-categories-button" @click="restoreGlobalCategories">
        Аднавіць катэгорыі па змаўчанні
      </button>
      <button type="button" class="add-category-button" @click="showAddCategoryDialog = true"><PhPlus :size="19" weight="bold" />Дадаць катэгорыю</button>
    </section>

    <AddCategoryDialog v-model="showAddCategoryDialog" @category-added="showAddCategoryDialog = false" />
  </v-container>
</template>

<script setup>
import { computed, ref } from 'vue';
import { PhCheck, PhFolders, PhMinus, PhPlus, PhSlidersHorizontal, PhTextAa, PhTrash } from '@phosphor-icons/vue';
import { useSettingsStore } from '@/stores/settings.js';
import { usePrayerCategoriesStore } from '@/stores/prayerCategories.js';
import { buildPrayerCategoryMenu } from '@/utils/prayerCategoryMenu.js';
import { useNotifier } from '@/composables/useNotifier';
import AddCategoryDialog from '@/components/prayers/AddCategoryDialog.vue';
import { READER_FONT_OPTIONS } from '@/constants/fonts';

const settings = useSettingsStore();
const prayerCategories = usePrayerCategoriesStore();
const { notifySuccess } = useNotifier();
const showAddCategoryDialog = ref(false);
const fontOptions = READER_FONT_OPTIONS;
prayerCategories.init();

const visibleCategories = computed(() => {
  return buildPrayerCategoryMenu(
    prayerCategories.categories,
    settings.personalPrayerCategories,
    settings.hiddenGlobalPrayerCategoryIds,
  );
});

function removeCategory(category) {
  if (category.scope === 'global') {
    settings.hideGlobalPrayerCategory(category.id);
    notifySuccess('Катэгорыя схавана толькі для вас');
    return;
  }
  settings.removeCategory(category.personalIndex);
  notifySuccess('Катэгорыя выдалена');
}

function restoreGlobalCategories() {
  settings.restoreGlobalPrayerCategories();
  notifySuccess('Катэгорыі па змаўчанні адноўлены');
}
</script>

<style scoped>
.settings-page { width: min(100%, 780px); padding: 10px 18px 48px; }
.settings-hero { padding: 8px 4px 20px; }
.settings-eyebrow, .control-label, .text-preview > span { color: var(--nav-muted); font-size: .7rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
.settings-eyebrow { color: var(--chrome-accent); }
.settings-hero h1 { margin: 5px 0 8px; color: var(--nav-on-surface); font-size: clamp(2rem, 9vw, 2.7rem); font-family: var(--reader-display-font-family); font-weight: 750; line-height: 1.02; letter-spacing: -.025em; }
.settings-hero p { max-width: 620px; margin: 0; color: var(--nav-muted); font-size: .98rem; line-height: 1.55; }
.settings-section { margin-bottom: 14px; overflow: hidden; border: 1px solid var(--nav-border); border-radius: 24px; background: var(--nav-surface); box-shadow: 0 5px 20px var(--nav-button-shadow); }
.section-heading { display: flex; align-items: center; gap: 12px; padding: 18px 20px 14px; }
.section-icon { display: grid; flex: 0 0 42px; width: 42px; height: 42px; place-items: center; border: 1px solid rgba(var(--chrome-accent-rgb), .16); border-radius: 14px; background: rgba(var(--chrome-accent-rgb), .09); color: var(--chrome-accent); }
.section-heading h2 { margin: 0; color: var(--nav-on-surface); font-size: 1rem; font-weight: 780; letter-spacing: -.01em; }
.section-heading p { margin: 2px 0 0; color: var(--nav-muted); font-size: .78rem; line-height: 1.35; }
.setting-row, .text-size-control, .category-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 70px; margin-inline: 20px; border-top: 1px solid var(--nav-border); }
.setting-copy, .category-copy { display: grid; min-width: 0; gap: 3px; }
.category-title-line { display: flex; align-items: center; gap: 7px; min-width: 0; }
.setting-copy strong, .category-copy strong { color: var(--nav-on-surface); font-size: .9rem; font-weight: 720; }
.setting-copy span, .category-copy span { overflow-wrap: anywhere; color: var(--nav-muted); font-size: .76rem; line-height: 1.4; }
.setting-row :deep(.v-switch) { flex: 0 0 auto; }
.font-picker { padding: 4px 20px 20px; border-top: 1px solid var(--nav-border); }
.control-label { display: block; margin: 15px 0 11px; }
.font-options { display: flex; flex-wrap: wrap; gap: 8px; }
.font-options button, .stepper button, .delete-button, .add-category-button { border: 0; font: inherit; cursor: pointer; }
.font-options button { display: flex; align-items: center; gap: 6px; min-height: 38px; padding: 8px 13px; border: 1px solid var(--nav-border); border-radius: 13px; background: transparent; color: var(--nav-muted); font-size: .8rem; transition: background .18s ease, color .18s ease, transform .16s ease; }
.font-options button:active, .stepper button:active, .add-category-button:active { transform: scale(.97); }
.font-options .font-option--active { border-color: rgba(var(--chrome-accent-rgb), .24); background: rgba(var(--chrome-accent-rgb), .11); color: var(--chrome-accent); }
.text-size-control { padding-block: 14px; }
.stepper { display: grid; flex: 0 0 auto; grid-template-columns: 38px 60px 38px; align-items: center; padding: 3px; border-radius: 15px; background: var(--nav-active); text-align: center; }
.stepper button { display: grid; width: 38px; height: 38px; place-items: center; border-radius: 12px; background: var(--nav-surface); color: var(--nav-on-surface); }
.stepper button:disabled { opacity: .35; cursor: default; }
.stepper strong { color: var(--nav-on-surface); font-size: .8rem; }
.text-preview { margin: 4px 20px 20px; padding: 17px 18px; border-radius: 17px; background: var(--nav-active); color: var(--nav-on-surface); }
.text-preview > span { display: block; margin-bottom: 8px; font-family: var(--ui-font-family); }
.text-preview p { margin: 0; line-height: 1.65; }
.text-preview p { font-optical-sizing: auto; }
.category-row { min-height: 64px; }
.global-badge { padding: 3px 7px; border-radius: 99px; background: var(--nav-active); color: var(--chrome-accent) !important; font-size: .62rem !important; font-weight: 750; white-space: nowrap; }
.categories-empty { margin: 8px 20px 0; padding: 14px 0; border-top: 1px solid var(--nav-border); color: var(--nav-muted); font-size: .8rem; text-align: center; }
.delete-button { display: grid; flex: 0 0 40px; width: 40px; height: 40px; place-items: center; border-radius: 13px; background: transparent; color: var(--rubric-color); transition: background .18s ease; }
.delete-button:hover { background: rgba(var(--v-theme-error), .08); }
.restore-categories-button { display: block; margin: 12px auto 0; border: 0; background: transparent; color: var(--chrome-accent); font: inherit; font-size: .76rem; font-weight: 720; cursor: pointer; }
.add-category-button { display: flex; align-items: center; justify-content: center; gap: 8px; width: calc(100% - 40px); min-height: 48px; margin: 14px 20px 20px; border-radius: 16px; background: var(--nav-active); color: var(--nav-on-surface); font-size: .86rem; font-weight: 750; transition: transform .16s ease; }
@media (max-width: 560px) {
  .settings-page { padding-inline: 14px !important; padding-bottom: 36px !important; }
  .settings-hero { padding-inline: 4px; }
  .settings-section { border-radius: 22px; }
  .section-heading { padding-inline: 16px; }
  .setting-row, .text-size-control, .category-row { margin-inline: 16px; }
  .font-picker { padding-inline: 16px; }
  .text-size-control { align-items: flex-start; flex-direction: column; }
  .stepper { width: 100%; grid-template-columns: 42px 1fr 42px; }
  .stepper button { width: 42px; }
  .text-preview { margin-inline: 16px; }
  .add-category-button { width: calc(100% - 32px); margin-inline: 16px; }
}
</style>
