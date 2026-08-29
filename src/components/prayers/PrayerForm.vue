<template>
  <v-container class="prayer-form-page">
    <header class="form-page-header">
      <div>
        <p class="form-eyebrow">Малітвы</p>
        <h1>{{ isEditMode ? 'Рэдагаванне малітвы' : 'Новая малітва' }}</h1>
        <p>
          {{ isEditMode
            ? 'Удакладніце назву, тэкст або тэгі і праверце вынік перад захаваннем.'
            : 'Дадайце назву, аформіце тэкст і пазначце тэгі для хуткага пошуку.' }}
        </p>
      </div>
      <v-btn
        variant="tonal"
        rounded="pill"
        class="preview-toggle text-none"
        :prepend-icon="showPreview ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
        @click="showPreview = !showPreview"
      >
        {{ showPreview ? 'Схаваць выгляд' : 'Паказаць выгляд' }}
      </v-btn>
    </header>

    <div v-if="loadingPrayer" class="form-loading">
      <v-skeleton-loader type="heading, paragraph, image, paragraph" />
    </div>

    <v-alert v-else-if="loadError" type="error" variant="tonal" class="load-alert">
      {{ loadError }}
      <template #append>
        <v-btn variant="text" :to="{ name: 'PrayersList' }">Да спіса</v-btn>
      </template>
    </v-alert>

    <v-form
      v-else
      ref="formRef"
      class="editor-layout"
      :class="{ 'editor-layout--without-preview': !showPreview }"
      @submit.prevent="handleSave"
    >
      <div class="editor-column">
        <v-card class="editor-card" elevation="0">
          <section class="editor-section">
            <div class="section-heading">
              <span class="section-number">1</span>
              <div>
                <h2>Назва</h2>
                <p>Кароткая і зразумелая назва для спіса.</p>
              </div>
            </div>
            <v-textarea
              v-model="form.title"
              label="Назва малітвы"
              variant="outlined"
              rows="1"
              auto-grow
              counter="200"
              maxlength="200"
              :rules="[validatePrayerTitle]"
              class="prayer-title-field"
              @blur="form.title = form.title.trim()"
            />
          </section>

          <v-divider />

          <section class="editor-section">
            <div class="section-heading section-heading--with-meta">
              <span class="section-number">2</span>
              <div>
                <h2>Тэкст малітвы</h2>
                <p>Markdown для структуры, рубрыкі — праз кнопку або блок :::rubric.</p>
              </div>
              <span class="text-count">{{ plainTextLength }} сімв.</span>
            </div>

            <PrayerMarkdownEditor v-model="form.text" :error="Boolean(textError)" />
            <p v-if="textError" class="field-error">{{ textError }}</p>
          </section>

          <v-divider />

          <section class="editor-section">
            <div class="section-heading">
              <span class="section-number">3</span>
              <div>
                <h2>Крыніца</h2>
                <p>Неабавязковая крыніца або аўтар тэксту.</p>
              </div>
            </div>
            <v-textarea
              v-model="form.source"
              label="Крыніца"
              variant="outlined"
              rows="1"
              auto-grow
              counter="500"
              maxlength="500"
              class="prayer-source-field"
              @blur="form.source = form.source.trim()"
            />
          </section>

          <v-divider />

          <section class="editor-section">
            <div class="section-heading">
              <span class="section-number">4</span>
              <div>
                <h2>Тэгі</h2>
                <p>Дапамагаюць знаходзіць малітву праз катэгорыі і фільтры.</p>
              </div>
            </div>
            <v-combobox
              v-model="form.tags"
              :items="availableTags"
              label="Дадаць або выбраць тэгі"
              multiple
              chips
              closable-chips
              clearable
              variant="outlined"
              hide-details="auto"
              class="tags-field"
              @update:model-value="normalizeTags"
            />
            <div v-if="suggestedTags.length" class="tag-suggestions">
              <span>Хуткі выбар:</span>
              <button
                v-for="tag in suggestedTags"
                :key="tag"
                type="button"
                @click="addTag(tag)"
              >
                + {{ tag }}
              </button>
            </div>
          </section>
        </v-card>

        <div class="form-actions">
          <v-btn variant="text" rounded="pill" class="text-none" :disabled="saving" @click="cancel">
            Скасаваць
          </v-btn>
          <v-btn
            type="submit"
            rounded="pill"
            size="large"
            prepend-icon="mdi-check"
            class="save-prayer-button text-none"
            :loading="saving"
          >
            {{ isEditMode ? 'Захаваць змены' : 'Дадаць малітву' }}
          </v-btn>
        </div>
      </div>

      <aside v-if="showPreview" class="preview-column" aria-label="Папярэдні выгляд малітвы">
        <div class="preview-sticky">
          <div class="preview-heading">
            <div>
              <p class="form-eyebrow">Папярэдні выгляд</p>
              <h2>Як убачыць чытач</h2>
            </div>
            <v-icon icon="mdi-eye-outline" color="medium-emphasis" />
          </div>
          <div class="prayer-preview">
            <h3>{{ form.title.trim() || 'Назва малітвы' }}</h3>
            <div v-if="plainTextLength" class="prayer-preview__text" v-html="previewHtml" />
            <p v-else class="preview-placeholder">Тэкст з’явіцца тут падчас рэдагавання.</p>
            <p v-if="form.source.trim()" class="preview-source">
              <span>Крыніца:</span> {{ form.source.trim() }}
            </p>
            <div v-if="form.tags.length" class="preview-tags">
              <span v-for="tag in form.tags" :key="tag">{{ tag }}</span>
            </div>
          </div>
        </div>
      </aside>
    </v-form>
  </v-container>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { usePrayers } from '@/composables/usePrayers';
