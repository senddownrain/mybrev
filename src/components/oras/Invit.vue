<template>
    <v-container  class="prayer-content-area">
        <v-row lign="center" justify="center">
            <v-col class="liturgical-hour-column" v-if="!pending && displayedDay">
                <day-title :day-data="day" />

                <v-select
                    v-if="invitatoriumOptions.length > 1"
                    v-model="selectedInvitatoriumId"
                    :items="invitatoriumOptions"
                    item-title="label"
                    item-value="id"
                    label="Псальм інвітаторыя"
                    variant="outlined"
                    density="comfortable"
                    class="mb-4"
                />

                <v-card class="ora" flat>
                    <v-card-title class="ora-header">
                        {{ title }}
                    </v-card-title>
                    <v-card-text class="ora-text">
                        <span style="color:red">Заклік з’яўляецца пачаткам штодзённай літургічнай малітвы. Ён
                            папярэднічае Гадзіне чытанняў або Ютрані, у залежнасці ад таго, якая з гэтых літургічных
                            гадзінаў распачынае малітву дня.</span> <br>
                        <br>
                        <span style="color:red">К.</span> <span> Пане, адкрый мае вусны.</span><br>
                        <span style="color:red">Н.</span> <span> І вусны мае будуць абвяшчаць Тваю хвалу.</span><br>
                    </v-card-text>
                </v-card>

                <v-card class="ora" flat>
                    <v-card-text class="ora-text">
                        <div class="ora-ant" v-html="displayedDay.invitatoriumAnt"></div>
                        <br>
                        <div class="ora-psalm" v-html="displayedDay.invitatoriumPs1"></div>
                        <br>
                        <div class="ora-ant" v-html="displayedDay.invitatoriumAnt"></div>
                        <br>
                        <div class="ora-psalm" v-html="displayedDay.invitatoriumPs2"></div>
                        <br>
                        <div class="ora-ant" v-html="displayedDay.invitatoriumAnt"></div>
                        <br>
                        <div class="ora-psalm" v-html="displayedDay.invitatoriumPs3"></div>
                        <br>
                        <div class="ora-ant" v-html="displayedDay.invitatoriumAnt"></div>
                        <br>
                        <div class="ora-psalm" v-html="displayedDay.invitatoriumPs4"></div>
                        <br>
                        <div class="ora-ant" v-html="displayedDay.invitatoriumAnt"></div>
                        <br v-if="displayedDay.invitatoriumPs5">
                        <div class="ora-psalm" v-if="displayedDay.invitatoriumPs5" v-html="displayedDay.invitatoriumPs5"></div>
                        <br v-if="displayedDay.invitatoriumPs5">
                        <div class="ora-ant" v-if="displayedDay.invitatoriumPs5" v-html="displayedDay.invitatoriumAnt"></div>
                        <br v-if="displayedDay.invitatoriumPs6">
                        <div class="ora-psalm" v-if="displayedDay.invitatoriumPs6" v-html="displayedDay.invitatoriumPs6"></div>
                        <br v-if="displayedDay.invitatoriumPs6">
                        <div class="ora-ant" v-if="displayedDay.invitatoriumPs6" v-html="displayedDay.invitatoriumAnt"></div>
                        <br v-if="displayedDay.invitatoriumPs6">
                    </v-card-text>
                </v-card>

            </v-col>
        </v-row>
    </v-container>

</template>

<script setup>

import { computed, onMounted, ref } from 'vue';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import { retryFirestore } from '@/utils/retry';
import { logger } from '@/utils/logger';
import { useResolvedLiturgicalDay } from '@/composables/useResolvedLiturgicalDay';
import DayTitle from '@/components/oraparts/DayTitle.vue';

const { day, pending } = useResolvedLiturgicalDay();
const invitatoriums = ref([]);
const selectedInvitatoriumId = ref('');
const optionLabel = (item, index) => {
  const text = String(item.invitatoriumPs1 || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return item.title || item.name || text.match(/Псальм\s+\d+(?:\s*\(\d+\))?/i)?.[0] || `Псальм ${index + 1}`;
};
const invitatoriumOptions = computed(() => invitatoriums.value.map((item, index) => ({
  id: item.id,
  label: optionLabel(item, index),
})));
const selectedInvitatorium = computed(() => invitatoriums.value.find((item) => item.id === selectedInvitatoriumId.value));
const displayedDay = computed(() => ({ ...(day.value || {}), ...(selectedInvitatorium.value || {}) }));

onMounted(async () => {
  try {
    const snapshot = await retryFirestore(() => getDocs(collection(db, 'invitatoriums')));
    invitatoriums.value = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    selectedInvitatoriumId.value = invitatoriums.value[0]?.id || '';
  } catch (error) {
    logger.error('[Invit] Не атрымалася загрузіць варыянты інвітаторыя:', error);
  }
});
const title = "ЗАКЛІК"

</script>
