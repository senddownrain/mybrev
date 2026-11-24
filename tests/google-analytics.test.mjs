import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleAnalyticsStarter } from '../src/utils/googleAnalytics.js';

function fixture({ enabled = true, consent = 'granted', supported = true, measurementId = 'G-TEST123' } = {}) {
  const calls = [];
  let choice = consent;
  const instance = {};
  const start = createGoogleAnalyticsStarter({
    enabled,
    readConsent: () => choice,
    origin: () => 'https://example.org',
    setDisabled: (id, disabled) => calls.push(['disabled', disabled]),
    loadSdk: async () => {
      calls.push(['load']);
      return {
        isSupported: async () => supported,
        setConsent: value => calls.push(['consent', value]),
        setAnalyticsCollectionEnabled: (analytics, enabled) => calls.push(['collection', enabled]),
        initializeAnalytics: (app, options) => { calls.push(['init', options]); return instance; },
        setDefaultEventParameters: value => calls.push(['defaults', value]),
        logEvent: (...args) => calls.push(['event', ...args]),
      };
    },
    loadApp: async () => ({ firebaseApp: { options: { measurementId } } }),
  });
  return { start, calls, instance, setChoice: value => { choice = value; } };
}

test('disabled build or absent opt-in never loads Analytics', async () => {
  for (const options of [{ enabled: false }, { consent: null }, { consent: 'denied' }]) {
    const { start, calls } = fixture(options);
    assert.equal(await start(), null);
    assert.deepEqual(calls, []);
  }
});

test('unsupported browser or missing measurement ID never initializes', async () => {
  for (const options of [{ supported: false }, { measurementId: '' }]) {
    const { start, calls } = fixture(options);
    assert.equal(await start(), null);
    assert.deepEqual(calls, [['load']]);
  }
});

test('consent removed while loading prevents initialization', async () => {
  const f = fixture();
  const pending = f.start();
  f.setChoice('denied');
  assert.equal(await pending, null);
  assert.deepEqual(f.calls, [['load']]);
});

test('opt-in initializes once with generic location and advertising disabled', async () => {
  const { start, calls, instance } = fixture();
  assert.equal(await start(), instance);
  assert.equal(await start(), instance);
  assert.deepEqual(calls.map(call => call[0]), ['load', 'consent', 'init', 'disabled', 'defaults', 'event']);
  assert.deepEqual(calls[1][1], {
    analytics_storage: 'granted', ad_storage: 'denied',
    ad_user_data: 'denied', ad_personalization: 'denied',
  });
  const config = calls[2][1].config;
  assert.equal(config.send_page_view, false);
  assert.equal(config.page_location, 'https://example.org/');
  assert.equal(config.page_title, 'MyBrev');
  assert.equal(config.page_referrer, '');
  assert.equal(config.allow_google_signals, false);
  assert.equal(config.allow_ad_personalization_signals, false);
  assert.deepEqual(calls[5].slice(2), ['page_view', {
    page_location: 'https://example.org/', page_title: 'MyBrev', page_referrer: '',
  }]);
});

test('revocation disables collection before consent update, re-grant reuses instance', async () => {
  const f = fixture();
  await f.start();
  f.setChoice('denied');
  f.start.stop();
  assert.deepEqual(f.calls.slice(-3), [
    ['disabled', true], ['collection', false],
    ['consent', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }],
  ]);
  assert.equal(await f.start(), null);
  f.setChoice('granted');
  assert.equal(await f.start(), f.instance);
  assert.equal(f.calls.filter(c => c[0] === 'init').length, 1);
  assert.deepEqual(f.calls.slice(-2), [['disabled', false], ['collection', true]]);
});
