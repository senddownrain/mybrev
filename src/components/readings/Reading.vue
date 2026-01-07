<template>
  <v-container class="prayer-content-area">
    <v-row >
      <v-col md="6" lg="6" sm="8" v-if="!pending && readingData">
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
import { computed } from 'vue';
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