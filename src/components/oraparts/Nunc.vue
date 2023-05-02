<template>
    <div>
        <v-card class="mb-2" flat>
            <v-card-title>
                ПЕСНЯ З ЕВАНГЕЛЛЯ
            </v-card-title>
            <v-card-text>
                <div v-html="ant"></div>
                <br>
                <!-- <div v-html="ps1"></div> -->
                <p>
                    <span style="color:red">Песня Сімяона (Лк 2, 29-32)</span>
                <br>
                <span style="color:red">Хрыстус – святло народаў і хвала Ізраэля</span>
                </p>
               <p>
                Цяпер адпускаеш слугу Твайго, Валадару, *
паводле слова Твайго, у спакоі;

бо вочы мае ўбачылі збаўленне Тваё, *
якое падрыхтаваў Ты перад абліччам усіх народаў, 

святло для асвятлення язычнікаў *
і хвалу народу Твайго Ізраэля.

Хвала Айцу і Сыну, *
І Духу Святому.

Як была спрадвеку, цяпер і заўсёды, *
і на векі вечныя. Амэн.
               </p>
               <br>
               <div v-html="ant"></div>
            </v-card-text>
        </v-card>
    </div>
</template>


<script setup>
const props = defineProps({
    ant: String,
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