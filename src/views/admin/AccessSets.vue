<template>
  <v-container class="access-admin" data-sentry-block>
    <router-link :to="{ name: 'Admin' }">← Адміністраванне</router-link>
    <h1>Асаблівы доступ</h1>
    <template v-if="client">
      <nav class="access-admin__nav" aria-label="Асаблівы доступ">
        <button
          v-for="section in sections"
          :key="section.label"
          type="button"
          :aria-pressed="selected === section"
          @click="selected = section"
        >{{ section.label }}</button>
      </nav>
      <component :is="selected.view" :key="auth.user.uid + selected.label" :client="client" />
    </template>
    <p v-else role="alert">Дзеянне недаступнае.</p>
  </v-container>
</template>

<script setup>
import { computed, shallowRef } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { createAccessAdminClient } from '@/components/admin/accessSets/client';
import SetsPanel from '@/components/admin/accessSets/SetsPanel.vue';
import ProfilesPanel from '@/components/admin/accessSets/ProfilesPanel.vue';
import CodesPanel from '@/components/admin/accessSets/CodesPanel.vue';
import DevicesPanel from '@/components/admin/accessSets/DevicesPanel.vue';

const auth = useAuthStore();
const sections = [
  { label: 'Наборы малітваў', view: SetsPanel },
  { label: 'Профілі', view: ProfilesPanel },
  { label: 'Коды', view: CodesPanel },
  { label: 'Прылады', view: DevicesPanel },
];
const selected = shallowRef(sections[0]);
const client = computed(() => auth.isAdmin && auth.user?.uid
  ? createAccessAdminClient(auth.user.uid) : null);
</script>

<style src="@/components/admin/accessSets/accessAdmin.css"></style>
