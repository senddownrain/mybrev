import test from 'node:test';
import assert from 'node:assert/strict';
import { auditFirstVespers, VESPER_SUFFIXES } from '../scripts/liturgy/audit-heart-first-vespers.mjs';

test('one resolved I Vespers field always uses Sunday explicit Proper or Saturday psalter, never Sunday II', () => {
  const saturday = Object.fromEntries(VESPER_SUFFIXES.map((suffix) => ['vesper' + suffix, '<p>I ' + suffix + '</p>']));
  const sunday = Object.fromEntries([
    ...VESPER_SUFFIXES.map((suffix) => ['vesper' + suffix, '<p>II ' + suffix + '</p>']),
    ['vesper1AntMag', '<p>Proper I AntMag</p>'],
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
