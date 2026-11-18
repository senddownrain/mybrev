import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MASS_MAJOR_SECTIONS,
  MASS_ORDER_PRAYER_ID,
  MASS_RITUAL,
  activeMassSectionAt,
  getMassMajorSectionId,
  getMassSection,
  getMassVariant,
  getMassVariantByPrayerId,
  isMassRitualPrayerId,
  locateMassSections,
  normalizeMassMarker,
  resolveMassLanguage,
  massSectionFromHash,
  resolveMassSectionId,
  resolveMassSectionTarget,
} from '../src/utils/massRitual.js';
import { buildMassDocument, renderMassBlocks } from '../src/utils/massContent.js';
import { prayerMarkdownToPlainText, renderPrayerMarkdown } from '../src/utils/prayerMarkdown.js';
import { MASS_V4_MAJOR_HEADINGS } from '../scripts/lib/mass-content-v4.mjs';

const englishText = readFileSync(new URL('../src/data/mass/order-of-mass-en.md', import.meta.url), 'utf8');

function blockTexts(markdown) {
  // Every rendered heading, paragraph and rubric in document order.
  const html = renderPrayerMarkdown(markdown);
  return [...html.matchAll(/<(h[2-6]|p|aside)[^>]*>([\s\S]*?)<\/\1>/g)]
    .map((match) => match[2].replace(/<[^>]+>/g, '').trim());
}

test('Holy Mass keeps the existing Belarusian prayer as the ritual entry', () => {
  assert.equal(MASS_ORDER_PRAYER_ID, 'eMmCtxwyJ75ogmL5rwye');
  assert.equal(MASS_RITUAL.defaultLanguage, 'be');
  assert.equal(getMassVariant('be').prayerId, MASS_ORDER_PRAYER_ID);
});

test('Latin reuses the existing Ordo Missae prayer and English has its own id', () => {
  assert.equal(getMassVariant('la').prayerId, 'zdro66KYVuQ9p2KbqizD');
  assert.equal(getMassVariantByPrayerId('zdro66KYVuQ9p2KbqizD').language, 'la');
  assert.equal(getMassVariant('en').prayerId, 'order-of-mass-en');
  assert.equal(getMassVariant('en').bundledText, 'order-of-mass-en.md');
  assert.ok(isMassRitualPrayerId('order-of-mass-en'));
  assert.equal(isMassRitualPrayerId('some-other-prayer'), false);
});

test('language resolution prefers the URL, then the stored choice, then Belarusian', () => {
  assert.equal(resolveMassLanguage('en', 'la'), 'en');
  assert.equal(resolveMassLanguage(undefined, 'la'), 'la');
  assert.equal(resolveMassLanguage('xx', 'yy'), 'be');
});

test('every variant marker points to a known semantic section', () => {
  const ids = new Set(MASS_RITUAL.sections.map((section) => section.id));
  MASS_RITUAL.sections.forEach((section) => {
    if (section.parent) assert.ok(ids.has(section.parent), section.id);
  });
  MASS_RITUAL.variants.forEach((variant) => {
    Object.keys(variant.markers).forEach((sectionId) => assert.ok(ids.has(sectionId), `${variant.language}:${sectionId}`));
  });
});

test('English source exposes all its semantic sections in ritual order', () => {
  const located = locateMassSections(getMassVariant('en'), blockTexts(englishText));
  const expected = Object.keys(getMassVariant('en').markers);
  assert.deepEqual(located.filter((section) => section.heading).map((section) => section.sectionId), expected);
  assert.deepEqual(located.filter((section) => !section.parent).map((section) => section.sectionId), [
    'introductory-rites', 'liturgy-of-the-word', 'eucharistic-liturgy', 'communion-rite', 'concluding-rites',
  ]);
  assert.equal(located.find((section) => section.sectionId === 'lords-prayer').title, 'The Lord’s Prayer');
  assert.equal(located.find((section) => section.sectionId === 'gloria').parent, 'introductory-rites');
});

