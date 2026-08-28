<template>
    <div>
        <v-card class="ora" flat>
            <v-card-text class="ora-text">
                <alternative-text :text="text" kind="reading" aria-label="Выбар чытання" />
            </v-card-text>
        </v-card>
    </div>
</template>


<script setup>
import AlternativeText from '@/components/oraparts/AlternativeText.vue';

defineProps({
  text: String
})
</script>
