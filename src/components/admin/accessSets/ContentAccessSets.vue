<template>
  <details v-if="client" class="access-admin content-access-sets" data-sentry-block @toggle="open = $event.target.open">
    <summary>{{ canonical && !disabled ? 'Наборы доступу V2' : 'Наборы доступу V2 (толькі прагляд)' }}</summary>
    <p v-if="!canonical">Запіс набораў даступны пасля пераключэння кананічнага каталога.</p>
    <p>Дастаткова аднаго з выбраных набораў. Абмежаванні, атрыманыя праз катэгорыі або тэгі, перасякаюцца з уласнымі і могуць звузіць доступ.</p>
    <template v-if="open">
      <ContentSetOptions :key="auth.user.uid" :client="client" :selected="modelValue" :disabled="!canonical || disabled"
        @update:selected="$emit('update:modelValue', $event)" />
      <p v-if="access?.effectiveAccessSets">Захаваныя выніковыя наборы: {{ access.effectiveAccessSets.join(', ') || 'няма' }}</p>
    </template>
  </details>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { getCatalogEditorMode } from '@/services/prayerStorageService';
import { createAccessAdminClient } from './client';
import ContentSetOptions from './ContentSetOptions.vue';

defineProps({ access: { type: Object, default: null }, modelValue: { type: Array, default: () => [] }, disabled: Boolean });
const emit = defineEmits(['update:modelValue', 'mode']);
const auth = useAuthStore();
const open = ref(false);
const canonical = ref(false);
const client = computed(() => auth.canManageAccessSetsV2 && auth.user?.uid
  ? createAccessAdminClient(auth.user.uid) : null);
watch(client, async (current, _previous, onCleanup) => {
  let active = true;
  onCleanup(() => { active = false; });
  canonical.value = false;
  emit('mode', false);
  if (!current) return;
  const mode = await getCatalogEditorMode().catch(() => null);
  if (active) {
    canonical.value = mode === 'canonical';
    emit('mode', canonical.value);
  }
}, { immediate: true });
</script>

<style src="./accessAdmin.css"></style>
<style scoped>
.content-access-sets { max-width: none; margin: 8px 0 16px; padding: 10px 12px; border: 1px solid var(--access-border); border-radius: 8px; }
.content-access-sets summary { cursor: pointer; font-weight: 600; }
.content-access-sets summary:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); }
</style>
