<template>
  <v-container class="category-admin">
    <header class="page-hero">
      <div>
        <p class="eyebrow">Адміністраванне · Малітвы</p>
        <h1>Катэгорыі і тэгі</h1>
        <p class="page-description">
          Кіруйце спісам катэгорый, які карыстальнікі бачаць у меню пры першым запуску.
        </p>
      </div>
      <v-btn
        color="primary"
        size="large"
        rounded="pill"
        prepend-icon="mdi-plus"
        class="hero-action text-none"
        @click="openCreateDialog"
      >
        Новая катэгорыя
      </v-btn>
    </header>

    <section class="summary-grid" aria-label="Зводка">
      <article class="summary-card">
        <span class="summary-icon"><v-icon icon="mdi-folder-outline" /></span>
        <div><strong>{{ categories.length }}</strong><span>Катэгорый</span></div>
      </article>
      <article class="summary-card">
        <span class="summary-icon"><v-icon icon="mdi-tag-multiple-outline" /></span>
        <div><strong>{{ tagStats.length }}</strong><span>Унікальных тэгаў</span></div>
      </article>
    </section>

    <v-card class="workspace-card" elevation="0">
      <div class="workspace-tabs">
        <v-tabs v-model="activeTab" color="primary" density="comfortable">
          <v-tab value="categories" class="text-none">
            <v-icon icon="mdi-folder-multiple-outline" start />Катэгорыі
          </v-tab>
          <v-tab value="tags" class="text-none">
            <v-icon icon="mdi-tag-multiple-outline" start />Тэгі
          </v-tab>
        </v-tabs>
      </div>

      <v-window v-model="activeTab" :touch="false">
        <v-window-item value="categories">
          <div class="workspace-toolbar">
            <v-select v-model="accessFilter" label="Доступ" :items="accessFilters" hide-details />
            <v-text-field
              v-model="categoryQuery"
              label="Пошук па назве або тэгу"
              prepend-inner-icon="mdi-magnify"
              clearable
              variant="outlined"
              density="comfortable"
              hide-details
              class="search-field"
            />
            <v-btn
              variant="text"
              rounded="pill"
              prepend-icon="mdi-restore"
              class="restore-button text-none"
              :loading="restoringDefaults"
              @click="restoreDefaults"
            >
              Аднавіць базавыя
            </v-btn>
          </div>

          <div v-if="categoriesLoading" class="state-panel">
            <v-progress-circular indeterminate color="primary" size="30" />
            <span>Загрузка катэгорый…</span>
          </div>
          <div v-else-if="categoriesError" class="state-panel state-panel--empty state-panel--error">
            <span class="empty-icon"><v-icon icon="mdi-alert-circle-outline" /></span>
            <strong>Не ўдалося загрузіць катэгорыі</strong>
            <span>{{ errorMessage(categoriesError, 'Праверце злучэнне і паспрабуйце яшчэ раз.') }}</span>
            <v-btn variant="tonal" rounded="pill" prepend-icon="mdi-refresh" class="text-none" @click="retryCategories">Паўтарыць</v-btn>
          </div>
          <div v-else-if="filteredCategories.length" class="category-list">
            <article v-for="category in filteredCategories" :key="category.id" class="category-item">
              <span class="category-icon"><CategoryIcon :icon-key="displayCategoryIconKey(category)" :size="24" /></span>
              <div class="category-main">
                <div class="category-title-row">
                  <h2>{{ category.name }}</h2>
                  <v-icon v-if="accessPolicy.categoryRestricted(category.id)" icon="mdi-key" size="small" aria-label="Толькі для святароў" />
                </div>
                <div class="tag-chips">
                  <span v-for="tag in category.tags" :key="tag">{{ tag }}</span>
                </div>
              </div>
              <v-btn icon="mdi-pencil" variant="text" :aria-label="`Рэдагаваць катэгорыю ${category.name}`" @click="openEditDialog(category)" />
              <v-btn
                icon="mdi-delete-outline"
                variant="text"
                color="error"
                :aria-label="`Выдаліць катэгорыю ${category.name}`"
                @click="categoryToDelete = category"
              />
            </article>
          </div>
          <div v-else class="state-panel state-panel--empty">
            <span class="empty-icon"><v-icon :icon="categoryQuery ? 'mdi-folder-search-outline' : 'mdi-folder-plus-outline'" /></span>
            <strong>{{ categoryQuery ? 'Катэгорыі не знойдзены' : 'Пакуль няма катэгорый' }}</strong>
            <span>{{ categoryQuery ? 'Паспрабуйце змяніць запыт.' : 'Стварыце першую катэгорыю або аднавіце базавыя.' }}</span>
          </div>
        </v-window-item>

        <v-window-item value="tags">
          <div class="workspace-toolbar workspace-toolbar--tags">
            <v-text-field
              v-model="tagQuery"
              label="Знайсці тэг"
              prepend-inner-icon="mdi-magnify"
              clearable
              variant="outlined"
              density="comfortable"
              hide-details
              class="search-field"
            />
            <p>Выдаленне тэга прыбярэ яго з усіх малітваў і катэгорый.</p>
          </div>

          <div v-if="prayersLoading" class="state-panel">
            <v-progress-circular indeterminate color="primary" size="30" />
            <span>Загрузка тэгаў…</span>
          </div>
          <div v-else-if="prayersError" class="state-panel state-panel--empty state-panel--error">
            <span class="empty-icon"><v-icon icon="mdi-alert-circle-outline" /></span>
            <strong>Не ўдалося загрузіць тэгі</strong>
            <span>{{ errorMessage(prayersError, 'Праверце злучэнне і абнавіце старонку.') }}</span>
          </div>
          <div v-else-if="filteredTagStats.length" class="tag-list">
            <article v-for="tag in filteredTagStats" :key="tag.name" class="tag-item">
              <span class="tag-icon"><v-icon icon="mdi-tag-outline" /></span>
              <div class="tag-main">
                <strong>{{ tag.name }}</strong>
                <span>
                  {{ pluralize(tag.prayerCount, 'малітва', 'малітвы', 'малітваў') }}
                  <template v-if="tag.categoryCount"> · {{ pluralize(tag.categoryCount, 'катэгорыя', 'катэгорыі', 'катэгорый') }}</template>
                </span>
              </div>
              <v-btn
                icon="mdi-delete-outline"
                variant="text"
                color="error"
                size="small"
                :aria-label="`Выдаліць тэг ${tag.name} з усіх малітваў`"
                @click="tagToDelete = tag"
              />
            </article>
          </div>
          <div v-else class="state-panel state-panel--empty">
            <span class="empty-icon"><v-icon icon="mdi-tag-search-outline" /></span>
            <strong>{{ tagQuery ? 'Тэгі не знойдзены' : 'Тэгаў пакуль няма' }}</strong>
            <span>{{ tagQuery ? 'Паспрабуйце змяніць запыт.' : 'Тэгі з’явяцца пасля дадання іх да малітваў або катэгорый.' }}</span>
          </div>
        </v-window-item>
      </v-window>
    </v-card>

    <v-dialog v-model="categoryDialogOpen" max-width="560" persistent>
      <v-card class="dialog-card">
        <v-card-title>{{ editingId ? 'Рэдагаванне катэгорыі' : 'Новая катэгорыя' }}</v-card-title>
        <v-card-subtitle>Катэгорыя стане часткай меню па змаўчанні для ўсіх карыстальнікаў.</v-card-subtitle>
        <v-form ref="categoryFormRef" @submit.prevent="saveCategory">
          <v-card-text class="dialog-fields">
            <v-switch v-model="categoryDraft.priestOnly" label="Толькі для святароў" color="primary" hide-details />
            <v-select v-model="categoryDraft.parentId" label="Бацькоўская катэгорыя" :items="parentOptions" item-title="name" item-value="id" clearable />
            <CategoryIconPicker :model-value="categoryDraft.iconKey" @update:model-value="pickIcon" />
            <v-text-field
              v-model="categoryDraft.name"
              label="Назва катэгорыі"
              variant="outlined"
              maxlength="80"
              counter="80"
              autofocus
              :rules="[value => Boolean(value?.trim()) || 'Увядзіце назву']"
            />
            <v-combobox
              v-model="categoryDraft.tags"
              :items="availableTagNames"
              label="Тэгі"
              hint="Можна выбраць існуючыя або ўвесці новыя"
              persistent-hint
              multiple
              chips
              closable-chips
              variant="outlined"
              :rules="[value => Boolean(value?.length) || 'Дадайце хаця б адзін тэг']"
            />
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn variant="text" class="text-none" :disabled="savingDialog" @click="closeCategoryDialog">Скасаваць</v-btn>
            <v-btn type="submit" color="primary" variant="flat" class="text-none" :loading="savingDialog">
              Захаваць
            </v-btn>
          </v-card-actions>
        </v-form>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="Boolean(categoryToDelete)" max-width="440" @update:model-value="!$event && (categoryToDelete = null)">
      <v-card class="dialog-card confirm-card">
        <v-card-title>Выдаліць катэгорыю?</v-card-title>
        <v-card-text>
          Катэгорыя «{{ categoryToDelete?.name }}» знікне ва ўсіх карыстальнікаў.
          Малітвы і іх тэгі застануцца без зменаў.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" class="text-none" @click="categoryToDelete = null">Скасаваць</v-btn>
          <v-btn color="error" variant="flat" class="text-none" :loading="deletingCategory" @click="removeCategory">Выдаліць</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="Boolean(tagToDelete)" max-width="480" @update:model-value="!$event && (tagToDelete = null)">
      <v-card class="dialog-card confirm-card">
        <v-card-title>Выдаліць тэг усюды?</v-card-title>
        <v-card-text>
          <p>Тэг «{{ tagToDelete?.name }}» будзе выдалены з {{ pluralize(tagToDelete?.prayerCount || 0, 'малітвы', 'малітваў', 'малітваў') }}.</p>
          <p v-if="tagToDelete?.categoryCount">Таксама зменяцца {{ pluralize(tagToDelete.categoryCount, 'катэгорыя', 'катэгорыі', 'катэгорый') }}. Катэгорыі без тэгаў будуць выдалены.</p>
          <strong>Гэта дзеянне нельга адмяніць.</strong>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" class="text-none" @click="tagToDelete = null">Скасаваць</v-btn>
          <v-btn color="error" variant="flat" class="text-none" :loading="deletingTag" @click="removeTag">Выдаліць усюды</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useNotifier } from '@/composables/useNotifier';
