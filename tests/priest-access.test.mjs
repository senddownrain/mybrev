import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPriestService } from '../functions/lib/priest-service.mjs';
import { createPriestHandler } from '../functions/lib/priest-http.mjs';
import { generateCode, normalizeCode, parseCredential, validNewCode } from '../functions/lib/priest-crypto.mjs';
import { permittedPrayerContent } from '../functions/lib/priest-policy.mjs';
import { publicAppCollections } from '../scripts/content/lib/app-content.mjs';
import { memoryPriestDb } from './helpers/priest-db.mjs';

const fixtures = {
  'prayerCategories/public': { name: 'Public', tags: ['public'] },
  'prayerCategories/closed': { name: 'Closed', tags: ['closed'], priestOnly: true },
  'prayerCategories/child': { name: 'Child', tags: ['child'], parentId: 'closed', priestOnly: false },
  'prayerCategories/empty': { name: 'Empty', tags: ['own'] },
  'prayers/public': { title: 'Public', text: 'PUBLIC', tags: ['public'] },
  'prayers/own': { title: 'Own', text: 'SECRET OWN', tags: ['public', 'own'], priestOnly: true },
  'prayers/inherited': { title: 'Inherited', text: 'SECRET INHERITED', tags: ['child'], priestOnly: false },
};
const input = (code, client = 'Web') => ({ code, installationId: randomUUID(), client, deviceName: 'Browser', label: 'а. Яўгеній' });
async function setup() {
  let time = Date.UTC(2026, 9, 10);
  const db = memoryPriestDb(fixtures);
  const service = createPriestService(db, { now: () => time });
  const { code } = await service.replaceCode({ generate: true }, 'admin');
  return { db, service, code, advance: (n) => { time += n; }, now: () => time };
}
test('public content hides ancestors, own prayer and empty categories; protected content restores existing categories', async () => {
  const { service, code } = await setup();
  const content = await service.content(null);
  assert.deepEqual(content.prayers.map((p) => p.id), ['public']);
  assert.deepEqual(content.categories.map((p) => p.id), ['public']);
  assert.ok(!JSON.stringify(content).includes('SECRET'));
  const grant = await service.activate(input(code), 'ip1');
  const allowed = await service.content(parseCredential(grant.credential));
  assert.equal(allowed.prayers.length, 3);
  assert.equal(allowed.prayers.find((p) => p.id === 'inherited').priestOnly, false);
});
test('correct code activates; wrong code and forged installation-only credentials are rejected', async () => {
  const { service, code } = await setup();
  await assert.rejects(service.activate(input('WRONG-CODE-2345'), 'ip1'), { code: 'INVALID_CODE' });
  const grant = await service.activate(input(code), 'ip1');
  assert.equal((await service.status(parseCredential(grant.credential))).active, true);
  await assert.rejects(service.content({ id: grant.device.id, secret: 'forged' }), { code: 'ACCESS_REQUIRED' });
});
test('grant survives service restart and 30 days, then code replacement; old code fails for new installations', async () => {
  const { db, service, code, advance, now } = await setup();
  const grant = await service.activate(input(code), 'ip1');
  advance(366 * 86400000);
  const restarted = createPriestService(db, { now });
  assert.equal((await restarted.status(parseCredential(grant.credential))).active, true);
  const next = await restarted.replaceCode({ generate: true }, 'admin');
  assert.equal((await restarted.content(parseCredential(grant.credential))).prayers.length, 3);
  await assert.rejects(restarted.activate(input(code), 'ip2'), { code: 'INVALID_CODE' });
  assert.ok((await restarted.activate(input(next.code), 'ip2')).credential);
  assert.equal('code' in await restarted.settings(), false);
  assert.match(db.rows.get('priestAccess/settings').codeHash, /^\$argon2id\$/);
});
test('individual revoke and user disable prevent further protected reads and are idempotent', async () => {
  const { service, code } = await setup();
  const a = await service.activate(input(code), 'ip1');
  const b = await service.activate(input(code, 'Flutter'), 'ip2');
  await service.updateDevice(a.device.id, { revoke: true, label: 'Changed' });
  await assert.rejects(service.content(parseCredential(a.credential)), { code: 'ACCESS_REQUIRED' });
  assert.equal((await service.content(parseCredential(b.credential))).prayers.length, 3);
  await service.disable(parseCredential(b.credential));
  await service.disable(parseCredential(b.credential));
  await assert.rejects(service.status(parseCredential(b.credential)), { code: 'ACCESS_REQUIRED' });
  const list = await service.listDevices();
  assert.equal(list.devices.find((d) => d.id === a.device.id).label, 'Changed');
  assert.ok(!JSON.stringify(list).includes('secretHash'));
});
test('parallel duplicate registration creates only one grant; limits survive server recreation', async () => {
  const { service, code, db, now } = await setup();
  const device = input(code);
  const results = await Promise.allSettled([service.activate(device, 'same'), service.activate(device, 'same')]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'INSTALLATION_REGISTERED');
  for (let i = 0; i < 8; i++) await assert.rejects(service.activate(input('WRONG-CODE-2345'), 'limited'), { code: 'INVALID_CODE' });
  await assert.rejects(createPriestService(db, { now }).activate(input(code), 'limited'), { code: 'TOO_MANY_ATTEMPTS' });
});

