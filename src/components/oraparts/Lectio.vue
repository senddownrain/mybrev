<template>
    <div>
        <v-card class="ora" flat>
            <v-card-text class="ora-text">
                <alternative-text :text="formattedText" kind="reading" aria-label="Выбар чытання" />
            </v-card-text>
        </v-card>
    </div>
</template>


<script setup>
import { computed } from 'vue';
import AlternativeText from '@/components/oraparts/AlternativeText.vue';
import { markLeadingLiturgicalSubheadings } from '@/utils/liturgicalHtml';

const props = defineProps({
  text: String
})

const formattedText = computed(() => markLeadingLiturgicalSubheadings(props.text));
</script>
