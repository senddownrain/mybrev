// Shared Web/Dart contract: ASCII trim, uppercase, remove ASCII hyphens;
// SHA-256 of the resulting ASCII/UTF-8 bytes, lowercase hex.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function normalizeCode(value) {
  if (typeof value !== 'string') return null;
  if (!/^[A-Za-z2-9\- \t\r\n]*$/.test(value)) return null;
  const code = value.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '').toUpperCase();
  if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9-]+$/.test(code) || code.startsWith('-') || code.endsWith('-') || code.includes('--')) return null;
  const result = code.replaceAll('-', '');
  return result.length >= 24 && result.length <= 64 ? result : null;
}
export function validNewCode(value) {
  const code = normalizeCode(value);
  if (!code || new Set(code).size < 10 || !/[A-Z]/.test(code) || !/[2-9]/.test(code)
    || /(.)\1{3}/.test(code) || /(ABCDEFG|23456789|98765432|PASSWORD|QWERTY|PRIEST)/.test(code)) return false;
  for (let size = 1; size <= code.length / 2; size++) {
    if (code.length % size === 0 && code.slice(0, size).repeat(code.length / size) === code) return false;
  }
  return true;
}
export function generateCode(random = globalThis.crypto) {
  // Rejection sampling also stays unbiased if the 32-symbol alphabet changes.
  const ceiling = 256 - (256 % CODE_ALPHABET.length);
  let code;
  do {
    code = '';
    while (code.length < 24) {
      const bytes = random.getRandomValues(new Uint8Array(32));
      for (const value of bytes) {
        if (value < ceiling && code.length < 24) code += CODE_ALPHABET[value % CODE_ALPHABET.length];
      }
    }
  } while (!validNewCode(code));
  return code.match(/.{4}/g).join('-');
}
export async function codeProof(value, crypto = globalThis.crypto) {
  const code = normalizeCode(value);
  if (!code) throw new Error('INVALID_CODE');
  const hash = await crypto.subtle.digest('SHA-256', new globalThis.TextEncoder().encode(code));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
