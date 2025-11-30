<template>
  <div>
    <v-app-bar color="teal-darken-1">
      <template v-slot:image>
        <!-- <v-img gradient="to bottom left, #2F4475, #2F4475"></v-img> -->
      </template>

      <!-- <template v-slot:prepend>
      <v-app-bar-nav-icon></v-app-bar-nav-icon>
    </template> -->

      <v-app-bar-nav-icon variant="text" @click.stop="drawer = !drawer"></v-app-bar-nav-icon>
<router-link to="/" class="text-decoration-none text-white">
      <v-app-bar-title> <span style="cursor: pointer;">Малітоўнік</span></v-app-bar-title>
</router-link>
      <v-spacer></v-spacer>

      <!-- <v-btn icon>
      <v-icon>mdi-magnify</v-icon>
    </v-btn>

    <v-btn icon>
      <v-icon>mdi-heart</v-icon>
    </v-btn> -->
      <v-btn icon id="menu-activator">
        <v-icon>mdi-dots-vertical</v-icon>
      </v-btn>

      <v-menu activator="#menu-activator">
        <v-card class="mx-auto" max-width="300" tile>
          <v-list dense>
            <v-list-item link v-for="(item, i) in menu" :key="i" :value="item" :to="item.to">
              <template v-slot:prepend>
                <v-icon :icon="item.icon"></v-icon>
              </template>
              <v-list-item-title v-text="item.text"></v-list-item-title>
            </v-list-item>
          </v-list>

        </v-card>
      </v-menu>



    </v-app-bar>



    <v-navigation-drawer v-model="drawer" location="left" temporary>
      <v-list :items="items"></v-list>
    </v-navigation-drawer>
  </div>
</template>

<script setup>

import router from '@/router';
import { ref } from 'vue'

const drawer = ref(false);
const goHome = function(){
  router.push('/')
}

const menu = [
  {
    text: "Bridge",
    to: '/bridge',
    icon: 'mdi-flag'
  },
  {
    text: "Bridge List",
    to: '/bridgeList',
    icon: 'mdi-flag'
  },
  {
    text: 'Tables',
    to: '/tables',
    icon: 'mdi-clock'
  },
  {
    text: 'YearOptions',
    to: '/yearOptions',
    icon: 'mdi-clock'
  },
  {
    text: 'Day List',
    to: '/dayList',
    icon: 'mdi-clock'
  }
]

const items = [
  {
    title: 'Чытанні',
    value: 'foo',
  },
  {
    title: 'Малітвы',
    value: 'bar',
  },
  {
    title: 'Імшал',
    value: 'fizz',
  },
  {
    title: 'Агенда',
    value: 'buzz',
  },
];

</script>
