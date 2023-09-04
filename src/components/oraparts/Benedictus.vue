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
                    <span style="color:red">Песня Захарыі (Лк 1, 68-79)</span>
                <br>
                <span style="color:red">Месія і Яго папярэднік</span>
                </p>
                <div class="ora-psalm" v-html="ben"></div>        
               
                <div  class="ora-ant" v-html="ant"></div>
            </v-card-text>
        </v-card>
    </div>
</template>


<script setup>
const props = defineProps({
    ant: String,
})

const ben = `<p>Благаслаўлёны Пан, Бог Ізраэля, *<br>
бо наведаў і адкупіў народ свой,
</p>
<p>
і ўзняў моц збаўлення для нас *<br>
у доме Давіда, слугі свайго.
</p>
<p>
Як абвясціў спрадвеку *<br>
вуснамі сваіх святых прарокаў,
</p>
<p>
што збавіць нас ад ворагаў нашых *<br>
і ад рук усіх, хто нас ненавідзіць.
</p>
<p>
Каб праявіць міласэрнасць да айцоў нашых *<br>
і нагадаць пра святы запавет свой.
</p>
<p>
Прысягу, якую даў Абрагаму, айцу нашаму, *<br>
дасць нам.
</p>
<p>
Каб, выбаўленыя з рук ворагаў, *<br>
мы без страху служылі Яму
</p>
<p>
ў святасці і справядлівасці перад Ім *<br>
ва ўсе дні нашыя.
</p>
<p>
А ты, дзіцятка, прарокам Найвышэйшага будзеш названа, *<br>
бо пойдзеш прад абліччам Пана падрыхтаваць шляхі Яму,
</p>
<p>
каб даць народу Ягонаму пазнаць збаўленне *<br>
праз адпушчэнне яго грахоў,
</p>
<p>
дзякуючы сардэчнай міласэрнасці нашага Бога,*<br>
у якой наведаў нас Усход з вышыні;
</p>
<p>
каб асвятліць тых, *<br>
хто сядзіць у цемры і ў цені смяротным;
</p>
<p>
каб накіраваць ногі нашыя *<br>
на шлях спакою.
</p>
<p>
Хвала Айцу і Сыну, *<br>
І Духу Святому.
</p>
<p>
Як была спрадвеку, цяпер і заўсёды, *<br>
і на векі вечныя. Амэн.
</p>
`
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