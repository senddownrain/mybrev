import assert from 'node:assert/strict';
import test from 'node:test';
import { parse } from 'node-html-parser';
import { getLiturgicalAlternatives } from '../src/utils/liturgicalAlternatives.js';
import { formatPsalmHtml, markLeadingLiturgicalSubheadings as format } from '../src/utils/liturgicalHtml.js';
import { commons, fieldsOf, isShortReading, shortReadingFields, officeReadingFields, responsoryReferenceParagraphs } from './fixtures/liturgical-rubrics.mjs';

const paragraphs = html => parse(html).querySelectorAll('p');
const text = p => p.text.replace(/\s+/gu, ' ').trim();
const shortHeading = p => /^Кароткае\s+чытанне/iu.test(text(p));
const responsoryHeading = p => /^(?:Кароткі\s+)?рэспансорый/iu.test(text(p));
const lectionHeading = p => /^(?:Першае|Другое)\s+чытанне$/iu.test(text(p));

function assertHeading(paragraph, context) {
  assert.ok(paragraph.hasAttribute('data-liturgical-heading'), context);
  assert.ok(!paragraph.hasAttribute('data-liturgical-subheading'), context);
}

test('independent audit: 14 commons; 55/59 excludes first Vespers, full baseline is 65/69', () => {
  assert.equal(Object.keys(commons).length, 14);
  const base = shortReadingFields.filter(field => !field.path.includes('.'));
  assert.equal(new Set(base.map(field => field.id)).size, 11);
  assert.equal(base.length, 65);
  assert.equal(base.flatMap(field => paragraphs(field.html).filter(shortHeading)).length, 69);
  const withoutFirstVespers = base.filter(field => field.key !== 'vesper1R');
  assert.equal(withoutFirstVespers.length, 55);
  assert.equal(withoutFirstVespers.flatMap(field => paragraphs(field.html).filter(shortHeading)).length, 59);
});

test('every short-reading field and alternative, including seasonal overrides, preserves content and heading roles', () => {
  let variants = 0;
  let readings = 0;
  let responsories = 0;
  for (const field of shortReadingFields) {
    for (const option of getLiturgicalAlternatives(field.html, 'reading')) {
      variants += 1;
      const context = `${field.id}/${field.path}/${option.title}`;
      const formatted = format(option.html);
      const before = paragraphs(option.html);
      const after = paragraphs(formatted);
      assert.deepEqual(after.map(p => p.innerHTML), before.map(p => p.innerHTML), context);
      assert.equal(format(formatted), formatted, `${context}: idempotent`);
      after.forEach((p, index) => {
        if (shortHeading(p) || responsoryHeading(p)) {
          assertHeading(p, context);
          if (shortHeading(p)) readings += 1;
          else responsories += 1;
        } else {
          // Ordinary Scripture and response paragraphs keep their attributes.
          // Rubric-only metadata may still become a genuine subtitle.
          const hasPlainBody = before[index].childNodes.some(node => node.nodeType === 3 && node.text.trim());
          if (hasPlainBody) assert.equal(p.rawAttrs, before[index].rawAttrs, context);
        }
      });
    }
  }
  assert.equal(shortReadingFields.length, 194);
  assert.equal(variants, 205);
  assert.equal(readings, 198);
  assert.equal(responsories, 108);
});

test('independent responsory-reference audit: all 3 short and 180 long source captions are covered', () => {
  const short = responsoryReferenceParagraphs.filter(field => isShortReading(field.key));
  const long = responsoryReferenceParagraphs.filter(field => !isShortReading(field.key));
  assert.equal(short.length, 3);
  assert.equal(long.length, 180);
  assert.equal(responsoryReferenceParagraphs.filter(field => parse(field.html).querySelectorAll('span').length > 1).length, 43);
  for (const field of responsoryReferenceParagraphs) {
    const before = paragraphs(field.html)[0];
    const after = paragraphs(format(field.html))[0];
    assertHeading(after, `${field.id}/${field.path}/${text(before)}`);
    assert.equal(after.innerHTML, before.innerHTML);
  }
});

for (const [id, key, expected] of [
  ['office-for-dead', 'laudesR', 1],
  ['blessed-virgin-mary', 'laudesR', 3],
  ['doctors-of-church', 'laudesR', 1],
  ['virgins', 'laudesR', 1],
  ['church-dedication', 'sext1R', 1],
  ['pastors', 'laudesR', 1],
  ['pastors', 'sext1R', 1],
]) {
  test(`${id}/${key}: standalone headings work across inline fragments and preceding rubrics`, () => {
    const options = getLiturgicalAlternatives(commons[id][key], 'reading');
    assert.equal(options.length, expected);
    options.forEach(option => {
      const headings = paragraphs(format(option.html)).filter(shortHeading);
      assert.equal(headings.length, 1);
      assertHeading(headings[0], `${id}/${key}`);
    });
    if (id === 'virgins') assert.match(commons[id][key], /Каротк<\/span>/u);
    if (id === 'doctors-of-church') assert.ok(paragraphs(commons[id][key])[0].querySelectorAll('span').length > 1);
    if (id === 'church-dedication') {
      assert.equal(text(paragraphs(format(commons[id][key]))[0]), text(paragraphs(commons[id][key])[0]));
      assert.ok(!paragraphs(format(commons[id][key]))[0].hasAttribute('data-liturgical-heading'));
    }
  });
}

