import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { selectDaysTemplates } from '../scripts/liturgy/prepare-days-templates.mjs';

const readGzip = (path) => JSON.parse(gunzipSync(readFileSync(path)));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const directory = 'docs/audits/liturgical-common-texts-2026-11/v4';

test('all retired Web corrections were verified on the server and retained in the later catalog', () => {
  const full = readGzip(`${directory}/full-content-plan.json.gz`);
  const plan = selectDaysTemplates(full, JSON.parse(readFileSync(`${directory}/PUBLICATION_RESULT.json`)));
  const receipt = readGzip(`${directory}/final-execution/field-readbacks-receipt.json.gz`);
  const later = readGzip('docs/releases/final-test-2026-11-18/catalog.json.gz').documents;
  assert.ok(receipt.receipts.every((batch) => batch.readback === 'verified'));
  const verified = new Map(receipt.receipts.flatMap((batch) => batch.documents.map(doc => [doc.document, doc])));
  assert.equal(verified.size, 749);
  let fields = 0;
  for (const document of plan.documents) {
    const committed = verified.get(document.document);
    assert.ok(committed, document.document);
    assert.deepEqual(later[document.document], receipt.catalog[document.document], document.document);
    assert.deepEqual(committed.writtenFieldMasks, document.fields.map(field => field.field));
    for (const [index, field] of document.fields.entries()) {
      const actual = committed.fields[index];
      assert.equal(actual.field, field.field);
      assert.deepEqual(actual.path, field.path);
      assert.equal(actual.beforeSha256, sha256(field.before));
      assert.equal(actual.afterSha256, sha256(field.after));
      fields += 1;
    }
  }
  assert.equal(fields, 7791);
});
