<template>
    <div>
        <v-card class="ora" flat>
            <v-card-text class="ora-text reader-align-office">
                <alternative-text :text="formattedText" kind="reading" aria-label="Выбар чытання або рэспансорыя" />
            </v-card-text>
        </v-card>
    </div>
</template>


<script setup>
import { normalizeReadingHtml } from '@/utils/liturgicalSourceHtml';
import { computed } from 'vue';
import AlternativeText from '@/components/oraparts/AlternativeText.vue';
import { markLeadingLiturgicalSubheadings } from '@/utils/liturgicalHtml';

const props = defineProps({
  text: String,
})

const formattedText = computed(() => markLeadingLiturgicalSubheadings(normalizeReadingHtml(props.text)));
</script>

