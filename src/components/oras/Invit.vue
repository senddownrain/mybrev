<template>
    <v-container  class="prayer-content-area">
        <v-row lign="center" justify="center">
            <v-col class="liturgical-hour-column" v-if="!pending && displayedDay">
                <day-title :day-data="day" />

                <div v-if="invitatoriumOptions.length > 1" class="hour-option-picker mb-5">
                  <div class="hour-option-picker__label">Выбар тэксту</div>
                  <v-select
                    v-model="selectedInvitatoriumId"
                    :items="invitatoriumOptions"
                    item-title="label"
                    item-value="id"
                    aria-label="Псальм інвітаторыя"
                    variant="solo-filled"
                    density="comfortable"
                    hide-details
                    prepend-inner-icon="mdi-book-open-variant-outline"
                    menu-icon="mdi-chevron-down"
                    class="hour-option-select"
                    :menu-props="{ contentClass: 'hour-option-menu' }"
                />
                </div>

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
                        <alternative-text v-model="antOption" class="ora-ant" :text="displayedDay.invitatoriumAnt" aria-label="Выбар антыфоны закліку" />
                        <br>
                        <div class="ora-psalm" v-html="formatPsalm(displayedDay.invitatoriumPs1)"></div>
                        <br>
                        <alternative-text v-model="antOption" class="ora-ant" :text="displayedDay.invitatoriumAnt" :show-picker="false" />
                        <br>
                        <div class="ora-psalm" v-html="formatPsalm(displayedDay.invitatoriumPs2)"></div>
                        <br>
                        <alternative-text v-model="antOption" class="ora-ant" :text="displayedDay.invitatoriumAnt" :show-picker="false" />
                        <br>
                        <div class="ora-psalm" v-html="formatPsalm(displayedDay.invitatoriumPs3)"></div>
                        <br>
                        <alternative-text v-model="antOption" class="ora-ant" :text="displayedDay.invitatoriumAnt" :show-picker="false" />
                        <br>
                        <div class="ora-psalm" v-html="formatPsalm(displayedDay.invitatoriumPs4)"></div>
                        <br>
                        <alternative-text v-model="antOption" class="ora-ant" :text="displayedDay.invitatoriumAnt" :show-picker="false" />
                        <br v-if="displayedDay.invitatoriumPs5">
                        <div class="ora-psalm" v-if="displayedDay.invitatoriumPs5" v-html="formatPsalm(displayedDay.invitatoriumPs5)"></div>
                        <br v-if="displayedDay.invitatoriumPs5">
                        <alternative-text v-if="displayedDay.invitatoriumPs5" v-model="antOption" class="ora-ant" :text="displayedDay.invitatoriumAnt" :show-picker="false" />
                        <br v-if="displayedDay.invitatoriumPs6">
                        <div class="ora-psalm" v-if="displayedDay.invitatoriumPs6" v-html="formatPsalm(displayedDay.invitatoriumPs6)"></div>
                        <br v-if="displayedDay.invitatoriumPs6">
                        <alternative-text v-if="displayedDay.invitatoriumPs6" v-model="antOption" class="ora-ant" :text="displayedDay.invitatoriumAnt" :show-picker="false" />
                        <br v-if="displayedDay.invitatoriumPs6">
                    </v-card-text>
                </v-card>

            </v-col>
        </v-row>
    </v-container>

</template>

<script setup>

import { computed, onMounted, ref } from 'vue';
import { logger } from '@/utils/logger';
import { useResolvedLiturgicalDay } from '@/composables/useResolvedLiturgicalDay';
import { getInvitatoriums } from '@/services/staticLiturgicalService';
import DayTitle from '@/components/oraparts/DayTitle.vue';
import AlternativeText from '@/components/oraparts/AlternativeText.vue';
import { removeBreakAfterAsterisk } from '@/utils/liturgicalHtml';

const { day, pending } = useResolvedLiturgicalDay();
const invitatoriums = ref([]);
const selectedInvitatoriumId = ref('');
const antOption = ref(0);
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
const formatPsalm = removeBreakAfterAsterisk;

onMounted(async () => {
  try {
    invitatoriums.value = await getInvitatoriums();
    selectedInvitatoriumId.value = invitatoriums.value[0]?.id || '';
  } catch (error) {
    logger.error('[Invit] Не атрымалася загрузіць варыянты інвітаторыя:', error);
  }
});
const title = "ЗАКЛІК"

</script>
