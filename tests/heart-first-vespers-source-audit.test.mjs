import test from 'node:test';
import assert from 'node:assert/strict';
import { auditFirstVespers, loadServiceAccount, VESPER_SUFFIXES } from '../scripts/liturgy/audit-heart-first-vespers.mjs';

test('one resolved I Vespers field always uses Sunday explicit Proper or Saturday psalter, never Sunday II', () => {
  const saturday = Object.fromEntries(VESPER_SUFFIXES.map((suffix) => ['vesper' + suffix, '<p>I ' + suffix + '</p>']));
  const sunday = Object.fromEntries([
    ...VESPER_SUFFIXES.map((suffix) => ['vesper' + suffix, '<p>II ' + suffix + '</p>']),
    ['vesper1AntMag', '<p>Proper I AntMag</p>'],
    ['vesperPr', saturday.vesperPr],
  ]);
  const source = Object.fromEntries(VESPER_SUFFIXES.map((suffix) => [
    'vesper1' + suffix, suffix === 'AntMag' ? '<p>Proper I AntMag</p>' : '<p>I ' + suffix + '</p>',
  ]));
  const result = auditFirstVespers({ saturday, sunday, source });
  assert.equal(result.verdict, 'MATCHED');
  assert.deepEqual(result.counts, { MATCH: VESPER_SUFFIXES.length });
  assert.equal(result.fields.find((row) => row.field === 'vesperAntMag').selectedFrom, 'sunday.vesper1');
  assert.equal(result.fields.find((row) => row.field === 'vesperHymn').selectedFrom, 'saturday.vesper');
});

test('missing source fields are not misreported as a match; absence of content blocks', () => {
  const saturday = { vesperHymn: 'valid' };
  const sunday = { vesperHymn: 'incorrect II Vespers' };
  const result = auditFirstVespers({ saturday, sunday, source: { vesper1Hymn: 'valid' } });
  assert.equal(result.verdict, 'BLOCKED');
  assert.ok(result.fields.some((row) => row.status === 'MISSING_CONTENT'));
  assert.equal(result.fields.find((row) => row.field === 'vesperHymn').status, 'MATCH');
});

test('without independent source, completeness alone does not claim liturgical correctness', () => {
  const saturday = Object.fromEntries(VESPER_SUFFIXES.map((suffix) => ['vesper' + suffix, 'Some text']));
  const result = auditFirstVespers({ saturday, sunday: {}, source: null });
  assert.equal(result.verdict, 'SOURCE_VERIFICATION_REQUIRED');
  assert.equal(result.counts.SOURCE_NOT_PROVIDED, VESPER_SUFFIXES.length);
});


test('a populated Saturday from another celebration blocks even without external HTML', () => {
  const saturday = Object.fromEntries(VESPER_SUFFIXES.map((suffix) => ['vesper' + suffix, '<p>Trinity ' + suffix + '</p>']));
  const sunday = { vesperPr: '<p>Collect of XI Sunday</p>' };
  const result = auditFirstVespers({ saturday, sunday });
  assert.equal(result.verdict, 'BLOCKED');
  assert.equal(result.counts.MISSING_CONTENT, undefined);
  assert.equal(result.sourceIssues[0].code, 'INCONSISTENT_SUNDAY_COLLECT');
  // The proper collect resolves this particular inconsistency, but never
  // substitutes for the independent field-by-field source comparison.
  sunday.vesper1Pr = sunday.vesperPr;
  assert.equal(auditFirstVespers({ saturday, sunday }).verdict, 'SOURCE_VERIFICATION_REQUIRED');
});

test('injected base64 credentials are read in memory without accessing a key file', () => {
  const account = { project_id: 'test-project', client_email: 'test@example.invalid' };
  assert.deepEqual(loadServiceAccount('/nonexistent/key.json', {
    FIREBASE_SERVICE_ACCOUNT_B64: Buffer.from(JSON.stringify(account)).toString('base64'),
  }), account);
});