import { usePrayers } from '@/composables/usePrayers';
import { usePrayerCategoriesStore } from '@/stores/prayerCategories';
import { validateCategory } from '@/utils/validators';
import CategoryIcon from '@/components/prayers/CategoryIcon.vue';
import CategoryIconPicker from '@/components/prayers/CategoryIconPicker.vue';
import { DEFAULT_CATEGORY_ICON_KEY, displayCategoryIconKey, normalizeCategoryIconKey, suggestCategoryIconKey } from '@/constants/prayerCategoryIcons';
import { buildPrayerTagStats } from '@/utils/prayerCategoryAdmin';
import { updatePrayerCategory } from '@/services/prayerCategoryService';
import { prayerAccessPolicy } from '../../utils/priestPolicy.mjs';

const prayerCategories = usePrayerCategoriesStore();
const { categories, isLoading: categoriesLoading, error: categoriesError } = storeToRefs(prayerCategories);
const { prayers, isLoading: prayersLoading, error: prayersError, init: initPrayers } = usePrayers();
const { notifyError, notifySuccess } = useNotifier();

const activeTab = ref('categories');
const categoryQuery = ref('');
const editingId = ref(null);
const accessFilter = ref('all');
const accessFilters = [{ title: 'Усе', value: 'all' }, { title: 'Агульнадаступныя', value: 'public' }, { title: 'Толькі для святароў', value: 'priest' }];
const accessPolicy = computed(() => prayerAccessPolicy(prayers.value, categories.value));
const parentOptions = computed(() => categories.value.filter((c) => {
  let current = c;
  const seen = new Set();
  while (current) {
    if (current.id === editingId.value || seen.has(current.id)) return false;
    seen.add(current.id);
    current = categories.value.find((p) => p.id === current.parentId);
  }
  return true;
}));
const tagQuery = ref('');
const categoryDialogOpen = ref(false);
const categoryFormRef = ref(null);
const categoryDraft = ref(emptyCategory());
const categoryToDelete = ref(null);
const tagToDelete = ref(null);
const savingDialog = ref(false);
const deletingCategory = ref(false);
const deletingTag = ref(false);
const restoringDefaults = ref(false);

