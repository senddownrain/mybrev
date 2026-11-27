import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const startup = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .find(([, code]) => code.includes('window.malitounikStartup'))?.[1];

function page(path) {
  const origin = 'https://malitounik.example';
  const requests = [];
  const paragraph = {};
  const retry = { hidden: true };
  const browser = {
    URL, window: {}, navigator: { onLine: true },
    location: { origin, href: origin + path, replace: url => requests.push(new URL(url)) },
    addEventListener() {}, setTimeout() {}, clearTimeout() {},
    document: { getElementById: () => ({ querySelector: name => name === 'p' ? paragraph : retry }) },
  };
  runInNewContext(startup, browser);
  return { startup: browser.window.malitounikStartup, requests, retry };
}

test('a failed route chunk retries the destination once and keeps the route selection', () => {
  const first = page('/');
  const error = new Error("Unexpected token '<'");
  const target = '/readings/2026-11-27?diocese=pinsk#text';
  first.startup.routeError(error, target);
  first.startup.routeError(error, target);
  assert.equal(first.requests.length, 1);
  const [reload] = first.requests;
  assert.equal(reload.pathname, '/readings/2026-11-27');
  assert.equal(reload.searchParams.get('diocese'), 'pinsk');
  assert.equal(reload.hash, '#text');
  assert.ok(reload.searchParams.has('app-retry'));

  const next = page(reload.pathname + reload.search + reload.hash);
  next.startup.routeError(error, target);
  assert.equal(next.requests.length, 0);
  assert.equal(next.retry.hidden, false);
});
