import { ref } from 'vue';
import { createGoogleAnalyticsStarter, GOOGLE_ANALYTICS_CONSENT_KEY as KEY } from './googleAnalytics.js';

export const googleAnalyticsAvailable = import.meta.env.VITE_FIREBASE_ANALYTICS === 'true'
  && /^G-[A-Z0-9]+$/.test(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '');

function readChoice() {
  if (!googleAnalyticsAvailable) return null;
  try {
    const value = window.localStorage.getItem(KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch { return null; }
}

export const googleAnalyticsChoice = ref(readChoice());
export const googleAnalyticsChoiceError = ref(false);
let listening = false;
let blockedInTab = false;
const start = createGoogleAnalyticsStarter({
  enabled: googleAnalyticsAvailable,
  readConsent: () => blockedInTab ? 'denied' : readChoice(),
});

function sync() {
  googleAnalyticsChoice.value = blockedInTab ? 'denied' : readChoice();
  if (googleAnalyticsChoice.value === 'granted') {
    start().catch(error => console.warn('[analytics] Initialization unavailable:', error.message));
  } else {
    start.stop();
  }
}

export function initGoogleAnalyticsChoice() {
  if (!googleAnalyticsAvailable || listening) return;
  listening = true;
  window.addEventListener('storage', event => {
    if (event.key === KEY || event.key === null) sync();
  });
  window.addEventListener('pageshow', sync);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sync();
  });
  sync();
}

export function setGoogleAnalyticsChoice(granted) {
  if (!googleAnalyticsAvailable) return;
  googleAnalyticsChoiceError.value = false;
  if (!granted) {
    blockedInTab = true;
    start.stop();
  }
  try {
    window.localStorage.setItem(KEY, granted ? 'granted' : 'denied');
    blockedInTab = false;
  } catch {
    blockedInTab = true;
    googleAnalyticsChoiceError.value = true;
  }
  if (listening) sync();
  else googleAnalyticsChoice.value = blockedInTab ? 'denied' : readChoice();
}
