<template>
  <v-app>
    <default-bar />

    <default-view />
    <bottom-bar />
  </v-app>
</template>

<script setup>
  import DefaultBar from './AppBar.vue'
  import DefaultView from './View.vue'
  import BottomBar from './BottomNav.vue'
</script>
