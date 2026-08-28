const dsn = import.meta.env.VITE_SENTRY_DSN;
const isEnabled = import.meta.env.PROD && Boolean(dsn);

let initPromise = null;
const pendingReports = [];

function flushPendingReports(Sentry) {
  pendingReports.splice(0).forEach(({ kind, value, context }) => {
    if (kind === 'exception') Sentry.captureException(value, context);
    else Sentry.captureMessage(value, context);
  });
}

/**
 * Initialize Sentry error tracking.
 * Only active in production when VITE_SENTRY_DSN is set.
 * @param {import('vue').App} app
 * @param {import('vue-router').Router} router
 */
export function initSentry(app, router) {
  if (!isEnabled) return Promise.resolve(null);
  if (initPromise) return initPromise;

  initPromise = import('@sentry/vue').then((Sentry) => {
    Sentry.init({
      app,
      dsn,
      integrations: [
        Sentry.browserTracingIntegration({ router }),
        Sentry.replayIntegration(),
      ],
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      environment: import.meta.env.MODE,
    });
    flushPendingReports(Sentry);
    return Sentry;
  });

  return initPromise;
}

export function scheduleSentryInit(app, router) {
  if (!isEnabled) return;

  const start = () => initSentry(app, router).catch((error) => {
    console.error('[sentry] Initialization failed:', error);
  });

  const schedule = () => {
    window.setTimeout(() => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(start, { timeout: 3000 });
      } else {
        start();
      }
    }, 2500);
  };

  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
}

export function reportToSentry(kind, value, context) {
  if (!isEnabled) return;

  if (!initPromise) {
    if (pendingReports.length < 20) pendingReports.push({ kind, value, context });
    return;
  }

  initPromise.then((Sentry) => {
    if (kind === 'exception') Sentry.captureException(value, context);
    else Sentry.captureMessage(value, context);
  }).catch(() => {});
}
