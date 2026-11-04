import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SOURCE_REGISTRY, SOURCES, getSource, getBibleSource } from '../src/constants/sources.js';
import { BIBLE_BOOKS, getBibleSourceLabel } from '../src/constants/bible.js';
import { COMPENDIUM_SOURCE_URL } from '../src/constants/compendium.js';

const root = new URL('../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');
const vueFiles = (dir) => fs.readdirSync(new URL(dir, root), { withFileTypes: true })
  .flatMap(entry => entry.isDirectory() ? vueFiles(`${dir}/${entry.name}`) : entry.name.endsWith('.vue') ? [`${dir}/${entry.name}`] : []);

test('portable UTF-8 registry parses with unique stable IDs and explicit unknowns', () => {
  assert.deepEqual(JSON.parse(read('src/data/sources.json')), SOURCE_REGISTRY);
  assert.equal(SOURCE_REGISTRY.schemaVersion, 1);
  assert.equal(SOURCES.length, 6);
  assert.equal(new Set(SOURCES.map(source => source.id)).size, SOURCES.length);
  for (const source of SOURCES) {
    assert.match(source.id, /^[a-z0-9-]+$/);
    for (const field of ['title', 'rightsholder', 'years', 'officialEdition', 'publicationPlace', 'translation', 'digitalSources', 'sections', 'verification']) {
      assert.ok(Object.hasOwn(source, field), `${source.id}: ${field}`);
    }
    assert.ok(source.title && source.officialEdition);
    assert.ok(source.sections.every(section => SOURCE_REGISTRY.sections[section]));
    assert.ok(source.verification.evidence.length);
    assert.ok(source.verification.pending.length);
    assert.equal(source.digitalPermission.status, 'requires_verification');
    for (const digital of source.digitalSources) assert.equal(new URL(digital.url).protocol, 'https:');
    for (const evidence of source.verification.evidence) {
      if (!/^(https:|user:)/.test(evidence.location)) assert.ok(fs.existsSync(new URL(evidence.location, root)), evidence.location);
    }
  }
});

test('all registry bindings and consumer references resolve', () => {
  const visit = value => {
    if (typeof value === 'string') assert.ok(getSource(value), value);
    else Object.values(value).forEach(visit);
  };
  visit(SOURCE_REGISTRY.bindings);
  for (const file of ['src/constants/compendium.js']) {
    for (const [, id] of read(file).matchAll(/getSource\('([^']+)'\)/g)) assert.ok(getSource(id), id);
  }
  assert.equal(getSource('missing'), null);
  assert.equal(getBibleSource('missing', 'old'), null);
  assert.equal(COMPENDIUM_SOURCE_URL, getSource(SOURCE_REGISTRY.bindings.compendium[0]).digitalSources[0].url);
});

test('required notices and every former Bible attribution are retained', () => {
  for (const [id, years] of [['bible-nt-kkbb-2017', '2017'], ['lectionary-kkbb-2002-2005', '2002–2005'], ['compendium-kkbb-2010', '2010']]) {
    assert.ok(getSource(id).copyrightNotices.includes(`© Канферэнцыя Каталіцкіх Біскупаў Беларусі, ${years}`));
    assert.equal(getSource(id).publicationPlace, 'Мінск');
  }
  assert.equal(getSource('liturgy-hours-2012-2020').years, '2012–2020');
  for (const text of ['Стары Запавет · пераклад кс. Уладзіслава Чарняўскага MIC', 'Новы Запавет · Catholic.by', 'Синодальный перевод']) {
    const legacy = SOURCE_REGISTRY.legacyAttributions.find(item => item.text === text);
    assert.ok(getSource(legacy?.sourceId), text);
  }
  assert.ok(getSource('compendium-kkbb-2010').copyrightNotices.includes('© Copyright 2005 — Libreria Editrice Vaticana'));
  assert.equal(getSource('bible-charniauski-2017').digitalSources[0].url, 'https://bible.by/bvc-2017/');
  assert.ok(getSource('bible-ru-synodal').digitalSources.every(source => source.status === 'candidate'));
});

test('three documented KKBB decrees and unresolved fourth never invent metadata', () => {
  const decrees = getSource('liturgy-hours-2012-2020').decrees;
  assert.deepEqual(decrees.map(({ number, date }) => [number, date]), [
    ['32/P/12', '2012-06-29'], ['70/P/13', '2013-08-15'], ['62/P/15', '2015-08-06'], [null, null],
  ]);
  assert.equal(decrees[3].status, 'requires_verification');
  assert.equal(decrees[3].summary, null);
  for (const id of ['bible-charniauski-2017', 'bible-ru-synodal', 'liturgy-hours-2012-2020']) assert.equal(getSource(id).rightsholder, null);
});

test('every Bible book retains correct visible translation by language and testament', () => {
  for (const [language, books] of Object.entries(BIBLE_BOOKS)) {
    for (const book of books) {
      const expected = language === 'ru' ? 'bible-ru-synodal' : book.testament === 'new' ? 'bible-nt-kkbb-2017' : 'bible-charniauski-2017';
      assert.equal(getBibleSource(language, book.testament).id, expected);
      assert.equal(getBibleSourceLabel(language, book.testament), getSource(expected).translation.label);
    }
  }
  assert.match(read('src/views/Bible.vue'), /bible-heading__translation[^\n]*translationLabel/);
  assert.match(read('src/views/Bible.vue'), /getBibleSourceLabel\(language.value, currentBook.value\?\.testament/);
});

test('Bible, Readings and all Hours have no old source footers; About renders registry', () => {
  const files = ['src/views/Bible.vue', 'src/components/OrasList.vue', ...vueFiles('src/components/oras'), ...vueFiles('src/components/oraparts'), ...vueFiles('src/components/readings')];
  for (const file of files) {
    const template = read(file).split('</template>')[0];
    assert.doesNotMatch(template, /(?:catholic\.by|bible\.by|Крыніца:|prayer-source|CompendiumSource|SourceRights|©)/i, file);
  }
  assert.match(read('src/views/About.vue'), /<SourceRights\s*\/>/);
  const component = read('src/components/SourceRights.vue');
  for (const field of ['officialEdition', 'rightsholder', 'copyrightNotices', 'translation', 'digitalSources', 'verification.pending']) assert.ok(component.includes(`source.${field}`));
  assert.match(component, /v-for="source in SOURCES"/);
});

test('PR leaves prayer, song, Bible text, readings, Hours and calendar modules untouched', { skip: !process.env.SOURCE_AUDIT_DIFF }, () => {
  const changed = fs.readFileSync(process.env.SOURCE_AUDIT_DIFF, 'utf8').trim().split('\n');
  for (const file of changed) {
    assert.doesNotMatch(file, /^(?:scripts\/bible\/|patchs\/|src\/(?:components\/(?:prayers\/|oras\/|oraparts\/|readings\/|OrasList.vue)|views\/(?:Songs?|Prayers|FavoritePrayers|Settings)\.vue|(?:composables|services|stores|utils|data\/ordo)\/))/, file);
  }
});
