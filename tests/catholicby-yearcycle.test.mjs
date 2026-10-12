import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { discoverCatalog, extractArticle, deduplicate, contentMarkdown, plainText, normalizeUrl, stationNumber, contextualAudit, prayerText, prayerTitle } from '../scripts/lib/catholicby-yearcycle.mjs';
import { buildDevotionHours, readGadzinki, GADZINKI_SECTIONS } from '../scripts/lib/devotion-hours.mjs';
import { parseArgs, applyPlan } from '../scripts/import-catholicby-yearcycle.mjs';
import { DEFAULT_CATEGORIES } from '../src/constants/categories.js';
import { renderPrayerMarkdown } from '../src/utils/prayerMarkdown.js';
import { buildPrayerCategoryMenu } from '../src/utils/prayerCategoryMenu.js';
import { matchesPrayerTags } from '../src/utils/prayerTagFilter.js';
import { prayerAccessPolicy } from '../functions/lib/priest-policy.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const article = (content) => `<nav>Меню</nav><table class="contentpaneopen"><tr><td class="contentheading">Загаловак</td></tr></table><table class="contentpaneopen"><tr><td valign="top">${content}</td></tr></table><footer>Навіны</footer>`;
const candidate = { id: 'catholicby-yearcycle-100110', importKey: 'catholicby-yearcycle-100110', title: 'Вяночак да Божай Міласэрнасці', sourceUrl: 'https://old.catholic.by/2/liturgy/pray/year-cycle/100110.html', text: 'Першы радок\nДругі радок', tags: ['Набажэнства'] };

