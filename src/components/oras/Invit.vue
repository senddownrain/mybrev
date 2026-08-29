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
                        <span class="liturgical-rubric" style="color:red">Заклік з’яўляецца пачаткам штодзённай літургічнай малітвы. Ён
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
                      
                        <div class="ora-psalm" v-html="formatPsalm(displayedDay.invitatoriumPs1)"></div>
                        <alternative-text v-model="antOption" class="ora-ant" :text="displayedDay.invitatoriumAnt" :show-picker="false" />
                        <div class="ora-psalm" v-html="formatPsalm(displayedDay.invitatoriumPs2)"></div>
                        <alternative-text v-model="antOption" class="ora-ant" :text="displayedDay.invitatoriumAnt" :show-picker="false" />
                        <div class="ora-psalm" v-html="formatPsalm(displayedDay.invitatoriumPs3)"></div>
                        <alternative-text v-model="antOption" class="ora-ant" :text="displayedDay.invitatoriumAnt" :show-picker="false" />
                        <div class="ora-psalm" v-html="formatPsalm(displayedDay.invitatoriumPs4)"></div>
                        <alternative-text v-model="antOption" class="ora-ant" :text="displayedDay.invitatoriumAnt" :show-picker="false" />
                        <div class="ora-psalm" v-if="displayedDay.invitatoriumPs5" v-html="formatPsalm(displayedDay.invitatoriumPs5)"></div>
                        <alternative-text v-if="displayedDay.invitatoriumPs5" v-model="antOption" class="ora-ant" :text="displayedDay.invitatoriumAnt" :show-picker="false" />
                        <div class="ora-psalm" v-if="displayedDay.invitatoriumPs6" v-html="formatPsalm(displayedDay.invitatoriumPs6)"></div>
                        <alternative-text v-if="displayedDay.invitatoriumPs6" v-model="antOption" class="ora-ant" :text="displayedDay.invitatoriumAnt" :show-picker="false" />
                      </v-card-text>
                </v-card>

            </v-col>
        </v-row>
    </v-container>

</template>

<script setup>

import { computed, onMounted, ref, watch } from 'vue';
import { logger } from '@/utils/logger';
import { useResolvedLiturgicalDay } from '@/composables/useResolvedLiturgicalDay';
import { getInvitatoriums } from '@/services/staticLiturgicalService';
import DayTitle from '@/components/oraparts/DayTitle.vue';
import AlternativeText from '@/components/oraparts/AlternativeText.vue';
import { formatPsalmHtml } from '@/utils/liturgicalHtml';
import { getDefaultInvitatoriumId } from '@/utils/invitatorium';

const { day, context, pending } = useResolvedLiturgicalDay();
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
const formatPsalm = formatPsalmHtml;
const periodType = computed(() => day.value?._periodType || context.value?.periodType);

watch([invitatoriums, periodType], () => {
  selectedInvitatoriumId.value = getDefaultInvitatoriumId(invitatoriums.value, periodType.value);
}, { immediate: true });

onMounted(async () => {
  try {
    invitatoriums.value = await getInvitatoriums();
  } catch (error) {
    logger.error('[Invit] Не атрымалася загрузіць варыянты інвітаторыя:', error);
  }
});
const title = "ЗАКЛІК"

</script>

<style scoped>
/* Separate each repeated antiphon from the psalm above it. */
.ora-psalm + .ora-ant {
  margin-top: 12px;
}
</style>
