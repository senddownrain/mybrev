<template>
  <div class="category-branch">
    <button
      type="button"
      class="category-link"
      :class="{ 'category-link--active': selectedKey === category.key }"
      :aria-expanded="category.children.length ? expanded : undefined"
      :aria-controls="category.children.length ? childrenId : undefined"
      :aria-current="selectedKey === category.key ? 'page' : undefined"
      @click="activate"
    >
      <PhBookmark :size="21" aria-hidden="true" />
      <span>{{ category.name }}</span>
      <PhCaretDown v-if="category.children.length" :size="18" :class="{ rotated: expanded }" aria-hidden="true" />
    </button>
    <div v-if="category.children.length && expanded" :id="childrenId" class="category-children" :class="{ 'category-children--deep': depth >= 4 }">
      <button v-if="category.directCount !== 0" type="button" class="category-link category-own" @click="$emit('select', category)">
        <span>Малітвы гэтай катэгорыі</span>
      </button>
      <PrayerCategoryBranch
        v-for="child in category.children"
        :key="child.key"
        :category="child"
        :depth="depth + 1"
        :selected-key="selectedKey"
        @select="$emit('select', $event)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { PhBookmark, PhCaretDown } from '@phosphor-icons/vue';
import { usePrayersFiltersStore } from '@/stores/prayersFilters';
const props = defineProps({ category: { type: Object, required: true }, selectedKey: { type: String, default: '' }, depth: { type: Number, default: 0 } });
const emit = defineEmits(['select']);
const filters = usePrayersFiltersStore();
const expanded = computed(() => filters.expandedCategoryKeys.includes(props.category.key));
const childrenId = computed(() => `category-children-${encodeURIComponent(props.category.key)}`);
function activate() {
  if (props.category.children.length) filters.toggleCategoryExpanded(props.category.key);
  else emit('select', props.category);
}
</script>

<style scoped>
.category-link { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 48px; padding: 10px 12px; border: 0; border-radius: 12px; color: var(--nav-on-surface); background: transparent; text-align: left; font: inherit; font-size: .9rem; cursor: pointer; }
.category-link span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.category-link svg { flex-shrink: 0; color: var(--chrome-accent); }
.category-link:hover, .category-link--active { background: var(--nav-active); }
.category-link:focus-visible { outline: 2px solid var(--chrome-accent); outline-offset: -2px; }
.category-children { margin-left: 10px; padding-left: 3px; border-left: 1px solid var(--nav-border); }
.category-children--deep { margin-left: 0; padding-left: 0; border-left: 0; }
.category-own { font-size: .78rem; color: var(--nav-muted); }
.rotated { transform: rotate(180deg); }
</style>
