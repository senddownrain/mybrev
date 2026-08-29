<template>
  <v-container class="categories-page">
    <header class="categories-page__header">
      <p>Адміністраванне</p>
      <h1>Катэгорыі і тэгі малітваў</h1>
      <span>Глабальныя катэгорыі захоўваюцца ў базе і бачныя ўсім. Асабістыя катэгорыі карыстальнікаў тут не змяняюцца.</span>
    </header>

    <v-card class="categories-card" elevation="0">
      <div class="categories-card__heading categories-card__heading--actions">
        <div>
          <h2>Глабальныя катэгорыі</h2>
          <p>{{ categories.length }} катэгорый у базе</p>
        </div>
        <v-btn
          variant="tonal"
          rounded="pill"
          class="text-none"
          prepend-icon="mdi-restore"
          :loading="restoringDefaults"
          @click="restoreDefaults"
        >
          Аднавіць базавыя
        </v-btn>
      </div>

      <div v-if="categoriesLoading" class="loading-state">
        <v-progress-circular indeterminate color="primary" size="28" />
        <span>Загрузка катэгорый…</span>
      </div>
      <div v-else-if="categories.length" class="categories-list">
        <div v-for="category in categories" :key="category.id" class="category-row">
          <v-checkbox-btn
            :model-value="category.addToNewPrayers"
            :disabled="savingCategoryId === category.id"
            :aria-label="`Дадаваць тэгі катэгорыі ${category.name} да новых малітваў`"
            color="primary"
            @update:model-value="setDefaultCategory(category, $event)"
          />
          <div class="category-row__copy">
            <strong>{{ category.name }}</strong>
            <span>{{ category.tags.join(' · ') }}</span>
          </div>
          <span v-if="category.addToNewPrayers" class="default-badge">Для новых малітваў</span>
          <v-btn
            icon="mdi-delete-outline"
            variant="text"
            color="error"
            :aria-label="`Выдаліць катэгорыю ${category.name}`"
            @click="categoryToDelete = category"
          />
        </div>
      </div>
      <div v-else class="empty-state">
        <strong>У базе пакуль няма катэгорый</strong>
        <span>Аднавіце тры базавыя катэгорыі або стварыце ўласную ніжэй.</span>
      </div>
    </v-card>

    <v-card class="categories-card" elevation="0">
      <div class="categories-card__heading">
        <h2>Новая глабальная катэгорыя</h2>
        <p>Аб’яднайце адзін або некалькі існуючых тэгаў ці стварыце новы.</p>
      </div>
      <v-form class="category-form" @submit.prevent="addCategory">
        <v-text-field
          v-model="newCategory.name"
          label="Назва катэгорыі"
          variant="outlined"
          hide-details="auto"
        />
        <v-combobox
          v-model="newCategory.tags"
          :items="availableTagNames"
          label="Тэгі"
          multiple
          chips
          closable-chips
          variant="outlined"
          hide-details="auto"
        />
        <v-checkbox
          v-model="newCategory.addToNewPrayers"
          label="Дадаваць гэтыя тэгі да кожнай новай малітвы"
          color="primary"
          hide-details
        />
        <v-btn
          type="submit"
          color="primary"
          rounded="pill"
          class="text-none category-submit"
          prepend-icon="mdi-plus"
          :loading="creatingCategory"
        >
          Дадаць катэгорыю
        </v-btn>
      </v-form>
    </v-card>

    <v-card class="categories-card" elevation="0">
      <div class="categories-card__heading">
        <h2>Усе тэгі</h2>
        <p>{{ tagStats.length }} тэгаў у малітвах і глабальных катэгорыях</p>
      </div>

      <v-text-field
        v-model="tagQuery"
        class="tag-search"
        label="Знайсці тэг"
        prepend-inner-icon="mdi-magnify"
        clearable
        variant="outlined"
        hide-details
      />

      <div v-if="prayersLoading" class="loading-state">
        <v-progress-circular indeterminate color="primary" size="28" />
        <span>Загрузка тэгаў…</span>
      </div>
      <div v-else-if="filteredTagStats.length" class="tags-list">
        <div v-for="tag in filteredTagStats" :key="tag.name" class="tag-row">
          <div class="tag-row__copy">
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
            :aria-label="`Выдаліць тэг ${tag.name} з усіх малітваў`"
            @click="tagToDelete = tag"
          />
        </div>
      </div>
      <p v-else class="empty-message">{{ tagQuery ? 'Нічога не знойдзена.' : 'Тэгаў пакуль няма.' }}</p>
    </v-card>

    <v-dialog :model-value="Boolean(categoryToDelete)" max-width="440" @update:model-value="!$event && (categoryToDelete = null)">
      <v-card class="confirm-card">
        <v-card-title>Выдаліць катэгорыю?</v-card-title>
        <v-card-text>
          Катэгорыя «{{ categoryToDelete?.name }}» знікне ва ўсіх карыстальнікаў. Самі тэгі і малітвы застануцца.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" class="text-none" @click="categoryToDelete = null">Скасаваць</v-btn>
          <v-btn color="error" variant="flat" class="text-none" :loading="deletingCategory" @click="removeCategory">Выдаліць</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="Boolean(tagToDelete)" max-width="480" @update:model-value="!$event && (tagToDelete = null)">
      <v-card class="confirm-card">
        <v-card-title>Выдаліць тэг усюды?</v-card-title>
        <v-card-text>
          <p>Тэг «{{ tagToDelete?.name }}» будзе выдалены з {{ pluralize(tagToDelete?.prayerCount || 0, 'малітвы', 'малітваў', 'малітваў') }}.</p>
          <p v-if="tagToDelete?.categoryCount">Ён таксама будзе прыбраны з {{ pluralize(tagToDelete.categoryCount, 'катэгорыі', 'катэгорый', 'катэгорый') }}. Катэгорыі без іншых тэгаў будуць выдалены.</p>
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
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useNotifier } from '@/composables/useNotifier';
import { usePrayers } from '@/composables/usePrayers';
import { usePrayerCategoriesStore } from '@/stores/prayerCategories';
import { validateCategory } from '@/utils/validators';
import { buildPrayerTagStats } from '@/utils/prayerCategoryAdmin';