test('all first/second reading variants preserve content and mark section labels and responsory captions', () => {
  let responsories = 0;
  for (const field of officeReadingFields) {
    for (const option of getLiturgicalAlternatives(field.html, 'office-reading')) {
      const formatted = format(option.html);
      const after = paragraphs(formatted);
      assert.deepEqual(after.map(p => p.innerHTML), paragraphs(option.html).map(p => p.innerHTML));
      assert.equal(format(formatted), formatted, `${field.id}/${field.path}: idempotent`);
      after.filter(p => lectionHeading(p) || responsoryHeading(p)).forEach(p => {
        assertHeading(p, `${field.id}/${field.path}`);
        if (responsoryHeading(p)) responsories += 1;
      });
    }
  }
  assert.equal(officeReadingFields.length, 124);
  assert.equal(responsories, 219); // 180 with references + 39 bare labels.
});

test('all psalms/canticles keep their centred source captions and original text', () => {
  let fields = 0;
  let captions = 0;
  for (const document of Object.values(commons)) {
    for (const field of fieldsOf(document).filter(field => /Ps[123]$/u.test(field.key))) {
      fields += 1;
      const formatted = formatPsalmHtml(field.html);
      // Cadence layout changes whitespace only; words and rubric labels survive.
      assert.equal(parse(formatted).text.replace(/\s/gu, ''), parse(field.html).text.replace(/\s/gu, ''));
      const after = paragraphs(formatted);
      for (const original of paragraphs(field.html).filter(p => /text-align\s*:\s*center/iu.test(p.rawAttrs))) {
        captions += 1;
        const caption = after.find(p => text(p) === text(original));
        assert.ok(caption?.hasAttribute('data-liturgical-subheading'), field.path);
        assert.ok(!caption.hasAttribute('data-liturgical-heading'), field.path);
      }
    }
  }
  assert.equal(fields, 263);
  assert.ok(captions > 200);
});

test('semantic headings win over explicit centring, stale subtitle attributes and word fragments', () => {
  const html = '<p style="text-align:center" data-liturgical-subheading=""><span style="color:red">Каротк</span><b>ае чытанне</b><span style="color:red">Гбр 13, 7</span></p>';
  assertHeading(paragraphs(format(html))[0], 'fragmented reading');
  for (const title of ['Першае чытанне', 'Другое чытанне', 'Кароткі рэспансорый']) {
    assertHeading(paragraphs(format(`<p>Звычайны тэкст.</p><p style="text-align:center">${title}</p>`))[1], title);
  }
});

test('a reading label sharing a paragraph with Scripture never shrinks the body', () => {
  const html = '<p><span style="color:red">Кароткае чытанне 1 Тэс 4, 14</span><br>Бо калі мы верым, што Езус памёр і ўваскрос.</p>';
  assert.equal(format(html), html);
});

test('fragmented responsory labels and glued references are structural headings', () => {
  for (const label of [
    '<span style="color:red">Кароткі рэспан</span><span style="color:red">сорый Ян 13, 35</span>',
    '<span style="color:red">Рэспан</span><span style="color:red">сорый</span><span style="color:red">пар. Пс 72 (71), 6. 19; Ап 21, 3</span>',
    '<span style="color:red">РэспансорыйМц 1, 20, 21; Міх 5, 4-5</span>',
    'Рэспансорый Ян 15, 15; Мц 13, 11. 16',
  ]) {
    const source = `<p style="text-align:center" data-liturgical-subheading>${label}</p>`;
    const formatted = format(source);
    assertHeading(paragraphs(formatted)[0], label);
    assert.equal(paragraphs(formatted)[0].innerHTML, label);
  }
});

test('ordinary replies and mixed responsory/body paragraphs never become structural headings', () => {
  for (const body of [
    '<span style="color:red">Н.</span> Рэспансорый Ян 13, 35.',
    '<span style="color:red">К.</span> Любіце адзін аднаго.',
    '<span style="color:red">Н. Любіце адзін аднаго.</span>',
    '<span style="color:red">Рэспансорый Ян 13, 35</span><br><span style="color:red">Н.</span> Любіце адзін аднаго.',
    '<span style="color:red">Рэспансорый Ян 13, 35<br>Н. Любіце адзін аднаго.</span>',
    '<em>Рэспансорый дапамагае маліцца.</em>',
    '<span style="color:red">Рэспансорый Ян 13, 35. Любіце адзін аднаго.</span>',
  ]) {
    // Check both at the start and after prose has ended the metadata budget.
    for (const prefix of ['', '<p>Сам тэкст чытання.</p>']) {
      const formatted = format(`${prefix}<p>${body}</p>`);
      assert.ok(!paragraphs(formatted).at(-1).hasAttribute('data-liturgical-heading'), body);
      assert.ok(!paragraphs(formatted).at(-1).hasAttribute('data-liturgical-subheading'), body);
      assert.equal(paragraphs(formatted).at(-1).innerHTML, body);
    }
  }
});
