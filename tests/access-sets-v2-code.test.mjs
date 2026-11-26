import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  parseAccessSetsV2Code, accessSetsV2CodeProof, generateAccessSetsV2Code,
} from '../src/utils/accessSetsV2Code.mjs';
import { normalizeCode } from '../src/utils/priestCode.mjs';

const vectors = JSON.parse(await readFile(new URL('./fixtures/access-sets-v2-code-vectors.json', import.meta.url)));

test('V2 code parsing and proof match the shared Dart and JavaScript vectors', async () => {
  for (const { input, codeId, canonical, proof } of vectors.valid) {
    assert.deepEqual(parseAccessSetsV2Code(input), { codeId, canonical });
    assert.equal(await accessSetsV2CodeProof(canonical), proof);
  }
  for (const value of vectors.invalid) assert.equal(parseAccessSetsV2Code(value), null);
  assert.ok(normalizeCode(vectors.invalid.at(-1)));
});

test('generator requests 16 ID bytes and 24 distinct secret bytes and formats the UTC date', () => {
  const random = {
    getRandomValues(bytes) {
      assert.equal(bytes.length, 40);
      return bytes.map((_byte, i) => i);
    },
  };
  const result = generateAccessSetsV2Code('mari', new Date('2026-11-25T00:15:00+03:00'), random);
  assert.match(result.code, /^MARI-20261124-[A-Z2-9]{16}(-[A-Z2-9]{4}){6}$/);
  assert.equal(result.codeId, 'ABCDEFGHJKLMNPQR');
  assert.deepEqual(parseAccessSetsV2Code(result.code), {
    canonical: 'MARI-20261124-ABCDEFGHJKLMNPQR-STUVWXYZ23456789ABCDEFGH',
    codeId: result.codeId,
  });
  assert.throws(() => generateAccessSetsV2Code('invalid-prefix'), /invalid-prefix/);
});
