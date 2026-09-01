import { readFile, writeFile } from 'node:fs/promises';

const path = new URL('../src/constants/contentRevision.js', import.meta.url);
const source = await readFile(path, 'utf8');
const revision = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const updated = source.replace(
  /export const CONTENT_REVISION = '[^']+';/,
  `export const CONTENT_REVISION = '${revision}';`,
);
if (updated === source) throw new Error('CONTENT_REVISION declaration not found');
await writeFile(path, updated);
console.log(`Public content revision: ${revision}`);
