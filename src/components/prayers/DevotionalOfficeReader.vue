<template>
  <div class="liturgical-hour-column devotional-office" :data-office-profile="document.profile">
    <section v-for="section in visibleSections" :key="section.id" class="ora">
      <h2 v-if="section.title" class="ora-title">
        <template v-if="section.type === 'reading' && readingHeading(section.title)">
          {{ readingHeading(section.title).label }}
          <span v-if="readingHeading(section.title).reference" class="devotional-office__reference">{{ readingHeading(section.title).reference }}</span>
        </template>
        <template v-else>{{ section.title }}</template>
      </h2>
      <div class="ora-text">
        <template v-for="(block, index) in displayItems(section)" :key="`${section.id}-${index}`">
          <template v-if="(index === 0 && section.title) || (block.level === 1 && block.text.trim() === documentTitle.trim())" />
          <h3 v-else-if="block.kind === 'heading' || (block.level && block.kind !== 'psalmTitle')" class="ora-sub">{{ block.text }}</h3>
          <div v-else-if="block.kind === 'antiphon'" class="ora-ant">
            <span class="devotional-office__ant-label">{{ antiphon(block)?.label }}</span>{{ antiphon(block)?.gap }}<span v-html="antiphonText(block)" />
          </div>
          <h3 v-else-if="block.kind === 'psalmTitle'" class="devotional-office__psalm-title" :data-work-type="psalmHeading(block)?.workType">{{ block.text }}</h3>
          <h3 v-else-if="block.kind === 'readingTitle' || block.kind === 'responseTitle'" class="ora-sub">{{ block.text }}</h3>
          <div v-else-if="block.kind === 'rubric'" class="liturgical-rubric" v-html="blockHtml(block)" />
          <hr v-else-if="block.kind === 'separator'" class="devotional-office__separator" />
          <PsalmText v-else-if="block.kind === 'psalmBody'" :html="psalmHtml(block)" />
          <div v-else class="devotional-office__text" v-html="blockHtml(block)" />
        </template>
      </div>
      <div v-if="section.alternatives?.length" class="devotional-office__alternatives">
        <h3 class="ora-sub">Іншыя варыянты</h3>
        <details v-for="(option, index) in section.alternatives" :key="`${section.id}-alternative-${index}`">
          <summary>{{ option.title }}</summary>
          <div class="devotional-office__text" v-html="optionHtml(option)" />
        </details>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import PsalmText from '@/components/oraparts/PsalmText.vue';
import { providePsalmody } from '@/composables/usePsalmody';
import { formatPsalmHtml, markPsalmCadenceSigns } from '@/utils/liturgicalHtml';
import { renderPrayerInline } from '@/utils/prayerMarkdown';
import {
  buildDevotionalOfficeDocument, devotionalAntiphon, devotionalBlockHtml,
  devotionalDisplayItems, devotionalPsalmHeading, devotionalReadingHeading,
} from '@/utils/devotionalOffice';

const props = defineProps({
  text: { type: String, default: '' },
  format: { type: String, default: '' },
  profile: { type: String, required: true },
  documentTitle: { type: String, default: '' },
});
providePsalmody(useRoute());
const document = computed(() => buildDevotionalOfficeDocument(props.text, props.format, props.profile));
const visibleSections = computed(() => document.value.sections.filter(section => (
  section.type !== 'alternatives' || section.blocks.length > 1
)));
const antiphon = devotionalAntiphon;
const psalmHeading = devotionalPsalmHeading;
const readingHeading = devotionalReadingHeading;
const blockHtml = devotionalBlockHtml;
const displayItems = devotionalDisplayItems;
const antiphonText = block => markPsalmCadenceSigns(renderPrayerInline(antiphon(block)?.text || ''));
const psalmHtml = block => formatPsalmHtml(blockHtml(block));
const optionHtml = option => option.blocks.slice(1).map(blockHtml).join('');
</script>

<style scoped>
.devotional-office { min-width: 0; }
.devotional-office .ora { min-width: 0; }
.devotional-office .ora-text { min-width: 0; }
.devotional-office__ant-label { color: var(--rubric-color); }
.devotional-office .ora-ant :deep(.psalm-marker) { color: var(--rubric-color); }
.devotional-office__psalm-title { color: var(--rubric-color); text-align: center !important; font-size: inherit; font-weight: 600; margin: 1.3em 0 .55em; }
.devotional-office__reference { display: block; font-size: .88em; font-weight: 500; letter-spacing: normal; text-transform: none; }
.devotional-office__separator { border: 0; border-top: 1px solid var(--nav-border); margin: 1.2em 0; }
.devotional-office__text :deep(p) { margin: 0 0 .8em; }
.devotional-office__alternatives { margin-block: 1.2em; }
.devotional-office__alternatives details { border-top: 1px solid var(--nav-border); padding: .65em 0; }
.devotional-office__alternatives summary { color: var(--rubric-color); cursor: pointer; font-weight: 600; }
.devotional-office__alternatives summary:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.devotional-office__alternatives .devotional-office__text { padding-block: .7em; }
.devotional-office[data-office-profile='gadzinki'] .devotional-office__text :deep(p > strong:first-child) { color: var(--rubric-color); }
.devotional-office :deep(.ora-ant) { color: inherit; }
.devotional-office :deep(.liturgical-rubric) { color: var(--rubric-color); }
</style>
