import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getLiturgicalAlternatives } from '../src/utils/liturgicalAlternatives.js';
import { parse } from 'node-html-parser';
import { formatPsalmHtml } from '../src/utils/liturgicalHtml.js';
import { formatPsalmOpening, addOpeningAntiphonFlexa } from '../src/utils/psalmOpening.js';

test('exact selected antiphon removes only the repeated opening through flexa', () => {
  const source = '<p>Псальм 10</p><p><b>Слава нашаму Пану <em>†</em> далей паём *</b> вечна.</p><p>Наступная страфа * заўсёды.</p>';
  const prepared = formatPsalmHtml(source);
  const result = formatPsalmOpening(prepared, '<p><span>1 ант.</span> Слава нашаму Пану.</p>');
  const root = parse(result);
  const strophes = root.querySelectorAll('p[data-psalm-strophe]');
  assert.equal(strophes.length, 2);
  assert.match(strophes[0].text.trim(), /^†\s*далей паём\s*\*\s*вечна/u);
  assert.equal(strophes[0].querySelectorAll('.psalm-opening-flexa').length, 1);
  assert.equal(strophes[0].querySelector('b')?.text.trim().startsWith('†'), true);
  assert.equal(strophes[1].text.trim(), 'Наступная страфа * заўсёды.');
  assert.doesNotMatch(strophes[0].text, /Слава нашаму Пану/u);
});

test('partial match, other antiphon and empty selection never remove psalm text', () => {
  const prepared = formatPsalmHtml('<p>Слава нашаму Пану † далей паём * вечна.</p>');
  for (const ant of ['Ант. Слава нашаму', 'Ант. Пану слава', '', null]) {
    assert.equal(formatPsalmOpening(prepared, ant), prepared);
  }
});

test('whole echo through * is removed; remaining verse and doxology survive', () => {
  const prepared = formatPsalmHtml('<p>Божа наш * благаслаўляем Цябе.</p><p>Хвала Айцу * Амэн.</p>');
  const result = formatPsalmOpening(prepared, 'Ант. Божа наш');
  const root = parse(result);
  assert.match(root.text, /благаслаўляем Цябе/u);
  assert.match(root.text, /Хвала Айцу/u);
  assert.doesNotMatch(root.text, /Божа наш/u);
  assert.equal(root.querySelector('.psalm-opening-flexa')?.text, '†');
});

test('opening antiphon gets one † at the end, inside its paragraph', () => {
  const antiphon = '<p><span class="ora-antiphon-label">1 ант.</span> Божа наш.</p>';
  const withDagger = addOpeningAntiphonFlexa(antiphon);
  const root = parse(withDagger);
  assert.equal(root.querySelector('p .psalm-antiphon-flexa')?.text, '†');
  assert.equal(root.querySelectorAll('.psalm-antiphon-flexa').length, 1);
  assert.equal(addOpeningAntiphonFlexa(withDagger), withDagger);
});

test('only first stanza gets opening †; later cadence and doxology stay intact', () => {
  const html = formatPsalmHtml(
    '<p>Божа наш † пасля антыфоны * канец.</p>' +
    '<p>Наступны верш † пасля крыжыка * адказ.</p>' +
    '<p>Хвала Айцу * Амэн.</p>',
  );
  const output = formatPsalmOpening(html, 'Ант. Божа наш');
  const root = parse(output);
  assert.equal(root.querySelectorAll('.psalm-opening-flexa').length, 1);
  const verses = root.querySelectorAll('p[data-psalm-strophe]');
  assert.match(verses[0].text.trim(), /^†\s*пасля антыфоны/u);
  assert.equal(verses[1].querySelectorAll('.psalm-opening-flexa').length, 0);
  assert.match(verses[1].text, /† пасля крыжыка/u);
  assert.match(verses[2].text, /Хвала Айцу/u);
});


// The two public liturgical fields of days/ordinary-w33-d4, captured from
// the published Vespers page's local Firestore cache on 2026-11-18.
const { vesperAnt1, vesperPs1 } = JSON.parse(
  readFileSync(new URL('./fixtures/psalm-27-vespers.json', import.meta.url), 'utf8'),
);
const strophes = (html) => parse(html).querySelectorAll('p[data-psalm-strophe]');
const fullAntiphon = 'Пан – маё святло і маё збаўленне, * каго ж мне баяцца?';
const halfAntiphon = 'Пан – маё святло і маё збаўленне,';
const prepare = (html) => formatPsalmHtml(html, { stripEmbeddedAntiphon: true, antiphon: vesperAnt1 });

test('Psalm 27 from the Vespers cache keeps the whole verse and a nonbreaking † before the next', () => {
  const prepared = prepare(vesperPs1);
  const result = formatPsalmOpening(prepared, vesperAnt1);
  const [opening, continuation, ...later] = strophes(result);
  assert.match(continuation.innerHTML, /psalm-opening-flexa[^>]*>†<\/span>&nbsp;Пан/u);
  assert.equal(continuation.querySelectorAll('.psalm-marker').length, 2);
  assert.equal(opening.toString(), strophes(prepared)[0].toString());
  assert.equal(opening.text, fullAntiphon);
  assert.deepEqual(later.map(String), strophes(prepared).slice(2).map(String));
  assert.match(later.at(-1).text, /Амэн/u);
  assert.equal(addOpeningAntiphonFlexa(vesperAnt1), vesperAnt1);
});

