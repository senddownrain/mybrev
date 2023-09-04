<template>
  <div>
    <v-app-bar color="teal-darken-4">
      <template v-slot:image>
        <v-img gradient="to bottom left, #2F4475, #2F4475"></v-img>
      </template>

      <!-- <template v-slot:prepend>
        <v-app-bar-nav-icon></v-app-bar-nav-icon>
      </template> -->

      <v-app-bar-nav-icon variant="text" icon="mdi-arrow-left" @click.stop="router.go(-1)"></v-app-bar-nav-icon>

      <v-app-bar-title> <span>{{ getDay() }}</span></v-app-bar-title>

      <v-spacer></v-spacer>

      <v-btn icon @click="increaseFont()">
        <v-icon>mdi-plus</v-icon>
      </v-btn>

      <v-btn icon @click="decreaseFont()">
        <v-icon>mdi-minus</v-icon>
      </v-btn>

      <v-btn icon id="menu-activator">
        <v-icon>mdi-dots-vertical</v-icon>
      </v-btn>

      <v-menu activator="#menu-activator">
        <v-card class="mx-auto" max-width="300" tile>
          <!-- <v-list dense>
              <v-list-item link v-for="(item, i) in menu" :key="i" :value="item" :to="item.to">
                <template v-slot:prepend>
                  <v-icon :icon="item.icon"></v-icon>
                </template>
                <v-list-item-title v-text="item.text"></v-list-item-title>
              </v-list-item>
            </v-list> -->

        </v-card>
      </v-menu>



    </v-app-bar>



    <!-- <v-navigation-drawer v-model="drawer" location="bottom" temporary>
        <v-list :items="items"></v-list>
      </v-navigation-drawer> -->
  </div>
</template>
  
<script setup>


import moment from 'moment'
import 'moment/dist/locale/be'
import { useRoute } from 'vue-router'
import router from '@/router';
import { ref } from 'vue'

import { useFontsStore } from '@/stores/fonts'
const fonts = useFontsStore()

function increaseFont() {
  fonts.increaseFont()
}
function decreaseFont() {
  fonts.decreaseFont()
}

const route = useRoute()

const goHome = function () {
  router.push('/')
}

const getDay = function () {
  if (route.params.day) {
    return moment(route.params.day, "DD-MM-YYYY").format("LL")
  } else ""
}

</script>
  