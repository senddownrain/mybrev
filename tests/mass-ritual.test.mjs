import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MASS_ORDER_PRAYER_ID,
  MASS_RITUAL,
  activeMassSectionAt,
  getMassVariant,
  getMassVariantByPrayerId,
  isMassRitualPrayerId,
  locateMassSections,
  normalizeMassMarker,
  resolveMassLanguage,
  resolveMassSectionTarget,
} from '../src/utils/massRitual.js';
import { renderPrayerMarkdown } from '../src/utils/prayerMarkdown.js';

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
  assert.deepEqual(located.map((section) => section.sectionId), expected);
  assert.deepEqual(located.filter((section) => !section.parent).map((section) => section.sectionId), [
    'introductory-rites', 'liturgy-of-the-word', 'liturgy-of-the-eucharist', 'communion-rite', 'concluding-rites',
  ]);
  assert.equal(located.find((section) => section.sectionId === 'lords-prayer').title, 'The Lord’s Prayer');
  assert.equal(located.find((section) => section.sectionId === 'gloria').parent, 'introductory-rites');
});

test('English text is taken from MCFL.pdf without invented prayers', () => {
  assert.match(englishText, /Deliver us, Lord, we pray…/);
  assert.match(englishText, /Lord Jesus Christ…/);
  assert.doesNotMatch(englishText, /Eucharistic Prayer II|Preface Dialogue|Penitential Act\s*\(Form/);
  assert.match(getMassVariant('en').source, /International Commission on English in the Liturgy/);
  assert.match(getMassVariant('en').source, /Catholic Bishops’ Conference of England and Wales/);
});

test('Belarusian and Latin markers match their real section blocks', () => {
  const be = locateMassSections(getMassVariant('be'), [
    'Уступныя абрады', 'Чын пакаяння', 'Хвала на вышынях Богу', 'Літургія слова',
    'Вызнанне веры', 'Эўхарыстычная літургія', 'II эўхарыстычная малітва', 'Абрад Камуніі', 'Абрад заканчэння',
  ]);
  assert.deepEqual(be.map((section) => section.sectionId), [
    'introductory-rites', 'penitential-act', 'gloria', 'liturgy-of-the-word', 'creed',
    'liturgy-of-the-eucharist', 'eucharistic-prayer', 'communion-rite', 'concluding-rites',
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
  const latin = ['introductory-rites', 'liturgy-of-the-word', 'creed', 'liturgy-of-the-eucharist', 'communion-rite'];
  assert.equal(resolveMassSectionTarget('creed', latin), 'creed');
  assert.equal(resolveMassSectionTarget('gospel', latin), 'liturgy-of-the-word');
  assert.equal(resolveMassSectionTarget('dismissal', latin), 'communion-rite');
  assert.equal(resolveMassSectionTarget('lords-prayer', ['liturgy-of-the-eucharist']), 'liturgy-of-the-eucharist');
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
