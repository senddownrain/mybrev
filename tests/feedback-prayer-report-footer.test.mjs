import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prayerFeedbackLink, feedbackLocationForRoute, contextFromQuery } from '../src/utils/feedbackContext.js';

const vue = fs.readFileSync(new URL('../src/components/prayers/PrayerView.vue', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles/prayer-reading.css', import.meta.url), 'utf8');
const drawer = fs.readFileSync(new URL('../src/layouts/default/NavigationDrawer.vue', import.meta.url), 'utf8');

const footer = vue.match(/<footer class="prayer-report"[\s\S]*?<\/footer>/)?.[0] || '';
const rule = (sel) => css.match(new RegExp(`${sel.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`))?.[1] || '';

test('prayer report block: prompt text, flag icon, compact action, same data-test hook', () => {
  assert.ok(footer, 'footer.prayer-report exists');
  assert.match(footer, /Заўважылі памылку ў тэксце\?/);
  assert.match(footer, /<PhFlag[^>]*aria-hidden="true"/);
  assert.match(footer, /<span>Паведаміць<\/span>/);
  assert.match(footer, /data-test="prayer-report-error"/);
  assert.match(footer, /:to="feedbackTo"/);
  assert.match(footer, /aria-describedby="prayer-report-label"/);
  assert.match(footer, /id="prayer-report-label"/);
  // old bare underlined link and scoped inline overrides are gone
  assert.ok(!/<style scoped>[\s\S]*prayer-report/.test(vue));
  assert.ok(!/fixed|sticky/.test(rule('.prayer-report')));
});

test('prayer report styles: thin rule, wrapping, 44px target, no overflow, visible focus inherited', () => {
  assert.match(rule('.prayer-report'), /border-top:\s*1px solid var\(--reader-border\)/);
  assert.match(rule('.prayer-report'), /flex-wrap:\s*wrap/);
  assert.match(rule('.prayer-report'), /margin:\s*0 20px/);
  assert.match(rule('.prayer-report__action'), /min-height:\s*44px/);
  assert.match(rule('.prayer-report__action'), /max-width:\s*100%/);
  assert.match(rule('.prayer-report__text'), /overflow-wrap:\s*anywhere/);
  assert.match(rule('.prayer-report__action'), /var\(--font-size-multiplier/);
  assert.ok(!/outline:\s*none/.test(rule('.prayer-report__action')));
});

test('footer link keeps prayer context: id, title, kind, return path', () => {
  const route = { name: 'PrayerView', path: '/prayer/abc-1', params: { id: 'abc-1' }, query: {} };
  const link = prayerFeedbackLink(route, ' Ойча наш ');
  assert.equal(link.name, 'Feedback');
  assert.deepEqual(link.query, { ctx_kind: 'prayer', ctx_id: 'abc-1', ctx_path: '/prayer/abc-1', ctx_title: 'Ойча наш' });
  const ctx = contextFromQuery(link.query, { lang: 'be' });
  assert.deepEqual({ kind: ctx.kind, id: ctx.id, title: ctx.title, path: ctx.path }, { kind: 'prayer', id: 'abc-1', title: 'Ойча наш', path: '/prayer/abc-1' });
});

test('footer link matches the side-menu location apart from the title', () => {
  const route = { name: 'PrayerView', path: '/prayer/abc-1', params: { id: 'abc-1' }, query: { lang: 'la' } };
  const { ctx_title, ...rest } = prayerFeedbackLink(route, 'T').query;
  assert.equal(ctx_title, 'T');
  assert.deepEqual(rest, feedbackLocationForRoute(route).query);
  // the return path never carries the query string (Mass language etc. stay private to the route)
  assert.ok(!rest.ctx_path.includes('?'));
});

test('footer link degrades safely: unsafe id dropped, no title, unknown route', () => {
  const bad = prayerFeedbackLink({ name: 'PrayerView', path: '/prayer/x', params: { id: '<x>' } }, '');
  assert.equal(bad.query.ctx_kind, 'prayer');
  assert.equal(bad.query.ctx_id, undefined);
  assert.equal(bad.query.ctx_title, undefined);
  const other = prayerFeedbackLink({ name: 'Elsewhere', path: '/x', params: { id: 'a1' } }, 'T');
  assert.deepEqual(other.query, { ctx_kind: 'prayer', ctx_id: 'a1', ctx_title: 'T' });
});

test('side-menu entry stays untouched', () => {
  assert.match(drawer, /Памылка ў тэксце/);
  assert.match(drawer, /feedbackLocationForRoute\(route\)/);
});