test('manifest contains 33 items, twenty stations and one reference; external routes stay intact', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('../patchs/sources/catholicby-yearcycle/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.items.length, 33);
  assert.equal(manifest.items.filter((i) => i.type === 'stations').length, 20);
  assert.equal(manifest.items.filter((i) => i.type === 'reference').length, 1);
  assert.equal(manifest.items.filter((i) => !i.sourceUrl.includes('/year-cycle/')).length, 2);
  assert.equal(new Set(manifest.items.map((i) => i.sourceUrl)).size, 33);
});
test('catalog discovery excludes menu, empty links and grouping headings', () => {
  const html = article('<ul><li>Група<a href="/2/liturgy/pray/111858-kryzowy-szlach.html">Курапацкі шлях</a><a href="/2/liturgy/pray/999.html"> </a></li></ul>');
  assert.deepEqual(discoverCatalog(html, 'https://old.catholic.by'), [{ title: 'Курапацкі шлях', sourceUrl: 'https://old.catholic.by/2/liturgy/pray/111858-kryzowy-szlach.html' }]);
  assert.equal(normalizeUrl(`${candidate.sourceUrl}/?a=1#b`), candidate.sourceUrl);
});
test('station conversion removes icon garbage and preserves all fourteen headings and prayer lines', () => {
  const html = article('<p>Уступная малітва і пачатак Крыжовага шляху.</p>' + Array.from({ length: 14 }, (_, i) => `<p><span class="divider">a</span><b>Стацыя ${i + 1}<br>Езус</b><br>С.: Кланяемся Табе!<br>Н.: Бо праз крыж свет адкупіў Ты!</p>`).join('') + '<p>Заключная малітва.</p>');
  const result = extractArticle(html, candidate.sourceUrl, 'stations');
  assert.deepEqual(result.stationNumbers, Array.from({ length: 14 }, (_, i) => i + 1));
  assert.equal(result.fidelity, true);
  assert.doesNotMatch(result.text, /Меню|Навіны|divider/);
  assert.equal((result.text.match(/^## Стацыя/gm) || []).length, 14);
  assert.match(result.text, /Заключная малітва/);
});
test('roman, mixed-script and word station numbers are recognized without editing their spelling', () => {
  assert.equal(stationNumber('Стацыя VІІI. Езус'), 8);
  assert.equal(stationNumber('XIV. Цела Езуса'), 14);
  assert.equal(stationNumber('Першая стацыя Крыжа'), 1);
  assert.equal(stationNumber('3. Езус падае'), 3);
  assert.equal(stationNumber('Малітва'), null);
});
test('plain paragraph station headings are retained and promoted without requiring bold markup', () => {
  const result = extractArticle(article('<p>Уступная малітва.</p><p>Стацыя 1</p><p>Езус асуджаны на смерць. Гэта першае разважанне з малітвай і адказам народа.</p>'), candidate.sourceUrl, 'stations');
  assert.deepEqual(result.stationNumbers, [1]);
  assert.match(result.text, /^## Стацыя 1$/m);
  assert.equal(result.fidelity, true);
});
test('poetry, literal cadence signs, biblical references and emphasis survive rendering', () => {
  const md = contentMarkdown('<p><em>Адказ народа.</em></p><p>Першы радок *<br>Другі радок †</p><p><i>Ян 1, 1</i></p><p class="rubric">Усе ўстаюць.</p>');
  const html = renderPrayerMarkdown(md, 'mybrev-markdown');
  assert.doesNotMatch(md, /SENTINEL/);
  assert.match(html, /<em>Адказ народа\.<\/em>/);
  assert.match(html, /Першы радок \*<br>/);
  assert.match(html, /<aside class="prayer-rubric">/);
  assert.match(html, /Ян 1, 1/);
});
test('exact URL match with changed text requests review; no existing fields are mutated', () => {
  const existing = [{ id: 'old', title: 'Ручная назва', text: 'Іншы тэкст', source: `[Catholic.by](${candidate.sourceUrl}?print=1)`, tags: ['Марыя'] }];
  const before = JSON.stringify(existing);
  const result = deduplicate(candidate, existing);
  assert.equal(result.status, 'needs-review');
  assert.equal(result.matches[0].id, 'old');
  assert.equal(JSON.stringify(existing), before);
});
test('same text matches independently of formatting and proposes additive tags only', () => {
  const old = { id: 'old', title: candidate.title, text: '**Першы радок**\nДругі радок', tags: ['Марыя'], source: 'Існуючая крыніца' };
  const result = deduplicate(candidate, [old]);
  assert.equal(result.status, 'add-tags-only');
  assert.deepEqual(result.patch, { tags: ['Марыя', 'Набажэнства'] });
  assert.equal(deduplicate(candidate, [{ ...old, ...result.patch }]).status, 'already-present');
});
test('different Stations versions are never merged based only on titles', () => {
  const result = deduplicate({ ...candidate, title: 'Крыжовы шлях', text: 'Зусім асобны варыянт', tags: ['Набажэнства', 'Крыжовы шлях'] }, [{ id: 'other', title: 'Крыжовы шлях', text: 'Папярэдні варыянт' }]);
  assert.equal(result.status, 'needs-review');
  assert.equal(deduplicate(candidate, null).status, 'database-not-audited');
});
test('index links alone are not duplicates; creating and reanalysing is idempotent', () => {
  const index = { id: 'index', title: 'Набажэнствы на працягу літургічнага года', text: `[${candidate.title}](${candidate.sourceUrl})`, source: 'https://old.catholic.by/2/liturgy/pray/year-cycle.html' };
  assert.equal(deduplicate(candidate, [index]).status, 'create');
  assert.equal(deduplicate(candidate, [index, { ...candidate }]).status, 'already-present');
});
test('deduplication includes legacy Belarusian versions and preserves primary edited fields', () => {
  const legacy = { id: 'legacy', titleVersions: { be: candidate.title }, textVersions: { be: candidate.text }, tags: ['Набажэнства'] };
  assert.equal(deduplicate(candidate, [legacy]).status, 'already-present');
  assert.equal(prayerText({ text: 'Ручны тэкст', textVersions: { be: 'Стары тэкст' } }), 'Ручны тэкст');
  assert.equal(prayerTitle({ title: 'Ручная назва', titleVersions: { be: 'Старая назва' } }), 'Ручная назва');
});
test('contextual matching finds prayer bodies inside differently named collections and ignores index links', () => {
  const text = Array.from({ length: 80 }, (_, i) => `слова${i}`).join(' ');
  const candidate = { id: 'new', title: 'Адна малітва', text, textFormat: 'mybrev-markdown' };
  const result = contextualAudit([candidate], [
    { id: 'collection', title: 'Зусім іншая назва зборніка', textVersions: { be: `Уводзіны перад тэкстам. ${text} Завяршэнне пасля тэксту.` } },
    { id: 'index', title: 'Спіс', text: '[Адна малітва](https://example.test/prayer)' },
  ]);
  assert.equal(result[0].matches[0].id, 'collection');
  assert.equal(result[0].matches[0].candidateCoverage, 1);
  assert.equal(result[0].matches[0].embedded, true);
  assert.equal(result[0].matches[1].candidateCoverage, 0);
});
test('devotions category appears through existing tag menus and stays public', () => {
  const category = DEFAULT_CATEGORIES.find((c) => c.id === 'devotions');
  assert.deepEqual(category, { id: 'devotions', name: 'Набажэнствы', tags: ['Набажэнства'], order: 40, priestOnly: false });
  assert.equal(DEFAULT_CATEGORIES.filter((c) => c.name === category.name).length, 1);
  const menu = buildPrayerCategoryMenu([category], [{ name: category.name, tags: [] }], [], [candidate]);
  assert.equal(menu.length, 1);
  assert.equal(matchesPrayerTags(candidate.tags, menu[0].tags), true);
  assert.equal(prayerAccessPolicy([], [category]).prayerRestricted(candidate), false);
});
test('four static Hours resolve intended Sunday psalmody, whole canticles, alternatives and full local Pater', async () => {
  const prayers = [{ id: 'import-08-asnounyya-malitvy-na-pratsyagu-dnya', text: 'Ойча наш, поўны тэкст з лакальнай крыніцы; збаў нас ад злога. Амэн.' }];
  const hours = await buildDevotionHours({ root: ROOT, prayers });
  assert.equal(hours.length, 4);
  for (const hour of hours) {
    assert.deepEqual(hour.issues, []);
    assert.equal(hour.tags[0], 'Набажэнства');
    assert.match(hour.text, /Ойча наш, поўны тэкст/);
    assert.match(hour.text, /## Завяршэнне/);
    assert.doesNotMatch(hour.text, /from-first-week|from-day|data-alternative-title|SENTINEL|<p>/);
    assert.equal(hour.audit.currentDateDependency, false);
    assert.match(hour.text, /## Іншыя варыянты частак Гадзіны/);
    if (hour.id.endsWith('laudes')) { assert.match(hour.text, /Благаслаўлёны Пан, Бог Ізраэля/); assert.match(hour.text, /на шлях спакою/); }
    else { assert.match(hour.text, /Велічае душа мая Пана/); assert.match(hour.text, /Абрагаму і яго патомству навекі/); }
  }
  const marian = hours.find((h) => h.id === 'mybrev-devotion-blessed-virgin-mary-laudes');
  assert.equal(marian.audit.sundayWeek1Resolved, true);
  assert.match(marian.text, /Псальм 63/);
  assert.match(marian.text, /Псальм 149/);
  for (const n of [1, 2, 3]) assert.match(marian.audit.provenance[`laudesPs${n}`], /sunday-week-1/);
  const again = await buildDevotionHours({ root: ROOT, prayers });
  assert.deepEqual(again, hours);
  const missing = await buildDevotionHours({ root: ROOT, prayers: [] });
  assert.ok(missing.every((h) => h.issues.includes('missing-full-pater-noster')));
});
test('local DOCX is checked independently against Markdown when the supplied private package is available', async (context) => {
  const dir = fileURLToPath(new URL('../patchs/sources/catholicby-yearcycle/package/', import.meta.url));
  try { await fs.access(`${dir}/Гадзінкі.docx`); } catch { context.skip('Private user package is not committed'); return; }
  const audit = await readGadzinki(dir);
  assert.deepEqual(audit.issues, []);
  assert.deepEqual(audit.sections, GADZINKI_SECTIONS);
  assert.equal(audit.faithful, true);
  assert.equal(audit.lineCount, 281);
  assert.match(plainText(audit.text), /Молімся: Молiмся:/);
});
test('CLI validates arguments and apply rejects before contacting Firebase', async () => {
  assert.throws(() => parseArgs(['--snapshot']), /Missing value/);
  assert.throws(() => parseArgs(['--unsafe']), /Unknown argument/);
  assert.equal(parseArgs(['--html-dir', '.']).offline, true);
  await assert.rejects(applyPlan({}, { confirm: '', rightsReviewed: false }), /requires/);
  await assert.rejects(applyPlan({ databaseAudited: false }, { confirm: 'import-catholicby-yearcycle', rightsReviewed: true }), /audited snapshots/);
});

test('apply is atomic, creates only ready public candidates, preserves old documents and is idempotent', async () => {
  const state = new Map([['priestContentControl/state', { version: 3 }], ['prayers/old', { title: 'Ручны тэкст', text: 'Без зменаў' }]]);
  let writes = 0;
  const reference = (name) => ({ path: name });
  const db = { doc: reference, collection: (name) => ({ where: (field, _op, value) => ({ limit: () => ({ name, field, value }) }) }),
    async runTransaction(callback) {
      const staged = [];
      let hasWritten = false;
      const result = await callback({
        async get(ref) {
          assert.equal(hasWritten, false, 'all preflight reads occur before writes');
          if (!ref.path) return { empty: ![...state].some(([key, value]) => key.startsWith(`${ref.name}/`) && value[ref.field] === ref.value) };
          return { exists: state.has(ref.path), data: () => state.get(ref.path) };
        },
        create(ref, data) { hasWritten = true; assert.equal(state.has(ref.path), false); staged.push([ref.path, data]); },
        set(ref, data) { hasWritten = true; staged.push([ref.path, { ...state.get(ref.path), ...data }]); },
      });
      staged.forEach(([key, value]) => state.set(key, value)); writes += staged.length;
      return result;
    },
  };
  const admin = { credential: { cert: (a) => a }, initializeApp: () => ({ delete: async () => {} }),
    firestore: Object.assign(() => db, { FieldValue: { serverTimestamp: () => 'TEST_TIMESTAMP' } }) };
  const plan = { projectId: 'demo-yearcycle', databaseAudited: true, expectedControl: 3, catalog: { verified: true }, category: { status: 'create', candidate: { ...DEFAULT_CATEGORIES.at(-1), parentId: null, effectivePriestOnly: false } },
    entries: [{ status: 'create', candidate: { ...candidate, priestOnly: false, verified: false, textFormat: 'mybrev-markdown' } },
      { status: 'needs-review', title: 'Патрэбна праверка', candidate: { ...candidate, id: 'skip' } }] };
  const options = { confirm: 'import-catholicby-yearcycle', rightsReviewed: true };
  const dependencies = { admin, account: { project_id: 'demo-yearcycle' } };
  await assert.rejects(applyPlan(plan, options, { admin, account: { project_id: 'wrong-project' } }), /does not match/);
  const result = await applyPlan(plan, options, dependencies);
  assert.deepEqual(result.created, [candidate.id]);
  assert.equal(state.has('prayers/skip'), false);
  assert.deepEqual(state.get('prayers/old'), { title: 'Ручны тэкст', text: 'Без зменаў' });
  assert.equal(state.get('priestContentControl/state').version, 4);
  const firstWrites = writes;
  const again = await applyPlan(plan, options, dependencies);
  assert.equal(again.alreadyApplied, true);
  assert.equal(writes, firstWrites);
  const conflictPlan = { ...plan, expectedControl: 4, entries: [{ status: 'create', candidate: { ...plan.entries[0].candidate, id: 'different-id' } }] };
  await assert.rejects(applyPlan(conflictPlan, options, dependencies), /Category was created/);
  assert.equal(writes, firstWrites);
  await assert.rejects(applyPlan({ ...plan, expectedControl: 99 }, options, dependencies), /Content changed/);
});