import { useNotifier } from '@/composables/useNotifier';
import { useUiStore } from '@/stores/ui';
import { usePrayerCategoriesStore } from '@/stores/prayerCategories';
import { validatePrayerTitle, validatePrayerText } from '@/utils/validators';
import PrayerMarkdownEditor from '@/components/prayers/PrayerMarkdownEditor.vue';
import {
  prayerMarkdownToPlainText,
  prayerTextFields,
  renderPrayerMarkdown,
  toPrayerMarkdown,
} from '@/utils/prayerMarkdown';

const route = useRoute();
const router = useRouter();
const { prayers, isLoading, addPrayer, updatePrayer, allTags } = usePrayers();
const { notifySuccess, notifyError } = useNotifier();
const uiStore = useUiStore();
const prayerCategories = usePrayerCategoriesStore();
const { defaultPrayerTags, isLoading: areCategoriesLoading } = storeToRefs(prayerCategories);
prayerCategories.init();

const formRef = ref(null);
const saving = ref(false);
const hydrated = ref(false);
const loadError = ref('');
const saveAttempted = ref(false);
const showPreview = ref(true);
const initialSnapshot = ref('');
const allowNavigation = ref(false);

const form = ref({ title: '', text: '', source: '', tags: [] });

const isEditMode = computed(() => Boolean(route.params.id));
const loadingPrayer = computed(() => isEditMode.value && isLoading.value && !hydrated.value);
const plainText = computed(() => prayerMarkdownToPlainText(form.value.text));
const plainTextLength = computed(() => plainText.value.length);
const previewHtml = computed(() => renderPrayerMarkdown(form.value.text));
const textError = computed(() => {
  if (!saveAttempted.value) return '';
  const result = validatePrayerText(form.value.text);
  return result === true ? '' : result;
});
const availableTags = computed(() => [...new Set(allTags.value || [])].sort((a, b) => a.localeCompare(b, 'be')));
const suggestedTags = computed(() => availableTags.value.filter((tag) => !form.value.tags.includes(tag)).slice(0, 6));
const currentSnapshot = computed(() => JSON.stringify({
  title: form.value.title.trim(),
  text: form.value.text || '',
  source: form.value.source.trim(),
  tags: [...form.value.tags].sort(),
}));
const isDirty = computed(() => hydrated.value && currentSnapshot.value !== initialSnapshot.value);

const hydrateForm = () => {
  if (hydrated.value) return;

  if (!isEditMode.value) {
    if (areCategoriesLoading.value) return;
    form.value.tags = [...defaultPrayerTags.value];
    hydrated.value = true;
    initialSnapshot.value = currentSnapshot.value;
    return;
  }

  if (isLoading.value) return;
  const prayer = prayers.value.find((item) => item.id === route.params.id);
  if (!prayer) {
    loadError.value = 'Малітва не знойдзена або была выдалена.';
    return;
  }

  form.value = {
    title: prayer.title
      || prayer.titleVersions?.be
      || prayer.titleVersions?.ru
      || Object.values(prayer.titleVersions || {})[0]
      || '',
    text: toPrayerMarkdown(
      prayer.text
        || prayer.textVersions?.be
        || prayer.textVersions?.ru
        || Object.values(prayer.textVersions || {})[0]
        || '',
      prayer.textFormat,
    ),
    source: prayer.source || '',
    tags: [...(prayer.tags || [])],
  };
  hydrated.value = true;
  initialSnapshot.value = currentSnapshot.value;
};

watch([isLoading, prayers, areCategoriesLoading, defaultPrayerTags], hydrateForm, { immediate: true });
watch(saving, (value) => { uiStore.prayerFormSaving = value; });

