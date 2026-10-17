import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLiturgicalTitleHtml } from '../src/utils/liturgicalTitle.js';

test('formats supported HTML break tags as line breaks in liturgical titles', () => {
  assert.equal(
    formatLiturgicalTitleHtml('ВЕЛІКОДНАЯ НЯДЗЕЛЯ<br>АБО<br/>НЯДЗЕЛЯ ЎВАСКРАСЕННЯ<br />ПАНА'),
    'ВЕЛІКОДНАЯ НЯДЗЕЛЯ<br>АБО<br>НЯДЗЕЛЯ ЎВАСКРАСЕННЯ<br>ПАНА',
  );
});

test('escapes other markup in liturgical titles', () => {
  assert.equal(
    formatLiturgicalTitleHtml('<img src=x onerror=alert(1)> & назва'),
    '&lt;img src=x onerror=alert(1)&gt; &amp; назва',
  );
});
