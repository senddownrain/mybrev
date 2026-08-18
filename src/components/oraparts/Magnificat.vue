<template>
    <div>
        <v-card class="ora" flat>
            <v-card-title class="ora-title">
                ПЕСНЯ З ЕВАНГЕЛЛЯ
            </v-card-title>
            <v-card-text class="ora-text">
                <div class="ora-ant" v-html="ant"></div>
                
                <!-- <div v-html="ps1"></div> -->
                <p class="ora-sub">
                    <span style="color:red">Песня Марыі (Лк 1, 46-55)</span>
                <br>
                <span style="color:red">Радасць душы ў Пану</span>
                </p>
               <p>
                <div class="ora-psalm" v-html="mag"></div>
               </p>
               <div class="ora-ant" v-html="ant"></div>
            </v-card-text>
        </v-card>
    </div>
</template>


<script setup>
const props = defineProps({
    ant: String,
})

const mag = `
<p>
Велічае душа мая Пана, *<br>
і ўзрадаваўся дух мой у Богу, маім Збаўцу,
</p>
<p>
бо глянуў Бог на пакору сваёй слугі. *<br>
І цяпер благаслаўляць мяне будуць усе пакаленні.
</p>
<p>
Бо вялікае ўчыніў мне Усемагутны, *<br>
а імя Яго святое.
</p>
<p>
І міласэрнасць Яго з пакалення ў пакаленне *<br>
над тымі, хто Яго баіцца.
</p>
<p>
Паказаў моц сваёй правіцы, *<br>
рассеяў тых, хто пыхлівы сэрцам.
</p>
<p>
Скінуў магутных з трону *<br>
і ўзвысіў пакорных.
</p>
<p>
Дабром галодных насыціў, *<br>
а багатых ні з чым адправіў.
</p>
<p>
Прыняў свайго слугу Ізраэля, *<br>
памятаючы пра сваю міласэрнасць,
</p>
<p>
як абяцаў бацькам нашым - *<br>
Абрагаму і яго патомству навекі.
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
.ora-psalm :deep(p:nth-child(even of p:not([style]))) {
    margin-left: 1rem;
}
</style>
