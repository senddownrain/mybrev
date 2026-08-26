<template>
    <div>
        <v-card class="ora" flat>
            <v-card-text class="ora-text">
                <alternative-text :text="text" kind="reading" aria-label="Выбар чытання або рэспансорыя" />
            </v-card-text>
        </v-card>
    </div>
</template>


<script setup>
import AlternativeText from '@/components/oraparts/AlternativeText.vue';

defineProps({
  text: String,
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
