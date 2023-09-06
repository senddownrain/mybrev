    <template>
        <div class="my-2">
            <p class="text-h5 date">
                {{ date }}
            </p>
            <p class="text-h5 day-name">
            <div v-if="dayName" v-html="dayName"></div>  <div v-if="feastType" v-html="feastType"></div>
            </p>


            <p v-if="!feastType" class="text-h6 psalms">
                {{ psalms }}
            </p>


        </div>
    </template>
    <!-- 
    <day-title :weekDay="day._weekDay" :date="nowDate" :psalms="day._psalmWeek" :feastType="day._feastType" :dayName="day._feastName ? day._feastName : day._dayName"/> -->

    <script setup>
    const props = defineProps({

        date: String,
        psalms: String,
        feastType: String,
        dayName: String,

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

    <style>
    .date {
        font-weight: 700;
        text-transform: uppercase !important;
    }

    .day-name {
        font-weight: 700;
    }

    .psalms {
        font-weight: 400;
    }
    </style>