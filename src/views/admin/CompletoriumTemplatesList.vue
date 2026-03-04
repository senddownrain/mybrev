<template>
  <v-container>
    <div class="d-flex justify-space-between align-center mb-4">
      <h1 class="text-h5 font-weight-light">Шаблоны комплеты</h1>
      <v-btn color="primary" variant="flat" :to="{ name: 'AdminCompletoriumTemplateCreate' }">
        Стварыць шаблон
      </v-btn>
    </div>

    <v-text-field
      v-model="search"
      label="Пошук па title"
      prepend-inner-icon="mdi-magnify"
      variant="outlined"
      clearable
      class="mb-3"
    />

    <v-list v-if="filteredTemplates.length" lines="two">
      <v-list-item v-for="item in filteredTemplates" :key="item.id">
        <v-list-item-title class="font-weight-bold">{{ item.title || '(без title)' }}</v-list-item-title>
        <v-list-item-subtitle>
          {{ weekdayLabel(item._dayOfWeek) }} · {{ periodLabel(item._periodType) }}
        </v-list-item-subtitle>

        <template #append>
          <v-btn
            icon="mdi-pencil"
            variant="text"
            color="primary"
            :to="{ name: 'AdminCompletoriumTemplateEdit', params: { id: item.id } }"
          />
          <v-btn icon="mdi-delete" variant="text" color="error" @click="removeTemplate(item.id)" />
        </template>
      </v-list-item>
    </v-list>

    <v-alert v-else type="info" variant="tonal">Шаблоны не знойдзены.</v-alert>
  </v-container>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { collection, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import { PERIOD_LABEL_MAP, WEEKDAY_LABEL_MAP } from '@/constants/liturgical';
import { useNotifier } from '@/composables/useNotifier';

const { notifyError, notifySuccess } = useNotifier();

const templates = ref([]);
const search = ref('');

const filteredTemplates = computed(() => {
  const query = search.value.trim().toLowerCase();
  if (!query) return templates.value;

  return templates.value.filter((item) => (item.title || '').toLowerCase().includes(query));
});

onMounted(loadTemplates);

async function loadTemplates() {
  try {
    const snapshot = await getDocs(collection(db, 'completoriumTemplates'));
    templates.value = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } catch (error) {
    notifyError(`Не атрымалася загрузіць шаблоны: ${error.message}`);
  }
}

function weekdayLabel(value) {
  return WEEKDAY_LABEL_MAP[value] || value || '—';
}

function periodLabel(value) {
  return PERIOD_LABEL_MAP[value] || value || '—';
}

async function removeTemplate(id) {
  const confirmed = window.confirm('Выдаліць гэты шаблон?');
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, 'completoriumTemplates', id));
    templates.value = templates.value.filter((item) => item.id !== id);
    notifySuccess('Шаблон выдалены');
  } catch (error) {
    notifyError(`Не атрымалася выдаліць шаблон: ${error.message}`);
  }
}
</script>
