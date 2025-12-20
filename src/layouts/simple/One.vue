<template>
  <v-app 
    :style="{ 
      '--app-font-family': settings.fontFamily,
      '--font-size-multiplier': settings.fontSizeMultiplier 
    }"
  >
    <v-main>
      <router-view name="topNav" />
      <router-view /> 

      <TextSettingsSheet />
      
      <NotificationSnackbar />
    </v-main>
  </v-app>
</template>

<script setup>
  import TextSettingsSheet from '@/components/TextSettingsSheet.vue';
  import NotificationSnackbar from '@/components/NotificationSnackbar.vue';
  import { useSettingsStore } from '@/stores/settings.js';
  
  const settings = useSettingsStore();
</script>

<style>
/* КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: только body должен скроллиться */
/* HTML - СТРОГО без скролла */
html {
  overflow: hidden !important;
  overflow-y: hidden !important;
  overflow-x: hidden !important;
  height: 100% !important;
  width: 100% !important;
  position: fixed !important;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

/* ТОЛЬКО body имеет скролл с тонким скроллбаром */
body {
  overflow-x: hidden !important;
  overflow-y: auto !important;
  height: 100vh !important;
  width: 100% !important;
  position: relative !important;
  -webkit-overflow-scrolling: touch;
  margin: 0;
  padding: 0;
  /* Тонкий скроллбар для Firefox */
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
}

/* Тонкий скроллбар для WebKit браузеров (Chrome, Safari) */
body::-webkit-scrollbar {
  width: 4px;
}

body::-webkit-scrollbar-track {
  background: transparent;
}

body::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 2px;
}

body::-webkit-scrollbar-thumb:hover {
  background-color: rgba(0, 0, 0, 0.3);
}

/* #app - без скролла, но позволяет контенту быть видимым */
#app {
  overflow: visible !important;
  overflow-y: visible !important;
  overflow-x: hidden !important;
  height: auto !important;
  min-height: 100vh !important;
  width: 100% !important;
  position: relative !important;
}

/* v-app / v-application - без скролла, но позволяет контенту быть видимым */
.v-application,
.v-application__wrap {
  overflow: visible !important;
  overflow-y: visible !important;
  overflow-x: hidden !important;
  height: auto !important;
  min-height: 100vh !important;
  width: 100% !important;
  position: relative !important;
}

/* v-main и все его обертки - без скролла, но позволяет контенту быть видимым */
.v-main,
.v-main__wrap {
  overflow: visible !important;
  overflow-x: hidden !important;
  overflow-y: visible !important;
  height: auto !important;
  min-height: 100% !important;
  width: 100% !important;
  position: relative !important;
}

/* Контейнеры внутри v-main - без скролла */
.v-main .v-container,
.v-main .v-container.prayer-content-area,
.v-main .v-row,
.v-main .v-col {
  overflow: visible !important;
  overflow-x: hidden !important;
  overflow-y: visible !important;
  height: auto !important;
  max-height: none !important;
  position: relative !important;
}

/* Для мобильных устройств - АГРЕССИВНЫЕ правила */
@media (max-width: 960px) {
  /* HTML - СТРОГО без скролла */
  html {
    overflow: hidden !important;
    overflow-y: hidden !important;
    overflow-x: hidden !important;
    height: 100% !important;
    position: fixed !important;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }
  
  /* ТОЛЬКО body скроллится с тонким скроллбаром */
  body {
    overflow-x: hidden !important;
    overflow-y: auto !important;
    height: 100vh !important;
    width: 100% !important;
    position: relative !important;
    -webkit-overflow-scrolling: touch;
    margin: 0;
    padding: 0;
    /* Тонкий скроллбар для Firefox */
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
  }
  
  /* Тонкий скроллбар для WebKit браузеров (Chrome, Safari) */
  body::-webkit-scrollbar {
    width: 4px;
  }
  
  body::-webkit-scrollbar-track {
    background: transparent;
  }
  
  body::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 2px;
  }
  
  body::-webkit-scrollbar-thumb:hover {
    background-color: rgba(0, 0, 0, 0.3);
  }
  
  /* #app - без скролла, но позволяет контенту быть видимым */
  #app {
    overflow: visible !important;
    overflow-y: visible !important;
    overflow-x: hidden !important;
    height: auto !important;
    min-height: 100vh !important;
    width: 100% !important;
    position: relative !important;
  }
  
  /* v-app - без скролла, но позволяет контенту быть видимым */
  .v-application,
  .v-application__wrap {
    overflow: visible !important;
    overflow-y: visible !important;
    overflow-x: hidden !important;
    height: auto !important;
    min-height: 100vh !important;
    width: 100% !important;
    position: relative !important;
  }
  
  /* v-main - без скролла, но позволяет контенту быть видимым */
  .v-main,
  .v-main__wrap {
    overflow: visible !important;
    overflow-y: visible !important;
    overflow-x: hidden !important;
    height: auto !important;
    min-height: 100% !important;
    width: 100% !important;
    position: relative !important;
  }
  
  /* Все контейнеры - без скролла */
  .v-main .v-container,
  .v-main .v-container.prayer-content-area,
  .v-main .v-row,
  .v-main .v-col,
  .v-container,
  .v-row,
  .v-col {
    overflow: visible !important;
    overflow-y: visible !important;
    overflow-x: hidden !important;
    height: auto !important;
    max-height: none !important;
    position: relative !important;
  }
}
</style>