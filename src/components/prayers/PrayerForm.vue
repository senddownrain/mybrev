<template>
  <v-container>
    <v-form @submit.prevent="handleSave">
      <v-text-field
        v-model="form.title"
        label="Назва"
        variant="outlined"
        class="mb-4 prayer-title-field"
        :rules="[validatePrayerTitle]"
        counter="200"
        required
      ></v-text-field>

      <div class="mb-4">
        <label class="text-caption text-medium-emphasis mb-2 d-block">Тэкст малітвы</label>
        <quill-editor
          v-model:content="form.text"
          contentType="html"
          theme="snow"
          toolbar="essential"
          class="prayer-text-editor"
        />
      </div>

      <v-combobox
        v-model="form.tags"
        :items="allTags"
        label="Тэгі"
        multiple
        chips
        clearable
        variant="outlined"
        class="mb-4"
      ></v-combobox>

      <v-btn
        type="submit"
        color="primary"
        variant="flat"
        :loading="saving"
        block
      >
        {{ isEditMode ? 'Захаваць змены' : 'Дадаць малітву' }}
      </v-btn>
    </v-form>
  </v-container>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePrayers } from '@/composables/usePrayers';
import { useNotifier } from '@/composables/useNotifier';
import { useUiStore } from '@/stores/ui';
import { validatePrayerTitle, validatePrayerText } from '@/utils/validators';

const route = useRoute();
const router = useRouter();
const { prayers, addPrayer, updatePrayer, allTags } = usePrayers();
const { notifySuccess, notifyError } = useNotifier();
const uiStore = useUiStore();

const isEditMode = computed(() => !!route.params.id);
const saving = ref(false);

const form = ref({
  title: '',
  text: '',
  tags: []
});

onMounted(() => {
  if (isEditMode.value) {
    const prayer = prayers.value.find(p => p.id === route.params.id);
    if (!prayer) {
      notifyError('Малітва не знойдзена');
      router.push({ name: 'PrayersList' });
      return;
    }
    
    // Поддержка старого формата с titleVersions/textVersions и нового формата
    if (prayer.titleVersions) {
      form.value.title = prayer.titleVersions.be || prayer.titleVersions.ru || Object.values(prayer.titleVersions)[0] || '';
    } else {
      form.value.title = prayer.title || '';
    }
    
    if (prayer.textVersions) {
      form.value.text = prayer.textVersions.be || prayer.textVersions.ru || Object.values(prayer.textVersions)[0] || '';
    } else {
      form.value.text = prayer.text || '';
    }
    
    form.value.tags = prayer.tags || [];
  }
  
  // Register save handler with Pinia store so Default.vue AppBar can trigger it
  uiStore.registerPrayerFormActions({ save: handleSave });
  uiStore.prayerFormSaving = saving.value;
});

onUnmounted(() => {
  uiStore.clearPrayerFormActions();
});

// Keep store in sync with local saving state
watch(saving, (val) => {
  uiStore.prayerFormSaving = val;
});

async function handleSave() {
  // Валидация
  const titleValidation = validatePrayerTitle(form.value.title);
  const textValidation = validatePrayerText(form.value.text);
  
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
    if (isEditMode.value) {
      await updatePrayer(route.params.id, form.value);
      notifySuccess('Малітва абноўлена');
    } else {
      await addPrayer(form.value);
      notifySuccess('Малітва дададзена');
    }
    router.push({ name: 'PrayersList' });
  } catch (error) {
    const { handleFirestoreError } = await import('@/utils/errorHandler');
    handleFirestoreError(error, 'PrayerForm');
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
/* Стили для QuillEditor */
.prayer-text-editor :deep(.ql-toolbar.ql-snow) {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-left: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-right: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px 4px 0 0;
}

.prayer-text-editor :deep(.ql-container.ql-snow) {
  border-left: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-right: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-top: none;
  border-radius: 0 0 4px 4px;
  min-height: 200px;
}

.prayer-text-editor :deep(.ql-editor) {
  min-height: 200px;
  font-size: 1rem;
}

/* Стили для поля названия - чтобы текст не обрезался */
.prayer-title-field :deep(.v-field__input) {
  white-space: normal !important;
  word-wrap: break-word !important;
  overflow-wrap: break-word !important;
  word-break: break-word !important;
  text-overflow: unset !important;
  overflow: visible !important;
}

.prayer-title-field :deep(input) {
  white-space: normal !important;
  word-wrap: break-word !important;
  overflow-wrap: break-word !important;
  word-break: break-word !important;
}
</style>

