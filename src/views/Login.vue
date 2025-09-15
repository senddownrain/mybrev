<template>
  <v-container>
    <v-row justify="center">
      <v-col cols="12" sm="8" md="6">
        <v-card class="pa-4">
          <v-card-title class="text-h5 text-center">Уваход для адміністратара</v-card-title>
          <v-card-text>
            <v-form @submit.prevent="handleLogin">
              <v-text-field
                v-model="email"
                label="Email"
                type="email"
                prepend-inner-icon="mdi-email-outline"
                variant="outlined"
                class="mb-2"
              ></v-text-field>
              
              <v-text-field
                v-model="password"
                label="Пароль"
                type="password"
                prepend-inner-icon="mdi-lock-outline"
                variant="outlined"
              ></v-text-field>

            <!-- Внутри <v-form> -->
<v-alert v-if="error" type="error" density="compact" class="my-3" text>{{ error }}</v-alert>
<v-btn 
  type="submit" 
  color="primary" 
  block 
  size="large" 
  class="mt-4"
  :loading="isLoggingIn"
>
  Увайсці
</v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth.js';

const email = ref('');
const password = ref('');
const error = ref(null); // Для отображения ошибки в шаблоне
const isLoggingIn = ref(false); // Для состояния загрузки кнопки

const authStore = useAuthStore();

const handleLogin = async () => {
  if (!email.value || !password.value) {
    error.value = 'Калі ласка, увядзіце email і пароль.';
    return;
  }
  
  isLoggingIn.value = true;
  error.value = null;

  try {
    // Просто вызываем login. Store сам позаботится о редиректе.
    await authStore.login(email.value, password.value);
  } catch (e) {
    // Если store пробросил ошибку, показываем ее
    error.value = 'Няправільны email або пароль.';
  } finally {
    isLoggingIn.value = false;
  }
};
</script>