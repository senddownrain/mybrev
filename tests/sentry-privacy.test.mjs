import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  SENTRY_PRIVACY_OPTIONS,
  createSentryFilters,
  parameterizeRoute,
  scrubBreadcrumb,
  scrubEvent,
} from '../src/plugins/sentryPrivacy.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PATTERNS = ['/prayer/:id', '/song/:id', '/bible/:language?/:bookId?/:chapter?', '/readings/:date', '/'];

// Synthetic stand-in for router.resolve(...).matched: first pattern that fits the segment count/prefix.
function resolvePattern(pathname) {
  if (pathname === '/') return '/';
  const parts = pathname.split('/').filter(Boolean);
  return PATTERNS.find((p) => p.split('/')[1] === parts[0]) || null;
}

const SECRET_ID = 'eMmCtxwyJ75ogmL5rwye';
const SYNTHETIC_EVENT = () => ({
  event_id: 'a'.repeat(32),
  level: 'error',
  release: 'synthetic',
  transaction: `/prayer/${SECRET_ID}`,
  message: `Failed to load https://mybrev.example/prayer/${SECRET_ID}?q=Ойча+наш#section`,
  user: { id: 'u1', ip_address: '203.0.113.7', email: 'x@example.com' },
  extra: { details: { prayerText: 'Ойча наш, Які ёсць на нябёсах' } },
  request: {
    url: `https://mybrev.example/song/${SECRET_ID}?search=secret#frag`,
    query_string: 'search=secret',
    cookies: 'a=b',
    headers: { Referer: `https://mybrev.example/bible/bel/gn/3?x=1`, 'User-Agent': 'UA' },
  },
  exception: { values: [{ type: 'TypeError', value: `boom at /song/${SECRET_ID}`, stacktrace: { frames: [{ filename: 'https://mybrev.example/assets/index-abc.js', lineno: 10, function: 'f' }] } }] },
  breadcrumbs: [
    { category: 'navigation', data: { from: `/prayer/${SECRET_ID}?a=b`, to: '/bible/bel/gn/3#v2' } },
    { category: 'ui.click', message: 'button.favorite "Ойча наш"' },
    { category: 'console', message: 'secret text' },
    { category: 'fetch', data: { url: `https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents/prayers/${SECRET_ID}?key=K`, method: 'GET', status_code: 200 } },
  ],
});

test('sampling options keep traces and replays at zero and PII off', () => {
  assert.equal(SENTRY_PRIVACY_OPTIONS.tracesSampleRate, 0);
  assert.equal(SENTRY_PRIVACY_OPTIONS.replaysSessionSampleRate, 0);
  assert.equal(SENTRY_PRIVACY_OPTIONS.replaysOnErrorSampleRate, 0);
  assert.equal(SENTRY_PRIVACY_OPTIONS.sendDefaultPii, false);
});

test('routes are reduced to patterns without ids, query or hash', () => {
  assert.equal(parameterizeRoute(`/prayer/${SECRET_ID}?q=1#x`, resolvePattern), '/prayer/:id');
  assert.equal(parameterizeRoute(`https://mybrev.example/song/${SECRET_ID}?q=1`, resolvePattern), '/song/:id');
  assert.equal(parameterizeRoute('/unknown/abc/def', resolvePattern), '/unknown/:param/:param');
  assert.equal(parameterizeRoute('/', resolvePattern), '/');
  assert.equal(parameterizeRoute(`/prayer/${SECRET_ID}`, () => { throw new Error('boom'); }), '/prayer/:param');
});

test('scrubbed synthetic event contains no id, query, hash, text, user or cookies', () => {
  const out = scrubEvent(SYNTHETIC_EVENT(), resolvePattern);
  const json = JSON.stringify(out);
  for (const leak of [SECRET_ID, 'Ойча', 'secret', 'q=', '#section', '#frag', '203.0.113.7', 'x@example.com', 'a=b', 'key=K', 'нябёсах']) {
    assert.ok(!json.includes(leak), `leaked: ${leak}`);
  }
  assert.equal(out.transaction, '/prayer/:id');
  assert.equal(out.request.url, '/song/:id');
  assert.equal(out.user, undefined);
  assert.equal(out.extra, undefined);
});