prayerCategories.init();
initPrayers();

const tagStats = computed(() => buildPrayerTagStats(prayers.value, categories.value));
const availableTagNames = computed(() => tagStats.value.map((tag) => tag.name));
const filteredCategories = computed(() => {
  const query = normalizeQuery(categoryQuery.value);
  return categories.value.filter((category) => (
    (accessFilter.value === 'all' || accessPolicy.value.categoryRestricted(category.id) === (accessFilter.value === 'priest'))
    && (!query || normalizeQuery(category.name).includes(query)
    || category.tags.some((tag) => normalizeQuery(tag).includes(query)))
  ));
});
const filteredTagStats = computed(() => {
  const query = normalizeQuery(tagQuery.value);
  if (!query) return tagStats.value;
  return tagStats.value.filter((tag) => normalizeQuery(tag.name).includes(query));
});

function emptyCategory() {
  return { name: '', tags: [], priestOnly: false, parentId: null, iconKey: DEFAULT_CATEGORY_ICON_KEY };
}

const iconPicked = ref(false);
function pickIcon(key) { categoryDraft.value.iconKey = key; iconPicked.value = true; }
// For a new category the suggested icon follows the name/tags until the admin picks one.
watch(() => [categoryDraft.value.name, (categoryDraft.value.tags || []).join('|')], () => {
  if (editingId.value || iconPicked.value || !categoryDialogOpen.value) return;
  const { name, tags } = categoryDraft.value;
  categoryDraft.value.iconKey = name.trim() || tags.length ? suggestCategoryIconKey({ name, tags }) : DEFAULT_CATEGORY_ICON_KEY;
});