const normalizeTags = () => {
  form.value.tags = [...new Set(
    (form.value.tags || [])
      .map((tag) => String(tag).trim())
      .filter(Boolean),
  )];
};

const addTag = (tag) => {
  form.value.tags = [...new Set([...form.value.tags, tag])];
};

const cancel = () => {
  if (window.history.length > 1) router.go(-1);
  else router.push({ name: 'PrayersList' });
};

async function handleSave() {
  if (saving.value || loadError.value) return;
  saveAttempted.value = true;
  normalizeTags();
  form.value.title = form.value.title.trim();
  form.value.source = form.value.source.trim();

  const validation = await formRef.value?.validate();
  const titleValidation = validatePrayerTitle(form.value.title);
  const textValidation = validatePrayerText(form.value.text);
  if (validation && !validation.valid) return;
  if (titleValidation !== true) {
    notifyError(titleValidation);
    return;
  }
  if (textValidation !== true) {
    notifyError(textValidation);
    return;
  }

  saving.value = true;
  try {
    const payload = {
      title: form.value.title,
      ...prayerTextFields(form.value.text),
      source: form.value.source,
      tags: [...form.value.tags],
    };
    if (isEditMode.value) {
      await updatePrayer(route.params.id, payload);
      notifySuccess('Малітва абноўлена');
    } else {
      await addPrayer(payload);
      notifySuccess('Малітва дададзена');
    }
    initialSnapshot.value = currentSnapshot.value;
    allowNavigation.value = true;
    await router.push(isEditMode.value
      ? { name: 'PrayerView', params: { id: route.params.id } }
      : { name: 'PrayersList' });
  } catch (error) {
    const { handleFirestoreError } = await import('@/utils/errorHandler');
    handleFirestoreError(error, 'PrayerForm');
  } finally {
    saving.value = false;
  }
}

const handleBeforeUnload = (event) => {
  if (!isDirty.value || allowNavigation.value) return;
  event.preventDefault();
  event.returnValue = '';
};

onBeforeRouteLeave(() => {
  if (!isDirty.value || allowNavigation.value) return true;
  return window.confirm('Ёсць незахаваныя змены. Выйсці без захавання?');
});

onMounted(() => {
  uiStore.registerPrayerFormActions({ save: handleSave });
  window.addEventListener('beforeunload', handleBeforeUnload);
});

onBeforeUnmount(() => {
  uiStore.clearPrayerFormActions();
  window.removeEventListener('beforeunload', handleBeforeUnload);
});
</script>

<style scoped>
.prayer-form-page {
  width: min(100%, 1220px);
  padding: 28px 20px 64px !important;
  color: var(--nav-on-surface);
}

.form-page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin: 0 6px 26px;
}

.form-eyebrow {
  margin: 0 0 7px;
  color: var(--nav-muted);
  font-size: 0.69rem;
  font-weight: 800;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.form-page-header h1 {
  margin: 0;
  font-size: clamp(2rem, 5vw, 3.25rem);
  font-weight: 760;
  line-height: 1.03;
  letter-spacing: -0.04em;
}

.form-page-header > div > p:last-child {
  max-width: 650px;
  margin: 14px 0 0;
  color: var(--nav-muted);
  line-height: 1.55;
}

.preview-toggle { flex: 0 0 auto; color: var(--nav-on-surface); }
.editor-layout { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.65fr); align-items: start; gap: 18px; }
.editor-layout--without-preview { grid-template-columns: minmax(0, 820px); justify-content: center; }
.editor-card { overflow: hidden; border: 1px solid var(--nav-border); border-radius: 28px !important; background: var(--nav-surface) !important; color: var(--nav-on-surface); box-shadow: 0 10px 34px var(--nav-button-shadow) !important; }
.editor-section { padding: 26px 28px 28px; }

.section-heading {
  display: flex;
  align-items: center;
  gap: 13px;
  margin-bottom: 20px;
}

.section-heading--with-meta { align-items: flex-start; }
.section-number { display: grid; width: 36px; height: 36px; flex: 0 0 36px; place-items: center; border-radius: 12px; background: var(--nav-active); font-size: 0.8rem; font-weight: 800; }
.section-heading h2 { margin: 0; font-size: 1.07rem; font-weight: 730; }
.section-heading p { margin: 3px 0 0; color: var(--nav-muted); font-size: 0.8rem; line-height: 1.4; }
.text-count { margin-left: auto; color: var(--nav-muted); font-size: 0.72rem; white-space: nowrap; }

.prayer-title-field :deep(.v-field),
.prayer-source-field :deep(.v-field),
.tags-field :deep(.v-field) { border-radius: 16px; background: rgba(var(--v-theme-on-surface), 0.025); }
.prayer-title-field :deep(textarea) { line-height: 1.45; }

