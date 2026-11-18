<template>
    <div>
        <v-card class="ora" flat>
            <v-card-title class="ora-title">
                ПСАЛЬМОДЫЯ
            </v-card-title>
            <v-card-text class="ora-text">
                <alternative-text highlight-antiphon-label v-model="ant1Option" class="ora-ant" :text="ant1" :following-psalm-html="selectedPsalm(formattedPs1, ps1Option)" aria-label="Выбар першай антыфоны" />
                <alternative-text class="ora-psalm" kind="psalm" v-model="ps1Option" :text="formattedPs1" aria-label="Выбар першага псальма">
                  <template #default="{ html }"><PsalmText :html="displayPsalm(html, ant1, ant1Option)" /></template>
                </alternative-text>
                <alternative-text highlight-antiphon-label v-if="!singleAntiphon" v-model="ant1Option" class="ora-ant" :text="ant1" :show-picker="false" />
                <alternative-text highlight-antiphon-label v-if="!singleAntiphon && ant2" v-model="ant2Option" class="ora-ant ora-ant--separated" :text="ant2" :following-psalm-html="selectedPsalm(formattedPs2, ps2Option)" aria-label="Выбар другой антыфоны" />
                <alternative-text v-if="ps2" class="ora-psalm" kind="psalm" v-model="ps2Option" :text="formattedPs2" aria-label="Выбар другога псальма">
                  <template #default="{ html }"><PsalmText :html="displayPsalm(html, ant2, singleAntiphon ? null : ant2Option)" /></template>
                </alternative-text>
                <alternative-text highlight-antiphon-label v-if="!singleAntiphon && ant2" v-model="ant2Option" class="ora-ant" :text="ant2" :show-picker="false" />
                <alternative-text highlight-antiphon-label v-if="!singleAntiphon && ant3 && !hasEmbeddedThirdPsalmAlternatives" v-model="ant3Option" class="ora-ant ora-ant--separated" :text="ant3" :following-psalm-html="selectedPsalm(formattedPs3, ps3Option)" aria-label="Выбар трэцяй антыфоны" />
                <alternative-text
                  v-if="ps3"
                  class="ora-psalm" kind="psalm"
                  v-model="ps3Option" :text="formattedPs3"
                  aria-label="Выбар трэцяга псальма">
                  <template #default="{ html }"><PsalmText :html="displayPsalm(html, ant3, singleAntiphon ? null : ant3Option)" /></template>
                </alternative-text>
                <alternative-text highlight-antiphon-label v-if="singleAntiphon" v-model="ant1Option" class="ora-ant" :text="ant1" :show-picker="false" />
                <alternative-text highlight-antiphon-label v-else-if="ant3 && !hasEmbeddedThirdPsalmAlternatives" v-model="ant3Option" class="ora-ant" :text="ant3" :show-picker="false" />
                <!-- <p><span style="color:red">1 ант.</span> <span> {{ ant1 }}</span></p>
                <p>{{ ps1 }}</p>
                <p><span style="color:red">2 ант.</span> <span> {{ ant2 }}</span></p>
                <p>{{ ps2 }}</p>
                <p><span style="color:red">3 ант.</span> <span> {{ ant3 }}</span></p>
                <p>{{ ps3 }}</p> -->
            </v-card-text>
        </v-card>
    </div>
</template>


<script setup>
import { computed, ref } from 'vue';
import { hasSingleAntiphonPsalmody } from '@/utils/liturgicalDayResolution';
import { formatPsalmHtml, markAntiphonLabel } from '@/utils/liturgicalHtml';
import { getLiturgicalAlternatives } from '@/utils/liturgicalAlternatives';
import { omitEchoedPsalmOpening } from '@/utils/psalmOpening';
import PsalmText from '@/components/oraparts/PsalmText.vue';
import AlternativeText from '@/components/oraparts/AlternativeText.vue';

const props = defineProps({
    ant1: String,
    ant2: String,
    ant3: String,
    ps1: String,
    ps2: String,
    ps3: String,
})
const singleAntiphon = computed(() => hasSingleAntiphonPsalmody(props));
const hasEmbeddedThirdPsalmAlternatives = computed(() => (
  String(props.ps3 || '').includes('data-alternative-title=')
));
const ant1Option = ref(0);
const ant2Option = ref(0);
const ant3Option = ref(0);
const ps1Option = ref(0);
const ps2Option = ref(0);
const ps3Option = ref(0);
const formatPsalm = (psalm, antiphon) => markAntiphonLabel(formatPsalmHtml(psalm, {
  stripEmbeddedAntiphon: Boolean(antiphon),
  antiphon,
}));
const formattedPs1 = computed(() => formatPsalm(props.ps1, props.ant1));
const formattedPs2 = computed(() => formatPsalm(props.ps2, singleAntiphon.value ? props.ant1 : props.ant2));
const formattedPs3 = computed(() => formatPsalm(props.ps3, singleAntiphon.value ? props.ant1 : props.ant3));
const selectedPsalm = (formatted, index) => getLiturgicalAlternatives(formatted, 'psalm')[index]?.html || '';
const displayPsalm = (html, antiphon, index) => {
  // A shared antiphon is announced only before the first psalm.
  const chosen = index === null ? '' : getLiturgicalAlternatives(antiphon)[index]?.html;
  return omitEchoedPsalmOpening(html, chosen);
};
</script>

<style scoped>
.ora-ant,
.ora-psalm {
  text-align: left !important;
}

.ora-ant--separated {
  margin-top: 12px;
}

/* Give a repeated antiphon the same breathing room above that the
   opening antiphon has below. This also covers one-antiphon psalmody. */
.ora-psalm + .ora-ant {
  margin-top: 22px;
}

/* Keep consecutive psalms readable when one antiphon surrounds the group. */
.ora-psalm + .ora-psalm {
  margin-top: 14px;
}

.ora-ant :deep(*),
.ora-psalm :deep(*) {
  text-align: left !important;
}

.ora-ant :deep([style*="text-align: justify"]),
.ora-ant :deep([style*="text-align:justify"]),
.ora-psalm :deep([style*="text-align: justify"]),
.ora-psalm :deep([style*="text-align:justify"]) {
  text-align: left !important;
}

</style>