function normalizeQuery(value) {
  return String(value || '').trim().toLocaleLowerCase('be');
}

function normalizedDraft() {
  return {
    name: categoryDraft.value.name.trim(),
    priestOnly: categoryDraft.value.priestOnly === true,
    parentId: categoryDraft.value.parentId || null,
    iconKey: normalizeCategoryIconKey(categoryDraft.value.iconKey) || undefined,
    order: categoryDraft.value.order,
    tags: [...new Set(categoryDraft.value.tags.map((tag) => String(tag).trim()).filter(Boolean))],
  };
}

function errorMessage(error, fallback) {
  return error?.message || fallback;
}

function openCreateDialog() {
  editingId.value = null;
  iconPicked.value = false;
  categoryDraft.value = emptyCategory();
  categoryDialogOpen.value = true;
}

function closeCategoryDialog() {
  categoryDialogOpen.value = false;
  categoryDraft.value = emptyCategory();
  categoryFormRef.value?.resetValidation();
}

function openEditDialog(category) {
  editingId.value = category.id;
  categoryDraft.value = { ...category, tags: [...category.tags], priestOnly: category.priestOnly === true, iconKey: displayCategoryIconKey(category) };
  iconPicked.value = true;
  categoryDialogOpen.value = true;
}

function retryCategories() {
  prayerCategories.cleanup();
  prayerCategories.init();
}

async function saveCategory() {
  if (savingDialog.value) return;
  const formValidation = await categoryFormRef.value?.validate();
  const category = normalizedDraft();
  const validation = validateCategory(category);
  if (formValidation && !formValidation.valid) return;
  if (validation !== true) return notifyError(validation);

  const duplicate = categories.value.some((item) => (
    item.id !== editingId.value && item.name.localeCompare(category.name, 'be', { sensitivity: 'base' }) === 0
  ));
  if (duplicate) return notifyError('Катэгорыя з такой назвай ужо існуе');

  savingDialog.value = true;
  try {
    if (editingId.value) await updatePrayerCategory(editingId.value, category);
    else await prayerCategories.addCategory(category);
    notifySuccess('Катэгорыя захавана');
    closeCategoryDialog();
  } catch (error) {
    notifyError(errorMessage(error, 'Не ўдалося захаваць катэгорыю'));
  } finally {
    savingDialog.value = false;
  }
}

