import assert from 'node:assert/strict';
import test from 'node:test';

import { removeBreakAfterAsterisk } from '../src/utils/liturgicalHtml.js';

test('removes a line break immediately after a psalm asterisk', () => {
  assert.equal(
    removeBreakAfterAsterisk('Пане, пачуй мяне, *<br /> і адкажы мне.'),
    'Пане, пачуй мяне, * і адкажы мне.',
  );
});

test('handles an asterisk wrapped in a rubric span', () => {
  assert.equal(
    removeBreakAfterAsterisk('слова <span style="color:red">*</span><br> працяг'),
    'слова <span style="color:red">*</span> працяг',
  );
});

test('preserves all other line breaks', () => {
  assert.equal(
    removeBreakAfterAsterisk('Першы радок<br>Другі радок'),
    'Першы радок<br>Другі радок',
  );
});
