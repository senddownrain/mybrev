import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('privacy document is public, standalone HTML and identifies both apps', () => {
  const html = read('../public/privacy.html');
  assert.match(html, /<html lang="be">/);
  assert.match(html, /Палітыка прыватнасці/);
  assert.match(html, /MyBrev Test/);
  assert.match(html, /MIC Development/);
  assert.match(html, /mailto:micdev\.by@gmail\.com/);
  assert.doesNotMatch(html, /marianchurch\.minsk@gmail\.com/);
  assert.match(html, /Sentry/);
  assert.match(html, /Firebase/);
  assert.doesNotMatch(html, /<script\b|<iframe\b|noindex|http-equiv="refresh"/i);
});

test('About links to privacy route and Hosting returns static page', () => {
  const about = read('../src/views/About.vue');
  const hosting = JSON.parse(read('../firebase.json'));
  assert.match(about, /href="\/privacy"/);
  const i = hosting.hosting.rewrites.findIndex((r) => r.source === '/privacy');
  const fallback = hosting.hosting.rewrites.findIndex((r) => r.source === '**');
  assert.ok(i >= 0 && i < fallback, 'privacy rewrite must precede SPA fallback');
  assert.equal(hosting.hosting.rewrites[i].destination, '/privacy.html');
});

test('privacy policy describes the actual feedback collection and Cloudflare processing', () => {
  const html = read('../public/privacy.html');
  assert.match(html, /Зваротная сувязь/);
  assert.match(html, /Cloudflare Workers/);
  assert.match(html, /Cloudflare D1/);
  assert.match(html, /180 дзён/);
  assert.match(html, /без адраса пошты/);
  assert.match(html, /Прыкладанні \(скрыншоты, файлы\) форма не прымае/);
  assert.match(html, /25 лістапада 2026/);
});

test('privacy policy describes optional Web Google Analytics and withdrawal', () => {
  const html = read('../public/privacy.html');
  assert.match(html, /Google Analytics for Firebase/);
  assert.match(html, /толькі пасля вашага добраахвотнага дазволу/);
  assert.match(html, /Налады.*Статыстыка выкарыстання/);
  assert.match(html, /адкліканне дазволу спыняе далейшы збор/);
  assert.match(html, /не выдаляе аўтаматычна ўжо сабраныя даныя/);
});
