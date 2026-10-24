<template>
    <div>
        <v-card class="ora" flat>
            <v-card-text class="ora-text">
                <p v-if="title" data-liturgical-heading>{{ title }}</p>
                <alternative-text
                    v-model="choice"
                    :text="formattedText"
                    kind="office-reading"
                    aria-label="Выбар чытання"
                    @options="optionCount = $event"
                />
            </v-card-text>
        </v-card>
    </div>
</template>


<script setup>
import { computed, ref } from 'vue';
import { useReadingChoice } from '@/composables/useReadingChoice';
import AlternativeText from '@/components/oraparts/AlternativeText.vue';
import {
  markLeadingLiturgicalSubheadings,
  removeLectionSectionHeading,
} from '@/utils/liturgicalHtml';

const props = defineProps({
  text: String,
  title: { type: String, default: '' },
  // Office field name (`officeOfReadingsR2`): the picked reading is remembered per field, day and Office option.
  field: { type: String, default: '' },
})

const optionCount = ref(Infinity);
const choice = useReadingChoice(() => props.field, () => optionCount.value);

const formattedText = computed(() => markLeadingLiturgicalSubheadings(
  removeLectionSectionHeading(props.text, props.title),
));
</script>