async function removeCategory() {
  if (!categoryToDelete.value || deletingCategory.value) return;
  deletingCategory.value = true;
  try {
    await prayerCategories.removeCategory(categoryToDelete.value.id);
    categoryToDelete.value = null;
    notifySuccess('Катэгорыя выдалена');
  } catch (error) {
    notifyError(errorMessage(error, 'Не ўдалося выдаліць катэгорыю'));
  } finally {
    deletingCategory.value = false;
  }
}

async function restoreDefaults() {
  if (restoringDefaults.value) return;
  restoringDefaults.value = true;
  try {
    const restored = await prayerCategories.restoreDefaults();
    notifySuccess(restored ? `Адноўлена катэгорый: ${restored}` : 'Усе базавыя катэгорыі ўжо ёсць');
  } catch (error) {
    notifyError(errorMessage(error, 'Не ўдалося аднавіць базавыя катэгорыі'));
  } finally {
    restoringDefaults.value = false;
  }
}

async function removeTag() {
  if (!tagToDelete.value || deletingTag.value) return;
  deletingTag.value = true;
  try {
    const result = await prayerCategories.removeTagEverywhere(tagToDelete.value.name, prayers.value);
    tagToDelete.value = null;
    notifySuccess(`Тэг выдалены з малітваў: ${result.prayers}`);
  } catch (error) {
    notifyError(errorMessage(error, 'Не ўдалося выдаліць тэг'));
  } finally {
    deletingTag.value = false;
  }
}

function pluralize(count, one, few, many) {
  const absolute = Math.abs(count) % 100;
  const last = absolute % 10;
  const word = absolute > 10 && absolute < 20 ? many : last === 1 ? one : last >= 2 && last <= 4 ? few : many;
  return `${count} ${word}`;
}
</script>