test('activation rejects a code rotated between hash verification and registration commit', async () => {
  const { service, code, db } = await setup();
  const old = structuredClone(db.rows.get('priestAccess/settings'));
  await service.replaceCode({ generate: true }, 'admin');
  const next = structuredClone(db.rows.get('priestAccess/settings'));
  db.rows.set('priestAccess/settings', old);
  const originalTransaction = db.runTransaction;
  db.runTransaction = (fn) => originalTransaction(async (tx) => {
    const get = tx.get;
    tx.get = (ref) => {
      if (ref.path === 'priestAccess/settings') db.rows.set(ref.path, next);
      return get(ref);
    };
    return fn(tx);
  });
  await assert.rejects(service.activate(input(code), 'race'), { code: 'INVALID_CODE' });
  assert.equal([...db.rows.keys()].filter((key) => key.startsWith('priestDeviceGrants/')).length, 0);
});
test('secure code generation and manual format reject simple or malformed values', () => {
  for (let i = 0; i < 100; i++) { const code = generateCode(); assert.match(code, /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){2}$/); assert.equal(validNewCode(code), true); }
  for (const code of ['', 'AAAAAAAAAAAA', 'ABCDEFGH2345', 'PASSWORD234567', 'abc 2345678912', '234567892345']) assert.equal(validNewCode(code), false);
  assert.equal(normalizeCode('abcd-efgh-2345'), 'ABCDEFGH2345');
});
test('parent status edits preserve children own flags; cycles and dangling links fail closed', () => {
  const prayers = [{ id: 'p', tags: ['child'] }];
  const cats = [{ id: 'root', priestOnly: true }, { id: 'child', parentId: 'root', tags: ['child'], priestOnly: true }];
  assert.equal(permittedPrayerContent(prayers, cats).prayers.length, 0);
  cats[0].priestOnly = false;
  assert.equal(permittedPrayerContent(prayers, cats).prayers.length, 0);
  cats[1].priestOnly = false;
  assert.equal(permittedPrayerContent(prayers, cats).prayers.length, 1);
  cats[0].parentId = 'child';
  assert.equal(permittedPrayerContent(prayers, cats).prayers.length, 0);
  cats[0].parentId = 'missing';
  assert.equal(permittedPrayerContent(prayers, cats).prayers.length, 0);
});
test('public bundle and manifest filtering excludes inherited texts and requires categories', () => {
  const prayers = Object.entries(fixtures).filter(([k]) => k.startsWith('prayers/')).map(([k, p]) => ({ ...p, id: k.split('/')[1] }));
  const cats = Object.entries(fixtures).filter(([k]) => k.startsWith('prayerCategories/')).map(([k, p]) => ({ ...p, id: k.split('/')[1] }));
  assert.throws(() => publicAppCollections(new Map([['prayers', prayers]])), /requires prayerCategories/);
  const exported = publicAppCollections(new Map([['prayers', prayers], ['prayerCategories', cats]]));
  assert.ok(!JSON.stringify([...exported]).includes('SECRET'));
  assert.equal(prayers.length, 3);
});

async function http(handler, path, { method = 'GET', body = {}, cookie, bearer, origin = 'https://test.web.app', native = false } = {}) {
  const headers = { origin, cookie, authorization: bearer ? `Bearer ${bearer}` : undefined, 'x-priest-client': native ? 'Flutter' : undefined };
  const [pathname, queryString] = path.split('?');
  const req = { path: `/api/priest${pathname}`, query: Object.fromEntries(new URLSearchParams(queryString)), method, body, ip: 'test', get: (k) => headers[k], is: (type) => type === 'application/json' };
  const res = { headers: {}, statusCode: 200, set(k, v) { this.headers[k] = v; return this; }, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; }, send(v) { this.body = v; return this; } };
  await handler(req, res);
  return res;
}
test('HTTP direct URLs, search and favorites never return unauthorized text; cookie/Flutter and CSRF contracts', async () => {
  const { service, code } = await setup();
  const handler = createPriestHandler(service, { origins: ['https://test.web.app'], verifyAdmin: async (token) => { if (token !== 'admin') throw Object.assign(new Error(), { status: 403 }); return 'admin'; } });
  assert.equal((await http(handler, '/prayers/own')).statusCode, 404);
  assert.deepEqual((await http(handler, '/prayers?q=SECRET')).body.prayers, []);
  assert.deepEqual((await http(handler, '/prayers?ids=own,inherited')).body.prayers, []);
  assert.equal((await http(handler, '/activate', { method: 'POST', body: input(code), origin: 'https://evil.test' })).statusCode, 403);
  assert.equal((await http(handler, '/activate', { method: 'POST', body: input(code), origin: null })).statusCode, 403);
  const web = await http(handler, '/activate', { method: 'POST', body: input(code) });
  assert.equal(web.body.credential, undefined);
  assert.match(web.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Strict/);
  const cookie = web.headers['Set-Cookie'].split(';')[0];
  assert.equal((await http(handler, '/status', { cookie })).body.active, true);
  assert.equal((await http(handler, '/prayers/own', { cookie })).body.prayer.text, 'SECRET OWN');
  const native = await http(handler, '/activate', { method: 'POST', body: input(code, 'Flutter'), native: true, origin: null });
  assert.ok(native.body.credential);
  assert.equal((await http(handler, '/prayers/own', { bearer: native.body.credential, native: true, origin: null })).statusCode, 200);
  assert.equal((await http(handler, '/content')).headers['Cache-Control'], 'private, no-store');
  assert.equal((await http(handler, '/admin/devices')).statusCode, 403);
  await http(handler, '/disable', { method: 'POST', cookie });
  assert.equal((await http(handler, '/prayers/own', { cookie })).statusCode, 401);
});
