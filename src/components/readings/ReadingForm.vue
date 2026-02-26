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

            <div class="text-subtitle-1 mb-2">Свята</div>
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
              <label class="text-caption text-medium-emphasis mb-2 d-block">Тэкст чытання</label>
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
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

import { useAuthStore } from '@/stores/auth.js';
import { FEAST_NAME_MAP, PERIOD_TYPES } from '@/constants/readings';

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

const periodTypes = Object.values(PERIOD_TYPES);
const feastOptions = Object.values(FEAST_NAME_MAP).map((value) => ({
  value,
  label: value,
}));

const editModel = ref({
  title: '',
  text: '',
  _periodType: null,
  _periodWeekNumber: null,
  _dayOfWeek: null,
  _date: '',
  _feast: null,
});

watch(
  readingData,
  (val) => {
    if (!val) return;
    editModel.value = {
      title: val.title || '',
      text: val.text || '',
      _periodType: val._periodType || null,
      _periodWeekNumber: val._periodWeekNumber ?? null,
      _dayOfWeek: val._dayOfWeek ?? null,
      _date: val._date || '',
      _feast: val._feast || null,
    };
  },
  { immediate: true },
);

const goBack = (targetReadingId = route.params.readingId) => {
  const { day, id } = route.params;
  if (day && id && targetReadingId) {
    router.push({ name: 'reading', params: { day, id, readingId: targetReadingId } });
  } else {
    router.back();
  }
};

function normalizeDate(dateValue) {
  if (!dateValue) return '';
  const trimmed = String(dateValue).trim();
  const match = trimmed.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (!match) return trimmed;
  return `${Number(match[1])}.${Number(match[2])}`;
}

function buildReadingId(model, fallbackId) {
  if (model._periodType && model._periodWeekNumber && model._dayOfWeek) {
    return `${model._periodType}-w${model._periodWeekNumber}-d${model._dayOfWeek}`;
  }
  if (model._date) {
    return model._date;
  }
  if (model._feast) {
    return model._feast;
  }
  return fallbackId;
}

const saveChanges = async () => {
  if (!isAdmin.value || !readingData.value) return;

  saving.value = true;
  try {
    const normalizedModel = {
      ...editModel.value,
      _date: normalizeDate(editModel.value._date),
      _feast: editModel.value._feast ? String(editModel.value._feast).toLowerCase().trim() : null,
      _periodWeekNumber: editModel.value._periodWeekNumber ? Number(editModel.value._periodWeekNumber) : null,
      _dayOfWeek: editModel.value._dayOfWeek ? Number(editModel.value._dayOfWeek) : null,
      text: editModel.value.text?.trim() || '',
    };

    const oldReadingId = route.params.readingId;
    const newReadingId = buildReadingId(normalizedModel, oldReadingId);

    const payload = {
      ...readingData.value,
      ...normalizedModel,
      updatedAt: serverTimestamp(),
    };

    if (!payload._periodType) {
      payload._periodWeekNumber = null;
      payload._dayOfWeek = null;
    }

    if (!payload._date) payload._date = null;
    if (!payload._feast) payload._feast = null;

    const newDocRef = doc(db, 'readings', newReadingId);

    if (newReadingId !== oldReadingId) {
      payload.createdAt = readingData.value.createdAt || serverTimestamp();
      await setDoc(newDocRef, payload);
      await deleteDoc(doc(db, 'readings', oldReadingId));
      goBack(newReadingId);
      return;
    }

    await setDoc(newDocRef, payload, { merge: true });
    goBack(newReadingId);
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
