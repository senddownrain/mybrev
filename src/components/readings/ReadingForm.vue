<template>
  <v-container class="prayer-content-area">
    <v-row align="center" justify="center">
      <v-col md="6" lg="6" sm="8">
        <!-- Защита: только админ -->
        <v-alert
          v-if="!isAdmin"
          type="error"
          prominent
          border="start"
          class="mt-6"
        >
          У вас няма прав для рэдагавання чытанняў.
        </v-alert>

        <div v-else>
          <h1 class="text-h5 font-weight-regular mb-4 text-center">
            Рэдагаванне чытання
          </h1>

          <v-form ref="formRef" v-model="formValid">
            <v-text-field
              v-model="editModel.title"
              label="Загаловак (title)"
              variant="outlined"
              class="mb-4"
              clearable
            />


            <div class="text-subtitle-1 mb-2">Перыяд</div>
            <v-row dense class="mb-2">
              <v-col cols="12" sm="4">
                <v-select
                  v-model="editModel._periodType"
                  :items="periodTypes"
                  label="_periodType"
                  variant="outlined"
                  clearable
                />
              </v-col>
              <v-col cols="6" sm="4">
                <v-text-field
                  v-model.number="editModel._periodWeekNumber"
                  type="number"
                  label="_periodWeekNumber"
                  variant="outlined"
                  clearable
                />
              </v-col>
              <v-col cols="6" sm="4">
                <v-text-field
                  v-model.number="editModel._dayOfWeek"
                  type="number"
                  label="_dayOfWeek (1–7)"
                  variant="outlined"
                  clearable
                />
              </v-col>
            </v-row>
              <div class="text-subtitle-1 mb-2">Дата</div>
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="editModel._date"
                  label="_date (DD.MM)"
                  hint="Напрыклад: 25.12"
                  persistent-hint
                  variant="outlined"
                  clearable
                />
              </v-col>
            <div class="text-subtitle-1 mb-2">Свята </div>
            <v-row dense>
              <v-col cols="12" sm="6">
                <v-select
                  v-model="editModel._feast"
                  :items="feastOptions"
                  item-title="label"
                  item-value="value"
                  label="_feast (код свята)"
                  variant="outlined"
                  clearable
                />
              </v-col>
            </v-row>

             <v-divider class="my-4" />

            <div class="mb-4">
        <label class="text-caption text-medium-emphasis mb-2 d-block">Тэкст чытання </label>
        <quill-editor
          v-model:content="editModel.text"
          contentType="html"
          theme="snow"
          toolbar="essential"
        />
      </div>
         
            <v-divider class="my-4" />

          </v-form>

          <div class="d-flex justify-end mt-6">
            <v-btn class="mr-2" variant="text" @click="goBack">
              Адмена
            </v-btn>
            <v-btn
              color="primary"
              :loading="saving"
              :disabled="!formValid"
              @click="saveChanges"
            >
              Захаваць
            </v-btn>
          </div>
        </div>
      </v-col>
    </v-row>

    <v-row align="center" justify="center" v-if="pending">
      <v-col md="6" lg="6" sm="8" class="text-center mt-8">
        <v-progress-circular indeterminate color="primary" size="48" />
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useFirestore, useDocument } from 'vuefire';
import { doc, updateDoc } from 'firebase/firestore';

import { useAuthStore } from '@/stores/auth.js';

const auth = useAuthStore();
const isAdmin = computed(() => auth && auth.isAdmin);

const route = useRoute();
const router = useRouter();
const db = useFirestore();

const { readingId } = route.params;
const readingDocRef = doc(db, 'readings', readingId);
const { data: readingData, pending } = useDocument(readingDocRef);

const formRef = ref(null);
const formValid = ref(true);
const saving = ref(false);

const editModel = ref({
  title: '',
  text: '',
});

watch(
  readingData,
  (val) => {
    if (!val) return;
    editModel.value = {
      title: val.title || '',
      text: val.text || '',
    };
  },
  { immediate: true },
);

const goBack = () => {
  const { day, id, readingId } = route.params;
  if (day && id && readingId) {
    router.push({ name: 'reading', params: { day, id, readingId } });
  } else {
    router.back();
  }
};

const saveChanges = async () => {
  if (!isAdmin.value || !readingData.value) return;

  saving.value = true;
  try {
    await updateDoc(readingDocRef, {
      title: editModel.value.title,
      text: editModel.value.text,
    });
    goBack();
  } catch (err) {
    console.error('[ReadingForm] Памылка пры захаванні чытання:', err);
  } finally {
    saving.value = false;
  }
};

// слушаем глобальный сигнал от OraBar
const onSaveRequest = () => {
  if (!saving.value) {
    saveChanges();
  }
};

onMounted(() => {
  window.addEventListener('reading-save-request', onSaveRequest);
});

onBeforeUnmount(() => {
  window.removeEventListener('reading-save-request', onSaveRequest);
});
</script>