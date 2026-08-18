<template>
  <v-container class="prayer-content-area">
    <v-row align="center" justify="center">
      <v-col v-if="!pending && displayedDay" md="6" lg="6" sm="8">
        <day-title :day-data="day" />
        <intro :title="title" />

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
          <v-card-title class="ora-header">ЗАКЛІК</v-card-title>
          <v-card-text class="ora-text">
            <span style="color: red">
              Заклік з’яўляецца пачаткам штодзённай літургічнай малітвы. Ён
              папярэднічае Гадзіне чытанняў або Ютрані, у залежнасці ад таго,
              якая з гэтых літургічных гадзінаў распачынае малітву дня.
            </span>
            <br><br>
            <span style="color: red">К.</span> Пане, адкрый мае вусны.<br>
            <span style="color: red">Н.</span> І вусны мае будуць абвяшчаць Тваю хвалу.<br>
          </v-card-text>
        </v-card>

        <v-card class="ora" flat>
          <v-card-text class="ora-text">
            <template v-for="(psalm, index) in invitatoriumPsalms" :key="index">
              <div class="ora-ant" v-html="displayedDay.invitatoriumAnt"></div>
              <br>
              <div class="ora-psalm" v-html="psalm"></div>
              <br>
            </template>
            <div class="ora-ant" v-html="displayedDay.invitatoriumAnt"></div>
          </v-card-text>
        </v-card>

        <hymnus :text="day.laudesHymn" />

        <psalms
          :ant1="day.officeOfReadingsAnt1"
          :ant2="day.officeOfReadingsAnt2"
          :ant3="day.officeOfReadingsAnt3"
          :ps1="day.officeOfReadingsPs1"
          :ps2="day.officeOfReadingsPs2"
          :ps3="day.officeOfReadingsPs3"
        />
        <resp :text="day.officeOfReadingsVers" />
        <lectio :text="day.officeOfReadingsR1" />
        <lectio :text="day.officeOfReadingsR2" />

        <psalms
          :ant1="day.laudesAnt1"
          :ant2="day.laudesAnt2"
          :ant3="day.laudesAnt3"
          :ps1="day.laudesPs1"
          :ps2="day.laudesPs2"
          :ps3="day.laudesPs3"
        />
        <reading :text="day.laudesR" />
        <benedictus :ant="day.laudesAntBen" />
        <inters :text="day.laudesInter" />
        <pater-noster />
        <last-prayer :text="day.laudesPr" />
        <end-of-vesper />
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
import Benedictus from '@/components/oraparts/Benedictus.vue';
import DayTitle from '@/components/oraparts/DayTitle.vue';
import EndOfVesper from '@/components/oraparts/EndOfVesper.vue';
import Hymnus from '@/components/oraparts/Hymnus.vue';
import Inters from '@/components/oraparts/Inters.vue';
import Intro from '@/components/oraparts/Intro.vue';
import LastPrayer from '@/components/oraparts/LastPrayer.vue';
import Lectio from '@/components/oraparts/Lectio.vue';
import PaterNoster from '@/components/oraparts/PaterNoster.vue';
import Psalms from '@/components/oraparts/Psalms.vue';
import Reading from '@/components/oraparts/Reading.vue';
import Resp from '@/components/oraparts/Resp.vue';

const title = 'РАНІЦА';
const { day, pending } = useResolvedLiturgicalDay();
const invitatoriums = ref([]);
const selectedInvitatoriumId = ref('');

const optionLabel = (item, index) => {
  const text = String(item.invitatoriumPs1 || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return item.title
    || item.name
    || text.match(/Псальм\s+\d+(?:\s*\(\d+\))?/i)?.[0]
    || `Псальм ${index + 1}`;
};

const invitatoriumOptions = computed(() => invitatoriums.value.map((item, index) => ({
  id: item.id,
  label: optionLabel(item, index),
})));

const selectedInvitatorium = computed(() => (
  invitatoriums.value.find((item) => item.id === selectedInvitatoriumId.value)
));

const displayedDay = computed(() => ({
  ...(day.value || {}),
  ...(selectedInvitatorium.value || {}),
}));

const invitatoriumPsalms = computed(() => (
  [1, 2, 3, 4, 5, 6]
    .map((number) => displayedDay.value?.[`invitatoriumPs${number}`])
    .filter(Boolean)
));

onMounted(async () => {
  try {
    const snapshot = await retryFirestore(() => getDocs(collection(db, 'invitatoriums')));
    invitatoriums.value = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    selectedInvitatoriumId.value = invitatoriums.value[0]?.id || '';
  } catch (error) {
    logger.error('[Morning] Не атрымалася загрузіць варыянты інвітаторыя:', error);
  }
});
</script>
