<template>
  <v-menu v-model="open" :close-on-content-click="false" location="bottom end" offset="8">
    <template #activator="{ props: activator }">
      <button
        v-bind="activator"
        type="button"
        class="filter-button"
        :class="{ 'filter-button--active': selected.length > 1 }"
        :aria-label="`Дыяцэзіі ў календары: ${summary}`"
      >
        <PhFunnel :size="18" weight="bold" aria-hidden="true" />
        <span>{{ summary }}</span>
      </button>
    </template>
    <div class="filter-sheet" role="group" aria-label="Паказваць дыяцэзіі">
      <p class="filter-sheet__title">Паказваць дыяцэзіі</p>
      <label v-for="item in ORDO_DIOCESES" :key="item.value" class="filter-option">
        <input
          type="checkbox"
          :checked="selected.includes(item.value)"
          :disabled="selected.length === 1 && selected.includes(item.value)"
          @change="toggle(item.value, $event.target.checked)"
        >
        <span>{{ item.label }}</span>
      </label>
      <p class="filter-sheet__hint">Толькі для прагляду календара. Літургія гадзін і чытанні застаюцца для дыяцэзіі з налад.</p>
    </div>
  </v-menu>
</template>

<script setup>
import { computed, ref } from 'vue';
import { PhFunnel } from '@phosphor-icons/vue';
import { ORDO_DIOCESES } from '@/utils/ordoDiocese';
import { ordoDioceseFilter, setOrdoDioceseFilter } from '@/utils/ordoMonthFilter';
import { DIOCESE_SHORT_LABELS } from '@/utils/ordoScreen';

const open = ref(false);
const selected = computed(() => ordoDioceseFilter.value);
const summary = computed(() => (selected.value.length === ORDO_DIOCESES.length
  ? 'Усе дыяцэзіі'
  : selected.value.map((id) => DIOCESE_SHORT_LABELS[id]).join(', ')));

function toggle(id, checked) {
  const next = checked ? [...selected.value, id] : selected.value.filter((item) => item !== id);
  setOrdoDioceseFilter(next);
}
</script>

<style scoped>
.filter-button { display: inline-flex; align-items: center; gap: 7px; max-width: 100%; min-height: 40px; padding: 8px 14px; border: 1px solid var(--nav-border); border-radius: 999px; background: var(--nav-surface); color: var(--nav-on-surface); font: inherit; font-size: .8rem; font-weight: 700; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.filter-button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.filter-button--active { border-color: rgba(var(--chrome-accent-rgb), .4); color: var(--chrome-accent); }
.filter-button:focus-visible { outline: 3px solid rgba(var(--chrome-accent-rgb), .3); outline-offset: 2px; }
.filter-sheet { width: min(320px, calc(100vw - 32px)); padding: 16px 18px; border: 1px solid var(--nav-border); border-radius: 20px; background: var(--nav-surface); color: var(--nav-on-surface); box-shadow: 0 14px 40px var(--nav-shadow); }
.filter-sheet__title { margin: 0 0 8px; font-size: .72rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--nav-muted); }
.filter-option { display: flex; align-items: center; gap: 12px; min-height: 44px; font-size: .92rem; cursor: pointer; }
.filter-option input { width: 20px; height: 20px; accent-color: var(--chrome-accent); }
.filter-sheet__hint { margin: 10px 0 0; color: var(--nav-muted); font-size: .74rem; line-height: 1.45; }
</style>
