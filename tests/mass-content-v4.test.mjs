import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, compileScript } from '@vue/compiler-sfc';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import {
  MASS_MAJOR_SECTIONS,
  MASS_RITUAL,
  buildMassSectionPicker,
  getMassVariant,
  resolveMassSectionTarget,
} from '../src/utils/massRitual.js';
import { buildMassDocument, renderMassBlocks } from '../src/utils/massContent.js';
import {
  MASS_V4_DOCUMENTS,
  MASS_V4_MAJOR_HEADINGS,
  activeMassTextFields,
  assertMassAllowListedChange,
  normalizeMassText,
  planMassDocument,
  runMassMigration,
  sha256,
} from '../scripts/lib/mass-content-v4.mjs';
import { run as runMigrationCli } from '../scripts/migrate-mass-content-v4.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');
const englishText = read('src/data/mass/order-of-mass-en.md').replace(/\r\n?/g, '\n');
const MAJOR_IDS = MASS_MAJOR_SECTIONS.map(({ id }) => id);
const MAJOR_TITLES = ['Уступныя абрады', 'Літургія слова', 'Эўхарыстычная літургія', 'Абрад Камуніі', 'Заключныя абрады'];

// Excerpts of the Firestore texts as they are before the migration, with
// their original markup (prayers/eMmCtxwyJ75ogmL5rwye, prayers/zdro66KYVuQ9p2KbqizD).
const BE_BEFORE = `### Уступныя абрады

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

**Хвала на вышынях Богу**

:::rubric
Затым, калі прадпісана, спяваецца ці прамаўляецца гімн:
:::

Хвала на вышынях Богу, а на зямлі супакой людзям добрай волі.

:::rubric
Усе разам са святаром пэўны час ціха моляцца.Потым святар, развёўшы рукі, гаворыць малітву дня (калекту), на заканчэнне якой народ адказвае:
:::

Амэн.

### **Літургія слова**

:::rubric
Потым спяваецца
:::

 Аллелюя

:::rubric
альбо іншы спеў, прадпісаны ў рубрыках, у залежнасці ад патрабаванняў літургічнага перыяду.
:::

### Эўхарыстычная літургія

II эўхарыстычная малітва

:::rubric
бярэ хлеб, трымае яго крыху ўзнятым над  алтаром і працягвае:
:::

**узяў хлеб і, падзяку Табе складаючы,
ламаў і раздаваў сваім вучням, кажучы:**

### Абрад Камуніі

:::rubric
Альбо:
:::

### Абрад заканчэння

Цэлебрант: Пан з вамі.
Усе:І з духам тваім.

Няхай благаславіць вас Бог усемагутны, Айцец і Сын,**X**і Дух Святы.`;

const LA_BEFORE = `ЧИН МЕССЫ НА ЛАТИНСКОМ ЯЗЫКЕ

:::rubric
Вступительные обряды
:::

V. In nomine Patris, et Filii, et Spiritus Sancti.

R. Amen.

V. Gratia Domini nostri Iesu Christi, et caritas Dei, et communicatio Sancti Spiritus sit cum omnibus vobis.

Или:

V. Dominus vobiscum.

R. Et cum spiritu tuo.

V. Kyrie eleison.

R. Kyrie eleison.

Gloria in excelsis Deo et in terra pax hominibus bonae voluntatis.

:::rubric
Литургия Слова
:::

После чтения:

V. Verbum Domini.

R. Deo gratias.

V.

:::rubric
(После чтения)
:::

 Verbum Domini.

R. Laus tibi, Christe.

:::rubric
Исповедание веры
:::

Credo in unum Deum, Patrem omnipotentem.

:::rubric
Евхаристическая Литургия
:::

:::rubric
Вторая Евхаристическая молитва
:::

V. Vere dignum et iustum est, aequum et salutare, nos tibi, sancte Pater, semper et ubique gratias agere.

Et ideo cum Angelis et omnibus Sanctis gloriam tuam praedicamus, una voce dicentes:

R. Sanctus, Sanctus, Sanctus Dominus Deus Sabaoth.

:::rubric
Обряд причащения
:::

:::rubric
Заключительный обряд
:::

V. Ite, missa est.

R. Deo gratias.`;

