<template>
  <v-app-bar flat class="floating-ora-bar" :class="{ 'floating-ora-bar--scrolled': showCapsule }">
    <v-app-bar-nav-icon class="ora-circle-btn" aria-label="Назад" @click="goBack"><PhArrowLeft :size="21" /></v-app-bar-nav-icon>
    <Transition name="hour-capsule">
      <div v-if="showCapsule" class="hour-capsule-anchor" :class="{ 'hour-capsule-anchor--admin': auth.isAdmin }">
        <v-menu location="bottom center">
          <template #activator="{ props }">
            <button v-bind="props" type="button" class="ora-location" :aria-label="`Выбраць гадзіну: ${hourTitle}`">
              <span>{{ hourTitle }}</span><PhCaretDown :size="14" aria-hidden="true" />
            </button>
          </template>
          <v-list class="ora-hour-menu" density="compact" aria-label="Літургічныя гадзіны">
            <v-list-item v-for="hour in hours" :key="hour.name" :to="hour.path" :title="hour.title"
              :subtitle="hour.selectorSubtitle"
              :active="isCurrentHour(hour)" />
          </v-list>
        </v-menu>
      </div>
    </Transition>
    <TextScaleControl v-if="isHour" class="ora-action-start" />
    <v-btn v-if="auth.isAdmin" icon variant="flat" class="ora-circle-btn" :class="{ 'ora-action-start': !isHour }" aria-label="Рэдагаваць" @click="onEditClick"><PhPencilSimple :size="21" /></v-btn>
  </v-app-bar>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import { PhArrowLeft, PhCaretDown, PhPencilSimple } from '@phosphor-icons/vue';
import TextScaleControl from '@/components/TextScaleControl.vue';
import { useLiturgicalHours } from '@/composables/useLiturgicalHours';
import moment from '@/utils/moment-be';
import { LITURGICAL_HOUR_TITLES } from '@/constants/liturgicalHours';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const hours = useLiturgicalHours();
const isHour = computed(() => route.name !== 'oras');
const hourTitle = computed(() => LITURGICAL_HOUR_TITLES[route.name] || 'Літургія гадзінаў');
const showCapsule = ref(false);
let headingObserver;
let contentObserver;
let heading;
function isCurrentHour(hour) {
  return hour.path.name === route.name && (hour.path.query.firstVespersDayId || '') === (route.query.firstVespersDayId || '');
}
function observeHeading() {
  const next = document.querySelector('[data-hour-heading]');
  if (heading === next) return;
  headingObserver?.disconnect();
  heading = next;
  showCapsule.value = false;
  if (!heading || !isHour.value) return;
  headingObserver = new window.IntersectionObserver(([entry]) => {
    showCapsule.value = !entry.isIntersecting && entry.boundingClientRect.bottom <= 64;
  }, { rootMargin: '-64px 0px 0px 0px' });
  headingObserver.observe(heading);
}
onMounted(async () => {
  await nextTick();
  contentObserver = new window.MutationObserver(observeHeading);
  contentObserver.observe(document.querySelector('.v-main'), { childList: true, subtree: true });
  observeHeading();
});
watch(() => route.fullPath, async () => {
  headingObserver?.disconnect();
  heading = null;
  showCapsule.value = false;
  await nextTick();
  observeHeading();
});
onBeforeUnmount(() => { headingObserver?.disconnect(); contentObserver?.disconnect(); });
const dateHomeRoute = computed(() => {
  const selectedDate = moment(route.params.day, 'YYYY-MM-DD', true);
  return !selectedDate.isValid() || selectedDate.isSame(moment(), 'day')
    ? { name: 'Today' } : { name: 'SelectedDay', params: { day: selectedDate.format('YYYY-MM-DD') } };
});
function goBack() {
  if (!isHour.value) router.push(dateHomeRoute.value);
  else if (window.history.length > 1) router.go(-1);
  else router.push({ name: 'oras', params: { ...route.params }, query: { ...route.query } });
}
function onEditClick() {
  if (route.params.id) router.push({ name: 'AdminDayEditor', params: { id: route.params.id }, query: route.params.day ? { date: route.params.day } : {} });
}
</script>

<style scoped>
.floating-ora-bar {
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

.floating-ora-bar--scrolled { background: var(--nav-surface) !important; }

.floating-ora-bar :deep(.v-toolbar__content) {
  gap: 8px;
  padding: 8px 12px;
}

.floating-ora-bar :deep(.v-toolbar__prepend),
.floating-ora-bar :deep(.v-toolbar__append) {
  margin-inline: 0;
}

.floating-ora-bar :deep(.v-toolbar__append) {
  gap: 8px;
}

.ora-circle-btn {
  width: 48px !important;
  height: 48px !important;
  min-width: 48px !important;
  flex: 0 0 48px !important;
  border: 1px solid var(--nav-border) !important;
  border-radius: 50% !important;
  background: color-mix(in srgb, var(--nav-surface) 78%, transparent) !important;
  color: var(--nav-on-surface) !important;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--nav-button-shadow) 72%, transparent) !important;
  transition: transform 0.16s ease, opacity 0.16s ease !important;
  backdrop-filter: blur(18px);
}

.ora-circle-btn:active {
  opacity: 0.72;
  transform: scale(0.94);
}

.ora-circle-btn--confirm {
  background: rgba(var(--chrome-accent-rgb), 0.13) !important;
  color: var(--chrome-accent) !important;
}

.ora-action-start {
  margin-left: auto !important;
}



.floating-ora-bar :deep(.text-scale-control) {
  background: color-mix(in srgb, var(--nav-surface) 78%, transparent);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--nav-button-shadow) 72%, transparent);
}



@media (max-width: 359px) {
  .floating-ora-bar :deep(.v-toolbar__content) {
    gap: 6px;
    padding-inline: 10px;
  }

  .ora-circle-btn {
    width: 44px !important;
    height: 44px !important;
    min-width: 44px !important;
    flex-basis: 44px !important;
  }



}

.hour-capsule-anchor { position: fixed; top: calc(13px + env(safe-area-inset-top, 0px)); left: calc(50% - 24px); transform: translateX(-50%); }
.ora-location { display: flex; align-items: center; gap: 6px; max-width: min(calc(100vw - 200px), 360px); height: 38px; padding: 0 13px; border: 1px solid var(--nav-border); border-radius: 20px; background: var(--nav-surface); color: var(--nav-on-surface); box-shadow: 0 2px 8px var(--nav-button-shadow); font: inherit; font-size: .82rem; font-weight: 700; cursor: pointer; }
.ora-location span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ora-location svg { flex-shrink: 0; }
.hour-capsule-anchor--admin { left: calc(50% - 48px); }
.hour-capsule-anchor--admin .ora-location { max-width: min(calc(100vw - 256px), 360px); }
.ora-hour-menu { max-height: min(65dvh, 480px); overflow-y: auto; }
.hour-capsule-enter-active, .hour-capsule-leave-active { transition: opacity .18s ease, translate .18s ease; }
.hour-capsule-enter-from, .hour-capsule-leave-to { opacity: 0; translate: 0 -5px; }
@media (prefers-reduced-motion: reduce) { .hour-capsule-enter-active, .hour-capsule-leave-active { transition: none; } }
</style>
