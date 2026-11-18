<template>
    <div>
        <v-card class="ora" flat>
           <v-card-title class="ora-title">
            МАЛІТВА
            </v-card-title>
            <v-card-text class="ora-text reader-align-office">
                <alternative-text :text="text" kind="prayer" :expand-collect-conclusion="fullConclusion" aria-label="Выбар малітвы" />
            </v-card-text>
        </v-card>
    </div>
</template>


<script setup>
import AlternativeText from '@/components/oraparts/AlternativeText.vue';

defineProps({
  text: String,
  fullConclusion: { type: Boolean, default: false },
})
</script>