// The bundled English text as it was before V4 (English major headings).
const EN_BEFORE = MASS_V4_MAJOR_HEADINGS.reduce(
  (text, heading) => text.replace(`## ${heading.title}`, `## ${heading.former.at(-1)}`),
  englishText,
);

const BEFORE = { be: BE_BEFORE, la: LA_BEFORE, en: EN_BEFORE };
const AFTER = Object.fromEntries(Object.entries(BEFORE).map(([language, text]) => [language, normalizeMassText(language, text).text]));
const documentOf = (language, text) => buildMassDocument(text, getMassVariant(language), 'mybrev-markdown');
const htmlOf = (language, text) => renderMassBlocks(documentOf(language, text).blocks, getMassVariant(language));
const majorsOf = (document) => document.blocks.filter((block) => block.type === 'majorSection');

// 1–2. Five canonical sections, the same ids in every language.
test('the five major headings are visible in Belarusian in every language, before and after the migration', () => {
  assert.deepEqual(MASS_MAJOR_SECTIONS.map(({ title }) => title), MAJOR_TITLES);
  assert.deepEqual(MASS_V4_MAJOR_HEADINGS.map(({ id, title }) => [id, title]), MASS_MAJOR_SECTIONS.map(({ id, title }) => [id, title]));
  for (const texts of [BEFORE, AFTER]) {
    for (const language of ['be', 'la', 'en']) {
      const majors = majorsOf(documentOf(language, texts[language]));
      assert.deepEqual(majors.map((block) => block.sectionId), MAJOR_IDS, language);
      assert.deepEqual(majors.map((block) => block.text), MAJOR_TITLES, language);
    }
  }
  assert.doesNotMatch(htmlOf('be', BE_BEFORE), /Абрад заканчэння/);
  assert.doesNotMatch(htmlOf('la', LA_BEFORE), /Вступительные|Литургия Слова|Евхаристическая Литургия|Обряд причащения|Заключительный/);
  assert.doesNotMatch(htmlOf('en', EN_BEFORE), /The Introductory Rites<|The Concluding Rites</);
});

test('migrated texts carry the canonical headings themselves', () => {
  for (const language of ['be', 'la', 'en']) {
    const headings = AFTER[language].split('\n').filter((line) => line.startsWith('## '));
    assert.deepEqual(headings, MAJOR_TITLES.map((title) => `## ${title}`), language);
  }
  assert.deepEqual(englishText.split('\n').filter((line) => line.startsWith('## ')), MAJOR_TITLES.map((title) => `## ${title}`));
  assert.equal(normalizeMassText('en', englishText).text, englishText.trimEnd(), 'bundled English text is already normalized');
});

test('every ritual variant lists the canonical heading first and keeps the former one as a fallback marker', () => {
  MASS_RITUAL.variants.forEach((variant) => {
    MASS_MAJOR_SECTIONS.forEach(({ id, title }) => {
      assert.equal(variant.markers[id][0], title, `${variant.language}:${id}`);
    });
  });
  assert.deepEqual(getMassVariant('be').markers['concluding-rites'], ['Заключныя абрады', 'Абрад заканчэння']);
  assert.deepEqual(getMassVariant('la').markers['introductory-rites'], ['Уступныя абрады', 'Вступительные обряды']);
  assert.deepEqual(getMassVariant('en').markers['eucharistic-liturgy'], ['Эўхарыстычная літургія', 'The Liturgy of the Eucharist']);
});

// 3. Language switching.
test('switching language keeps the semantic section in the real section lists', () => {
  const ids = (language) => documentOf(language, AFTER[language]).sections.map((section) => section.sectionId);
  const [be, la, en] = [ids('be'), ids('la'), ids('en')];
  MAJOR_IDS.forEach((id) => {
    [be, la, en].forEach((available) => assert.equal(resolveMassSectionTarget(id, available), id));
  });
  assert.equal(resolveMassSectionTarget('creed', la), 'creed');
  // Missing in Latin: nearest preceding sibling, then the parent section.
  assert.equal(resolveMassSectionTarget('homily', la), 'first-reading');
  assert.equal(resolveMassSectionTarget('prayer-over-the-offerings', la), 'eucharistic-liturgy');
  assert.equal(resolveMassSectionTarget('gloria', be), 'gloria');
});

