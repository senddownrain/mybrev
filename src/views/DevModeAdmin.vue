<template>
  <main class="dev-admin">
    <h1>Developer Admin Mode</h1>
    <p>
      Enabled via <code>src/config/devMode.js</code>. Only this page loads at startup.
    </p>

    <section class="buttons">
      <button
        v-for="target in targets"
        :key="target.path"
        type="button"
        class="nav-btn"
        @click="open(target.path)"
      >
        {{ target.label }}
      </button>
    </section>
  </main>
</template>

<script setup>
const targets = [
  { label: 'Главная', path: '/' },
  { label: 'Молитвы', path: '/prayers' },
  { label: 'Чтения', path: '/readings' },
  { label: 'Админка', path: '/admin' },
  { label: 'Настройки', path: '/settings' },
  { label: 'Логин', path: '/login' },
]

function open(path) {
  window.location.href = path
}
</script>

<style scoped>
.dev-admin {
  min-height: 100vh;
  padding: 24px;
  display: grid;
  gap: 16px;
  align-content: start;
}

.buttons {
  display: grid;
  gap: 10px;
  max-width: 420px;
}

.nav-btn {
  border: 1px solid #ccc;
  border-radius: 10px;
  padding: 12px 14px;
  font-size: 16px;
  text-align: left;
  cursor: pointer;
}

.nav-btn:hover {
  background: #f6f6f6;
}
</style>
