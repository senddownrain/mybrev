/* global Request, TextEncoder */
/**
 * LOCAL fallback for the R05 dashboard (there is no Cloudflare staging: R02-STAGING-BLOCKED-CREDENTIALS). Binds 127.0.0.1 only.
 *   node worker/reports-local-server.mjs --db <file.sqlite> [--port 8790] [--access-port 8791] [--now YYYY-MM-DD] [--simulate-storage-error]
 *  - port       : the Worker AS IS. Without a valid Cloudflare-Access JWT or bearer token it answers 401 (this is the "incognito / unauthenticated CLI" case).
 *  - access-port: LOCAL ACCESS SIMULATOR, NOT Cloudflare. A proxy that signs a short-lived RS256 JWT with a throw-away key and adds it as
 *                 `Cf-Access-Jwt-Assertion`, exactly the header Cloudflare Access adds after login. The Worker verifies it for real
 *                 (signature against the pinned JWKS, iss, aud, exp). Open this port in a browser as "the logged-in owner".
 * DASHBOARD_TOKEN (optional env, >= 24 chars) enables the bearer layer; it is never printed.
 */
import http from 'node:http';
import { Readable } from 'node:stream';
import { createReportsWorker } from './src/reports-worker.mjs';
import { createSqliteD1 } from './src/sqlite-d1-shim.mjs';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const flag = (name) => process.argv.includes(`--${name}`);
const b64 = (input) => Buffer.from(input).toString('base64url');

const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'local-sim', use: 'sig', alg: 'RS256' };
const TEAM = 'local-sim.cloudflareaccess.test';
const AUD = 'local-sim-aud';
const fixedNow = arg('now', null);
const clock = () => (fixedNow ? Date.parse(`${fixedNow}T12:00:00Z`) : Date.now());
async function mintJwt() {
  const head = b64(JSON.stringify({ alg: 'RS256', kid: 'local-sim', typ: 'JWT' }));
  const body = b64(JSON.stringify({ iss: `https://${TEAM}`, aud: [AUD], exp: Math.floor(clock() / 1000) + 300, iat: Math.floor(clock() / 1000), email: 'owner@local-sim.invalid' }));
  const sig = Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${sig.toString('base64url')}`;
}

const DB = createSqliteD1({ file: arg('db', ':memory:') });
if (flag('simulate-storage-error')) DB.prepare = () => { throw new Error('simulated outage'); };
const worker = createReportsWorker({ now: clock });
const env = {
  DB, DASHBOARD_MODE: process.env.DASHBOARD_MODE ?? 'qa', LIVE_RELEASE_CARD: process.env.LIVE_RELEASE_CARD,
  DASHBOARD_TOKEN: process.env.DASHBOARD_TOKEN,
  ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ACCESS_JWKS: JSON.stringify({ keys: [jwk] }),
};

const serve = (withAccess) => http.createServer(async (req, res) => {
  const headers = { ...req.headers };
  delete headers['cf-access-jwt-assertion']; // never trust a client-supplied one on the simulator
  if (withAccess) headers['cf-access-jwt-assertion'] = await mintJwt();
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const request = new Request(`http://localhost${req.url}`, { method: req.method, headers, body: hasBody ? Readable.toWeb(req) : undefined, duplex: 'half' });
  const response = await worker.fetch(request, env);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
});
const direct = serve(false); const simulated = serve(true);
direct.listen(Number(arg('port', 8790)), '127.0.0.1', () => process.stdout.write(`reports Worker (no Access header added) on http://127.0.0.1:${arg('port', 8790)}/reports\n`));
simulated.listen(Number(arg('access-port', 8791)), '127.0.0.1', () => process.stdout.write(`LOCAL ACCESS SIMULATOR (not Cloudflare) on http://127.0.0.1:${arg('access-port', 8791)}/reports\n`));
process.on('SIGTERM', () => { direct.close(); simulated.close(); DB.close(); });
