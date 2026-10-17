<template>
  <Transition name="back-top">
    <button v-if="visible" type="button" class="back-to-top" :class="{ 'back-to-top--bottom-nav': bottomNav }" aria-label="Уверх" @click="goUp">
      <PhArrowUp :size="21" aria-hidden="true" />
    </button>
  </Transition>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { PhArrowUp } from '@phosphor-icons/vue';
import { trackFeature } from '@/utils/trackFeature';
defineProps({ bottomNav: Boolean });
const visible = ref(false);
const update = () => { visible.value = window.scrollY > Math.max(400, window.innerHeight * .7); };
const goUp = () => { trackFeature('back_to_top'); window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
onMounted(() => { update(); window.addEventListener('scroll', update, { passive: true }); });
onBeforeUnmount(() => window.removeEventListener('scroll', update));
</script>

<style scoped>
.back-to-top { position: fixed; z-index: 90; right: max(16px, calc((100vw - 760px) / 2 + 16px)); bottom: calc(20px + env(safe-area-inset-bottom, 0px)); display: grid; place-items: center; width: 40px; height: 40px; border: 1px solid var(--nav-border); border-radius: 50%; background: var(--nav-surface); color: var(--nav-on-surface); box-shadow: 0 2px 8px var(--nav-button-shadow); cursor: pointer; }
.back-to-top--bottom-nav { bottom: var(--bottom-nav-clearance); }
.back-to-top:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 3px; }
.back-top-enter-active, .back-top-leave-active { transition: opacity .18s ease, transform .18s ease; }
.back-top-enter-from, .back-top-leave-to { opacity: 0; transform: translateY(6px); }
@media (prefers-reduced-motion: reduce) { .back-top-enter-active, .back-top-leave-active { transition: none; } }
</style>
