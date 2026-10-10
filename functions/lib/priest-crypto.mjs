import { randomInt, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function normalizeCode(value) {
  const code = String(value || '').trim().toUpperCase();
  if (!/^[A-Z2-9-]{12,79}$/.test(code) || code.startsWith('-') || code.endsWith('-') || code.includes('--')) return null;
  const normalized = code.replaceAll('-', '');
  if (normalized.length < 12 || normalized.length > 64) return null;
  return normalized;
}
export function validNewCode(value) {
  const code = normalizeCode(value);
  if (!code || new Set(code).size < 6 || !/[A-Z]/.test(code) || !/[2-9]/.test(code)) return false;
  if (/^(.{1,6})\1+$/.test(code) || /(?:ABCDEFG|23456789|PASSWORD|QWERTY|PRIEST)/.test(code)) return false;
  return true;
}
export function generateCode() {
  let code;
  do { code = Array.from({ length: 12 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join(''); } while (!validNewCode(code));
  return code.match(/.{4}/g).join('-');
}
export const newSecret = () => randomBytes(32).toString('base64url');
export const secretHash = (value) => createHash('sha256').update(value).digest('hex');
export function matchesSecret(value, hash) {
  if (typeof hash !== 'string' || hash.length !== 64) return false;
  return timingSafeEqual(Buffer.from(secretHash(value), 'hex'), Buffer.from(hash, 'hex'));
}
export function parseCredential(value) {
  const match = /^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.([A-Za-z0-9_-]{43})$/.exec(value || '');
  return match ? { id: match[1], secret: match[2] } : null;
}
