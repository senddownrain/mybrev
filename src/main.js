import App from './App.vue'
import { createApp } from 'vue'
import { registerPlugins } from '@/plugins'
import './styles/main.scss'
import { primeContentCache } from '@/utils/primeContentCache'

const app = createApp(App)

registerPlugins(app)

// Restore only the initial screen's local records before creating its loading
// state. No network is allowed here; unavailable storage falls back gracefully.
primeContentCache().catch(error => console.warn('[main] Local cache unavailable:', error.message)).finally(() => app.mount('#app'))

function runAfterLoadAndIdle(task, { delay = 0, idleTimeout = 2000 } = {}) {
  const schedule = () => {
    window.setTimeout(() => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(task, { timeout: idleTimeout })
      } else {
        task()
      }
    }, delay)
  }

  if (document.readyState === 'complete') schedule()
  else window.addEventListener('load', schedule, { once: true })
}

// Navigation prefetch is intentionally delayed until the document has loaded,
// so it cannot compete with the first screen's critical requests.
runAfterLoadAndIdle(() => {
  import('./utils/cacheWarmup').then(({ warmupCache }) => warmupCache()).catch(error => {
    console.error('[main] Cache warmup error:', error)
  })
}, { delay: 5000, idleTimeout: 5000 })
