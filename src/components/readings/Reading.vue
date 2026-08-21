<template>
  <v-container class="prayer-content-area">
    <v-row >
      <v-col md="6" lg="6" sm="8" v-if="!pending && readingData">

        <!-- JSON debug panel -->
        <div class="json-toggle" @click="showJson = !showJson">
          <span class="json-toggle-label">{{ showJson ? '▾' : '▸' }} JSON</span>
          <span class="json-toggle-id">readings / {{ readingId }}</span>
        </div>
        <div v-if="showJson" class="json-block">
          <pre>{{ JSON.stringify(readingData, null, 2) }}</pre>
        </div>

        <!-- Заголовок дня / урачыстасці -->
        <DayTitle
          :date="nowDate"
          :psalms="null"
          :feastComment="null"
          :dayName="readingData.title"
        />

       <div>
        <v-card class="ora" flat>
            <v-card-text class="ora-text">
                <div v-html="readingData.text"></div>
            </v-card-text>
        </v-card>
    </div>

      </v-col>

      <v-col md="6" lg="6" sm="8" v-else-if="pending">
        <div class="text-center mt-16">
          <v-progress-circular indeterminate color="primary" size="64" />
        </div>
      </v-col>

      <v-col md="6" lg="6" sm="8" v-else>
        <v-alert type="error" prominent border="start">
          Не атрымалася загрузіць чытанні для гэтага дня.
        </v-alert>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref, computed } from 'vue';
const showJson = ref(false);
import { useRoute } from 'vue-router';
import moment from '@/utils/moment-be';

import { useFirestore, useDocument } from 'vuefire';
import { doc } from 'firebase/firestore';

import DayTitle from '@/components/oraparts/DayTitle.vue';


const route = useRoute();
const db = useFirestore();

const { day: dateParam, id: dayId, readingId } = route.params;

// Документ чытання
const readingDocRef = doc(db, 'readings', readingId);
const { data: readingData, pending } = useDocument(readingDocRef);

// дата для DayTitle (аналогично Ютрані)
const nowDate = computed(() => {
  if (!dateParam) return '';
  const [y, m, d] = dateParam.split('-').map(Number);
  const originDate = new Date(y, m - 1, d);
  return `${moment(originDate).format('dddd')}, ${moment(originDate).format('LL')} `;
});

</script>

<style scoped>
.json-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  margin-bottom: 10px;
  user-select: none;
}
.json-toggle-label {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(var(--v-theme-on-surface), 0.35);
}
.json-toggle-id {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 0.7rem;
  color: rgba(var(--v-theme-on-surface), 0.25);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 240px;
}
.json-block {
  background: rgba(var(--v-theme-on-surface), 0.04);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 20px;
  overflow-x: auto;
}
.json-block pre {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 0.72rem;
  line-height: 1.55;
  color: rgba(var(--v-theme-on-surface), 0.75);
  white-space: pre;
  margin: 0;
}

.ora-text {
  text-align: left !important;
}

.ora-text :deep(*) {
  text-align: left !important;
}

.ora-text :deep([style*="text-align: justify"]),
.ora-text :deep([style*="text-align:justify"]) {
  text-align: left !important;
}
</style>