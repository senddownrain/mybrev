<template>
  <v-app>
    <simple />
  </v-app>
</template>
  
<script setup>
import DefaultBar from '@/layouts/default/AppBar.vue'
import simple from './Simple.vue';


import { useFontStore } from '@/stores/font'
const font = useFontStore()

</script>
  

<style>
.ora-text p {
    margin-top: 10px;
    margin-bottom: 10px;
}

.v-card .ora-text{
    padding-left: 0;
    font-size: v-bind('font.getHeader.textSize');
    line-height: v-bind('font.getHeader.textLine');
} 

/* 
.ora-text{
    padding-left: 0;
    font-size: 0.975rem;
    line-height: 1.4rem;
    letter-spacing: 0.02rem;
} 


    letter-spacing: v-bind('font.getHeader.textLetterSpacing');

    letter-spacing: v-bind('font.getHeader.headerLetterSpacing');
}
*/

.ora-header{
    padding-left: 0;
}

.ora-title{
    padding-left: 0;
    color: red;
    font-weight: 600;
    
    font-size: v-bind('font.getHeader.headerSize');
    
  }

.ora{
}

.ora-ant{

}

.ora-psalm{

}


</style>