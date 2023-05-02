<template>
    <div>
        <p class="text-h4 ma-2">
    {{ date }}
        </p>
        <p class="text-h6 ma-2">
    {{ day }}
        </p>
    </div>

</template>


<script setup>
const props = defineProps({
  day: String,
  date: String
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