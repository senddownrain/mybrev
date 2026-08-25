<template>
  <v-snackbar
    v-model="snackbar.show"
    :color="snackbar.color"
    :timeout="snackbar.timeout"
    location="bottom"
    variant="flat"
    class="notification-snackbar"
    :class="`notification-snackbar--${snackbar.color || 'info'}`"
  >
    {{ snackbar.text }}
    <template v-slot:actions>
      <v-btn
        variant="text"
        @click="snackbar.show = false"
      >
        Закрыць
      </v-btn>
    </template>
  </v-snackbar>
</template>

<script setup>
import { useNotifier } from '@/composables/useNotifier';

const { snackbar } = useNotifier();
</script>

<style scoped>
.notification-snackbar :deep(.v-snackbar__wrapper) {
  border-left: 4px solid var(--chrome-accent) !important;
}

.notification-snackbar--success :deep(.v-snackbar__wrapper) {
  border-left-color: rgb(var(--v-theme-success)) !important;
}

.notification-snackbar--error :deep(.v-snackbar__wrapper) {
  border-left-color: var(--rubric-color) !important;
}

.notification-snackbar--warning :deep(.v-snackbar__wrapper) {
  border-left-color: rgb(var(--v-theme-warning)) !important;
}
</style>