const prayerCategories = usePrayerCategoriesStore();
const { categories, isLoading: categoriesLoading } = storeToRefs(prayerCategories);
const { prayers, isLoading: prayersLoading, init: initPrayers } = usePrayers();
const { notifyError, notifySuccess } = useNotifier();

const newCategory = ref({ name: '', tags: [], addToNewPrayers: false });
const tagQuery = ref('');
const categoryToDelete = ref(null);
const tagToDelete = ref(null);
const creatingCategory = ref(false);
const deletingCategory = ref(false);
const deletingTag = ref(false);
const restoringDefaults = ref(false);
const savingCategoryId = ref('');

prayerCategories.init();
initPrayers();

const tagStats = computed(() => buildPrayerTagStats(prayers.value, categories.value));

const availableTagNames = computed(() => tagStats.value.map((tag) => tag.name));
const filteredTagStats = computed(() => {
  const query = String(tagQuery.value || '').trim().toLocaleLowerCase('be');
  if (!query) return tagStats.value;
  return tagStats.value.filter((tag) => tag.name.toLocaleLowerCase('be').includes(query));
});

function normalizedCategory() {
  return {
    name: newCategory.value.name.trim(),
    tags: [...new Set(newCategory.value.tags.map((tag) => String(tag).trim()).filter(Boolean))],
    addToNewPrayers: newCategory.value.addToNewPrayers,
  };
}

function errorMessage(error, fallback) {
  return error?.message || fallback;
}

