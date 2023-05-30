<template>
  <div>
    <v-app-bar color="teal-darken-4" image="https://picsum.photos/1920/1080?random">
    <template v-slot:image>
      <v-img gradient="to bottom left, #2F4475, #2F4475"></v-img>
    </template>

    <!-- <template v-slot:prepend>
      <v-app-bar-nav-icon></v-app-bar-nav-icon>
    </template> -->

    <v-app-bar-nav-icon variant="text" @click.stop="drawer = !drawer"></v-app-bar-nav-icon>

    <v-app-bar-title>My Brev</v-app-bar-title>

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
      <v-card
    class="mx-auto"
    max-width="300"
    tile
  >
      <v-list dense>
        <v-list-item 
        link
        v-for="(item, i) in menu" :key="i" 
        :value="item" :to="item.to">
        <template v-slot:prepend>
          <v-icon :icon="item.icon"></v-icon>
        </template>
        <v-list-item-title v-text="item.text" ></v-list-item-title>
        </v-list-item>
      </v-list>
      
  </v-card>
    </v-menu>



  </v-app-bar>


  
  <v-navigation-drawer
        v-model="drawer"
        location="bottom"
        temporary
      >
        <v-list
          :items="items"
        ></v-list>
      </v-navigation-drawer>
  </div>
  
</template>

<script setup>

import { ref } from 'vue'

const drawer = ref(false);

const menu = [
  {
    text: "Bridge",
    to: '/bridge',
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
  }
]

const items = [
        {
          title: 'Foo',
          value: 'foo',
        },
        {
          title: 'Bar',
          value: 'bar',
        },
        {
          title: 'Fizz',
          value: 'fizz',
        },
        {
          title: 'Buzz',
          value: 'buzz',
        },
      ];
      
</script>
