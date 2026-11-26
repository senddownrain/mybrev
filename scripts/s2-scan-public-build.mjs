import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { CODE_ALPHABET, codeProof, normalizeCode } from '../src/utils/priestCode.mjs';

const vectors = JSON.parse(await readFile(new URL('../tests/fixtures/access-sets-v2-code-vectors.json', import.meta.url)));
const legacy = 'A2B3-C4D5-E6F7-G8H9-J2K3-L4M5';
const values = [
  legacy, normalizeCode(legacy), await codeProof(legacy), 'Synthetic restricted S2 fixture',
  ...vectors.valid.flatMap(({ canonical, proof }) => [canonical, proof]),
];
const groupedSecrets = vectors.valid.map(({ canonical }) => canonical.split('-').at(-1));
const files = (await readdir('dist', { recursive: true, withFileTypes: true })).filter(item => item.isFile());
assert.ok(files.some(item => item.name === 'sw.js'), 'Run the production build before scanning');

for (const entry of files) {
  const path = join(entry.parentPath, entry.name);
  const payload = (await readFile(path)).toString('utf8');
  assert.ok(values.every(value => !payload.includes(value)), `Protected fixture value in ${path}`);
  // A sequential vector overlaps the public alphabet used by the parser and generator.
  const withoutAlphabet = payload.replaceAll(`"${CODE_ALPHABET}"`, '');
  assert.ok(groupedSecrets.every(secret => !withoutAlphabet.includes(secret)), `Fixture secret in ${path}`);
}

console.log(`PASS public build scan: ${files.length} files, including the service worker`);
