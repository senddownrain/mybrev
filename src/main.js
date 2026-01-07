import App from './App.vue'
import { createApp } from 'vue'
import { registerPlugins } from '@/plugins'
import './styles/main.scss'

const app = createApp(App)

registerPlugins(app)

import { useAuthStore } from './stores/auth'
import { usePrayersStore } from './stores/prayers'
import { warmupCache } from './utils/cacheWarmup'

const authStore = useAuthStore()
authStore.init()

const prayersStore = usePrayersStore()
prayersStore.init()

app.mount('#app')

// Инициализируем warmup cache в фоне после монтирования приложения
// Не блокируем UI, warmup идет параллельно
setTimeout(() => {
  warmupCache().catch(error => {
    console.error('[main] Памылка пры прагрэве кэшу:', error)
  })
}, 100) // Небольшая задержка, чтобы не мешать первоначальной загрузке UI
