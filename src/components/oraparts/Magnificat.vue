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
                    <span style="color:red">Песня Марыі (Лк 1, 46-55)</span>
                <br>
                <span style="color:red">Радасць душы ў Пану</span>
                </p>
               <p>
                Велічае душа мая Пана, *
і ўзрадаваўся дух мой у Богу, маім Збаўцу,

бо глянуў Бог на пакору сваёй слугі. *
І цяпер благаслаўляць мяне будуць усе пакаленні.

Бо вялікае ўчыніў мне Усемагутны, *
а імя Яго святое.

І міласэрнасць Яго з пакалення ў пакаленне *
над тымі, хто Яго баіцца.

Паказаў моц сваёй правіцы, *
рассеяў тых, хто пыхлівы сэрцам.

Скінуў магутных з трону *
і ўзвысіў пакорных.

Дабром галодных насыціў, *
а багатых ні з чым адправіў.

Прыняў свайго слугу Ізраэля, *
памятаючы пра сваю міласэрнасць,

як абяцаў бацькам нашым - *
Абрагаму і яго патомству навекі.

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