<template>
    <v-bottom-navigation 
    :value="value"
    color="#FE5A26"
    horizontal
    >
    
      <v-btn value="recent" @click="go('/notes')">
        <span>Уводзіны</span>
        <v-icon>mdi-history</v-icon>
      </v-btn>

      <v-btn value="favorites" @click="go('/')">
        <span>Сёння</span>
  
        <v-icon>mdi-heart</v-icon>
      </v-btn>
  
      <v-btn value="nearby" @click="go('/days')">
        <span>Дні</span>
  
        <v-icon>mdi-map-marker</v-icon>
      </v-btn>

      <v-btn value="weeks" @click="go('/weeks')">
        <span>Тыдні</span>
  
        <v-icon>mdi-map-marker</v-icon>
      </v-btn>
    </v-bottom-navigation>
  </template>

<script setup>
import { ref } from 'vue'
import router from '@/router';
const value = ref(1)
function go(item){
    router.push(item)
}
</script>