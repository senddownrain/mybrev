<template>
  <v-app-bar color="teal-darken-4" image="https://picsum.photos/1920/1080?random">
    <template v-slot:image>
      <v-img gradient="to bottom left, #EEEEEE, #FE5A26"></v-img>
    </template>

    <!-- <template v-slot:prepend>
      <v-app-bar-nav-icon></v-app-bar-nav-icon>
    </template> -->

    <v-app-bar-title>My Brev</v-app-bar-title>

    <v-spacer></v-spacer>

    <!-- <v-btn icon>
      <v-icon>mdi-magnify</v-icon>
    </v-btn>

    <v-btn icon>
      <v-icon>mdi-heart</v-icon>
    </v-btn> -->

    <!-- <v-btn icon  id="menu-activator">
      <v-icon>mdi-dots-vertical</v-icon>
    </v-btn>

    <v-menu activator="#menu-activator">
      <v-list  dense >
          <v-list-item-title> <v-btn text block @click="myfunc()">Add note</v-btn> </v-list-item-title>
          <v-list-item-title> <v-btn text block>Add day</v-btn> </v-list-item-title>
          <v-list-item-title> <v-btn text block>Add week</v-btn> </v-list-item-title>
      </v-list>
    </v-menu>  -->
  </v-app-bar>
</template>

<script setup>

// function myfunc(){
//   if(this.$refs){
//     console.log('hi')
//   }
// }
</script>