async function addCategory() {
  const category = normalizedCategory();
  const validation = validateCategory(category);
  if (validation !== true) return notifyError(validation);
  if (categories.value.some((item) => item.name.localeCompare(category.name, 'be', { sensitivity: 'base' }) === 0)) {
    return notifyError('Катэгорыя з такой назвай ужо існуе');
  }

  creatingCategory.value = true;
  try {
    await prayerCategories.addCategory(category);
    newCategory.value = { name: '', tags: [], addToNewPrayers: false };
    notifySuccess('Глабальная катэгорыя дададзена');
  } catch (error) {
    notifyError(errorMessage(error, 'Не ўдалося дадаць катэгорыю'));
  } finally {
    creatingCategory.value = false;
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

async function setDefaultCategory(category, enabled) {
  savingCategoryId.value = category.id;
  try {
    await prayerCategories.setAddToNewPrayers(category.id, enabled);
    notifySuccess(enabled ? 'Тэгі будуць дадавацца да новых малітваў' : 'Аўтададаванне тэгаў выключана');
  } catch (error) {
    notifyError(errorMessage(error, 'Не ўдалося абнавіць катэгорыю'));
  } finally {
    savingCategoryId.value = '';
  }
}

async function restoreDefaults() {
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
.categories-page { width: min(100%, 860px); padding: 34px 20px 72px !important; }
.categories-page__header { margin: 0 4px 24px; }
.categories-page__header p { margin: 0 0 8px; color: var(--chrome-accent); font-size: .72rem; font-weight: 800; letter-spacing: .11em; text-transform: uppercase; }
.categories-page__header h1 { margin: 0 0 9px; color: var(--nav-on-surface); font-family: var(--reader-display-font-family); font-size: clamp(1.9rem, 7vw, 2.5rem); line-height: 1.05; }
.categories-page__header span { display: block; max-width: 720px; color: var(--nav-muted); line-height: 1.5; }
.categories-card { margin-bottom: 16px; padding: 20px; border: 1px solid var(--nav-border); border-radius: 22px; background: var(--nav-surface); color: var(--nav-on-surface); }
.categories-card__heading h2 { margin: 0; color: var(--nav-on-surface); font-size: 1.08rem; }
.categories-card__heading p,
.empty-message { margin: 5px 0 0; color: var(--nav-muted); font-size: .84rem; }
.categories-card__heading--actions { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.categories-list { margin-top: 16px; border-top: 1px solid var(--nav-border); }
.category-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 10px; min-height: 68px; border-bottom: 1px solid var(--nav-border); }
.category-row__copy,
.tag-row__copy { display: grid; gap: 3px; min-width: 0; }
.category-row__copy strong,
.tag-row__copy strong { color: var(--nav-on-surface); }
.category-row__copy span,
.tag-row__copy span { overflow-wrap: anywhere; color: var(--nav-muted); font-size: .8rem; }
.default-badge { padding: 4px 8px; border-radius: 99px; background: var(--nav-active); color: var(--chrome-accent); font-size: .69rem; font-weight: 750; white-space: nowrap; }
.category-form { display: grid; gap: 12px; margin-top: 18px; }
.category-submit { justify-self: start; }
.loading-state,
.empty-state { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 110px; margin-top: 16px; border-radius: 16px; background: var(--nav-active); color: var(--nav-muted); font-size: .84rem; }
.empty-state { flex-direction: column; text-align: center; }
.empty-state strong { color: var(--nav-on-surface); }
.tag-search { margin-top: 18px; }
.tags-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 14px; }
.tag-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-width: 0; min-height: 62px; padding: 8px 8px 8px 14px; border: 1px solid var(--nav-border); border-radius: 15px; background: var(--nav-active); }
.confirm-card { border: 1px solid var(--nav-border); border-radius: 22px !important; background: var(--overlay-surface); color: var(--nav-on-surface); }
.confirm-card .v-card-text { color: var(--nav-muted); line-height: 1.55; }
.confirm-card .v-card-text p { margin: 0 0 10px; }
.confirm-card .v-card-text strong { color: var(--rubric-color); }
@media (max-width: 600px) {
  .categories-page { padding: 22px 14px 56px !important; }
  .categories-card { padding: 16px; }
  .categories-card__heading--actions { align-items: flex-start; flex-direction: column; }
  .category-row { grid-template-columns: auto minmax(0, 1fr) auto; }
  .default-badge { display: none; }
  .tags-list { grid-template-columns: 1fr; }
  .category-submit { width: 100%; }
}
</style>