test('English text is taken from MCFL.pdf without invented prayers', () => {
  assert.match(englishText, /Deliver us, Lord, we pray…/);
  assert.match(englishText, /Lord Jesus Christ…/);
  assert.doesNotMatch(englishText, /Eucharistic Prayer II|Preface Dialogue|Penitential Act\s*\(Form/);
  assert.equal(getMassVariant('en').source, 'The Roman Missal');

});

test('Belarusian and Latin markers match their real section blocks', () => {
  const be = locateMassSections(getMassVariant('be'), [
    'Уступныя абрады', 'Чын пакаяння', 'Хвала на вышынях Богу', 'Літургія слова',
    'Вызнанне веры', 'Эўхарыстычная літургія', 'II эўхарыстычная малітва', 'Абрад Камуніі', 'Абрад заканчэння',
  ]);
  assert.deepEqual(be.map((section) => section.sectionId), [
    'introductory-rites', 'penitential-act', 'gloria', 'liturgy-of-the-word', 'creed',
    'eucharistic-liturgy', 'eucharistic-prayer', 'communion-rite', 'concluding-rites',
  ]);
  const la = locateMassSections(getMassVariant('la'), [
    'ЧИН МЕССЫ НА ЛАТИНСКОМ ЯЗЫКЕ', 'Вступительные обряды', '(молитва из Миссала)', 'Литургия Слова',
  ]);
  assert.deepEqual(la.map((section) => [section.blockIndex, section.sectionId]), [
    [1, 'introductory-rites'], [3, 'liturgy-of-the-word'],
  ]);
});

test('marker matching ignores emphasis, case, dashes and apostrophe style', () => {
  assert.equal(normalizeMassMarker('**Літургія слова**'), normalizeMassMarker('Літургія слова'));
  assert.equal(normalizeMassMarker("The Lord's Prayer"), normalizeMassMarker('The Lord’s Prayer'));
  assert.equal(normalizeMassMarker('Малітва дня — Калекта'), 'малітва дня калекта');
});

test('switching language keeps the section, then falls back to parent and neighbours', () => {
  const latin = ['introductory-rites', 'liturgy-of-the-word', 'creed', 'eucharistic-liturgy', 'communion-rite'];
  assert.equal(resolveMassSectionTarget('creed', latin), 'creed');
  assert.equal(resolveMassSectionTarget('gospel', latin), 'liturgy-of-the-word');
  assert.equal(resolveMassSectionTarget('dismissal', latin), 'communion-rite');
  assert.equal(resolveMassSectionTarget('lords-prayer', ['eucharistic-liturgy']), 'eucharistic-liturgy');
  assert.equal(resolveMassSectionTarget('second-reading', ['liturgy-of-the-word', 'psalm', 'gospel']), 'psalm');
  assert.equal(resolveMassSectionTarget('liturgy-of-the-eucharist', latin), 'eucharistic-liturgy');
  assert.equal(resolveMassSectionTarget('sign-of-the-cross', ['gloria']), 'gloria');
  assert.equal(resolveMassSectionTarget(null, latin), null);
  assert.equal(resolveMassSectionTarget('creed', []), null);
});

test('active section is the last heading above the reading line', () => {
  const tops = [
    { sectionId: 'introductory-rites', top: -900 },
    { sectionId: 'gloria', top: -20 },
    { sectionId: 'collect', top: 131 },
    { sectionId: 'liturgy-of-the-word', top: 700 },
  ];
  assert.equal(activeMassSectionAt(tops, 132), 'collect');
  assert.equal(activeMassSectionAt(tops, 130), 'gloria');
  assert.equal(activeMassSectionAt([{ sectionId: 'introductory-rites', top: 400 }], 132), 'introductory-rites');
  assert.equal(activeMassSectionAt([], 132), null);
});

// Short excerpts of the Firestore texts (prayers/eMmCtxwyJ75ogmL5rwye and
// prayers/zdro66KYVuQ9p2KbqizD), copied verbatim with their original markup.
const belarusianExcerpt = `### Уступныя абрады

:::rubric
Святар гаворыць:
:::

У імя Айца і Сына, і Духа Святога.

:::rubric
Народ адказвае:
:::

Амэн.

**Чын пакаяння**

:::rubric
Пасля гэтага гаворыцца Пане, змілуйся над намі:
:::

С.: Пане, змілуйся над намі.
Н.: Пане, змілуйся над намі.

### **Літургія слова**

:::rubric
Потым спяваецца
:::

 Аллелюя

:::rubric
альбо іншы спеў, прадпісаны ў рубрыках, у залежнасці ад патрабаванняў літургічнага перыяду.
:::

### Эўхарыстычная літургія

**Ён, калі дабравольна выдаў сябе на мукі,**

### Абрад Камуніі

:::rubric
Альбо:
:::

### Абрад заканчэння

Цэлебрант: Пан з вамі.
Усе:І з духам тваім.`;

const latinExcerpt = `ЧИН МЕССЫ НА ЛАТИНСКОМ ЯЗЫКЕ

:::rubric
Вступительные обряды
:::

V. In nomine Patris, et Filii, et Spiritus Sancti.

R. Amen.

Или:

:::rubric
Литургия Слова
:::

После чтения:

V.

:::rubric
(После чтения)
:::

 Verbum Domini.

R. Laus tibi, Christe.

:::rubric
Евхаристическая Литургия
:::

:::rubric
Обряд причащения
:::

:::rubric
Заключительный обряд
:::

V. Ite, missa est.`;

function compact(value) {
  return String(value).replace(/[*_]+/g, '').replace(/\s+/g, '');
}

// Every visible character of the source must survive, in order; only markup,
// whitespace and line-leading speaker prefixes (kept as role metadata) may go,
// and a major heading shows its canonical Belarusian name.
function assertWordingPreserved(markdown, document, variant) {
  const labels = Object.keys(variant.speakerLabels || {}).sort((a, b) => b.length - a.length);
  const source = prayerMarkdownToPlainText(markdown)
    .replace(/^---$/gm, '')
    .split('\n')
    .map((line) => {
      const major = MASS_V4_MAJOR_HEADINGS.find(({ title, former }) => [title, ...former].includes(line.trim()));
      if (major) return major.title;
      const label = labels.find((item) => line.trim().startsWith(item));
      return label ? line.trim().slice(label.length) : line;
    })
    .join('\n');
  const rendered = document.blocks.map((block) => block.text).join('');
  assert.equal(compact(rendered), compact(source));
  assert.ok(document.blocks.filter((block) => block.label).every((block) => labels.includes(block.label)));
}

test('ritual schema v3 has exactly the five canonical Belarusian major sections', () => {
  assert.equal(MASS_RITUAL.schemaVersion, 3);
  assert.deepEqual(MASS_MAJOR_SECTIONS.map(({ id, title }) => [id, title]), [
    ['introductory-rites', 'Уступныя абрады'],
    ['liturgy-of-the-word', 'Літургія слова'],
    ['eucharistic-liturgy', 'Эўхарыстычная літургія'],
    ['communion-rite', 'Абрад Камуніі'],
    ['concluding-rites', 'Заключныя абрады'],
  ]);
  ['offertory', 'prayer-over-the-offerings', 'eucharistic-prayer'].forEach((id) => {
    assert.equal(getMassSection(id).parent, 'eucharistic-liturgy');
  });
  MASS_RITUAL.variants.forEach((variant) => {
    const majors = MASS_MAJOR_SECTIONS.map(({ id }) => id);
    assert.deepEqual(Object.keys(variant.markers).filter((id) => majors.includes(id)), majors, variant.language);
  });
});

test('the retired liturgy-of-the-eucharist id still resolves', () => {
  assert.equal(resolveMassSectionId('liturgy-of-the-eucharist'), 'eucharistic-liturgy');
  assert.equal(getMassSection('liturgy-of-the-eucharist').title, 'Эўхарыстычная літургія');
  assert.equal(getMassMajorSectionId('offertory'), 'eucharistic-liturgy');
  assert.equal(massSectionFromHash('#mass-liturgy-of-the-eucharist'), 'eucharistic-liturgy');
  assert.equal(massSectionFromHash('#mass-unknown'), null);
  assert.equal(resolveMassSectionId('unknown'), null);
});

test('every anchor and classifier references known sections and block types', () => {
  const ids = new Set(MASS_RITUAL.sections.map((section) => section.id));
  const types = new Set(MASS_RITUAL.blockTypes);
  const roles = new Set(MASS_RITUAL.roles);
  MASS_RITUAL.variants.forEach((variant) => {
    Object.keys(variant.anchors || {}).forEach((id) => assert.ok(ids.has(id), `${variant.language}:${id}`));
    Object.keys(variant.classify || {}).forEach((type) => assert.ok(types.has(type), `${variant.language}:${type}`));
    Object.values(variant.speakerLabels || {}).forEach((role) => assert.ok(roles.has(role), role));
    Object.keys(variant.roleCues || {}).forEach((role) => assert.ok(roles.has(role), role));
  });
});

test('English document keeps wording and uses the shared semantic types', () => {
  const document = buildMassDocument(englishText, getMassVariant('en'), 'mybrev-markdown');
  assertWordingPreserved(englishText, document, getMassVariant('en'));
  const types = (type) => document.blocks.filter((block) => block.type === type);
  assert.deepEqual(types('majorSection').map((block) => block.sectionId), MASS_MAJOR_SECTIONS.map(({ id }) => id));
  assert.equal(types('comment').length, 4);
  assert.deepEqual([...new Set(types('posture').map((block) => block.text))], ['all sit', 'all stand', 'all kneel']);
  assert.ok(types('alternative').every((block) => block.text === 'Or:'));
  const greeting = document.blocks.findIndex((block) => block.text === 'The Lord be with you.');
  assert.deepEqual(document.blocks[greeting + 1], { type: 'response', text: 'And with your spirit.', role: 'people', speakerLabel: 'R.' });
  assert.ok(document.sections.some((section) => section.sectionId === 'offertory' && !section.heading));
});

test('Belarusian excerpt: headings, roles from labels and cues, quoted rubric words', () => {
  const document = buildMassDocument(belarusianExcerpt, getMassVariant('be'), 'mybrev-markdown');
  assertWordingPreserved(belarusianExcerpt, document, getMassVariant('be'));
  const summary = document.blocks.map(({ type, text, role, sectionId }) => [type, text, role || null, sectionId || null]);
  assert.deepEqual(summary, [
    ['majorSection', 'Уступныя абрады', null, 'introductory-rites'],
    ['rubric', 'Святар гаворыць:', null, 'sign-of-the-cross'],
    ['spoken', 'У імя Айца і Сына, і Духа Святога.', null, null],
    ['rubric', 'Народ адказвае:', null, null],
    ['response', 'Амэн.', 'people', null],
    ['subsection', 'Чын пакаяння', null, 'penitential-act'],
    ['rubric', 'Пасля гэтага гаворыцца Пане, змілуйся над намі:', null, 'kyrie'],
    ['spoken', 'Пане, змілуйся над намі.', 'priest', null],
    ['response', 'Пане, змілуйся над намі.', 'people', null],
    ['majorSection', 'Літургія слова', null, 'liturgy-of-the-word'],
    ['rubric', 'Потым спяваецца Аллелюя альбо іншы спеў, прадпісаны ў рубрыках, у залежнасці ад патрабаванняў літургічнага перыяду.', null, 'gospel'],
    ['majorSection', 'Эўхарыстычная літургія', null, 'eucharistic-liturgy'],
    ['spoken', '**Ён, калі дабравольна выдаў сябе на мукі,**', null, null],
    ['majorSection', 'Абрад Камуніі', null, 'communion-rite'],
    ['alternative', 'Альбо:', null, null],
    ['majorSection', 'Заключныя абрады', null, 'concluding-rites'],
    ['spoken', 'Пан з вамі.', 'celebrant', null],
    ['response', 'І з духам тваім.', 'all', null],
  ]);
  const html = renderMassBlocks(document.blocks, getMassVariant('be'));
  assert.match(html, /<span class="mass-cited">Аллелюя<\/span> альбо/);
  assert.doesNotMatch(html, /С\.:|Н\.:|Цэлебрант:|Усе:/);
  assert.match(html, /<span class="mass-speaker" aria-hidden="true">С\.<\/span> Пане, змілуйся над намі\./);
});

test('Latin excerpt (pre-migration): Russian headings become canonical sections, V./R. become roles', () => {
  const document = buildMassDocument(latinExcerpt, getMassVariant('la'), 'mybrev-markdown');
  assertWordingPreserved(latinExcerpt, document, getMassVariant('la'));
  const summary = document.blocks.map(({ type, text, role, sectionId }) => [type, text, role || null, sectionId || null]);
  assert.deepEqual(summary, [
    ['heading', 'ЧИН МЕССЫ НА ЛАТИНСКОМ ЯЗЫКЕ', null, null],
    ['majorSection', 'Уступныя абрады', null, 'introductory-rites'],
    ['spoken', 'In nomine Patris, et Filii, et Spiritus Sancti.', 'priest', 'sign-of-the-cross'],
    ['response', 'Amen.', 'people', null],
    ['alternative', 'Или:', null, null],
    ['majorSection', 'Літургія слова', null, 'liturgy-of-the-word'],
    ['rubric', 'После чтения:', null, 'first-reading'],
    ['rubric', '(После чтения)', null, null],
    ['spoken', 'Verbum Domini.', 'priest', null],
    ['response', 'Laus tibi, Christe.', 'people', null],
    ['majorSection', 'Эўхарыстычная літургія', null, 'eucharistic-liturgy'],
    ['majorSection', 'Абрад Камуніі', null, 'communion-rite'],
    ['majorSection', 'Заключныя абрады', null, 'concluding-rites'],
    ['spoken', 'Ite, missa est.', 'priest', 'dismissal'],
  ]);
});

test('Mass renderer gives every block one shared class and escapes source text', () => {
  const html = renderMassBlocks([
    { type: 'majorSection', text: 'Уступныя абрады', sectionId: 'introductory-rites' },
    { type: 'response', text: 'Lord, have mercy. Or: Kyrie, eleison. <b>', role: 'people' },
  ], getMassVariant('en'));
  assert.match(html, /^<h2 class="mass-block mass-major" id="mass-introductory-rites" data-mass-section="introductory-rites" tabindex="-1">/);
  assert.match(html, /<p class="mass-block mass-spoken mass-response" data-role="people">Lord, have mercy\. <span class="mass-alternative-inline">Or:<\/span> Kyrie, eleison\. &lt;b&gt;<\/p>/);
});