.field-error { margin: 7px 16px 0; color: rgb(var(--v-theme-error)); font-size: 0.75rem; }

.tag-suggestions { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; margin-top: 13px; color: var(--nav-muted); font-size: 0.74rem; }
.tag-suggestions button { padding: 6px 10px; border: 1px solid var(--nav-border); border-radius: 999px; background: transparent; color: var(--nav-on-surface); font: inherit; cursor: pointer; }
.tag-suggestions button:hover { background: var(--nav-active); }

.form-actions { display: flex; align-items: center; justify-content: flex-end; gap: 9px; padding: 18px 4px 0; }
.save-prayer-button { min-height: 52px; padding-inline: 24px !important; background: var(--nav-on-surface) !important; color: var(--nav-surface) !important; font-weight: 720; }
.preview-sticky { position: sticky; top: 84px; overflow: hidden; border: 1px solid var(--nav-border); border-radius: 26px; background: var(--nav-surface); box-shadow: 0 8px 28px var(--nav-button-shadow); }
.preview-heading { display: flex; align-items: center; justify-content: space-between; padding: 20px 22px 16px; border-bottom: 1px solid var(--nav-border); }
.preview-heading h2 { margin: 0; font-size: 1rem; font-weight: 720; }
.prayer-preview { padding: 26px 24px 28px; }
.prayer-preview h3 { margin: 0 0 22px; font-size: 1.65rem; font-weight: 740; line-height: 1.18; letter-spacing: -0.025em; overflow-wrap: anywhere; }
.prayer-preview__text { font-family: var(--reader-font-family); font-size: 1rem; line-height: 1.72; overflow-wrap: anywhere; }
.prayer-preview__text :deep(p) { margin: 0 0 1em; }
.prayer-preview__text :deep(p:last-child) { margin-bottom: 0; }
.prayer-preview__text :deep(ul), .prayer-preview__text :deep(ol) { max-width: 100%; margin: 0.65em 0 1em; padding-inline-start: 1.45em; list-style-position: outside; }
.prayer-preview__text :deep(li) { min-width: 0; padding-inline-start: 0.16em; overflow-wrap: anywhere; }
.prayer-preview__text :deep(li::marker) { font-variant-numeric: tabular-nums; }
.prayer-preview__text :deep(ul ul), .prayer-preview__text :deep(ul ol), .prayer-preview__text :deep(ol ul), .prayer-preview__text :deep(ol ol) { margin-block: 0.3em; padding-inline-start: 1.2em; }
.prayer-preview__text :deep(.prayer-rubric) { margin: 1em 0; padding-left: 0.8em; border-left: 3px solid var(--rubric-color); color: var(--rubric-color); font-size: 0.88em; line-height: 1.45; }
.prayer-preview__text :deep(.prayer-rubric p) { margin-bottom: 0.45em; }
.preview-placeholder { margin: 0; color: var(--nav-muted); font-style: italic; line-height: 1.6; }
.preview-source { margin: 22px 0 0; color: var(--nav-muted); font-size: 0.7rem; line-height: 1.4; overflow-wrap: anywhere; }
.preview-source span { font-weight: 600; }
.preview-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--nav-border); }
.preview-tags span { padding: 5px 9px; border-radius: 999px; background: var(--nav-active); font-size: 0.7rem; }
.form-loading, .load-alert { max-width: 820px; margin-inline: auto; border-radius: 24px; }
.form-loading { overflow: hidden; border: 1px solid var(--nav-border); background: var(--nav-surface); }

@media (max-width: 900px) {
  .editor-layout { grid-template-columns: 1fr; }
  .preview-column { grid-row: 2; }
  .preview-sticky { position: static; }
}

@media (max-width: 600px) {
  .prayer-form-page { padding: 16px 8px 48px !important; }
  .form-page-header { align-items: flex-start; flex-direction: column; margin: 0 10px 22px; }
  .form-page-header h1 { font-size: 2.15rem; }
  .preview-toggle { width: 100%; }
  .editor-section { padding: 22px 18px 24px; }
  .section-heading { align-items: flex-start; }
  .section-heading p { font-size: 0.76rem; }
  .text-count { position: absolute; right: 28px; margin-top: 42px; }
  .form-actions { position: sticky; bottom: 8px; z-index: 4; margin: 10px 4px 0; padding: 8px; border: 1px solid var(--nav-border); border-radius: 999px; background: color-mix(in srgb, var(--nav-surface) 92%, transparent); box-shadow: 0 8px 28px var(--nav-shadow); backdrop-filter: blur(16px); }
  .form-actions .save-prayer-button { flex: 1; }
  .prayer-preview { padding: 22px 20px; }
}
</style>