test('Vue component props never reach the event', () => {
  const event = { ...SYNTHETIC_EVENT(), contexts: { browser: { name: 'Chrome' }, vue: { componentName: 'Reader', propsData: { text: 'Ойча наш, Які ёсць на нябёсах' } } } };
  const out = scrubEvent(event, resolvePattern);
  assert.equal(out.contexts.vue, undefined);
  assert.deepEqual(out.contexts.browser, { name: 'Chrome' });
  assert.ok(!JSON.stringify(out).includes('Ойча'));
  const src = readFileSync(path.join(root, 'src/plugins/sentry.js'), 'utf8');
  assert.match(src, /attachProps: false/);
});

test('useful error data survives scrubbing', () => {
  const out = scrubEvent(SYNTHETIC_EVENT(), resolvePattern);
  assert.equal(out.level, 'error');
  assert.equal(out.release, 'synthetic');
  assert.equal(out.exception.values[0].type, 'TypeError');
  assert.match(out.exception.values[0].value, /^boom at /);
  assert.deepEqual(out.exception.values[0].stacktrace.frames[0], { filename: 'https://mybrev.example/assets/index-abc.js', lineno: 10, function: 'f' });
  assert.equal(out.request.headers, undefined);
  const nav = out.breadcrumbs.find((b) => b.category === 'navigation');
  assert.deepEqual(nav.data, { from: '/prayer/:id', to: '/bible/:language?/:bookId?/:chapter?' });
});

test('UI and console breadcrumbs are dropped; fetch breadcrumbs keep host and status only', () => {
  const out = scrubEvent(SYNTHETIC_EVENT(), resolvePattern);
  assert.deepEqual(out.breadcrumbs.map((b) => b.category), ['navigation', 'fetch']);
  assert.deepEqual(out.breadcrumbs[1].data, { url: 'https://firestore.googleapis.com', method: 'GET', status_code: 200 });
  assert.equal(scrubBreadcrumb({ category: 'ui.input', message: 'typed' }, resolvePattern), null);
  assert.equal(scrubBreadcrumb(null, resolvePattern), null);
});

test('scrubbing does not mutate the original event and is idempotent', () => {
  const original = SYNTHETIC_EVENT();
  const snapshot = JSON.stringify(original);
  const once = scrubEvent(original, resolvePattern);
  assert.equal(JSON.stringify(original), snapshot);
  assert.deepEqual(scrubEvent(once, resolvePattern), once);
});

test('filters drop performance transactions and never throw on empty input', () => {
  const filters = createSentryFilters(resolvePattern);
  assert.equal(filters.beforeSendTransaction({ type: 'transaction' }), null);
  assert.equal(filters.beforeSend(null), null);
  assert.deepEqual(filters.beforeSend({}), {});
});

test('sentry.js has no tracing, replay or non-zero sampling configured', () => {
  const src = readFileSync(path.join(root, 'src/plugins/sentry.js'), 'utf8');
  assert.ok(!/browserTracingIntegration|replayIntegration|feedbackIntegration/.test(src));
  assert.ok(!/tracesSampleRate|replaysSessionSampleRate|replaysOnErrorSampleRate/.test(src.replace(/\/\/.*$/gm, '')), 'rates come only from SENTRY_PRIVACY_OPTIONS');
  assert.match(src, /\.\.\.SENTRY_PRIVACY_OPTIONS/);
  assert.match(src, /\.\.\.createSentryFilters\(/);
  assert.match(src, /import\.meta\.env\.PROD && Boolean\(dsn\)/);
});