<style scoped>
.category-admin { width: min(100%, 980px); padding: 38px 22px 80px !important; color: var(--nav-on-surface); }
.page-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 28px; margin: 0 4px 26px; }
.eyebrow { margin: 0 0 8px; color: var(--chrome-accent); font-size: .72rem; font-weight: 800; letter-spacing: .11em; text-transform: uppercase; }
.page-hero h1 { margin: 0 0 10px; font-family: var(--reader-display-font-family); font-size: clamp(2rem, 6vw, 2.7rem); line-height: 1.04; letter-spacing: -.025em; }
.page-description { max-width: 660px; margin: 0; color: var(--nav-muted); font-size: .95rem; line-height: 1.55; }
.hero-action { flex: 0 0 auto; }
.summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px; }
.summary-card { display: flex; align-items: center; gap: 13px; min-width: 0; padding: 16px 18px; border: 1px solid var(--nav-border); border-radius: 18px; background: var(--nav-surface); box-shadow: 0 4px 16px var(--nav-button-shadow); }
.summary-icon, .category-icon, .tag-icon, .empty-icon { display: grid; place-items: center; flex: 0 0 auto; border-radius: 13px; background: var(--nav-active); color: var(--chrome-accent); }
.summary-icon { width: 42px; height: 42px; }
.summary-card div { display: grid; min-width: 0; }
.summary-card strong { font-size: 1.22rem; line-height: 1.1; }
.summary-card div span { overflow: hidden; color: var(--nav-muted); font-size: .76rem; text-overflow: ellipsis; white-space: nowrap; }
.workspace-card { overflow: hidden; border: 1px solid var(--nav-border); border-radius: 24px; background: var(--nav-surface); color: var(--nav-on-surface); box-shadow: 0 8px 28px var(--nav-button-shadow); }
.workspace-tabs { padding-inline: 14px; border-bottom: 1px solid var(--nav-border); }
.workspace-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 18px 20px; border-bottom: 1px solid var(--nav-border); }
.search-field { max-width: 430px; }
.restore-button { color: var(--nav-muted); }
.workspace-toolbar--tags p { max-width: 370px; margin: 0; color: var(--nav-muted); font-size: .78rem; line-height: 1.4; text-align: right; }
.category-list { padding: 0 20px 8px; }
.category-item { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 18px; min-height: 88px; border-bottom: 1px solid var(--nav-border); }
.category-item:last-child { border-bottom: 0; }
.category-icon { width: 44px; height: 44px; }
.category-main { min-width: 0; }
.category-title-row { display: flex; align-items: center; gap: 9px; }
.category-title-row h2 { overflow: hidden; margin: 0; font-size: .98rem; font-weight: 750; text-overflow: ellipsis; white-space: nowrap; }
.tag-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
.tag-chips span { padding: 3px 7px; border: 1px solid var(--nav-border); border-radius: 8px; color: var(--nav-muted); font-size: .7rem; line-height: 1.2; }
.state-panel { display: flex; align-items: center; justify-content: center; gap: 12px; min-height: 220px; color: var(--nav-muted); }
.state-panel--empty { flex-direction: column; text-align: center; }
.state-panel--empty strong { color: var(--nav-on-surface); }
.state-panel--empty > span:last-child { font-size: .82rem; }
.state-panel--error strong { color: rgb(var(--v-theme-error)); }
.empty-icon { width: 54px; height: 54px; margin-bottom: 4px; font-size: 1.55rem; }
.tag-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 18px 20px 22px; }
.tag-item { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 11px; min-width: 0; min-height: 68px; padding: 10px 10px 10px 13px; border: 1px solid var(--nav-border); border-radius: 16px; background: var(--nav-active); }
.tag-icon { width: 36px; height: 36px; }
.tag-main { display: grid; min-width: 0; gap: 3px; }
.tag-main strong { overflow: hidden; font-size: .87rem; text-overflow: ellipsis; white-space: nowrap; }
.tag-main span { color: var(--nav-muted); font-size: .71rem; }
.dialog-card { overflow: hidden; border: 1px solid var(--nav-border); border-radius: 24px !important; background: var(--overlay-surface); color: var(--nav-on-surface); }
.dialog-card :deep(.v-card-title) { padding: 22px 24px 5px; font-family: var(--reader-display-font-family); font-size: 1.32rem; font-weight: 750; }
.dialog-card :deep(.v-card-subtitle) { padding: 0 24px 18px; color: var(--nav-muted); opacity: 1; }
.dialog-fields { display: grid; gap: 5px; padding: 8px 24px 10px !important; }
.dialog-card :deep(.v-card-actions) { padding: 14px 18px 18px; }
.confirm-card :deep(.v-card-text) { color: var(--nav-muted); line-height: 1.55; }
.confirm-card :deep(.v-card-text p) { margin: 0 0 10px; }
.confirm-card :deep(.v-card-text strong) { color: rgb(var(--v-theme-error)); }
@media (max-width: 720px) {
  .category-admin { padding: 26px 14px 60px !important; }
  .page-hero { align-items: stretch; flex-direction: column; gap: 18px; }
  .hero-action { align-self: flex-start; }
  .summary-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
  .summary-card { justify-content: center; padding: 13px 8px; text-align: center; }
  .summary-icon { display: none; }
  .summary-card div span { font-size: .66rem; }
  .workspace-toolbar { align-items: stretch; flex-direction: column; }
  .search-field { max-width: none; }
  .restore-button { align-self: flex-start; }
  .workspace-toolbar--tags p { max-width: none; text-align: left; }
  .category-item { grid-template-columns: auto minmax(0, 1fr) auto; padding-block: 14px; }
  .tag-list { grid-template-columns: 1fr; }
}
@media (max-width: 430px) {
  .page-hero h1 { font-size: 2rem; }
  .hero-action { width: 100%; }
  .summary-card strong { font-size: 1.05rem; }
  .category-list { padding-inline: 14px; }
  .category-item { gap: 10px; }
  .category-icon { width: 38px; height: 38px; }
  .tag-list { padding-inline: 14px; }
}
</style>
