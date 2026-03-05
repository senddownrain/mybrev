import * as Sentry from '@sentry/vue';

/**
 * Initialize Sentry error tracking.
 * Only active in production when VITE_SENTRY_DSN is set.
 * @param {import('vue').App} app
 * @param {import('vue-router').Router} router
 */
export function initSentry(app, router) {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!import.meta.env.PROD || !dsn) {
    return;
  }

  Sentry.init({
    app,
    dsn,
    integrations: [
      Sentry.browserTracingIntegration({ router }),
      Sentry.replayIntegration(),
    ],
    // Capture 10% of transactions for performance monitoring
    tracesSampleRate: 0.1,
    // Capture 10% of sessions for replays
    replaysSessionSampleRate: 0.1,
    // Always capture replays on errors
    replaysOnErrorSampleRate: 1.0,
    environment: import.meta.env.MODE,
  });
}
