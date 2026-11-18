<template>
  <footer
    class="feedback-prompt"
    :class="{ 'feedback-prompt--reader': reader }"
    data-test="feedback-prompt"
  >
    <p :id="labelId || undefined" class="feedback-prompt__text prayer-report__text">{{ label }}</p>
    <RouterLink
      :to="destination"
      class="feedback-prompt__action prayer-report__action"
      :aria-describedby="labelId || undefined"
      :aria-label="`Паведаміць пра памылку. ${label}`"
      :data-test="actionTest || undefined"
    >
      <PhFlag :size="16" aria-hidden="true" />
      <span>Паведаміць</span>
    </RouterLink>
  </footer>
</template>

<script setup>
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { PhFlag } from '@phosphor-icons/vue';
import { feedbackLink, feedbackLocationForRoute } from '@/utils/feedbackContext';

const props = defineProps({
  label: { type: String, default: 'Заўважылі памылку ў тэксце?' },
  reader: { type: Boolean, default: false },
  to: { type: [Object, String], default: null },
  labelId: { type: String, default: '' },
  actionTest: { type: String, default: '' },
});

const route = useRoute();
const destination = computed(() => {
  if (props.to) return props.to;
  const contextual = feedbackLocationForRoute(route);
  if (contextual) return contextual;

  // The Compendium index and calendar month have no item ID; still retain
  // the screen context and return path for a useful feedback report.
  const isCompendium = route.path.startsWith('/compendium');
  const isOrdo = route.path.startsWith('/ordo');
  const fallback = feedbackLink({
    kind: isCompendium ? 'compendium' : isOrdo ? 'day' : 'other',
    title: isCompendium ? 'Кампендый' : isOrdo ? 'Літургічны каляндар' : undefined,
  });
  return { ...fallback, query: { ...fallback.query, ctx_path: route.path } };
});
</script>

<style scoped>
.feedback-prompt {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: min(calc(100% - 32px), 720px);
  margin: 20px auto 0;
  padding: 15px 0 20px;
  border-top: 1px solid var(--nav-border);
  color: var(--nav-muted);
  font-family: var(--ui-font-family, system-ui, sans-serif);
}

.feedback-prompt--reader {
  width: auto;
  margin: 0 20px;
  padding-bottom: 22px;
  border-color: var(--reader-border);
  color: color-mix(in srgb, var(--reader-ink) 62%, transparent);
}

.feedback-prompt__text {
  flex: 1 1 0;
  min-width: 0;
  margin: 0;
  font-size: .82rem;
  font-weight: 500;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.feedback-prompt__action {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid var(--nav-border);
  border-radius: 999px;
  background: var(--nav-surface);
  color: var(--nav-on-surface);
  font-size: .8rem;
  font-weight: 650;
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
  transition: background-color .15s ease, border-color .15s ease;
}

.feedback-prompt--reader .feedback-prompt__action {
  border-color: var(--reader-border);
  background: color-mix(in srgb, var(--reader-ink) 4%, transparent);
  color: var(--reader-ink);
}

.feedback-prompt__action:hover {
  background: var(--nav-active);
}

.feedback-prompt--reader .feedback-prompt__action:hover {
  background: color-mix(in srgb, var(--reader-ink) 8%, transparent);
}

.feedback-prompt__action:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
}

@media (max-width: 600px) {
  .feedback-prompt {
    margin-inline: 16px;
    width: auto;
  }
  .feedback-prompt__action {
    padding-inline: 11px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .feedback-prompt__action { transition: none; }
}
</style>
