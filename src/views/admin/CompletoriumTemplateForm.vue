<template>
  <v-container>
    <div class="d-flex justify-space-between align-center mb-4">
      <h1 class="text-h5 font-weight-light">
        {{ isEditMode ? 'Рэдагаванне шаблона комплеты' : 'Стварэнне шаблона комплеты' }}
      </h1>
      <v-btn variant="text" :to="{ name: 'AdminCompletoriumTemplates' }">Назад да спісу</v-btn>
    </div>

    <v-card variant="outlined" class="mb-4">
      <v-card-title class="text-subtitle-1">Запаўненне са дня (days)</v-card-title>
      <v-card-text>
        <v-autocomplete
          v-model="selectedDayId"
          :items="daysOptions"
          item-title="label"
          item-value="id"
          label="Выбраць дзень"
          variant="outlined"
          clearable
          :loading="loadingDays"
        />
        <v-btn class="mt-2" color="secondary" variant="flat" :disabled="!selectedDayId" @click="applyFromDay">
          Запоўніць палі са дня
        </v-btn>
      </v-card-text>
    </v-card>

    <v-form @submit.prevent="saveTemplate">
      <v-row>
        <v-col cols="12">
          <v-text-field
            v-model="form.title"
            label="Title"
            variant="outlined"
            required
            hint="Можна згенераваць з _dayOfWeek + _periodType"
            persistent-hint
          />
          <v-btn size="small" variant="text" @click="generateTitle">
            Згенераваць title з літургічных палёў
          </v-btn>
        </v-col>

        <v-col cols="12" md="6">
          <v-select
            v-model="form._dayOfWeek"
            :items="dayOfWeekItems"
            item-title="label"
            item-value="value"
            label="_dayOfWeek"
            variant="outlined"
          />
        </v-col>
        <v-col cols="12" md="6">
          <v-select
            v-model="form._periodType"
            :items="periodItems"
            item-title="label"
            item-value="value"
            label="_periodType"
            variant="outlined"
          />
        </v-col>

        <v-col v-for="field in contentFields" :key="field" cols="12" md="6">
          <v-textarea
            v-model="form[field]"
            :label="field"
            variant="outlined"
            rows="2"
            auto-grow
          />
        </v-col>
      </v-row>

      <v-btn type="submit" color="primary" variant="flat" :loading="saving" :disabled="!form.title">
        {{ isEditMode ? 'Захаваць змены' : 'Стварыць шаблон' }}
      </v-btn>
    </v-form>
  </v-container>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import { PERIOD_LABEL_MAP, WEEKDAY_LABEL_MAP } from '@/constants/liturgical';
import { useNotifier } from '@/composables/useNotifier';

const CONTENT_FIELDS = [
  'compHymn',
  'compAnt1',
  'compAnt2',
  'compPs1',
  'compPs2',
  'compR',
  'compResp',
  'compAntS',
  'compPr',
];

const route = useRoute();
const router = useRouter();
const { notifyError, notifySuccess } = useNotifier();

const isEditMode = computed(() => !!route.params.id);
const saving = ref(false);
const loadingDays = ref(false);
const selectedDayId = ref(null);
const daysOptions = ref([]);

const form = ref({
  title: '',
  _dayOfWeek: null,
  _periodType: null,
  compHymn: '',
  compAnt1: '',
  compAnt2: '',
  compPs1: '',
  compPs2: '',
  compR: '',
  compResp: '',
  compAntS: '',
  compPr: '',
});

const contentFields = CONTENT_FIELDS;

const dayOfWeekItems = computed(() =>
  Object.entries(WEEKDAY_LABEL_MAP).map(([value, label]) => ({ value: Number(value), label }))
);

const periodItems = computed(() =>
  Object.entries(PERIOD_LABEL_MAP).map(([value, label]) => ({ value, label }))
);

onMounted(async () => {
  await Promise.all([loadDays(), loadTemplateIfEdit()]);
});

function generateTitle() {
  const dayLabel = WEEKDAY_LABEL_MAP[form.value._dayOfWeek] || form.value._dayOfWeek || '';
  const periodLabel = PERIOD_LABEL_MAP[form.value._periodType] || form.value._periodType || '';
  form.value.title = [dayLabel, periodLabel].filter(Boolean).join(' — ');
}

async function loadDays() {
  loadingDays.value = true;
  try {
    const snapshot = await getDocs(collection(db, 'days'));
    daysOptions.value = snapshot.docs.map((item) => {
      const data = item.data();
      const dateLabel = data._date || item.id;
      const nameLabel = data._dayName || data._feastName || '';
      const periodLabel = PERIOD_LABEL_MAP[data._periodType] || data._periodType || '';
      return {
        id: item.id,
        data,
        label: `${dateLabel} ${nameLabel} ${periodLabel}`.trim(),
      };
    });
  } catch (error) {
    notifyError(`Не атрымалася загрузіць days: ${error.message}`);
  } finally {
    loadingDays.value = false;
  }
}

function applyFromDay() {
  const selected = daysOptions.value.find((item) => item.id === selectedDayId.value);
  if (!selected) return;

  form.value._dayOfWeek = selected.data._dayOfWeek ?? null;
  form.value._periodType = selected.data._periodType ?? null;

  for (const key of CONTENT_FIELDS) {
    form.value[key] = selected.data[key] || '';
  }

  if (!form.value.title) {
    generateTitle();
  }
}

async function loadTemplateIfEdit() {
  if (!isEditMode.value) return;

  try {
    const templateRef = doc(db, 'completoriumTemplates', route.params.id);
    const templateSnap = await getDoc(templateRef);

    if (!templateSnap.exists()) {
      notifyError('Шаблон не знойдзены');
      router.push({ name: 'AdminCompletoriumTemplates' });
      return;
    }

    const data = templateSnap.data();
    form.value = {
      ...form.value,
      ...data,
    };
  } catch (error) {
    notifyError(`Памылка загрузкі шаблона: ${error.message}`);
  }
}

async function saveTemplate() {
  saving.value = true;
  try {
    const payload = {
      title: form.value.title,
      _dayOfWeek: form.value._dayOfWeek,
      _periodType: form.value._periodType,
      updatedAt: serverTimestamp(),
    };

    for (const field of CONTENT_FIELDS) {
      payload[field] = form.value[field] || '';
    }

    if (isEditMode.value) {
      await updateDoc(doc(db, 'completoriumTemplates', route.params.id), payload);
      notifySuccess('Шаблон абноўлены');
    } else {
      await addDoc(collection(db, 'completoriumTemplates'), {
        ...payload,
        createdAt: serverTimestamp(),
      });
      notifySuccess('Шаблон створаны');
    }

    router.push({ name: 'AdminCompletoriumTemplates' });
  } catch (error) {
    notifyError(`Не атрымалася захаваць шаблон: ${error.message}`);
  } finally {
    saving.value = false;
  }
}
</script>
