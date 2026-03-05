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

    <v-card class="mb-4" variant="tonal">
      <v-card-text class="py-3">
        <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
          <div class="text-subtitle-2">Праверана шаблонаў</div>
          <div class="text-body-2">{{ checkedTemplatesCount }} / {{ templates.length }} ({{ checkedTemplatesPercent }}%)</div>
        </div>
        <v-progress-linear :model-value="checkedTemplatesPercent" color="success" height="10" rounded />
      </v-card-text>
    </v-card>

    <v-list v-if="filteredTemplates.length" lines="two">
      <v-list-item v-for="item in filteredTemplates" :key="item.id" :class="{ 'checked-item': isChecked(item) }">
        <v-list-item-title class="font-weight-bold">{{ item.title || '(без title)' }}</v-list-item-title>
        <v-list-item-subtitle>
          {{ weekdayLabel(item._dayOfWeek) }} · {{ periodLabel(item._periodType) }}
        </v-list-item-subtitle>

        <template #append>
          <v-checkbox-btn
            :model-value="isChecked(item)"
            color="success"
            class="mr-1"
            @update:model-value="toggleChecked(item, $event)"
          />
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
import { collection, deleteDoc, doc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
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

const checkedTemplatesCount = computed(() => templates.value.filter((item) => isChecked(item)).length);
const checkedTemplatesPercent = computed(() => {
  if (!templates.value.length) return 0;
  return Math.round((checkedTemplatesCount.value / templates.value.length) * 100);
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

function isChecked(item) {
  return item?._isChecked === true;
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

async function toggleChecked(item, checkedValue) {
  try {
    await updateDoc(doc(db, 'completoriumTemplates', item.id), {
      _isChecked: checkedValue,
      _checkedAt: checkedValue ? serverTimestamp() : null,
    });
    item._isChecked = checkedValue;
    item._checkedAt = checkedValue ? new Date().toISOString() : null;
    notifySuccess(checkedValue ? 'Шаблон пазначаны як правераны' : 'Пазнака праверкі знятая');
  } catch (error) {
    notifyError(`Не атрымалася абнавіць пазнаку праверкі: ${error.message}`);
  }
}
</script>

<style scoped>
.checked-item {
  background-color: rgba(var(--v-theme-success), 0.12);
}
</style>
