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
import { useLiturgicalHours } from '@/composables/useLiturgicalHours';
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { PhArrowRight } from '@phosphor-icons/vue';
import { NEXT_LITURGICAL_HOUR, liturgicalHourRoute } from '@/constants/liturgicalHours';

const route = useRoute();
const hours = useLiturgicalHours();
const nextHour = computed(() => {
  const name = NEXT_LITURGICAL_HOUR[route.name];
  return name ? hours.value.find((hour) => hour.name === name) : null;
});
const nextRoute = computed(() => liturgicalHourRoute(route, nextHour.value.name));
</script>

<style scoped>
.next-hour {
  width: min(calc(100% - 32px), 760px);
  margin: 8px auto 0;
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
