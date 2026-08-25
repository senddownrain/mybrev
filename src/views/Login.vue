<template>
  <v-container fluid class="login-page">
    <v-btn
      icon="mdi-arrow-left"
      variant="text"
      class="login-back"
      aria-label="Вярнуцца назад"
      @click="goBack"
    />

    <main class="login-shell">
      <section class="login-intro" aria-labelledby="login-title">
        <div class="login-mark" aria-hidden="true">
          <v-icon icon="mdi-cross" size="34" />
        </div>
        <p class="login-eyebrow">Малітоўнік</p>
        <h1 id="login-title" class="login-title">Уваход для адміністратара</h1>
        <p class="login-description">
          Увайдзіце, каб кіраваць літургічным годам і рэдагаваць малітвы.
        </p>
      </section>

      <v-card class="login-card" elevation="0">
        <v-form ref="loginForm" @submit.prevent="handleLogin">
          <v-card-text class="login-card__content">
            <v-text-field
              v-model.trim="email"
              label="Email"
              type="email"
              autocomplete="username"
              inputmode="email"
              prepend-inner-icon="mdi-email-outline"
              variant="outlined"
              :disabled="isLoggingIn"
              :rules="emailRules"
              class="login-field"
              @update:model-value="error = null"
            />

            <v-text-field
              v-model="password"
              label="Пароль"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              prepend-inner-icon="mdi-lock-outline"
              variant="outlined"
              :disabled="isLoggingIn"
              :rules="passwordRules"
              class="login-field"
              @update:model-value="error = null"
            >
              <template #append-inner>
                <v-btn
                  :icon="showPassword ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                  variant="text"
                  size="small"
                  :aria-label="showPassword ? 'Схаваць пароль' : 'Паказаць пароль'"
                  @click="showPassword = !showPassword"
                />
              </template>
            </v-text-field>

            <v-alert
              v-if="error"
              type="error"
              variant="tonal"
              density="comfortable"
              class="login-error"
            >
              {{ error }}
            </v-alert>

            <v-btn
              type="submit"
              block
              size="large"
              rounded="pill"
              class="login-submit text-none"
              :loading="isLoggingIn"
            >
              Увайсці
            </v-btn>
          </v-card-text>
        </v-form>
      </v-card>
    </main>
  </v-container>
</template>

<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import { validateEmail, validatePassword } from '@/utils/validators.js';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const loginForm = ref(null);
const email = ref('');
const password = ref('');
const error = ref(null);
const isLoggingIn = ref(false);
const showPassword = ref(false);

const emailRules = [(value) => validateEmail(value)];
const passwordRules = [(value) => validatePassword(value)];

const goBack = () => {
  if (window.history.length > 1) router.go(-1);
  else router.push({ name: 'Today' });
};

const handleLogin = async () => {
  const validation = await loginForm.value?.validate();
  if (validation && !validation.valid) return;

  isLoggingIn.value = true;
  error.value = null;

  try {
    await authStore.login(email.value, password.value);
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
      ? route.query.redirect
      : '/admin';
    await router.replace(redirect);
  } catch (loginError) {
    error.value = loginError?.code === 'auth/not-admin'
      ? 'Гэты акаўнт не мае доступу да адміністравання.'
      : 'Няправільны email або пароль.';
  } finally {
    isLoggingIn.value = false;
  }
};
</script>

<style scoped>
.login-page {
  position: relative;
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: clamp(72px, 10vh, 112px) 20px 40px !important;
  color: var(--nav-on-surface);
}

.login-page::before {
  position: fixed;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(circle at 18% 12%, rgba(var(--v-theme-primary), 0.12), transparent 28rem),
    radial-gradient(circle at 88% 88%, rgba(var(--v-theme-primary), 0.07), transparent 24rem);
  content: '';
  pointer-events: none;
}

.login-back {
  position: absolute;
  top: max(16px, env(safe-area-inset-top));
  left: 16px;
  z-index: 2;
  width: 48px !important;
  height: 48px !important;
  border: 1px solid var(--nav-border);
  border-radius: 50%;
  background: var(--nav-surface);
  color: var(--nav-on-surface);
  box-shadow: 0 2px 9px var(--nav-button-shadow);
}

.login-shell {
  position: relative;
  z-index: 1;
  display: grid;
  width: min(100%, 920px);
  grid-template-columns: minmax(0, 1fr) minmax(320px, 420px);
  align-items: center;
  gap: clamp(36px, 8vw, 92px);
}

.login-intro {
  max-width: 440px;
}

.login-mark {
  display: grid;
  width: 68px;
  height: 68px;
  margin-bottom: 26px;
  place-items: center;
  border: 1px solid var(--nav-border);
  border-radius: 22px;
  background: var(--nav-surface);
  box-shadow: 0 8px 26px var(--nav-button-shadow);
}

.login-eyebrow {
  margin: 0 0 8px;
  color: var(--nav-muted);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.login-title {
  max-width: 430px;
  margin: 0;
  font-size: clamp(2.15rem, 5vw, 3.6rem);
  font-weight: 750;
  line-height: 1.02;
  letter-spacing: -0.045em;
}

.login-description {
  max-width: 410px;
  margin: 20px 0 0;
  color: var(--nav-muted);
  font-size: 1rem;
  line-height: 1.65;
}

.login-card {
  overflow: hidden;
  border: 1px solid var(--nav-border);
  border-radius: 28px !important;
  background: var(--nav-surface) !important;
  color: var(--nav-on-surface);
  box-shadow: 0 18px 55px var(--nav-shadow) !important;
}

.login-card__content {
  display: grid;
  gap: 14px;
  padding: 30px !important;
}

.login-field :deep(.v-field) {
  min-height: 58px;
  border-radius: 17px;
  background: rgba(var(--v-theme-on-surface), 0.035);
}

.login-field :deep(.v-field--focused) {
  background: transparent;
}

.login-error {
  border-radius: 16px;
}

.login-submit {
  height: 56px !important;
  margin-top: 4px;
  background: var(--nav-on-surface) !important;
  color: var(--nav-surface) !important;
  font-size: 1rem;
  font-weight: 720;
  letter-spacing: 0;
}

@media (max-width: 760px) {
  .login-page {
    display: block;
    padding: 88px 16px 32px !important;
  }

  .login-shell {
    display: block;
    max-width: 480px;
    margin-inline: auto;
  }

  .login-intro {
    margin: 0 8px 28px;
  }

  .login-mark {
    width: 58px;
    height: 58px;
    margin-bottom: 20px;
    border-radius: 19px;
  }

  .login-title {
    font-size: clamp(2rem, 10vw, 2.75rem);
  }

  .login-description {
    margin-top: 14px;
  }

  .login-card__content {
    padding: 22px !important;
  }
}
</style>
