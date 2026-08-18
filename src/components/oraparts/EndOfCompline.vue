<template>
    <div>

        <v-card class="ora" flat>
            <v-card-text class="ora-text">
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
                <alternative-text :text="ant" aria-label="Выбар антыфоны да Найсвяцейшай Панны Марыі" />
            </v-card-text>
        </v-card>
    </div>
</template>


<script setup>
import AlternativeText from '@/components/oraparts/AlternativeText.vue';

defineProps({
  ant: String,
});
</script>
