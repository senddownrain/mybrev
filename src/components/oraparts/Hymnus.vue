<template>
    <div>
        <v-card class="ora" flat>
            <v-card-title class="ora-title">
                ГІМН
            </v-card-title >
            <v-card-text class="ora-text">
                <alternative-text :text="text" kind="hymn" aria-label="Выбар варыянта гімна" />
            </v-card-text>
        </v-card>
    </div>
</template>


<script setup>
import AlternativeText from '@/components/oraparts/AlternativeText.vue';

defineProps({
  text: String,
});
</script>
