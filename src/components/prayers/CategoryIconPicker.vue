<template>
  <div class="icon-picker">
    <span :id="labelId" class="icon-picker__label">Значок катэгорыі</span>
    <button
      type="button"
      class="icon-picker__trigger"
      :aria-expanded="open"
      :aria-controls="panelId"
      :aria-labelledby="`${labelId} ${valueId}`"
      @click="open = !open"
    >
      <span class="icon-picker__current"><CategoryIcon :icon-key="modelValue" :size="26" /></span>
      <span :id="valueId" class="icon-picker__value">{{ currentLabel }}</span>
      <PhCaretDown :size="16" class="icon-picker__caret" :class="{ 'icon-picker__caret--open': open }" aria-hidden="true" />
    </button>

    <div v-if="open" :id="panelId" class="icon-picker__panel">
      <section v-for="group in groups" :key="group.id" class="icon-picker__group" :aria-label="group.label">
        <h3>{{ group.label }}</h3>
        <div class="icon-picker__grid" role="radiogroup" :aria-label="group.label">
          <button
            v-for="icon in group.icons"
            :key="icon.key"
            type="button"
            role="radio"
            class="icon-picker__option"
            :class="{ 'icon-picker__option--selected': icon.key === modelValue }"
            :aria-checked="icon.key === modelValue"
            :data-icon-key="icon.key"
            @click="choose(icon.key)"
          >
            <CategoryIcon :icon-key="icon.key" :size="24" />
            <span>{{ icon.label }}</span>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { PhCaretDown } from '@phosphor-icons/vue';
import CategoryIcon from './CategoryIcon.vue';
import { CATEGORY_ICON_GROUPS, CATEGORY_ICONS, categoryIconMeta, normalizeCategoryIconKey } from '@/constants/prayerCategoryIcons.js';

const props = defineProps({ modelValue: { type: String, default: '' } });
const emit = defineEmits(['update:modelValue']);

const uid = `icon-picker-${Math.random().toString(36).slice(2, 9)}`;
const labelId = `${uid}-label`;
const valueId = `${uid}-value`;
const panelId = `${uid}-panel`;
const open = ref(false);

const groups = CATEGORY_ICON_GROUPS.map((group) => ({ ...group, icons: CATEGORY_ICONS.filter((icon) => icon.group === group.id) }));
const currentLabel = computed(() => categoryIconMeta(normalizeCategoryIconKey(props.modelValue))?.label || 'Абраць значок');

function choose(key) {
  emit('update:modelValue', key);
  open.value = false;
}
</script>

<style scoped>
.icon-picker { display: grid; gap: 6px; }
.icon-picker__label { color: var(--nav-muted, rgba(var(--v-theme-on-surface), .65)); font-size: .75rem; font-weight: 700; }
.icon-picker__trigger {
  display: flex; align-items: center; gap: 12px; width: 100%; min-height: 52px; padding: 8px 14px;
  border: 1px solid rgba(var(--v-theme-on-surface), .28); border-radius: 12px; background: transparent;
  color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.icon-picker__trigger:focus-visible, .icon-picker__option:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.icon-picker__current { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: rgba(var(--v-theme-primary), .12); color: rgb(var(--v-theme-primary)); }
.icon-picker__value { flex: 1; min-width: 0; font-weight: 600; }
.icon-picker__caret { transition: transform .15s; }
.icon-picker__caret--open { transform: rotate(180deg); }
.icon-picker__panel {
  display: grid; gap: 14px; max-height: min(52vh, 420px); overflow-y: auto; padding: 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), .18); border-radius: 14px; background: rgba(var(--v-theme-on-surface), .03);
}
.icon-picker__group h3 { margin: 0 0 8px; font-size: .72rem; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; opacity: .68; }
.icon-picker__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 6px; }
.icon-picker__option {
  display: grid; justify-items: center; align-content: start; gap: 4px; min-height: 68px; padding: 8px 4px;
  border: 1px solid transparent; border-radius: 12px; background: transparent; color: inherit; font: inherit;
  font-size: .7rem; line-height: 1.15; text-align: center; cursor: pointer; overflow-wrap: anywhere;
}
.icon-picker__option:hover { background: rgba(var(--v-theme-on-surface), .06); }
.icon-picker__option--selected { border-color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .14); color: rgb(var(--v-theme-primary)); font-weight: 700; }
</style>
