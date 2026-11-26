import { CODE_ALPHABET } from './priestCode.mjs';

const symbols = '[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]';
const format = new RegExp(
  '^([A-Z]{3,10})-([0-9]{8})-(' + symbols + '{16})-('
    + symbols + '{24}|' + symbols + '{4}(?:-' + symbols + '{4}){5})$',
);

export const ACCESS_SET_ID = /^[a-z][a-z0-9-]{0,63}$/;

export function parseAccessSetsV2Code(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9 \t\r\n-]+$/.test(value)) return null;
  const match = format.exec(value.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '').toUpperCase());
  if (!match) return null;
  const [, prefix, issuedDate, codeId, groupedSecret] = match;
  const isoDate = issuedDate.replace(/^(....)(..)(..)$/, '$1-$2-$3');
  const date = new Date(isoDate + 'T00:00:00.000Z');
  if (issuedDate.startsWith('0000') || !Number.isFinite(date.getTime())
    || date.toISOString().slice(0, 10) !== isoDate) return null;

  return {
    codeId,
    canonical: [prefix, issuedDate, codeId, groupedSecret.replaceAll('-', '')].join('-'),
  };
}

export async function accessSetsV2CodeProof(canonical, crypto = globalThis.crypto) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new globalThis.TextEncoder().encode('mybrev/access-code/v2\n' + canonical),
  );
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function generateAccessSetsV2Code(prefix, issuedAt = new Date(), crypto = globalThis.crypto) {
  if (typeof prefix !== 'string' || !/^[A-Za-z]{3,10}$/.test(prefix)) throw new Error('invalid-prefix');
  const issueDate = issuedAt.toISOString().slice(0, 10).replaceAll('-', '');
  if (!/^[0-9]{8}$/.test(issueDate) || issueDate.startsWith('0000')) throw new Error('invalid-date');
  const random = Array.from(
    crypto.getRandomValues(new Uint8Array(40)), byte => CODE_ALPHABET[byte % CODE_ALPHABET.length],
  ).join('');
  const codeId = random.slice(0, 16);
  const secret = random.slice(16).match(/.{4}/g).join('-');
  return { codeId, code: [prefix.toUpperCase(), issueDate, codeId, secret].join('-') };
}
