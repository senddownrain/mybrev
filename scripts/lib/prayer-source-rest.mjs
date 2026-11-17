// A small REST transport with no automatic retries, including HTTP 429.
import { readFile } from 'node:fs/promises';
import { createSign } from 'node:crypto';
import https from 'node:https';
import { HttpsProxyAgent } from 'https-proxy-agent';

/** REST values in the existing private snapshot schema; retain timestamp precision. */
export function decodeSourceRestValue(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return {
    __firestoreType:'timestamp', seconds:Math.floor(Date.parse(value.timestampValue)/1000),
    nanoseconds:Number((value.timestampValue.match(/\.(\d+)Z$/u)?.[1] || '').padEnd(9,'0')),
  };
  if ('bytesValue' in value) return {__firestoreType:'bytes',base64:value.bytesValue};
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeSourceRestValue);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k,v])=>[k,decodeSourceRestValue(v)]));
  return value;
}

export async function createSourceRest({ serviceAccount } = {}) {
  const credentials = JSON.parse(serviceAccount
    ? await readFile(serviceAccount, 'utf8')
    : Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64 || '', 'base64').toString());
  if (credentials.project_id !== 'ibreviaryby') throw new Error('Wrong Firebase project');
  const agent = process.env.HTTPS_PROXY ? new HttpsProxyAgent(process.env.HTTPS_PROXY) : undefined;
  const request = (url, body, token, method = 'POST') => new Promise((resolve, reject) => {
    const req = https.request(url, {
      method, agent,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': token ? 'application/json' : 'application/x-www-form-urlencoded',
      },
    }, (res) => {
      let result = '';
      res.on('data', (chunk) => { result += chunk; });
      res.on('error', reject);
      res.on('end', () => {
        if (res.statusCode >= 300) {
          const error = new Error(`HTTP ${res.statusCode}: ${result.slice(0, 500)}`);
          error.status = res.statusCode;
          reject(error);
        } else {
          try { resolve(JSON.parse(result)); } catch (error) { reject(error); }
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('Request timed out')));
    req.end(body);
  });
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const input = encode({ alg: 'RS256', typ: 'JWT' }) + '.' + encode({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  });
  const jwt = input + '.' + createSign('RSA-SHA256').update(input).sign(credentials.private_key, 'base64url');
  const { access_token: token } = await request('https://oauth2.googleapis.com/token', new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt,
  }).toString());
  const base = 'https://firestore.googleapis.com/v1/projects/ibreviaryby/databases/(default)';
  return {
    base,
    request: (url, body, method = 'POST') => request(url, body === undefined ? undefined : JSON.stringify(body), token, method),
  };
}
