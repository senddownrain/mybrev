import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { markAntiphonLabel } from '../src/utils/liturgicalHtml.js';

const load = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const marker = '<span class="ora-antiphon-label">';

test('antiphon labels are rubric-only; preserve wording, cadence marks and source HTML', () => {
  const source = '<p>3 ант. Буду славіць Пана <span style="color: #ff0000;">*</span> ў сваім жыцці.</p>';
  const formatted = markAntiphonLabel(source);
  assert.ok(formatted.includes(`${marker}3 ант.</span> Буду`));
  assert.equal(formatted.replace(/<span class="ora-antiphon-label">([\s\S]*?)<\/span>/gu, '$1'), source);
  assert.equal(markAntiphonLabel(formatted), formatted, 'safe to apply twice');
});

test('Gospel-canticle rubrics and Unicode/HTML spacing receive only label styling', () => {
  for (const input of [
    '<p>Ант. да песні Захарыі: Я – уваскрасенне і жыццё.</p>',
    '<p>Ант.&nbsp;да песні Марыі: Кожны, каго дае Мне Айцец.</p>',
    '<div data-alternative-title="Год А"><p>Ант. да песні Захарыі: Слова.</p></div>',
    '<p>1 ант. Пане, Ты благаславіў сваю зямлю.</p>',
  ]) {
    const formatted = markAntiphonLabel(input);
    assert.equal(formatted.split(marker).length - 1, 1, input);
    assert.equal(formatted.replace(/<span class="ora-antiphon-label">([\s\S]*?)<\/span>/gu, '$1'), input);
  }
});

test('already coloured source labels, plain prayer text and non-antiphon paragraphs remain unchanged', () => {
  const inputs = [
    '<p><span style="color:red">1 ант.</span> Тэкст.</p>',
    '<p>Благаслаўлёны Пан, Бог Ізраэля.</p>',
    '<p>Песня Марыі: Няхай славіцца Пан.</p>',
  ];
  for (const input of inputs) assert.equal(markAntiphonLabel(input), input);
  assert.equal(
    markAntiphonLabel('Ант. Пане, дапамажы.'),
    `${marker}Ант.</span> Пане, дапамажы.`,
  );
});

test('checked-in Office for the Dead: all antiphon fields are safely renderable without a Firestore write', () => {
  const data = JSON.parse(load('patchs/feasts/common-texts/office-for-dead.json'));
  const fields = Object.keys(data).filter((key) => /^(?:invitatoriumAnt|officeOfReadingsAnt[123]|laudesAnt(?:[123]|Ben)|sext[123]Ant1|vesperAnt(?:[123]|Mag))$/u.test(key));
  assert.equal(fields.length, 15);
  for (const field of fields) {
    const original = data[field];
    const formatted = markAntiphonLabel(original);
    assert.ok(formatted.includes(marker), field);
    assert.equal(formatted.replace(/<span class="ora-antiphon-label">([\s\S]*?)<\/span>/gu, '$1'), original, field);
  }
  // The 146/150 third-psalm chooser has two independent embedded antiphons.
  const embedded = markAntiphonLabel(data.laudesPs3);
  assert.equal((embedded.match(/class="ora-antiphon-label"/gu) || []).length, 4, 'opening and repeated antiphons for both psalms');
  assert.equal(embedded.replace(/<span class="ora-antiphon-label">([\s\S]*?)<\/span>/gu, '$1'), data.laudesPs3);
});

test('all Web antiphon render entry points and repeated antiphons opt in; styling stays theme-aware', () => {
  for (const file of [
    'src/components/oraparts/Psalms.vue',
    'src/components/oraparts/Benedictus.vue',
    'src/components/oraparts/Magnificat.vue',
    'src/components/oraparts/Nunc.vue',
    'src/components/oras/Invit.vue',
  ]) {
    const source = load(file);
    const tags = [...source.matchAll(/<alternative-text\b([^>]*?)>/gsu)]
      .map((match) => match[1])
      .filter((attributes) => /class="[^"]*\bora-ant\b/u.test(attributes));
    assert.ok(tags.length >= 2, file);
    tags.forEach((tag) => assert.match(tag, /\bhighlight-antiphon-label\b/u, file));
  }
  assert.match(load('src/components/oraparts/AlternativeText.vue'), /markAntiphonLabel\(formatted\)/u);
  const psalms = load('src/components/oraparts/Psalms.vue');
  assert.match(psalms, /formatPsalmHtml\(psalm,\s*\{/u);
  assert.match(psalms, /markAntiphonLabel\(omitEchoedPsalmOpening\(formatted, chosen\)\)/u);
  assert.match(load('src/styles/main.scss'), /\.ora-psalm \.ora-antiphon-label\s*\{\s*color: var\(--rubric-color\) !important;/u);
});
