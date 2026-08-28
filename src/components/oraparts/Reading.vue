<template>
    <div>
        <v-card class="ora" flat>
            <v-card-text class="ora-text">
                <alternative-text :text="formattedText" kind="reading" aria-label="Выбар чытання або рэспансорыя" />
            </v-card-text>
        </v-card>
    </div>
</template>


<script setup>
import { computed } from 'vue';
import AlternativeText from '@/components/oraparts/AlternativeText.vue';
import { markLeadingLiturgicalSubheadings } from '@/utils/liturgicalHtml';

const props = defineProps({
  text: String,
})

const formattedText = computed(() => markLeadingLiturgicalSubheadings(props.text));
</script>

<style scoped>
.ora-text {
  text-align: left !important;
}

.ora-text :deep(*) {
  text-align: left !important;
}

.ora-text :deep([style*="text-align: justify"]),
.ora-text :deep([style*="text-align:justify"]) {
  text-align: left !important;
}
</style>
