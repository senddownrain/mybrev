import App from './App.vue'
import { createApp } from 'vue'
import { registerPlugins } from '@/plugins'
import './styles/main.scss'
import { primeContentCache } from '@/utils/primeContentCache'
import { removeLegacyStorageKeys } from '@/utils/legacyStorageCleanup'
import router from '@/router'
import { MASS_ORDER_PRAYER_ID } from '@/utils/massRitual'

const app = createApp(App)
removeLegacyStorageKeys()

registerPlugins(app)

// Restore only the initial screen's local records before creating its loading
// state. No network is allowed here; unavailable storage falls back gracefully.
primeContentCache().catch(error => console.warn('[main] Local cache unavailable:', error.message)).finally(() => {
  app.mount('#app')
  // Calendar definitions and manual year overrides: cached copy is already
  // applied; this only checks Firestore in the background.
  import('./services/ordoCalendarService')
    .then(({ startCalendarRevalidation }) => startCalendarRevalidation())
    .catch(error => console.warn('[main] Calendar refresh skipped:', error.message))
})

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

// Local-only analytics for test builds (decision D-10 = B). The flag is a build-time
// constant: when it is not 'true' this branch and the analytics code are removed from the bundle.
if (import.meta.env.VITE_ANALYTICS_LOCAL === 'true') {
  // R03: QA-only hand-over of closed days to the closed staging. A second compile-time flag; without it the transport
  // module and the staging URL are removed from the bundle and nothing is ever sent. No consent UI is mounted.
  const loadStaging = import.meta.env.VITE_ANALYTICS_STAGING === 'true'
    ? import('./utils/analytics/stagingTransport').then(({ createBrowserStagingTransport }) => (context) => createBrowserStagingTransport({
      ...context,
      url: import.meta.env.VITE_ANALYTICS_STAGING_URL || 'http://127.0.0.1:8788',
    }))
    : Promise.resolve(null)
  Promise.all([import('./utils/analytics/localAnalytics'), loadStaging])
    .then(([{ startLocalAnalytics }, staging]) => startLocalAnalytics(router, {
      massOrderPrayerId: MASS_ORDER_PRAYER_ID,
      staging,
    }))
    .catch(error => console.warn('[main] Local analytics unavailable:', error.message))
}