// 4. Wording allow-list.
test('migration changes only headings, speaker prefixes, markup and whitespace', () => {
  for (const language of ['be', 'la', 'en']) {
    assert.doesNotThrow(() => assertMassAllowListedChange(language, BEFORE[language], AFTER[language]), language);
  }
  assert.match(AFTER.be, /^## Заключныя абрады$/m);
  assert.match(AFTER.be, /^### Чын пакаяння$/m);
  assert.match(AFTER.be, /^### II эўхарыстычная малітва$/m);
  assert.match(AFTER.be, /^С\. Пане, змілуйся над намі\.\nН\. Пане, змілуйся над намі\.$/m);
  assert.match(AFTER.be, /^Цэлебрант: Пан з вамі\.\nУсе: І з духам тваім\.$/m);
  assert.match(AFTER.be, /моляцца\. Потым святар/);
  assert.match(AFTER.be, /Айцец і Сын, \*\*X\*\* і Дух Святы\./);
  assert.match(AFTER.be, /над алтаром/);
  assert.match(AFTER.la, /^#### ЧИН МЕССЫ НА ЛАТИНСКОМ ЯЗЫКЕ\n\n## Уступныя абрады$/m);
  assert.match(AFTER.la, /:::rubric\nИли:\n:::/);
  assert.match(AFTER.la, /:::rubric\n\(После чтения\)\n:::\n\nV\. Verbum Domini\.\n\nR\. Laus tibi, Christe\./);
  assert.match(AFTER.la, /^### Исповедание веры$/m);
  assert.doesNotMatch(AFTER.la, /^V\.$/m);
});

test('the allow-list rejects any change of words, punctuation, speakers or sections', () => {
  const rejects = (language, mutate, pattern) => assert.throws(
    () => assertMassAllowListedChange(language, BEFORE[language], mutate(AFTER[language])), pattern,
  );
  rejects('be', (text) => text.replace('У імя Айца і Сына', 'У імя Айца, Сына'), /wording changed/);
  rejects('be', (text) => text.replace('Амэн.', 'Амэн'), /wording changed/);
  rejects('la', (text) => text.replace('Kyrie eleison', 'Kyrie, eleison'), /wording changed/);
  rejects('la', (text) => text.replace('Или:', 'Vel:'), /wording changed/);
  rejects('la', (text) => text.replace('### Исповедание веры', '### Вызнанне веры'), /wording changed/);
  rejects('en', (text) => text.replace('And with your spirit.', 'And also with you.'), /wording changed/);
  rejects('en', (text) => text.replace('### Greeting', '### Прывітанне'), /wording changed/);
  rejects('la', (text) => text.replace('R. Amen.', 'V. Amen.'), /speaker sequence changed/);
  rejects('be', (text) => text.replace('С. Пане', 'Пане'), /speaker sequence changed/);
  rejects('be', (text) => text.replace('## Абрад Камуніі\n', ''), /major sections changed/);
  assert.throws(() => assertMassAllowListedChange('la', 'V. Amen.', 'V. Amen.'), /exactly the five major sections/);
});

const REPORTS = path.join(ROOT, 'reports/mass-v4');
const dryRunTexts = existsSync(REPORTS)
  ? readdirSync(REPORTS).filter((name) => name.endsWith('.before.md')).map((name) => ({
    name,
    language: MASS_V4_DOCUMENTS.find(({ id }) => name.startsWith(id))?.language,
    before: readFileSync(path.join(REPORTS, name), 'utf8'),
    after: readFileSync(path.join(REPORTS, name.replace('.before.md', '.after.md')), 'utf8'),
  }))
  : [];

// Runs against the real Firestore texts when a local dry run has produced them
// (reports/ is not committed).
test('real dry-run output: allow-list holds and both versions render the same structure', { skip: !dryRunTexts.length }, () => {
  dryRunTexts.forEach(({ name, language, before, after }) => {
    assert.equal(normalizeMassText(language, before).text, after, name);
    assert.doesNotThrow(() => assertMassAllowListedChange(language, before, after), name);
    assert.equal(normalizeMassText(language, after).changed, false, name);
    const shape = (text) => documentOf(language, text).blocks.map((block) => (
      [block.type, block.role || '', block.speakerLabel || '', block.sectionId || ''].join(':')
    ));
    assert.deepEqual(shape(after), shape(before), name);
    const compact = (text) => documentOf(language, text).blocks.map((block) => block.text).join('').replace(/[*\s]+/g, '');
    assert.equal(compact(after), compact(before), name);
    assert.deepEqual(majorsOf(documentOf(language, after)).map((block) => block.text), MAJOR_TITLES, name);
  });
});

// 5. Roles.
test('dialogue roles and labels are detected with the same meaning in all three languages', () => {
  const dialogue = (language, call) => {
    const { blocks } = documentOf(language, AFTER[language]);
    const index = blocks.findIndex((block) => block.text === call);
    return blocks.slice(index, index + 2).map((block) => [block.type, block.role, block.speakerLabel]);
  };
  assert.deepEqual(dialogue('be', 'Пане, змілуйся над намі.'), [['spoken', 'priest', 'С.'], ['response', 'people', 'Н.']]);
  assert.deepEqual(dialogue('la', 'Kyrie eleison.'), [['spoken', 'priest', 'V.'], ['response', 'people', 'R.']]);
  assert.deepEqual(dialogue('en', 'The Lord be with you.'), [['spoken', 'priest', 'P.'], ['response', 'people', 'R.']]);
  assert.deepEqual(dialogue('be', 'Пан з вамі.'), [['spoken', 'celebrant', 'С.'], ['response', 'all', 'Н.']]);
  assert.deepEqual(dialogue('en', 'The word of the Lord.'), [['spoken', 'reader', 'L.'], ['response', 'people', 'R.']]);
  // Same result from the pre-migration syntax.
  const before = documentOf('be', BE_BEFORE).blocks.find((block) => block.text === 'Пане, змілуйся над намі.');
  assert.deepEqual([before.role, before.speakerLabel], ['priest', 'С.']);
});

test('labels stay off long prayers, hymns, rubric-led lines and comments', () => {
  const find = (language, start) => documentOf(language, AFTER[language]).blocks.find((block) => block.text.startsWith(start));
  const preface = find('la', 'Vere dignum');
  assert.deepEqual([preface.type, preface.role, preface.speakerLabel], ['spoken', 'priest', undefined]);
  assert.equal(find('la', 'Sanctus, Sanctus').speakerLabel, undefined);
  assert.equal(find('la', 'Gratia Domini').speakerLabel, undefined);
  // Hymns are said by all in every language and never labelled.
  [['be', 'Хвала на вышынях Богу, а'], ['la', 'Gloria in excelsis'], ['en', 'Glory to God']].forEach(([language, start]) => {
    const gloria = find(language, start);
    assert.equal(gloria.type, 'response', language);
    assert.equal(gloria.speakerLabel, undefined, language);
  });
  assert.equal(find('la', 'Credo in unum').role, 'all');
  // A rubric already names the speaker: a role, but no label.
  const amen = find('be', 'Амэн.');
  assert.deepEqual([amen.type, amen.role, amen.speakerLabel], ['response', 'people', undefined]);
  // Consecutive stanzas of one prayer are not a dialogue.
  const stanzas = documentOf('en', englishText).blocks.filter((block) => block.type === 'response' && /^We praise you|^For you alone/.test(block.text));
  assert.equal(stanzas.length, 2);
  stanzas.forEach((block) => assert.equal(block.speakerLabel, undefined));
  documentOf('en', englishText).blocks
    .filter((block) => ['rubric', 'comment', 'posture', 'alternative', 'heading', 'subsection', 'majorSection'].includes(block.type))
    .forEach((block) => assert.equal(block.speakerLabel, undefined));
});

test('role labels are ritual metadata for every role and language', () => {
  assert.equal(MASS_RITUAL.rolePolicy.showSpeakerLabels, true);
  assert.equal(MASS_RITUAL.rolePolicy.labelPolicy, 'dialogue');
  const expected = { be: ['С.', 'Н.'], la: ['V.', 'R.'], en: ['P.', 'R.'] };
  MASS_RITUAL.variants.forEach((variant) => {
    assert.deepEqual(Object.keys(variant.roleLabels).sort(), [...MASS_RITUAL.roles].sort(), variant.language);
    assert.deepEqual([variant.roleLabels.priest, variant.roleLabels.people], expected[variant.language]);
    Object.keys(variant.roleMarkers || {}).forEach((role) => assert.ok(MASS_RITUAL.roles.includes(role)));
  });
  assert.doesNotMatch(read('src/utils/massContent.js'), /['"](?:С\.|Н\.|V\.|R\.|P\.)['"]/, 'no labels hard-coded in the adapter');
  assert.doesNotMatch(read('src/components/prayers/PrayerView.vue'), /['"](?:С\.|Н\.|V\.|R\.|P\.)['"]/);
});

// 6. Section selector.
test('section picker model: five Belarusian sections, the current one selected, subsections secondary', () => {
  const located = documentOf('en', englishText).sections.map((section) => section.sectionId);
  const picker = buildMassSectionPicker(located, 'gospel');
  assert.deepEqual(picker.items.map((item) => [item.number, item.title, item.active, item.available]), [
    [1, 'Уступныя абрады', false, true],
    [2, 'Літургія слова', true, true],
    [3, 'Эўхарыстычная літургія', false, true],
    [4, 'Абрад Камуніі', false, true],
    [5, 'Заключныя абрады', false, true],
  ]);
  assert.deepEqual([picker.current.id, picker.current.number, picker.current.total], ['liturgy-of-the-word', 2, 5]);
  assert.deepEqual(picker.items[1].children.filter((child) => child.active).map((child) => child.id), ['gospel']);
  assert.ok(picker.items[1].children.every((child) => located.includes(child.id)));
  // Retired id, a text without subsections, and no position yet.
  assert.equal(buildMassSectionPicker(MAJOR_IDS, 'liturgy-of-the-eucharist').current.id, 'eucharistic-liturgy');
  assert.deepEqual(buildMassSectionPicker(MAJOR_IDS, 'communion-rite').items.map((item) => item.children.length), [0, 0, 0, 0, 0]);
  assert.equal(buildMassSectionPicker(['introductory-rites'], null).current, null);
  assert.equal(buildMassSectionPicker(['introductory-rites'], null).items[4].available, false);
});

// Compiles the real SFC for SSR; Vuetify's sheet is replaced by a stub that
// renders its content while open.
async function loadComponent(file) {
  const { descriptor } = parse(read(file), { filename: file });
  const { content } = compileScript(descriptor, { id: file, inlineTemplate: true, templateOptions: { ssr: true, ssrCssVars: [] } });
  const srcUrl = (name) => new URL(`../src/${name}`, import.meta.url).href;
  const code = content
    .replace(/from ['"]@\/([^'"]+)['"]/g, (_, name) => `from '${srcUrl(name)}'`)
    .replace(/from ['"](vue|vue\/server-renderer|@phosphor-icons\/vue)['"]/g, (_, name) => `from '${import.meta.resolve(name)}'`);
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default;
}

async function renderSectionNav(props, sheetOpen) {
  const component = await loadComponent('src/components/prayers/MassSectionNav.vue');
  const app = createSSRApp({ render: () => h(component, props) });
  app.component('VBottomSheet', (_, { slots }) => (sheetOpen ? h('div', { class: 'sheet' }, slots.default?.()) : null));
  app.component('VCard', (_, { slots }) => h('div', slots.default?.()));
  return (await renderToString(app)).replace(/ data-v-[^\s>]*/g, '').replace(/<!--[\s\S]*?-->/g, '');
}

test('section control shows the full current section name and opens a picker of the five sections', async () => {
  const located = documentOf('en', englishText).sections.map((section) => section.sectionId);
  const closed = await renderSectionNav({ sectionIds: located, activeSectionId: 'eucharistic-prayer' }, false);
  assert.match(closed, /aria-haspopup="dialog"/);
  assert.match(closed, /aria-label="Раздзел: Эўхарыстычная літургія\. Выбраць раздзел"/);
  assert.match(closed, /mass-section-control__count[^>]*>\s*3\/5\s*</);
  assert.match(closed, /mass-section-control__title[^>]*>Эўхарыстычная літургія</);
  assert.doesNotMatch(closed, /mass-section-item/);

  const open = await renderSectionNav({ sectionIds: located, activeSectionId: 'eucharistic-prayer' }, true);
  const items = [...open.matchAll(/<button[^>]*class="mass-section-item[^"]*"[^>]*>/g)].map(([tag]) => tag);
  assert.deepEqual(items.map((tag) => tag.match(/data-mass-target="([^"]+)"/)[1]), MAJOR_IDS);
  assert.deepEqual(items.filter((tag) => tag.includes('aria-current="location"')).map((tag) => tag.match(/data-mass-target="([^"]+)"/)[1]), ['eucharistic-liturgy']);
  MAJOR_TITLES.forEach((title) => assert.ok(open.includes(`>${title}</span>`), title));
  assert.match(open, /class="mass-subsection-item mass-subsection-item--active"[^>]*data-mass-target="eucharistic-prayer"/);
  assert.doesNotMatch(open, /data-mass-target="gospel"/, 'only the current section lists its parts');

  const source = read('src/components/prayers/MassSectionNav.vue');
  assert.match(source, /-webkit-line-clamp: 2/);
  assert.match(source, /open\.value = false;[\s\S]*emit\('select', sectionId\)/, 'selecting closes the sheet and asks the reader to scroll');
  assert.doesNotMatch(source, /massLanguage|MassLanguageMenu|query\.lang/, 'language stays in the top-right menu');
});

test('Mass reader uses the section control, keeps the language menu in the header and has no dock or Share', () => {
  const view = read('src/components/prayers/PrayerView.vue');
  assert.match(view, /<MassSectionNav[\s\S]*?@select="onMassSectionSelect"/);
  assert.doesNotMatch(view, /mass-dock/);
  assert.doesNotMatch(read('src/styles/prayer-reading.css'), /mass-dock/);
  const layout = read('src/layouts/default/Default.vue');
  assert.match(layout, /<MassLanguageMenu v-if="isMassPage" \/>/);
  assert.match(layout, /v-if="!isMassPage"/);
});

// 7. Bundled English vs Firestore.
test('English renders the same from the bundled file, the published document and the pre-V4 text', () => {
  const bundled = htmlOf('en', englishText);
  // scripts/import-mass-english.mjs publishes the trimmed bundled text.
  assert.equal(htmlOf('en', englishText.trim()), bundled);
  assert.equal(htmlOf('en', EN_BEFORE), bundled);
  assert.equal(normalizeMassText('en', EN_BEFORE).text, englishText.trimEnd());
});

// 8–9. Migration.
function mockFirestore(documents) {
  const store = structuredClone(documents);
  const calls = { get: 0, update: [] };
  let clock = 0;
  return {
    store,
    calls,
    async get(id) {
      calls.get += 1;
      return store[id] ? { exists: true, data: structuredClone(store[id].data), updateTime: store[id].updateTime } : { exists: false };
    },
    async update(id, fields, options) {
      if (options.lastUpdateTime !== store[id].updateTime) throw new Error('FAILED_PRECONDITION');
      calls.update.push({ id, fields: Object.keys(fields) });
      Object.entries(fields).forEach(([fieldPath, value]) => {
        const keys = fieldPath.split('.');
        const last = keys.pop();
        keys.reduce((target, key) => target[key], store[id].data)[last] = value;
      });
      store[id].updateTime = `2026-10-01T00:00:0${clock += 1}.000Z`;
    },
  };
}

const seed = () => ({
  eMmCtxwyJ75ogmL5rwye: {
    updateTime: '2026-08-28T12:38:27.525Z',
    data: { title: 'Парадак святой Імшы', tags: ['Святая Імша'], text: BE_BEFORE, textVersions: { be: 'legacy copy' }, textFormat: 'mybrev-markdown' },
  },
  zdro66KYVuQ9p2KbqizD: {
    updateTime: '2026-08-26T11:59:14.428Z',
    data: { titleVersions: { be: 'Ordo Missae' }, tags: ['Святая Імша'], textVersions: { be: LA_BEFORE, ru: LA_BEFORE, la: LA_BEFORE } },
  },
});

const planFile = (outcome) => JSON.parse(JSON.stringify(outcome.plan));

test('dry run reads the three documents, backs them up untouched and writes nothing', async () => {
  const firestore = mockFirestore(seed());
  const backups = [];
  const outcome = await runMassMigration({ firestore, backup: (documents) => backups.push(structuredClone(documents)) });
  assert.equal(firestore.calls.get, 3);
  assert.deepEqual(firestore.calls.update, []);
  assert.deepEqual(firestore.store, seed());
  assert.deepEqual(backups[0].map((document) => [document.id, document.exists]), [
    ['eMmCtxwyJ75ogmL5rwye', true], ['zdro66KYVuQ9p2KbqizD', true], ['order-of-mass-en', false],
  ]);
  assert.equal(backups[0][0].data.text, BE_BEFORE);
  assert.deepEqual(outcome.results, [
    { id: 'eMmCtxwyJ75ogmL5rwye', status: 'would-update' },
    { id: 'zdro66KYVuQ9p2KbqizD', status: 'would-update' },
    { id: 'order-of-mass-en', status: 'missing' },
  ]);
  assert.deepEqual(outcome.plan.documents.map((document) => document.fields.map((field) => field.path)), [
    ['text'], ['textVersions.be', 'textVersions.la', 'textVersions.ru'], [],
  ]);
  assert.equal(JSON.stringify(outcome.plan).includes('Пане, змілуйся'), false, 'the plan holds hashes, not texts');
  assert.equal(outcome.plan.documents[0].fields[0].beforeSha256, sha256(BE_BEFORE));
});

test('the CLI dry run writes backup, plan and report files and never calls update', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'mass-v4-'));
  const firestore = mockFirestore(seed());
  const lines = [];
  await runMigrationCli(['--backup-dir', path.join(directory, 'backups'), '--report-dir', path.join(directory, 'reports')], {
    firestore, now: '2026-09-30T10:00:00.000Z', log: (line) => lines.push(line),
  });
  assert.deepEqual(firestore.calls.update, []);
  const backup = JSON.parse(readFileSync(path.join(directory, 'backups/2026-09-30T10-00-00-000Z/eMmCtxwyJ75ogmL5rwye.json'), 'utf8'));
  assert.equal(backup.data.text, BE_BEFORE);
  assert.equal(backup.updateTime, '2026-08-28T12:38:27.525Z');
  const plan = JSON.parse(readFileSync(path.join(directory, 'reports/plan.json'), 'utf8'));
  assert.equal(plan.mode, 'dry-run');
  const report = readFileSync(path.join(directory, 'reports/report.md'), 'utf8');
  assert.match(report, /\*\*dry-run\*\* \(no Firestore writes\)/);
  assert.match(report, /-### Абрад заканчэння\n\+## Заключныя абрады/);
  assert.match(lines.join('\n'), /Dry run only: no Firestore writes/);
  await assert.rejects(
    runMigrationCli(['--apply', '--snapshot', directory], { firestore }),
    /do not combine it with --snapshot/,
  );
});

test('apply writes only the planned text fields of the two existing documents and is idempotent', async () => {
  const firestore = mockFirestore(seed());
  const plan = planFile(await runMassMigration({ firestore }));
  const applied = await runMassMigration({ firestore, apply: true, previousPlan: plan });
  assert.deepEqual(firestore.calls.update, [
    { id: 'eMmCtxwyJ75ogmL5rwye', fields: ['text'] },
    { id: 'zdro66KYVuQ9p2KbqizD', fields: ['textVersions.be', 'textVersions.la', 'textVersions.ru'] },
  ]);
  assert.deepEqual(applied.results.map((result) => result.status).sort(), ['missing', 'updated', 'updated']);
  const be = firestore.store.eMmCtxwyJ75ogmL5rwye.data;
  assert.equal(be.text, AFTER.be);
  assert.deepEqual([be.title, be.tags, be.textVersions, be.textFormat], ['Парадак святой Імшы', ['Святая Імша'], { be: 'legacy copy' }, 'mybrev-markdown']);
  const la = firestore.store.zdro66KYVuQ9p2KbqizD.data;
  assert.deepEqual(la.textVersions, { be: AFTER.la, ru: AFTER.la, la: AFTER.la });
  assert.deepEqual(la.titleVersions, { be: 'Ordo Missae' });
  assert.equal('text' in la, false);
  assert.equal(firestore.store['order-of-mass-en'], undefined, 'a missing document is never created');

  // Second apply with the same plan, and a fresh dry run + apply: no writes.
  const again = await runMassMigration({ firestore, apply: true, previousPlan: plan });
  assert.equal(firestore.calls.update.length, 2);
  assert.deepEqual(again.results.map((result) => result.status).sort(), ['already-applied', 'already-applied', 'missing']);
  const fresh = await runMassMigration({ firestore });
  assert.deepEqual(fresh.results.map((result) => result.status), ['unchanged', 'unchanged', 'missing']);
  await runMassMigration({ firestore, apply: true, previousPlan: planFile(fresh) });
  assert.equal(firestore.calls.update.length, 2);
  for (const language of ['be', 'la', 'en']) {
    assert.equal(normalizeMassText(language, AFTER[language]).text, AFTER[language], language);
  }
});

test('apply refuses to run without a plan or when a document changed since the dry run', async () => {
  const firestore = mockFirestore(seed());
  await assert.rejects(runMassMigration({ firestore, apply: true }), /No dry-run plan found/);
  const plan = planFile(await runMassMigration({ firestore }));

  // Someone edits the Latin text after the dry run.
  firestore.store.zdro66KYVuQ9p2KbqizD.data.textVersions.be += '\n\nNova oratio.';
  firestore.store.zdro66KYVuQ9p2KbqizD.updateTime = '2026-09-30T12:00:00.000Z';
  await assert.rejects(runMassMigration({ firestore, apply: true, previousPlan: plan }), /zdro66KYVuQ9p2KbqizD changed since the dry run.*Nothing was written/);
  assert.deepEqual(firestore.calls.update, [], 'the untouched Belarusian document is not written either');

  // Metadata-only edit: same text, newer updateTime.
  const other = mockFirestore(seed());
  const otherPlan = planFile(await runMassMigration({ firestore: other }));
  other.store.eMmCtxwyJ75ogmL5rwye.data.tags.push('Новы тэг');
  other.store.eMmCtxwyJ75ogmL5rwye.updateTime = '2026-09-30T12:00:00.000Z';
  await assert.rejects(runMassMigration({ firestore: other, apply: true, previousPlan: otherPlan }), /eMmCtxwyJ75ogmL5rwye changed since the dry run/);
  assert.deepEqual(other.calls.update, []);

  // The English document appears after the dry run.
  const third = mockFirestore(seed());
  const thirdPlan = planFile(await runMassMigration({ firestore: third }));
  third.store['order-of-mass-en'] = { updateTime: '2026-09-30T12:00:00.000Z', data: { text: EN_BEFORE } };
  await assert.rejects(runMassMigration({ firestore: third, apply: true, previousPlan: thirdPlan }), /did not exist at dry run/);
  assert.deepEqual(third.calls.update, []);
});

test('planning picks the displayed text field and refuses a text that would lose a section', () => {
  assert.deepEqual(activeMassTextFields({ text: 'a', textVersions: { be: 'b' } }), ['text']);
  assert.deepEqual(activeMassTextFields({ textVersions: { ru: 'b', be: 'b' } }), ['textVersions.be', 'textVersions.ru']);
  const english = planMassDocument({ id: 'order-of-mass-en', language: 'en' }, { exists: true, data: { text: EN_BEFORE }, updateTime: 't' });
  assert.equal(english.status, 'update');
  assert.deepEqual(english.fields[0].counts, { heading: 5, prefix: 0, markup: 0, whitespace: 1 });
  assert.throws(
    () => planMassDocument({ id: 'x', language: 'be' }, { exists: true, data: { text: BE_BEFORE.replace('### Абрад Камуніі', '') } }),
    /exactly the five major sections/,
  );
});

// 10. Secret.
test('the service-account key is ignored, untracked and nothing like it is committed', () => {
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  assert.match(read('.gitignore'), /^\/patchs\/serviceAccountKey\.json$/m);
  assert.match(read('.gitignore'), /^\/backups\/$/m);
  assert.match(read('.gitignore'), /^\/reports\/$/m);
  assert.match(git('check-ignore', '-v', 'patchs/serviceAccountKey.json', 'backups/mass-v4/x.json', 'reports/mass-v4/plan.json'), /serviceAccountKey\.json/);
  assert.equal(git('ls-files', '--', 'patchs/serviceAccountKey.json', 'backups', 'reports/mass-v4').trim(), '');
  const marker = ['BEGIN', 'PRIVATE', 'KEY'].join(' ');
  let tracked = '';
  try {
    tracked = git('grep', '-l', '-e', marker, '-e', ['"private', 'key"'].join('_'), '--', '.');
  } catch (error) {
    if (error.status !== 1) throw error; // 1 = no match
  }
  assert.equal(tracked.trim(), '');
  const script = read('scripts/migrate-mass-content-v4.mjs') + read('scripts/lib/mass-content-v4.mjs');
  assert.doesNotMatch(script, /console\.(log|error)\([^)]*(serviceAccount|credentials)/);
});
