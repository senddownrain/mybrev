<template>
    <div>
        <v-card class="mb-2 ora" flat>
            <v-card-title class="ora-title">
                ПЕСНЯ З ЕВАНГЕЛЛЯ
            </v-card-title>
            <v-card-text class="ora-text">
                <div class="ora-ant" v-html="ant"></div>
                
                <!-- <div v-html="ps1"></div> -->
                <p class="ora-sub">
                    <span style="color:red">Песня Сімяона (Лк 2, 29-32)</span>
                <br>
                <span style="color:red">Хрыстус – святло народаў і хвала Ізраэля</span>
                </p>
                <div class="ora-psalm" v-html="nunc"></div>
                
                <div class="ora-ant" v-html="ant"></div>
            </v-card-text>
        </v-card>
    </div>
</template>


<script setup>
const props = defineProps({
    ant: String,
})

const nunc = `
<p>
Цяпер адпускаеш слугу Твайго, Валадару, *<br>
паводле слова Твайго, у спакоі;
</p>
<p>
бо вочы мае ўбачылі збаўленне Тваё, *<br>
якое падрыхтаваў Ты перад абліччам усіх народаў, 
</p>
<p>
святло для асвятлення язычнікаў *<br>
і хвалу народу Твайго Ізраэля.
</p>
<p>
Хвала Айцу і Сыну, *<br>
І Духу Святому.
</p>
<p>
Як была спрадвеку, цяпер і заўсёды, *<br>
і на векі вечныя. Амэн.
</p>`
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