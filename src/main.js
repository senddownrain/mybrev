import App from './App.vue'
import { createApp } from 'vue'
import { registerPlugins } from '@/plugins'
import './styles/main.scss'
import { restoreCalendarCache } from '@/utils/ordoCalendarCache'
import { removeLegacyStorageKeys } from '@/utils/legacyStorageCleanup'
import router from '@/router'

const calendarReady = restoreCalendarCache()
  .catch(error => console.warn('[main] Local calendar unavailable:', error.message))
const app = createApp(App, { calendarReady })
removeLegacyStorageKeys()

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

runAfterLoadAndIdle(() => {
  calendarReady.then(() => import('./services/ordoCalendarService'))
    .then(({ startCalendarRevalidation }) => startCalendarRevalidation())
    .catch(error => console.warn('[main] Calendar refresh skipped:', error.message))
}, { delay: 1000 })

// Keep the optional offline experiment available only in development builds.
if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_EXTENDED_CACHE_WARMUP === 'true') {
  runAfterLoadAndIdle(() => {
    calendarReady.then(() => router.isReady())
      .then(() => import('./utils/extendedCacheWarmup'))
      .then(({ warmupExtendedDateWindow }) => warmupExtendedDateWindow())
      .catch(error => console.warn('[extended warmup] skipped:', error.message))
  }, { delay: 20000, idleTimeout: 12000 })
}

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
  Promise.all([import('./utils/analytics/localAnalytics'), loadStaging, import('./utils/massRitual')])
    .then(([{ startLocalAnalytics }, staging, { MASS_ORDER_PRAYER_ID }]) => startLocalAnalytics(router, {
      massOrderPrayerId: MASS_ORDER_PRAYER_ID,
      staging,
    }))
    .catch(error => console.warn('[main] Local analytics unavailable:', error.message))
}

// Optional Google Analytics: initialize choice handling after the first render.
if (import.meta.env.VITE_FIREBASE_ANALYTICS === 'true') {
  runAfterLoadAndIdle(() => {
    import('./utils/googleAnalyticsConsent.js')
      .then(({ initGoogleAnalyticsChoice }) => initGoogleAnalyticsChoice())
      .catch(error => console.warn('[main] Google Analytics unavailable:', error.message))
  }, { delay: 2000 })
}
