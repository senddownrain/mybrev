<template>
  <v-container>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h5">Шаблоны дзён</h1>
      <v-spacer></v-spacer>
      <v-btn color="primary" prepend-icon="mdi-plus" :to="{ name: 'AdminDayTemplateEditor', params: { id: 'new' } }">
        Стварыць шаблон
      </v-btn>
    </div>

    <v-expansion-panels variant="accordion">
      <v-expansion-panel v-for="group in groupedTemplates" :key="group.key" :title="group.title">
        <v-expansion-panel-text>
          <v-list lines="two">
            <v-list-item v-for="item in group.items" :key="item.id" :subtitle="buildSubtitle(item)">
              <template #title>{{ item._title || '(без назвы)' }}</template>
              <template #append>
                <v-btn icon="mdi-pencil" size="small" variant="text" @click="editTemplate(item.id)"></v-btn>
                <v-btn icon="mdi-delete" size="small" variant="text" color="error" @click="deleteTemplate(item.id)"></v-btn>
              </template>
            </v-list-item>
          </v-list>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </v-container>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useCollection, useFirestore } from 'vuefire';
import { collection, deleteDoc, doc } from 'firebase/firestore';
import { PERIOD_LABEL_MAP, WEEKDAY_LABEL_MAP } from '@/constants/liturgical';
import { useNotifier } from '@/composables/useNotifier';

const db = useFirestore();
const router = useRouter();
const { success, error } = useNotifier();
const templates = useCollection(collection(db, 'dayTemplates'));

function sortItems(items) {
  return [...items].sort((a, b) => {
    const weekA = Number(a._psalmWeekNumber || Number.MAX_SAFE_INTEGER);
    const weekB = Number(b._psalmWeekNumber || Number.MAX_SAFE_INTEGER);
    if (weekA !== weekB) return weekA - weekB;

    const dayA = Number(a._dayOfWeek || Number.MAX_SAFE_INTEGER);
    const dayB = Number(b._dayOfWeek || Number.MAX_SAFE_INTEGER);
    return dayA - dayB;
  });
}

const groupedTemplates = computed(() => {
  const groups = new Map();

  templates.value.forEach((item) => {
    const key = item._periodType || '__no_period__';
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(item);
  });

  const keys = [...groups.keys()].sort((a, b) => {
    if (a === '__no_period__') return 1;
    if (b === '__no_period__') return -1;
    return (PERIOD_LABEL_MAP[a] || a).localeCompare(PERIOD_LABEL_MAP[b] || b);
  });

  return keys.map((key) => ({
    key,
    title: key === '__no_period__' ? 'Без перыяду' : PERIOD_LABEL_MAP[key] || key,
    items: sortItems(groups.get(key)),
  }));
});

function buildSubtitle(item) {
  const week = item._psalmWeekNumber != null ? `Тыдзень псалтыра: ${item._psalmWeekNumber}` : 'Тыдзень псалтыра: —';
  const day = item._dayOfWeek ? WEEKDAY_LABEL_MAP[item._dayOfWeek] : '—';
  return `${week} • Дзень: ${day}`;
}

function editTemplate(id) {
  router.push({ name: 'AdminDayTemplateEditor', params: { id } });
}

async function deleteTemplate(id) {
  if (!window.confirm('Выдаліць шаблон?')) return;
  try {
    await deleteDoc(doc(db, 'dayTemplates', id));
    success('Шаблон выдалены.');
  } catch (e) {
    error(`Не атрымалася выдаліць шаблон: ${e?.message || e}`);
  }
}
</script>
