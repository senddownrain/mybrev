<template>
    <div>
        <v-card class="ora" flat>
            <v-card-title class="ora-title">
                ПЕСНЯ З ЕВАНГЕЛЛЯ
            </v-card-title>
            <v-card-text class="ora-text">
                <alternative-text v-model="antOption" class="ora-ant" :text="ant" aria-label="Выбар антыфоны" />
                
                <!-- <div v-html="ps1"></div> -->
                <p class="ora-sub">
                    <span style="color:red">Песня Сімяона (Лк 2, 29-32)</span>
                <br>
                <span style="color:red">Хрыстус – святло народаў і хвала Ізраэля</span>
                </p>
                <div class="ora-psalm" v-html="formatPsalm(nunc)"></div>
                
                <alternative-text v-model="antOption" class="ora-ant" :text="ant" :show-picker="false" />
            </v-card-text>
        </v-card>
    </div>
</template>


<script setup>
import { ref } from 'vue';
import AlternativeText from '@/components/oraparts/AlternativeText.vue';
import { formatPsalmHtml } from '@/utils/liturgicalHtml';

const props = defineProps({
    ant: String,
})
const formatPsalm = formatPsalmHtml;
const antOption = ref(0);

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
