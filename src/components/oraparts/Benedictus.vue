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
                    <span style="color:red">Песня Захарыі (Лк 1, 68-79)</span>
                <br>
                <span style="color:red">Месія і Яго папярэднік</span>
                </p>
               <p>
                Благаслаўлёны Пан, Бог Ізраэля, *
бо наведаў і адкупіў народ свой,

і ўзняў моц збаўлення для нас *
у доме Давіда, слугі свайго.

Як абвясціў спрадвеку *
вуснамі сваіх святых прарокаў,

што збавіць нас ад ворагаў нашых *
і ад рук усіх, хто нас ненавідзіць.

Каб праявіць міласэрнасць да айцоў нашых *
і нагадаць пра святы запавет свой.

Прысягу, якую даў Абрагаму, айцу нашаму, *
дасць нам.

Каб, выбаўленыя з рук ворагаў, *
мы без страху служылі Яму

ў святасці і справядлівасці перад Ім *
ва ўсе дні нашыя.

А ты, дзіцятка, прарокам Найвышэйшага будзеш названа, *
бо пойдзеш прад абліччам Пана падрыхтаваць шляхі Яму,

каб даць народу Ягонаму пазнаць збаўленне *
праз адпушчэнне яго грахоў,

дзякуючы сардэчнай міласэрнасці нашага Бога,*
у якой наведаў нас Усход з вышыні;

каб асвятліць тых, *
хто сядзіць у цемры і ў цені смяротным;

каб накіраваць ногі нашыя *
на шлях спакою.

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