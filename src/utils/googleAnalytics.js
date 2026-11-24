// Separate from the local/Cloudflare collector. No SDK initialization without opt-in.
// A new consent key deliberately does not reuse QA choices from the earlier draft.
export const GOOGLE_ANALYTICS_CONSENT_KEY = 'mybrev_google_analytics_consent_v2';

const consent = analytics_storage => ({
  analytics_storage, ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
});

export function createGoogleAnalyticsStarter({
  enabled,
  readConsent,
  loadSdk = () => import('firebase/analytics'),
  loadApp = () => import('../plugins/firebase.js'),
  origin = () => window.location.origin,
  setDisabled = (id, disabled) => { globalThis['ga-disable-' + id] = disabled; },
}) {
  let pending, initialized, active = false;
  const hasConsent = () => {
    try { return readConsent() === 'granted'; } catch { return false; }
  };

  function stop() {
    if (!initialized) return;
    const { sdk, analytics, id } = initialized;
    // Set the documented Google tag opt-out flag synchronously, before SDK calls.
    setDisabled(id, true);
    active = false;
    sdk.setAnalyticsCollectionEnabled(analytics, false);
    sdk.setConsent(consent('denied'));
  }

  function start() {
    if (!enabled || !hasConsent()) return Promise.resolve(null);
    if (active && initialized) return Promise.resolve(initialized.analytics);
    if (pending) return pending;
    pending = (async () => {
      if (initialized) {
        const { sdk, analytics, id } = initialized;
        if (!hasConsent()) return null;
        sdk.setConsent(consent('granted'));
        setDisabled(id, false);
        sdk.setAnalyticsCollectionEnabled(analytics, true);
        active = true;
        return analytics;
      }
      const sdk = await loadSdk();
      if (!await sdk.isSupported() || !hasConsent()) return null;
      const { firebaseApp } = await loadApp();
      if (!hasConsent()) return null;
      const id = firebaseApp.options.measurementId || '';
      if (!/^G-[A-Z0-9]+$/.test(id)) return null;
      sdk.setConsent(consent('granted'));
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
      initialized = { sdk, analytics, id };
      setDisabled(id, false);
      active = true;
      sdk.setDefaultEventParameters(parameters);
      sdk.logEvent(analytics, 'page_view', { page_location: parameters.page_location, page_title: parameters.page_title, page_referrer: '' });
      return analytics;
    })().catch(error => {
      if (initialized) stop();
      throw error;
    }).finally(() => { pending = undefined; });
    return pending;
  }
  start.stop = stop;
  return start;
}
