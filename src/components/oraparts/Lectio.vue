<template>
    <div>
        <v-card class="ora" flat>
            <v-card-text class="ora-text">
                <p v-if="title" data-liturgical-heading>{{ title }}</p>
                <alternative-text :text="formattedText" kind="reading" aria-label="Выбар чытання" />
            </v-card-text>
        </v-card>
    </div>
</template>


<script setup>
import { computed } from 'vue';
import AlternativeText from '@/components/oraparts/AlternativeText.vue';
import {
  markLeadingLiturgicalSubheadings,
  removeLectionSectionHeading,
} from '@/utils/liturgicalHtml';

const props = defineProps({
  text: String,
  title: { type: String, default: '' },
})

const formattedText = computed(() => markLeadingLiturgicalSubheadings(
  removeLectionSectionHeading(props.text, props.title),
));
</script>
