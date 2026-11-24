// Google Analytics is separate from the existing local/Cloudflare collector.
// No SDK import or network initialization until the build gate AND explicit
// analytics opt-in are present. Do not use this module for prayer-level tracking.
export const GOOGLE_ANALYTICS_CONSENT_KEY = 'mybrev_google_analytics_consent_v1';

export function createGoogleAnalyticsStarter({
  enabled,
  readConsent,
  loadSdk = () => import('firebase/analytics'),
  loadApp = () => import('../plugins/firebase.js'),
  origin = () => window.location.origin,
}) {
  let pending;
  const hasConsent = () => {
    try { return readConsent() === 'granted'; } catch { return false; }
  };

  return function start() {
    if (!enabled || !hasConsent()) return Promise.resolve(null);
    if (pending) return pending;
    pending = (async () => {
      const sdk = await loadSdk();
      if (!await sdk.isSupported() || !hasConsent()) return null;
      const { firebaseApp } = await loadApp();
      if (!hasConsent()) return null;

      // Require the configured stream so a missing production variable fails closed.
      if (!/^G-[A-Z0-9]+$/.test(firebaseApp.options.measurementId || '')) return null;

      sdk.setConsent({
        analytics_storage: 'granted',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      });

      // Keep prayer names, private routes, titles, query strings and referrers
      // out of the requested configuration. Enhanced Measurement must also
      // be disabled in the GA console before any real-user launch.
      const parameters = {
        page_location: origin() + '/',
        page_title: 'MyBrev',
        page_referrer: '',
        ignore_referrer: true,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      };
      const analytics = sdk.initializeAnalytics(firebaseApp, {
        config: { ...parameters, send_page_view: false },
      });
      sdk.setDefaultEventParameters(parameters);
      return analytics;
    })().then(result => {
      if (!result) pending = undefined;
      return result;
    }).catch(error => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
}
