<template>
    <div>
        <v-card class="ora" flat>
            <v-card-title class="ora-title">
                ПСАЛМОДЫЯ
            </v-card-title>
            <v-card-text class="ora-text">
                <div class="ora-ant" v-html="ant1"></div>
                <div class="ora-psalm" v-html="ps1"></div>
                <div class="ora-ant" v-if="!singleAntiphon" v-html="ant1"></div>
                <div class="ora-ant ora-ant--separated" v-if="!singleAntiphon && ant2" v-html="ant2"></div>
                <div class="ora-psalm" v-if="ps2" v-html="ps2"></div>
                <div class="ora-ant" v-if="!singleAntiphon && ant2" v-html="ant2"></div>
                <div class="ora-ant ora-ant--separated" v-if="!singleAntiphon && ant3" v-html="ant3"></div>
                <div class="ora-psalm" v-if="ps3" v-html="ps3"></div>
                <div class="ora-ant" v-if="singleAntiphon" v-html="ant1"></div>
                <div class="ora-ant" v-else-if="ant3" v-html="ant3"></div>
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
import { computed } from 'vue';
import { hasSingleAntiphonPsalmody } from '@/utils/liturgicalDayResolution';

const props = defineProps({
    ant1: String,
    ant2: String,
    ant3: String,
    ps1: String,
    ps2: String,
    ps3: String,
})
const singleAntiphon = computed(() => hasSingleAntiphonPsalmody(props));
// import { ref } from 'vue'
// import moment from '@/utils/moment-be';

// import { useRoute } from 'vue-router'
// import { useCollection, useFirestore, useDocument } from 'vuefire'
// import { collection, orderBy, query, doc, updateDoc } from 'firebase/firestore'

//const db = useFirestore()

//const days = useCollection(query(collection(db, 'days')))
//const notes = useCollection(query(collection(db, 'days'), orderBy('id')))

// const route = useRoute()
// const docRef = doc(db, "days", route.params.id);
// var { data: day, pending } = useDocument(docRef)

// const nowDate = moment(Date.now()).format('LL') 

</script>

<style scoped>
.ora-ant,
.ora-psalm {
  text-align: left !important;
}

.ora-ant--separated {
  margin-top: 12px;
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

.ora-psalm :deep(p:nth-child(even of p:not([style]))) {
  margin-left: 1rem;
}
</style>
