<template>
  <div class="liturgical-hour-column devotional-office" :data-office-profile="document.profile">
    <section v-for="section in visibleSections" :key="section.id" class="ora">
      <h2 v-if="heading(section).title" class="ora-title" :data-hour-heading="section.type === 'intro' ? '' : null">{{ heading(section).title }}</h2>
      <p v-if="heading(section).caption" class="ora-sub devotional-office__canticle-caption">{{ heading(section).caption }}</p>
      <div v-if="deadIntentions.length && section.type === 'hymn'" class="devotional-office__choices" role="group" aria-label="Намер малітвы за памерлых">
        <button
          v-for="(intention, index) in deadIntentions"
          :key="intention.label"
          type="button"
          :aria-pressed="intentionIndex === index"
          @click="intentionIndex = index"
        >{{ intention.label }}</button>
      </div>
      <div v-if="choices(section).length > 1" class="devotional-office__choices" role="group" :aria-label="`${section.title}: намер`">
        <button
          v-for="(option, index) in choices(section)"
          :key="`${section.id}-choice-${option.sourceIndex}`"
          type="button"
          :aria-pressed="choice(section) === index"
          @click="selected[section.id] = index"
        >{{ option.label }}</button>
      </div>
      <p v-if="deadIntentions.length && ['hymn', 'prayer'].includes(section.type) && !chosenIntention" class="devotional-office__context">Абярыце намерэнне перад гімнам, каб паказаць поўны тэкст.</p>
      <p v-if="deadIntentions.length && ['hymn', 'prayer'].includes(section.type) && chosenIntention && !selectedSection(section).blocks.length" class="devotional-office__context">Тэкст для гэтага намеру недаступны.</p>
      <div class="ora-text">
        <template v-for="(block, index) in displayItems(selectedSection(section))" :key="`${section.id}-${index}`">
          <template v-if="(index === 0 && section.title) || (block.level === 1 && block.text.trim() === documentTitle.trim())" />
          <h3 v-else-if="block.kind === 'heading' || (block.level && block.kind !== 'psalmTitle')" class="ora-sub">{{ block.text }}</h3>
          <div v-else-if="block.kind === 'antiphon'" class="ora-ant">
            <span class="devotional-office__ant-label">{{ antiphon(block)?.label }}</span>{{ antiphon(block)?.gap }}<span v-html="antiphonText(block)" />
          </div>
          <h3 v-else-if="block.kind === 'psalmTitle'" class="devotional-office__psalm-title" :data-work-type="psalmHeading(block)?.workType">{{ block.text }}</h3>
          <div v-else-if="block.kind === 'psalmMeta'" class="devotional-office__meta" v-html="subheadingHtml(block)" />
          <h3 v-else-if="block.kind === 'readingTitle' || block.kind === 'responseTitle'" class="ora-sub">{{ block.text }}</h3>
          <div v-else-if="block.kind === 'rubric'" class="liturgical-rubric" v-html="speakerHtml(block)" />
          <hr v-else-if="block.kind === 'separator'" class="devotional-office__separator" />
          <PsalmText v-else-if="block.kind === 'psalmBody'" :html="psalmHtml(block)" />
          <div v-else class="devotional-office__text" v-html="speakerHtml(block)" />
        </template>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import PsalmText from '@/components/oraparts/PsalmText.vue';
import { providePsalmody } from '@/composables/usePsalmody';
import { formatPsalmHtml, markPsalmCadenceSigns } from '@/utils/liturgicalHtml';
import { renderPrayerInline } from '@/utils/prayerMarkdown';
import {
  buildDevotionalOfficeDocument, devotionalAntiphon, devotionalBlockHtml,
  devotionalDeadIntentions, devotionalDeadSelection, devotionalDisplayItems,
  devotionalHeading, devotionalOfficeChoices, devotionalPsalmHeading, devotionalSelectedBlocks,
  devotionalSpeakerHtml, devotionalSubheadingHtml,
} from '@/utils/devotionalOffice';

