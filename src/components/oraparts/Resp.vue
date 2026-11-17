<template>
    <div>
        <v-card class="ora" flat>
            <v-card-text class="ora-text">
                <alternative-text :text="formattedText" aria-label="Выбар верша" />
            </v-card-text>
        </v-card>
    </div>
</template>


<script setup>
import { computed } from 'vue';
import { formatOfficeReadingPresentation } from '@/utils/officeReadingPresentation';
import AlternativeText from '@/components/oraparts/AlternativeText.vue';

const props = defineProps({
  text: String,
})
const formattedText = computed(() => formatOfficeReadingPresentation(props.text));
</script>
