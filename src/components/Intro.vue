<template>
    <div>
        
        <v-card class="mb-2">
            <v-card-title>
                {{title}}
            </v-card-title>
            <v-card-text>
                <p><span style="color:red">К.</span> <span> Божа, прыйдзі мне на дапамогу.</span>

                </p>
                <p><span style="color:red">Н.</span> <span> Божа, прыйдзі мне на дапамогу.</span>

                </p>
                <p>Хвала Айцу і Сыну,* і Духу Святому.

                </p>
                <p>Як была спрадвеку, цяпер і заўсёды, *
І на векі вечныя. Амэн.
                    
                </p>
                <p>
                    Аллелюя.
                </p>
            </v-card-text>
        </v-card>
    </div>
</template>


<script setup>
const props = defineProps({
  title: String,
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