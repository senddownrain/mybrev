<template>
    <div>
        <v-card class="ora" flat>
           <v-card-title class="ora-title">
            МАЛІТВА
            </v-card-title>
            <v-card-text class="ora-text">
                <alternative-text :text="text" kind="prayer" aria-label="Выбар малітвы" />
            </v-card-text>
        </v-card>
    </div>
</template>


<script setup>
import AlternativeText from '@/components/oraparts/AlternativeText.vue';

defineProps({
  text: String,
})
</script>
