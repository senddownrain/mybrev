<template>
  <nav v-if="nextHour" class="next-hour" aria-label="Наступная літургічная гадзіна">
    <RouterLink :to="nextRoute" class="next-hour__link">
      <span class="next-hour__eyebrow">Далей</span>
      <span class="next-hour__title">{{ nextHour.title }}</span>
      <PhArrowRight :size="22" aria-hidden="true" />
    </RouterLink>
  </nav>
</template>

<script setup>
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { PhArrowRight } from '@phosphor-icons/vue';
import { LITURGICAL_HOUR_TITLES, NEXT_LITURGICAL_HOUR } from '@/constants/liturgicalHours';

const route = useRoute();
const nextHour = computed(() => {
  const name = NEXT_LITURGICAL_HOUR[route.name];
  return name ? { name, title: LITURGICAL_HOUR_TITLES[name] } : null;
});
const nextRoute = computed(() => ({
  name: nextHour.value.name,
  params: { day: route.params.day, id: route.params.id },
}));
</script>

<style scoped>
.next-hour {
  width: min(calc(100% - 32px), 760px);
  margin: 8px auto max(36px, env(safe-area-inset-bottom));
}

.next-hour__link {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  min-height: 72px;
  padding: 14px 18px;
  border: 1px solid var(--nav-border);
  border-radius: 20px;
  background: var(--nav-surface);
  color: var(--nav-on-surface);
  text-decoration: none;
  box-shadow: 0 4px 18px var(--nav-button-shadow);
}

.next-hour__eyebrow {
  color: var(--nav-muted);
  font-size: .68rem;
  font-weight: 760;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.next-hour__title {
  grid-column: 1;
  margin-top: 2px;
  font-family: var(--reader-display-font-family);
  font-size: 1.05rem;
  font-weight: 720;
}

.next-hour__link > svg {
  grid-column: 2;
  grid-row: 1 / span 2;
  color: var(--chrome-accent);
}
</style>
