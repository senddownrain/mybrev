<template>
  <details v-if="client" class="access-admin content-access-sets" data-sentry-block @toggle="open = $event.target.open">
    <summary>Наборы доступу V2 (толькі прагляд)</summary>
    <p>Выбар і захаванне V2-даступнасці стануць магчымымі пасля падключэння запісу кананічнага каталога.</p>
    <p>Дастаткова аднаго з выбраных набораў. Абмежаванні, атрыманыя праз катэгорыі або тэгі, перасякаюцца з уласнымі і могуць звузіць доступ.</p>
    <template v-if="open">
      <ContentSetOptions :key="auth.user.uid" :client="client" :selected="access?.accessSets || []" />
      <p v-if="access">Выніковыя наборы: {{ access.effectiveAccessSets.join(', ') || 'няма' }}</p>
      <p v-else>Для гэтага запісу няма даных кананічнага каталога V2.</p>
    </template>
  </details>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { createAccessAdminClient } from './client';
import ContentSetOptions from './ContentSetOptions.vue';

// Canonical preview data comes from the future writer/reader integration.
// Only display its already-computed values, including inherited constraints.
defineProps({ access: { type: Object, default: null } });
const auth = useAuthStore();
const open = ref(false);
const client = computed(() => auth.canManageAccessSetsV2 && auth.user?.uid
  ? createAccessAdminClient(auth.user.uid) : null);
</script>

<style src="./accessAdmin.css"></style>
<style scoped>
.content-access-sets { max-width: none; margin: 8px 0 16px; padding: 10px 12px; border: 1px solid var(--access-border); border-radius: 8px; }
.content-access-sets summary { cursor: pointer; font-weight: 600; }
.content-access-sets summary:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); }
</style>
