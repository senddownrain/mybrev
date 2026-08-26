<template>
    <div>
        <v-card class="ora" flat>
           <v-card-title class="ora-title">
            ПРОСЬБЫ
            </v-card-title>
            <v-card-text class="ora-text">
                <alternative-text :text="text" kind="intercession" aria-label="Выбар просьбаў" />
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
.ora-text :deep(.intercessions__intro) {
  margin-bottom: 0.8rem;
}

.ora-text :deep(.intercessions__refrain) {
  margin: 0.25rem 0 1.35rem;
  padding: 0.72rem 0.95rem;
  border-left: 3px solid var(--rubric-color);
  border-radius: 0 12px 12px 0;
  background: var(--rubric-soft);
  color: var(--reader-ink);
  font-weight: 700;
}

.ora-text :deep(.intercessions__petition) {
  margin-top: 1.15rem;
  margin-bottom: 0.3rem;
}

.ora-text :deep(.intercessions__response) {
  margin: 0 0 0.95rem 1.35rem;
  color: var(--reader-muted);
}

.ora-text :deep(.intercessions__continuation) {
  display: block;
  margin-left: 1.35rem;
  color: var(--reader-muted);
}

.ora-text :deep(.intercessions__conclusion) {
  margin-top: 1.35rem;
  color: var(--reader-muted);
  font-style: italic;
}

.ora-text :deep(.intercessions__response::first-letter) {
  color: var(--rubric-color);
  font-weight: 800;
}
</style>