test('Psalm 27 alternatives keep the full verse and remove only a matching half', () => {
  const prepared = prepare(vesperPs1);
  const alternatives = getLiturgicalAlternatives(
    `${vesperAnt1}<hr><p><em>1 ант.</em> ${halfAntiphon}</p><hr><p>1 ант. Пан – маё святло.</p>`,
  );
  assert.equal(alternatives.length, 3);
  const [whole, half, different] = alternatives.map(({ html }) => formatPsalmOpening(prepared, html));
  assert.equal(strophes(whole)[0].text, fullAntiphon);
  assert.match(strophes(whole)[1].text, /^†\s+Пан – ахова/u);
  assert.match(strophes(half)[0].text, /^†\s+каго ж мне баяцца\?/u);
  assert.deepEqual(strophes(half).slice(1).map(String), strophes(prepared).slice(1).map(String));
  assert.equal(different, prepared);
});

test('Psalm 27 can start with a split verse and a separate dagger paragraph', () => {
  const split = vesperPs1
    .replace('*<br />каго ж мне баяцца?', '*</p><p>каго ж мне баяцца?')
    .replace('&dagger; Пан &ndash; ахова', '<em>&dagger;</em></p><p>Пан &ndash; ахова');
  const prepared = prepare(split);
  const whole = formatPsalmOpening(prepared, fullAntiphon);
  const half = formatPsalmOpening(prepared, halfAntiphon);
  assert.match(strophes(whole)[0].text, /^Пан – маё святло/u);
  assert.equal(strophes(whole)[0].nextElementSibling.text, 'каго ж мне баяцца?');
  assert.match(strophes(whole)[1].innerHTML, /psalm-opening-flexa[^>]*>†<\/span>&nbsp;Пан/u);
  assert.equal(parse(whole).querySelectorAll('p').filter(p => p.text.trim() === '†').length, 0);
  assert.match(strophes(half)[0].text, /^†\s+каго ж мне баяцца\?/u);
});

test('Psalm 27 has no source break after a dagger inside nested markup', () => {
  const nested = vesperPs1.replace('&dagger; Пан', '<em>&dagger;</em><br class="legacy"><strong>Пан</strong>');
  const result = formatPsalmOpening(prepare(nested), vesperAnt1);
  assert.match(strophes(result)[1].innerHTML, /†<\/span>&nbsp;<\/em><strong>Пан<\/strong>/u);
});

test('full-verse echo adds a single † when the following stanza has none', () => {
  const prepared = formatPsalmHtml(
    '<p>Пан – маё святло * каго ж мне баяцца?</p>'
    + '<p>Пан – ахова жыцця майго * каго ж мне палохацца?</p>',
  );
  const result = formatPsalmOpening(prepared, 'Ант. Пан – маё святло * каго ж мне баяцца?');
  const root = parse(result);
  assert.equal(strophes(result).length, 2);
  assert.match(strophes(result)[0].text, /^Пан – маё святло/u);
  assert.match(strophes(result)[1].text, /^†\s*Пан – ахова жыцця майго/u);
  assert.equal(root.querySelectorAll('.psalm-opening-flexa').length, 1);
  assert.match(root.innerHTML, /psalm-opening-flexa[^>]*>†<\/span>&nbsp;Пан/u);
});

test('partial or different whole-verse antiphon does not omit a psalm stanza', () => {
  const prepared = formatPsalmHtml(
    '<p>Пан – маё святло і маё збаўленне, * каго ж мне баяцца?</p>'
    + '<p>† Пан – ахова жыцця майго, * каго ж мне палохацца?</p>',
  );
  for (const antiphon of [
    '1 ант. Пан – маё святло',
    '1 ант. Пан – маё святло і маё збаўленне, каго ж мне баяцца заўтра?',
  ]) {
    assert.equal(formatPsalmOpening(prepared, antiphon), prepared);
  }

  const noContinuation = formatPsalmHtml('<p>Пан – маё святло * каго ж мне баяцца?</p>');
  assert.equal(
    formatPsalmOpening(noContinuation, 'Ант. Пан – маё святло * каго ж мне баяцца?'),
    noContinuation,
  );
});

// ADV-01/07/08: opening verses of Psalms 18, 81 and 147 (doc5 l.1122, 4148, 4535).
const flexaCases = [
  ['ADV-01 02.12', '1 ант. Буду любіць Цябе, Пане, моц мая.',
    '<p>Буду любіць Цябе, Пане, моц мая. &dagger;<br />&dagger; Пан &ndash; мая скала i мая цвярдыня, *<br />Ён мой Збаўца.</p>',
    /^†\s+Пан – мая скала i мая цвярдыня, \*\s*Ён мой Збаўца\.$/u],
  ['ADV-07 10.12', '3 ант. Радасна спявайце Богу, нашай моцы.',
    '<p>Радасна спявайце Богу, нашай моцы, *<br />&dagger; усклікайце Богу Якуба.</p>', /^†\s+усклікайце Богу Якуба\.$/u],
  ['ADV-08 11.12', '3 ант. Хвалі, Ерузалем, Пана.',
    '<p>Хвалі, Ерузалем, Пана, *<br />&dagger; праслаўляй, Сіён, твайго Бога.</p>', /^†\s+праслаўляй, Сіён, твайго Бога\.$/u],
];

for (const [name, antiphon, source, expected] of flexaCases) {
  test(`${name}: one † opens the continuation without a break after it`, () => {
    const prepared = formatPsalmHtml(`${source}<p>Другі верш &dagger; пасярэдзіне, *<br />канец.</p>`);
    const [first, second] = strophes(formatPsalmOpening(prepared, antiphon));
    assert.match(first.text.trim(), expected);
    assert.equal(first.text.match(/†/gu).length, 1);
    assert.match(first.innerHTML, /psalm-opening-flexa[^>]*>†<\/span>&nbsp;/u);
    assert.equal(second.toString(), strophes(prepared)[1].toString());
    // No opening antiphon, or a different one: the source stays whole.
    for (const other of ['', 'Ант. Іншая антыфона.']) assert.equal(formatPsalmOpening(prepared, other), prepared);
  });
}
