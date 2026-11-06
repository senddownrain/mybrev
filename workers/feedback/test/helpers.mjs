/* global Response */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

/** LOCAL/TEST ONLY D1 shim on node:sqlite (same shape as the analytics shim; own migrations). */
export function createD1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(fs.readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  const make = (sql, params = []) => ({
    bind: (...a) => make(sql, a),
    _run: () => { const r = db.prepare(sql).run(...params); return { changes: Number(r.changes) }; },
    async run() { return { success: true, meta: this._run() }; },
    async all() { return { results: db.prepare(sql).all(...params), success: true }; },
    async first() { return db.prepare(sql).get(...params) ?? null; },
  });
  return {
    raw: db, prepare: (s) => make(s),
    async batch(stmts) { db.exec('BEGIN IMMEDIATE'); try { const out = stmts.map((s) => ({ success: true, meta: s._run() })); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; } },
  };
}

export const PROJECT = 'mybrev-test';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
export const JWKS = JSON.stringify({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' }] });
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

export function makeToken(uid, { claims = {}, signWith = privateKey, kid = 'k1', alg = 'RS256' } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: uid, iat: now - 5, auth_time: now - 5, exp: now + 3600, ...claims };
  const head = `${b64({ alg, kid, typ: 'JWT' })}.${b64(payload)}`;
  const sig = alg === 'none' ? '' : crypto.sign('RSA-SHA256', Buffer.from(head), signWith).toString('base64url');
  return `${head}.${sig}`;
}
export const forgedKey = other.privateKey;

/** Role table for tests: uid -> firestore-shaped response. Counts calls so tests can prove "read on every request". */
export function makeEnv(roles = {}, extra = {}) {
  const DB = createD1();
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), auth: init?.headers?.authorization });
    const uid = decodeURIComponent(String(url).split('/admins/')[1]);
    const r = roles[uid];
    if (r === 'ERROR') return new Response('boom', { status: 500 });
    if (r === undefined) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify({ fields: r === 'legacy' ? {} : { role: { stringValue: r } } }), { status: 200 });
  };
  return { env: { DB, FIREBASE_PROJECT_ID: PROJECT, FIREBASE_JWKS: JWKS, FEEDBACK_ENABLED: 'true', ALLOWED_ORIGINS: 'https://app.example', DAILY_BUDGET: '500', RATE_PER_MINUTE: '1000', ...extra }, deps: { fetchImpl }, calls, roles };
}
