<template>
  <div class="loading-screen" :class="{ 'telegram': isTelegram }">
    <div class="loading-content">
      <img 
        src="/web-app-manifest-192x192.png" 
        alt="Малітоўнік"
        class="app-icon"
      />
      
      <h1 class="app-title">Малітоўнік</h1>
      
      <v-progress-circular
        indeterminate
        color="primary"
        :size="isTelegram ? 40 : 48"
        width="4"
        class="loading-spinner"
      ></v-progress-circular>
      
      <p class="loading-text">Загрузка...</p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { isTelegramWebApp } from '@/utils/telegram';

const isTelegram = computed(() => isTelegramWebApp());
</script>

<style scoped>
.loading-screen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #1867C0 0%, #4A90E2 100%);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

.app-icon {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.app-title {
  color: white;
  font-size: 28px;
  font-weight: 300;
  margin: 0;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  font-family: 'Kurale', serif;
}

.loading-spinner {
  margin-top: 8px;
}

.loading-text {
  color: rgba(255, 255, 255, 0.9);
  font-size: 16px;
  margin: 0;
  font-weight: 300;
}

/* Анимация появления */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.loading-content {
  animation: fadeIn 0.3s ease-out;
}

/* Упрощенный стиль для Telegram */
.loading-screen.telegram {
  background: linear-gradient(135deg, #1867C0 0%, #4A90E2 100%);
}

.loading-screen.telegram .app-icon {
  width: 100px;
  height: 100px;
}

.loading-screen.telegram .app-title {
  font-size: 24px;
}

.loading-screen.telegram .loading-text {
  font-size: 14px;
}
</style>

