<template>
  <v-app>
    <default-bar />

    <default-view />
    <bottom-nav-bar/>
  </v-app>
</template>

<script setup>
  import DefaultBar from './AppBar.vue'
  import DefaultView from './View.vue'
  import BottomNavBar from './BottomNav.vue'
</script>
