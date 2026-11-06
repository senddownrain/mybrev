/* global TextEncoder, TextDecoder, atob */
/**
 * Cryptographic verification of a Firebase ID token (RS256 against Google's securetoken JWKS).
 * Checks: alg/kid, signature, iss, aud, exp, iat, auth_time, sub. Anything doubtful => { ok:false } (401).
 * Local emulator tokens are unsigned (alg none): accepted ONLY when ALLOW_EMULATOR_TOKENS==='true' AND the project id starts with `demo-`.
 */
const enc = new TextEncoder();
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const DEFAULT_TTL_MS = 3600000;
const SKEW_SEC = 60;
let cache = { at: 0, ttl: 0, keys: null };

const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const parseJson = (bytes) => JSON.parse(new TextDecoder().decode(bytes));

export function resetKeyCache() { cache = { at: 0, ttl: 0, keys: null }; }

async function loadKeys(env, now, fetchImpl) {
  if (env.FIREBASE_JWKS) return JSON.parse(env.FIREBASE_JWKS).keys; // pinned keys (tests)
  if (cache.keys && now - cache.at < cache.ttl) return cache.keys;
  const res = await fetchImpl(JWKS_URL);
  if (!res.ok) throw new Error('jwks_unavailable');
  const { keys } = await res.json();
  const maxAge = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
  cache = { at: now, ttl: maxAge ? Math.min(Number(maxAge[1]) * 1000, DEFAULT_TTL_MS) : DEFAULT_TTL_MS, keys };
  return keys;
}

/** @returns {Promise<{ ok: true, uid: string } | { ok: false, reason: string }>} */
export async function verifyFirebaseIdToken(token, env, { now = Date.now(), fetchImpl = fetch } = {}) {
  const projectId = env.FIREBASE_PROJECT_ID;
  if (!projectId || typeof token !== 'string') return { ok: false, reason: 'config_or_token' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'format' };
  try {
    const header = parseJson(b64url(parts[0]));
    const claims = parseJson(b64url(parts[1]));
    if (header.alg === 'none') {
      if (env.ALLOW_EMULATOR_TOKENS !== 'true' || !projectId.startsWith('demo-') || parts[2] !== '') return { ok: false, reason: 'alg' };
    } else {
      if (header.alg !== 'RS256' || typeof header.kid !== 'string') return { ok: false, reason: 'alg' };
      const keys = await loadKeys(env, now, fetchImpl);
      const jwk = keys.find((k) => k.kid === header.kid && k.kty === 'RSA');
      if (!jwk) return { ok: false, reason: 'kid' };
      const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
      if (!valid) return { ok: false, reason: 'signature' };
    }
    const nowSec = Math.floor(now / 1000);
    if (claims.aud !== projectId) return { ok: false, reason: 'aud' };
    if (claims.iss !== `https://securetoken.google.com/${projectId}`) return { ok: false, reason: 'iss' };
    if (typeof claims.exp !== 'number' || claims.exp <= nowSec) return { ok: false, reason: 'exp' };
    if (typeof claims.iat !== 'number' || claims.iat > nowSec + SKEW_SEC) return { ok: false, reason: 'iat' };
    if (typeof claims.auth_time === 'number' && claims.auth_time > nowSec + SKEW_SEC) return { ok: false, reason: 'auth_time' };
    if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128) return { ok: false, reason: 'sub' };
    return { ok: true, uid: claims.sub };
  } catch {
    return { ok: false, reason: 'parse' };
  }
}
