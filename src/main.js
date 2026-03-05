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

// Warmup cache in the background after the app is mounted.
// queueMicrotask defers execution after the current task without an arbitrary timeout.
queueMicrotask(() => {
  warmupCache().catch(error => {
    console.error('[main] Cache warmup error:', error);
  });
});