const props = defineProps({
  text: { type: String, default: '' },
  format: { type: String, default: '' },
  profile: { type: String, required: true },
  prayerId: { type: String, default: '' },
  documentTitle: { type: String, default: '' },
});
providePsalmody(useRoute());
const document = computed(() => buildDevotionalOfficeDocument(props.text, props.format, props.profile));
const selected = reactive({});
const intentionIndex = ref(-1);
const deadIntentions = computed(() => devotionalDeadIntentions(props.prayerId));
const chosenIntention = computed(() => deadIntentions.value[intentionIndex.value] || null);
const choice = section => selected[section.id] || 0;
const choices = section => devotionalOfficeChoices(props.prayerId, section);
const selectedSection = section => {
  let blocks;
  let selectedAlternative = false;
  if (deadIntentions.value.length && ['hymn', 'prayer'].includes(section.type)) {
    blocks = devotionalDeadSelection(section, chosenIntention.value) || [];
  } else {
    const sourceIndex = choices(section)[choice(section)]?.sourceIndex || 0;
    selectedAlternative = sourceIndex > 0;
    blocks = devotionalSelectedBlocks(section, sourceIndex);
  }
  return { ...section, blocks: selectedAlternative
    ? blocks.filter(block => !/^(?:Або|Або іншыя):$/iu.test(block.text?.trim() || ''))
    : blocks };
};
const visibleSections = computed(() => document.value.sections.filter(section => {
  if (document.value.profile !== 'gadzinki' && section.type === 'alternatives') return false;
  if (section.id === 'office-intro' && section.blocks.every(block => block.level === 1)) return false;
  return true;
}));
const antiphon = devotionalAntiphon;
const psalmHeading = devotionalPsalmHeading;
const heading = section => devotionalHeading(section, document.value.profile);
const blockHtml = devotionalBlockHtml;
const speakerHtml = devotionalSpeakerHtml;
const subheadingHtml = devotionalSubheadingHtml;
const displayItems = devotionalDisplayItems;
const antiphonText = block => markPsalmCadenceSigns(renderPrayerInline(antiphon(block)?.text || ''));
const psalmHtml = block => formatPsalmHtml(blockHtml(block));
</script>

<style scoped>
.devotional-office { min-width: 0; }
.devotional-office .ora { min-width: 0; }
.devotional-office .ora-text { min-width: 0; }
.devotional-office__ant-label { color: var(--rubric-color); }
.devotional-office .ora-ant :deep(.psalm-marker) { color: var(--rubric-color); }
.devotional-office__psalm-title { color: var(--rubric-color); text-align: center !important; font-size: inherit; font-weight: 600; margin: 1.3em 0 .55em; }
.devotional-office__canticle-caption { margin: 0 28px; }
.devotional-office__meta :deep(p[data-liturgical-subheading]) { margin: 0; text-align: center !important; font-size: .84em; line-height: 1.45; }
.devotional-office__meta :deep(p[data-liturgical-subheading]:last-child) { margin-bottom: 1.15em; }
.devotional-office :deep([data-office-speaker]) { color: var(--rubric-color); font-weight: 700; }
.devotional-office__separator { border: 0; border-top: 1px solid var(--nav-border); margin: 1.2em 0; }
.devotional-office__text { margin-bottom: .8em; }
.devotional-office__text:last-child { margin-bottom: 0; }
.devotional-office__text :deep(p) { margin: 0 0 .8em; }
.devotional-office__choices { display: flex; flex-wrap: wrap; gap: .4em; padding: .5em 28px; }
.devotional-office__context { padding: .5em 28px; color: var(--rubric-color); }
.devotional-office__choices button { min-width: 0; max-width: 100%; border: 1px solid var(--nav-border); border-radius: 999px; padding: .35em .75em; color: var(--reader-ink); background: var(--reader-surface); cursor: pointer; text-align: left; overflow-wrap: anywhere; }
.devotional-office__choices button[aria-pressed='true'] { border-color: var(--rubric-color); color: var(--rubric-color); font-weight: 700; }
.devotional-office__choices button:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.devotional-office :deep(.ora-ant) { color: inherit; }
.devotional-office :deep(.liturgical-rubric) { color: var(--rubric-color); }
</style>
