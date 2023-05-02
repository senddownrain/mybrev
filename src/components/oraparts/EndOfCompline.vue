<template>
    <div>

        <v-card class="mb-2" flat>
            <v-card-title>
            </v-card-title>
            <v-card-text>
                <p><span style="color:red">Потым, нават тады, калі Камплета чытаецца індывідуальна, прамаўляецца благаслаўленне:</span> </p>
                <br>
                <p><span style="color:red">К.</span> <span>
                    Ноч спакойную і смерць шчаслівую няхай дасць нам Бог усемагутны, Айцец і Сын, і Дух Святы.
                    </span>
                </p>
                <p><span style="color:red">Н.</span> <span> Амэн.</span>
                </p>
<br>
                <p><span style="color:red">АНТЫФОНЫ НА ЗАКАНЧЭННЕ ДА НАЙСВЯЦЕЙШАЙ ПАННЫ МАРЫІ</span> </p>
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