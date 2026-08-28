<template>
    <div>
        <v-card class="ora" flat>
            <v-card-title class="ora-title">
                ПСАЛМОДЫЯ
            </v-card-title>
            <v-card-text class="ora-text">
                <alternative-text v-model="ant1Option" class="ora-ant" :text="ant1" aria-label="Выбар першай антыфоны" />
                <alternative-text class="ora-psalm" :text="formatPsalm(ps1, ant1)" aria-label="Выбар першага псальма" />
                <alternative-text v-if="!singleAntiphon" v-model="ant1Option" class="ora-ant" :text="ant1" :show-picker="false" />
                <alternative-text v-if="!singleAntiphon && ant2" v-model="ant2Option" class="ora-ant ora-ant--separated" :text="ant2" aria-label="Выбар другой антыфоны" />
                <alternative-text v-if="ps2" class="ora-psalm" :text="formatPsalm(ps2, singleAntiphon ? ant1 : ant2)" aria-label="Выбар другога псальма" />
                <alternative-text v-if="!singleAntiphon && ant2" v-model="ant2Option" class="ora-ant" :text="ant2" :show-picker="false" />
                <alternative-text v-if="!singleAntiphon && ant3 && !hasEmbeddedThirdPsalmAlternatives" v-model="ant3Option" class="ora-ant ora-ant--separated" :text="ant3" aria-label="Выбар трэцяй антыфоны" />
                <alternative-text
                  v-if="ps3"
                  class="ora-psalm"
                  :text="formatPsalm(ps3, singleAntiphon ? ant1 : ant3)"
                  aria-label="Выбар трэцяга псальма"
                />
                <alternative-text v-if="singleAntiphon" v-model="ant1Option" class="ora-ant" :text="ant1" :show-picker="false" />
                <alternative-text v-else-if="ant3 && !hasEmbeddedThirdPsalmAlternatives" v-model="ant3Option" class="ora-ant" :text="ant3" :show-picker="false" />
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
import { formatPsalmHtml } from '@/utils/liturgicalHtml';
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
const formatPsalm = (psalm, antiphon) => formatPsalmHtml(psalm, {
  stripEmbeddedAntiphon: Boolean(antiphon),
});
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
