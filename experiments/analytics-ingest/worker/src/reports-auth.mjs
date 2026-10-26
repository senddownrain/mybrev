/* global TextEncoder, TextDecoder, atob */
/**
 * R05: authorisation of the PRIVATE read API. Two independent layers, either one is enough, neither is optional to configure:
 *  - Cloudflare Access: the Worker itself verifies the `Cf-Access-Jwt-Assertion` JWT (RS256 signature against the team JWKS, `iss`, `aud`,
 *    `exp`, `nbf`). Putting Access in front of the route is not trusted on its own: a request that reaches the Worker around Access
 *    (for example straight to *.workers.dev) carries no valid JWT and is refused.
 *  - A bearer token (`DASHBOARD_TOKEN`, a Worker secret, >= 24 chars) for CLI / smoke checks. Constant-time comparison.
 * Nothing configured = nobody gets in (401). Identity (email) is only compared with an optional allow-list and is never logged or echoed.
 * Real Cloudflare Access is NOT TESTED here (no account): the JWT path is tested with locally generated RSA keys and an injected JWKS.
 */
const enc = new TextEncoder();
const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const parseJson = (bytes) => JSON.parse(new TextDecoder().decode(bytes));

export const MIN_TOKEN_LENGTH = 24;
const JWKS_TTL_MS = 600000;
const jwksCache = new Map(); // team domain -> { at, keys }

async function safeEqual(a, b) {
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const [x, y] = [new Uint8Array(ha), new Uint8Array(hb)];
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function loadJwks(env, now, fetchImpl) {
  if (env.ACCESS_JWKS) return JSON.parse(env.ACCESS_JWKS).keys; // pinned keys (tests, or a deliberate pin)
  const domain = env.ACCESS_TEAM_DOMAIN;
  const hit = jwksCache.get(domain);
  if (hit && now - hit.at < JWKS_TTL_MS) return hit.keys;
  const res = await fetchImpl(`https://${domain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('jwks_unavailable');
  const { keys } = await res.json();
  jwksCache.set(domain, { at: now, keys });
  return keys;
}

/** @returns {Promise<{ ok: true, identity: string } | { ok: false, status: 401 | 403 }>} */
async function verifyAccessJwt(jwt, env, now, fetchImpl) {
  const parts = jwt.split('.');
  if (parts.length !== 3) return { ok: false, status: 401 };
  try {
    const header = parseJson(b64url(parts[0]));
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return { ok: false, status: 401 };
    const jwk = (await loadJwks(env, now, fetchImpl)).find((key) => key.kid === header.kid && key.kty === 'RSA');
    if (!jwk) return { ok: false, status: 401 };
    const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
    if (!valid) return { ok: false, status: 401 };
    const claims = parseJson(b64url(parts[1]));
    const nowSec = Math.floor(now / 1000);
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== `https://${env.ACCESS_TEAM_DOMAIN}` || !audience.includes(env.ACCESS_AUD)) return { ok: false, status: 401 };
    if (typeof claims.exp !== 'number' || claims.exp <= nowSec || (typeof claims.nbf === 'number' && claims.nbf > nowSec + 60)) return { ok: false, status: 401 };
    const allowed = String(env.ACCESS_ALLOWED_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (allowed.length && !allowed.includes(String(claims.email || '').toLowerCase())) return { ok: false, status: 403 };
    return { ok: true, identity: 'access' };
  } catch {
    return { ok: false, status: 401 };
  }
}

export const accessConfigured = (env) => Boolean(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD);
export const tokenConfigured = (env) => typeof env.DASHBOARD_TOKEN === 'string' && env.DASHBOARD_TOKEN.length >= MIN_TOKEN_LENGTH;

/** @returns {Promise<{ ok: true, via: 'access' | 'token' } | { ok: false, status: 401 | 403 }>} */
export async function authorize(request, env, { now = Date.now(), fetchImpl = fetch } = {}) {
  let status = 401;
  const jwt = request.headers.get('cf-access-jwt-assertion');
  if (jwt && accessConfigured(env)) {
    const result = await verifyAccessJwt(jwt, env, now, fetchImpl);
    if (result.ok) return { ok: true, via: 'access' };
    status = result.status;
  }
  const header = request.headers.get('authorization') || '';
  if (tokenConfigured(env) && header.startsWith('Bearer ') && await safeEqual(header.slice(7), env.DASHBOARD_TOKEN)) return { ok: true, via: 'token' };
  return { ok: false, status };
}
