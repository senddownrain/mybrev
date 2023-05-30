<template>
  <div>

    <v-bottom-navigation :value="value" color="#2F4475" horizontal>

      <v-btn v-for="(m, i) in menu" :key="i" :to="m.to" :value="i">
        <span>{{ m.title }}</span>
        <v-icon>{{ m.icon }}</v-icon>
      </v-btn>
      <v-btn value="day" @click.stop="drawer = !drawer">
        <span>Day</span>
        <v-icon>mdi-heart</v-icon>
      </v-btn>

    </v-bottom-navigation>

    <v-navigation-drawer v-model="drawer" location="bottom" temporary>
      <v-row justify="center">
        <v-col cols="12">

          <Calendar v-model="picker" is-expanded :columns="$screens({ default: 2, lg: 2 })" />
        </v-col>


      </v-row>
    </v-navigation-drawer>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import router from '@/router';

const value = ref(1)
const drawer = ref(false)
const picker = ref();

function go(item) {
  router.push(item)
}

const menu = [
  {
    title: "Учора",
    to: "/yesterday",
    icon: "mdi-heart"
  },
  {
    title: "Сёння",
    to: "/",
    icon: "mdi-heart"
  },
]

function showCalendar() {
  drawer.value = true;
}


</script>