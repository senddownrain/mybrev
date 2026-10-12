<template>
  <v-btn :to="to" variant="text" class="liturgy-nav-link text-none" prepend-icon="mdi-cross">
    Літургія
  </v-btn>
</template>

<script setup>
defineProps({ to: { type: [Object, String], required: true } });
</script>

<style scoped>
.liturgy-nav-link {
  min-height: 44px;
  border-radius: 999px;
  color: var(--nav-on-surface);
  font-size: .84rem;
  font-weight: 650;
  letter-spacing: normal;
}
</style>
