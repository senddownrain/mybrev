<template>
  <v-snackbar
    v-model="snackbar.show"
    :color="snackbar.color"
    :timeout="snackbar.timeout"
    location="bottom"
    variant="flat"
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

