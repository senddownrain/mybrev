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

// Warm the navigation window after the first screen gets a chance to render.
// The timeout keeps prefetch from being postponed indefinitely on busy devices.
const startCacheWarmup = () => {
  warmupCache().catch(error => {
    console.error('[main] Cache warmup error:', error)
  })
}

if ('requestIdleCallback' in window) {
  window.requestIdleCallback(startCacheWarmup, { timeout: 1500 })
} else {
  window.setTimeout(startCacheWarmup, 0)
}
