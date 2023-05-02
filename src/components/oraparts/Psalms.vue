<template>
    <div>
        <v-card class="mb-2" flat>
            <v-card-title>
                ПСАЛМОДЫЯ
            </v-card-title>
            <v-card-text>
                <div v-html="ant1"></div>
                <br>
                <div v-html="ps1"></div>
                <br>
                <div v-html="ant1"></div>
                <br v-if="ant2"><br v-if="ant2">
                <div v-if="ant2" v-html="ant2"></div>
                <br v-if="ant2">
                <div v-if="ps2" v-html="ps2"></div>
                <br v-if="ps2">
                <div v-if="ant2" v-html="ant2"></div>
                <br v-if="ant2"><br v-if="ant2">
                <div v-if="ant3" v-html="ant3"></div>
                <br v-if="ant3">
                <div v-if="ps3" v-html="ps3"></div>
                <br v-if="ant3">
                <div v-if="ant3" v-html="ant3"></div>
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
const props = defineProps({
    ant1: String,
    ant2: String,
    ant3: String,
    ps1: String,
    ps2: String,
    ps3: String,
})
// import { ref } from 'vue'
// import moment from 'moment';
// import 'moment/dist/locale/be';

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