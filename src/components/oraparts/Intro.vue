<template>
    <div>

        <v-card class="ora" flat>
            <v-card-title class="ora-header">
                {{ title }}
            </v-card-title>
            <v-card-text class="ora-text">
                <span style="color:red">К.</span> <span> Божа, прыйдзі мне на дапамогу.</span><br>

                <span style="color:red">Н.</span> <span> Пане, паспяшы да мяне на паратунак.</span><br>

                Хвала Айцу і Сыну,* і Духу Святому. <br>

                
                Як была спрадвеку, цяпер і заўсёды, *<br>
                    І на векі вечныя. Амэн.

                
                
                    Аллелюя.
                
            </v-card-text>
        </v-card>
    </div>
</template>


<script setup>
const props = defineProps({
    title: String,
})



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
<style>
.ora-header{
    font-weight: 700;
    font-size: calc(1.1rem * var(--font-size-multiplier, 1)) !important;
    font-family: var(--app-font-family, sans-serif) !important;
}

.ora-text {
  text-align: left !important;
}

.ora-text * {
  text-align: left !important;
}

.ora-text [style*="text-align: justify"],
.ora-text [style*="text-align:justify"] {
  text-align: left !important;
}
</style>