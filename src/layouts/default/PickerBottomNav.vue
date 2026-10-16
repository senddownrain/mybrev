<template>
  <ReadingsBottomNav v-if="route.query.mode === 'readings'" />
  <BottomNav v-else />
</template>
<script setup>
import { useRoute } from 'vue-router';
import BottomNav from './BottomNav.vue';
import ReadingsBottomNav from './ReadingsBottomNav.vue';
const route = useRoute();
</script>
