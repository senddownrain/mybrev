<template>
    <div>
        <v-card class="ora" flat>
            <v-card-title class="ora-title">
                ГІМН
            </v-card-title >
            <v-card-text class="ora-text">
                <alternative-text :text="preparedText" kind="hymn" aria-label="Выбар варыянта гімна" />
            </v-card-text>
        </v-card>
    </div>
</template>


<script setup>
import { computed } from 'vue';
import { preparePastorsHymn } from '@/utils/pastorsHymn';
import AlternativeText from '@/components/oraparts/AlternativeText.vue';

const props = defineProps({
  text: String,
  feastName: { type: String, default: '' },
});

const preparedText = computed(() => preparePastorsHymn(props.text, props.feastName));
</script>
