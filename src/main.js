import App from './App.vue'
import { createApp } from 'vue'
import { registerPlugins } from '@/plugins'
import './styles/main.scss'

const app = createApp(App)

registerPlugins(app)

app.mount('#app')

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

// Authentication only affects admin affordances on public routes. Protected
// routes initialise it synchronously in the router guard.
runAfterLoadAndIdle(() => {
  import('./stores/auth').then(({ useAuthStore }) => useAuthStore().init()).catch(error => {
    console.error('[main] Auth initialization error:', error)
  })
}, { delay: 1500, idleTimeout: 2000 })

// Navigation prefetch is intentionally delayed until the document has loaded,
// so it cannot compete with the first screen's critical requests.
runAfterLoadAndIdle(() => {
  import('./utils/cacheWarmup').then(({ warmupCache }) => warmupCache()).catch(error => {
    console.error('[main] Cache warmup error:', error)
  })
}, { delay: 5000, idleTimeout: 5000 })
