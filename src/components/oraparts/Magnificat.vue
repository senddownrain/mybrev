<template>
    <div>
        <v-card class="ora" flat>
            <v-card-title class="ora-title">
                ПЕСНЯ МАРЫІ
            </v-card-title>
            <v-card-text class="ora-text">
                <alternative-text v-model="antOption" class="ora-ant" :text="ant" kind="gospel-antiphon" aria-label="Выбар антыфоны" />
                
                <!-- <div v-html="ps1"></div> -->
                <p class="ora-sub">
                    <span style="color:red">Лк 1, 46-55</span>
                <br>
                <span style="color:red">Радасць душы ў Пану</span>
                </p>
               <PsalmText :html="formatPsalm(mag)" />
               <alternative-text v-model="antOption" class="ora-ant" :text="ant" kind="gospel-antiphon" :show-picker="false" />
            </v-card-text>
        </v-card>
    </div>
</template>


<script setup>
import { ref } from 'vue';
import PsalmText from '@/components/oraparts/PsalmText.vue';
import AlternativeText from '@/components/oraparts/AlternativeText.vue';
import { formatPsalmHtml } from '@/utils/liturgicalHtml';

defineProps({
    ant: String,
})
const formatPsalm = formatPsalmHtml;
const antOption = ref(0);

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
</script>
