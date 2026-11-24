import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const siteKey = 'local-test-enterprise-site-key';
Object.assign(process.env, {
  VITE_FIREBASE_API_KEY: 'demo-key',
  VITE_FIREBASE_PROJECT_ID: 'demo-app-check',
  VITE_FIREBASE_APP_ID: '1:123456789012:web:0000000000000000000000',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789012',
  VITE_FIREBASE_APP_CHECK_SITE_KEY: ` ${siteKey} `,
});

const server = await createServer({
  configFile: false,
  envDir: false,
  server: { host: '127.0.0.1', port: 0 },
  optimizeDeps: {
    noDiscovery: true,
    entries: [],
    include: ['firebase/app', 'firebase/app-check', 'firebase/auth', 'firebase/firestore', 'firebase/firestore/lite'],
  },
  plugins: [{
    name: 'app-check-local-harness',
    configureServer(vite) {
      vite.middlewares.use('/__app_check', (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end('<!doctype html><title>Local App Check test</title>');
      });
    },
  }],
});
await server.listen();

let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.BENCHMARK_BROWSER_PATH ||
      (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome'),
    headless: true,
  });
  const url = new URL('/__app_check', server.resolvedUrls.local[0]).href;
  const page = await browser.newPage();
  const diagnostics = [];
  page.on('pageerror', (error) => diagnostics.push(error.message));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) diagnostics.push(message.text());
  });
  await page.addInitScript(() => {
    const fetch = window.fetch.bind(window);
    window.__exchanges = [];
    window.fetch = async (input, init) => {
      const url = new URL(input, window.location.href);
      if (url.hostname !== 'content-firebaseappcheck.googleapis.com') return fetch(input, init);
      if (!url.pathname.endsWith(':exchangeRecaptchaEnterpriseToken') || url.searchParams.get('key') !== 'demo-key') {
        throw new Error(`Unexpected App Check request: ${url.pathname}`);
      }
      const proof = JSON.parse(init.body).recaptcha_enterprise_token;
      window.__exchanges.push(proof);
      return window.Response.json({ token: `test-token-${proof}`, ttl: '3600s' });
    };
  });
  await page.route('**/*', async (route) => {
    const target = new URL(route.request().url());
    if (target.hostname === '127.0.0.1') return route.continue();
    if (target.href === 'https://www.google.com/recaptcha/enterprise.js') {
      return route.fulfill({ contentType: 'application/javascript', body: `
        window.__widgets ??= [];
        window.grecaptcha = { enterprise: {
          ready: fn => fn(),
          render: (id, config) => window.__widgets.push({ id, config }) - 1,
          execute: async index => {
            const { id, config } = window.__widgets[index];
            config.callback();
            return id;
          },
        }};
      ` });
    }
    return route.abort();
  });
  await page.goto(url);
  const result = await page.evaluate(async () => {
    const { firebaseApp } = await import('/src/plugins/firebase.js');
    const { priestFirebase, priestEditorFirebase } = await import('/src/plugins/priestFirebase.js');
    const { getClientAppCheckToken, initializeClientAppCheck } = await import('/src/plugins/firebaseAppCheck.js');
    const before = document.querySelectorAll('[id^="fire_app_check_"]').length;
    const apps = [firebaseApp, priestFirebase.db.app, priestEditorFirebase.db.app];
    const tokens = await Promise.all(apps.map(getClientAppCheckToken));
    return {
      before,
      names: apps.map((app) => app.name),
      tokens,
      exchanges: window.__exchanges,
      noKey: initializeClientAppCheck(apps[0], '   ') === undefined,
      keys: window.__widgets.map(({ config }) => config.sitekey),
    };
  });
  assert.equal(result.before, 1);
  assert.deepEqual(result.names, ['[DEFAULT]', 'mybrev-priest', 'mybrev-priest-editor']);
  assert.deepEqual(result.keys, [siteKey, siteKey, siteKey]);
  assert.deepEqual(result.tokens, result.names.map((name) => `test-token-fire_app_check_${name}`), diagnostics.join('\n'));
  assert.deepEqual(result.exchanges.sort(), result.names.map((name) => `fire_app_check_${name}`).sort());
  assert.equal(result.noKey, true);

  const blocked = await browser.newPage();
  await blocked.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await blocked.goto(url);
  assert.equal(await blocked.evaluate(async () => {
    const { firebaseApp } = await import('/src/plugins/firebase.js');
    const { getClientAppCheckToken } = await import('/src/plugins/firebaseAppCheck.js');
    return (await getClientAppCheckToken(firebaseApp)) === undefined;
  }), true);
  console.log('App Check browser smoke: default, priest, editor, and blocked reCAPTCHA passed');
} finally {
  await browser?.close();
  await server.close();
}
