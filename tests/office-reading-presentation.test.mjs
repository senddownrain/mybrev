import assert from 'node:assert/strict';
import test from 'node:test';
import { parse } from 'node-html-parser';
import { formatOfficeReadingPresentation as format } from '../src/utils/officeReadingPresentation.js';
const text = html => parse(html.replace(/<br\s*\/?>/giu, ' ')).text.replace(/\s+/gu, ' ').trim();
for (const tag of ['p','div']) test(`${tag}: reading reference retains case and numbering; replies retain text and boundaries`, () => {
  const source = `<${tag}><b>КАРОТКАЕ ЧЫТАННЕ Рым 13, 11б. 12–13а</b></${tag}><${tag}>Слова чытання.</${tag}><${tag}>Кароткі рэспансорый</${tag}><${tag}><span style="color:red">К.</span> Адказ * першы.<br><span style="color:red">Н.</span> Адказ другі.</${tag}><${tag}>Хвала Айцу і Сыну.</${tag}>`;
  const result = format(source), root = parse(result);
  assert.equal(text(result),text(source));
  assert.equal(root.querySelector('[data-office-reference]').text,'Рым 13, 11б. 12–13а');
  assert.equal(root.querySelectorAll('[data-office-response]').length,3);
  assert.equal(root.querySelectorAll('[data-office-speaker]').length,2);
  assert.equal(format(result),result,'idempotent');
});
test('books, annotations, themes and reading prose never become structural labels', () => {
  const source='<p><b>З Паслання да Рымлянаў</b></p><p>Чытанне вучыць нас жыць.</p><p>Глава 1, 1–3</p><p>КАРОТКАЕ ЧЫТАННЕ<br>Звычайны тэкст.</p>';
  const result=parse(format(source));
  assert.equal(result.querySelectorAll('[data-liturgical-heading]').length,1);
  assert.equal(result.querySelectorAll('[data-office-reference]').length,0);
});
test('long responsory reference and empty legacy paragraphs are scoped', () => {
  const result=parse(format('<p>Рэспансорый 1 Ян 3, 1а–2</p><p>К. Першы.</p><p><br></p><p>Н. Другі.</p><p>Іншы тэкст.</p><p></p>'));
  assert.equal(result.querySelector('[data-office-reference]').text,'1 Ян 3, 1а–2');
  assert.equal(result.querySelectorAll('[data-office-response-gap]').length,1);
  assert.equal(result.querySelectorAll('[data-office-response]').length,2);
});

test('unwrapped br-only HTML keeps separate replies', () => {
  const source='Рэспансорый<br><span style="color:red">К.</span> Першы * адказ.<br><br><span style="color:red">Н.</span> Другі адказ.';
  const result=parse(format(source));
  assert.equal(result.querySelectorAll('[data-office-response]').length,2);
  assert.equal(result.querySelectorAll('[data-liturgical-heading]').length,1);
  assert.equal(text(result.toString()), text(source).replace(/\s+/gu,' ').trim());
});
