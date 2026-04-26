import App from './App.vue'
import { createApp } from 'vue'
import { registerPlugins } from '@/plugins'
import { DEV_ADMIN_MODE } from '@/config/devMode'
import './styles/main.scss'

const app = createApp(App)

registerPlugins(app)

import { useAuthStore } from './stores/auth'
import { usePrayersStore } from './stores/prayers'
import { warmupCache } from './utils/cacheWarmup'

if (!DEV_ADMIN_MODE) {
  const authStore = useAuthStore()
  authStore.init()

  const prayersStore = usePrayersStore()
  prayersStore.init()
}

app.mount('#app')

// Warmup cache in the background after the app is mounted.
// queueMicrotask defers execution after the current task without an arbitrary timeout.
if (!DEV_ADMIN_MODE) {
  queueMicrotask(() => {
    warmupCache().catch(error => {
      console.error('[main] Cache warmup error:', error)
    })
  })
}
