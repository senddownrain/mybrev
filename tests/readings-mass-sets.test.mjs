import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LECTIONARY_PAGES } from '../scripts/liturgy/lib/lectionary-pages.mjs';
import { parseLectionaryPage, validateParsedPage } from '../scripts/liturgy/lib/lectionary-parser.mjs';
import { READING_SET_CELEBRATIONS, buildReadingsSetsMigration, setLabelOf } from '../scripts/liturgy/lib/readings-sets-plan.mjs';
import {
  collapseCoveredDocuments, defaultSetId, massReadingSetsOf, passionRoleCount, projectSetToLegacy,
  readingViewOfSet, sanitizeReadingHtml, sectionsForCycle, setCycles, validateMassReadings,
} from '../src/utils/massReadingSets.js';
import {
  buildSetsPayload, createSetsDraft, linkedProjectionUpdates, markupToPassion, passionToMarkup, setFromLegacy, validateSetsDraft,
} from '../src/utils/massReadingSetsEditor.js';
import { preferredReadingGroup } from '../src/utils/readingSetChoice.js';
import { hasReadingDocumentContent } from '../src/utils/parsedReadingsIdentity.js';
import { validateCollection } from '../scripts/content/lib/app-content.mjs';
import { resolveRuntimeDay, planReadings } from '../src/utils/ordo/runtime.js';
import { orderReadingsByPlan } from '../src/utils/ordo/readingsPlan.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = (key) => fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'catholicby', `${key}.html`), 'utf8');
const pages = Object.fromEntries(LECTIONARY_PAGES.map((page) => [page.key, fixture(page.key)]));

// Offline: minimal originals (the real migration reads the Firestore snapshot).
function stubDocs() {
  const docs = new Map();
  READING_SET_CELEBRATIONS.forEach((celebration) => {
    if (!celebration.create) docs.set(celebration.doc, { title: celebration.key, keepMe: 'unknown field' });
    (celebration.linked || []).forEach((link) => docs.set(link.doc, { title: link.doc, year: link.cycle || null, gospel: { bible: 'Мц 21, 1–11', text: 'Легасі тэкст Евангелля' } }));
  });
  docs.set('02-11-all-faithful-departed', {
    title: '2 лістапада — Успамін усіх памерлых вернікаў', _date: '02.11', _dayId: '02-11-all-faithful-departed',
  });
  return docs;
}
const migration = buildReadingsSetsMigration({ docs: stubDocs(), pages });
const after = (id) => migration.changes.find((change) => change.id === id)?.after;
const setsOf = (id) => massReadingSetsOf(after(id));
const bibles = (set, cycle, kind) => sectionsForCycle(set, cycle).filter((section) => section.kind === kind).map((section) => section.bible);

test('every special Lectionary page parses and passes the semantic validation', () => {
  for (const page of LECTIONARY_PAGES) {
    const parsed = parseLectionaryPage(pages[page.key]);
    assert.deepEqual(validateParsedPage(parsed), [], page.key);
    assert.deepEqual(parsed.warnings, [], page.key);
  }
  assert.deepEqual(migration.warnings, []);
});

test('15.08 Assumption: exactly vigil + day, default day, source labels', () => {
  const sets = setsOf('15-08-assumption-blessed-virgin-mary');
  assert.deepEqual(sets.map((set) => set.label), ['Св. Імша ў вігілію', 'Св. Імша ўдзень']);
  assert.equal(defaultSetId(sets), 'day');
  assert.deepEqual(bibles(sets[0], '', 'gospel'), ['Лк 11, 27–28']);
  assert.deepEqual(bibles(sets[1], '', 'gospel'), ['Лк 1, 39–56']);
  // Flat fields (released apps) = the day Mass, no vigil/day mix any more.
  const doc = after('15-08-assumption-blessed-virgin-mary');
  assert.equal(doc.reading1.bible, 'Ап 11, 19а; 12, 1–6а. 10аb');
  assert.equal(doc.gospel.bible, 'Лк 1, 39–56');
  assert.equal(doc.keepMe, 'unknown field');
  assert.ok(sets.every((set) => !/навячэр/iu.test(set.label)));
});

test('29.06 Peter and Paul: exactly vigil + day, default day', () => {
  const sets = setsOf('29-06-sv-peter-paul-apostles');
  assert.deepEqual(sets.map((set) => [set.id, set.label]), [['vigil', 'Св. Імша ў вігілію'], ['day', 'Св. Імша ўдзень']]);
  assert.equal(defaultSetId(sets), 'day');
  assert.equal(after('29-06-sv-peter-paul-apostles').gospel.bible, 'Мц 16, 13–19');
});

test('25.12 Christmas: exactly 3 sets with source labels, default day', () => {
  const sets = setsOf('25-12-naradzhenne-pana');
  assert.deepEqual(sets.map((set) => set.label), ['Св. Імша ўначы', 'Св. Імша на світанні', 'Св. Імша ўдзень']);
  assert.equal(defaultSetId(sets), 'day');
  assert.equal(after('25-12-naradzhenne-pana').gospel.bible, 'Ян 1, 1–18');
});

test('24.12: morning + evening (vigil) sets, default evening; legacy groups prefer the evening too', () => {
  const sets = setsOf('advent-24-12');
  assert.deepEqual(sets.map((set) => set.context), ['morning', 'vigil']);
  assert.equal(defaultSetId(sets), 'vigil');
  assert.equal(defaultSetId(sets.map(({ default: _default, ...set }) => set)), 'vigil', 'evening rule without an explicit default');
  assert.equal(after('advent-24-12').gospel.bible, 'Лк 1, 67–79', 'flat fields of the weekday document stay the morning Mass');
  assert.deepEqual(after('advent-24-12--christmas-vigil')._massReadingsRef, { doc: 'advent-24-12', set: 'vigil', projected: true });
  const morning = { key: 'm', documents: [{ id: 'advent-24-12' }] };
  const evening = { key: 'e', documents: [{ id: 'advent-24-12--christmas-vigil', _variant: 'christmas-vigil' }] };
  assert.equal(preferredReadingGroup([morning, evening]), evening);
  assert.equal(preferredReadingGroup([morning]), morning);
});

test('Palm Sunday: shared readings once, cycle-specific procession Gospel and Mass Passion', () => {
  const [procession, mass] = setsOf('feast-palmsunday');
  assert.equal(procession.context, 'procession');
  assert.equal(mass.default, true);
  assert.deepEqual(setCycles(procession), ['A', 'B', 'C']);
  assert.deepEqual(['A', 'B', 'C'].map((cycle) => bibles(procession, cycle, 'gospel')[0]), ['Мц 21, 1–11', 'Мк 11, 1–10', 'Лк 19, 28–40']);
  const shared = mass.sections.filter((section) => !section.cycle && section.kind !== 'rubric');
  assert.deepEqual(shared.map((section) => section.role), ['reading1', 'psalm', 'reading2', 'alleluia']);
  assert.equal(mass.sections.filter((section) => section.role === 'reading1').length, 1, 'no duplicated first reading');
  assert.deepEqual(['A', 'B', 'C'].map((cycle) => bibles(mass, cycle, 'gospel')), [['Мц 27, 11–54'], ['Мк 15, 1–39'], ['Лк 23, 1–49']]);
  for (const cycle of ['A', 'B', 'C']) {
    const passion = sectionsForCycle(mass, cycle).find((section) => section.kind === 'gospel').passion;
    assert.ok(passionRoleCount(passion) >= 3, `roles ${cycle}`);
  }
  assert.ok(mass.sections.some((section) => section.kind === 'rubric' && /Е\. — словы Хрыста/u.test(section.text)), 'role legend kept');
  // Released apps: the cycle documents keep a plain Passion with role markers.
  const legacyB = after('feast-palmsunday--B');
  assert.equal(legacyB.gospel.bible, 'Мк 15, 1–39');
  assert.match(legacyB.gospel.text, /^Ев\. /u);
  assert.doesNotMatch(legacyB.gospel.text, /ЕВАНГЕЛЛЕ/u);
  assert.equal(after('feast-palmsunday').reading1, undefined, 'the canonical document has no flat fields');
});

test('Holy Thursday: two Mass contexts, default the evening Mass of the Lord’s Supper', () => {
  const sets = setsOf('holyweek-w1-d5');
  assert.deepEqual(sets.map((set) => [set.context, set.label]), [['chrism', 'Св. Імша Хрызма'], ['evening', 'Св. Імша Вячэры Пана']]);
  assert.equal(defaultSetId(sets), 'evening');
  assert.equal(bibles(sets[1], '', 'gospel')[0], 'Ян 13, 1–15');
  assert.equal(after('holyweek-w1-d5').gospel.bible, 'Лк 4, 16–21');
});

test('Good Friday: one set, role-marked Passion preserved with its rubrics', () => {
  const [set] = setsOf('holyweek-w1-d6');
  const gospel = set.sections.find((section) => section.kind === 'gospel');
  const roles = new Set(gospel.passion.blocks.flatMap((block) => (block.runs || []).map((run) => run.role)));
  assert.deepEqual([...roles].sort(), ['christ', 'crowd', 'narrator', 'speaker']);
  assert.ok(gospel.passion.blocks.some((block) => block.type === 'rubric' && /на калені/u.test(block.text)));
  assert.ok(gospel.passion.blocks.some((block) => block.type === 'heading' && /Здрада і арышт/u.test(block.text)));
  assert.ok(!gospel.text, 'no flattened text next to the roles');
  // Round trip through the editor markup keeps every role.
  assert.deepEqual(markupToPassion(passionToMarkup(gospel.passion)), gospel.passion);
});

test('Easter Vigil: ordered multi-reading structure, rubrics and cycle Gospels', () => {
  const [set] = setsOf('holyweek-w1-d7--vigil');
  const order = set.sections.map((section) => (section.kind === 'rubric' ? 'rubric' : `${section.role}${section.cycle ? `/${section.cycle}` : ''}`));
  assert.deepEqual(order, [
    'rubric', 'reading1', 'psalm1', 'reading2', 'psalm2', 'reading3', 'psalm3', 'reading4', 'psalm4',
    'reading5', 'psalm5', 'reading6', 'psalm6', 'reading7', 'psalm7', 'rubric', 'epistle', 'psalm',
    'gospel/A', 'gospel/B', 'gospel/C',
  ]);
  const third = set.sections.find((section) => section.role === 'reading3');
  assert.equal(third.conclusion, '', 'no «Гэта слова Божае» after the Exodus reading');
  assert.match(third.rubrics[0], /Не гаворыцца/u);
  assert.match(set.sections[0].text, /дзевяць чытанняў/u);
  const legacyC = after('holyweek-w1-d7--C-vigil');
  assert.equal(legacyC.gospel.bible, 'Лк 24, 1–12');
  assert.equal(legacyC.reading7.bible, 'Эзх 36, 16–17а. 18–28');
  assert.equal(legacyC.epistle.bible, 'Рым 6, 3–11');
});

test('Pentecost: Saturday morning / evening vigil on Saturday, Sunday day Mass separate', () => {
  const saturday = setsOf('easter-w7-d7');
  assert.deepEqual(saturday.map((set) => set.context), ['morning', 'vigil']);
  assert.equal(defaultSetId(saturday), 'vigil');
  assert.equal(bibles(saturday[0], '', 'gospel')[0], 'Ян 21, 20–25');
  assert.equal(bibles(saturday[1], '', 'gospel')[0], 'Ян 7, 37–39');
  const sunday = setsOf('feast-pentecost');
  assert.equal(sunday.length, 1);
  assert.equal(bibles(sunday[0], '', 'gospel')[0], 'Ян 20, 19–23');
  assert.ok(!sunday[0].sections.some((section) => section.bible === 'Ян 7, 37–39'), 'vigil not mixed into Sunday');
  // The modern page and the old.catholic.by page carry the same vigil.
  const modern = parseLectionaryPage(pages['pentecost-vigil']).sets[0].sections.filter((section) => section.kind !== 'rubric');
  const old = parseLectionaryPage(pages['pentecost-vigil-old']).sets[0].sections.filter((section) => section.kind !== 'rubric');
  assert.deepEqual(old.map((section) => section.bible), modern.map((section) => section.bible));
});

test('Ascension: shared readings + A/B/C Gospel, no three identical documents', () => {
  const [set] = setsOf('feast-ascension');
  assert.equal(set.sections.filter((section) => section.role === 'reading1').length, 1);
  assert.deepEqual(['A', 'B', 'C'].map((cycle) => bibles(set, cycle, 'gospel')[0]), ['Мц 28, 16–20', 'Мк 16, 15–20', 'Лк 24, 46–53']);
  assert.equal(after('feast-ascension--B').psalm.bible, 'Пс 47 (46), 2–3. 6–7. 8–9 (Р.: 6)');
});

test('sequence is a first-class section: parse, project, edit round trip', () => {
  const [set] = setsOf('feast-eastersunday');
  const roles = set.sections.map((section) => section.role);
  assert.deepEqual(roles, ['reading1', 'psalm', 'reading2', 'sequence', 'alleluia', 'gospel']);
  const doc = after('feast-eastersunday');
  assert.match(doc.sequence.text, /^Ў радаснае свята Пасхальнай Ахвяры/u);
  const draft = createSetsDraft(doc);
  draft.sets[0].sections[3].text += '\nАмэн.';
  assert.deepEqual(validateSetsDraft(draft), []);
  const saved = buildSetsPayload(doc, draft);
  assert.match(saved.sequence.text, /Амэн\.$/u);
  assert.equal(saved.massReadings.sets[0].sections[3].kind, 'sequence');
  const pentecost = setsOf('feast-pentecost')[0];
  assert.ok(pentecost.sections.some((section) => section.kind === 'sequence' && /^1\. Божа, Дух Святы/u.test(section.text)));
});

test('reference-only sets: citations only, rendered as such, invisible to old apps', () => {
  for (const id of ['04-12-grodno-cathedral-dedication', '10-10-vitebsk-cathedral-dedication', '01-05-pinsk-cathedral-dedication']) {
    const doc = after(id);
    const [set] = massReadingSetsOf(doc);
    assert.equal(set.referenceOnly, true);
    assert.deepEqual(set.sections.map((section) => section.bible), ['Нм 8, 2–4а. 5–6. 8–10', 'Пс 119 (118), 129–130. 132–133. 135. 144', 'Эф 2, 19–22', 'Мц 16, 13–19']);
    assert.deepEqual(doc.reading1, { bible: 'Нм 8, 2–4а. 5–6. 8–10' }, `${id}: no text`);
    assert.equal(doc.alleluia, undefined);
    assert.equal(hasReadingDocumentContent(doc), true, 'the web shows it');
    const view = readingViewOfSet({ id, ...doc }, set, '');
    assert.equal(view._referenceOnly, true);
  }
  const lahishyn = massReadingSetsOf(after('22-08-our-lady-lahishyn-pinsk'))[0];
  const trakai = massReadingSetsOf(after('05-07-our-lady-trakai-grodno'))[0];
  assert.deepEqual(lahishyn.sections, trakai.sections);
  assert.deepEqual(lahishyn.sections[0].alternatives, [{ bible: 'Рым 12, 9–16аb' }]);
  assert.equal(lahishyn.sections.some((section) => section.kind === 'psalm'), false, 'no invented psalm');
  const withText = { schema: 1, sets: [{ ...lahishyn, sections: [{ ...lahishyn.sections[0], text: 'Выдуманы тэкст' }] }] };
  assert.match(validateMassReadings(withText).join(), /reference-only set carries text/);
});

test('Bonaventure, Clare and Andrew Bobola follow the Catholic.by pages', () => {
  assert.equal(after('15-07-sv-bonaventure').gospel.bible, 'Мц 23, 8–12');
  assert.equal(after('11-08-sv-clare').gospel.bible, 'Мц 19, 27–29');
  assert.equal(after('11-08-sv-clare').psalm.chorus, 'Ты, Пане, частка спадчыны маёй.');
  const bobola = after('16-05-sv-andrei-bobola');
  assert.equal(bobola.reading1.bible, 'Ап 12, 10–12а');
  assert.equal(massReadingSetsOf(bobola)[0].source.url, LECTIONARY_PAGES.find((page) => page.key === 'andrew-bobola').url);
  assert.deepEqual(after('16-05-sv-andrei-bobola-pinsk').gospel, bobola.gospel);
});

test('All Souls: 3 reading sets; on a Sunday 2 November the Mass readings are All Souls', () => {
  const doc = after('02-11-all-faithful-departed');
  const sets = massReadingSetsOf(doc);
  assert.deepEqual(sets.map((set) => set.label), ['Першая Імша', 'Другая Імша', 'Трэцяя Імша']);
  assert.equal(defaultSetId(sets), 'first');
  for (const date of ['2025-11-02', '2031-11-02']) {
    const resolved = resolveRuntimeDay(date, { diocese: 'minsk-mohilev' });
    const plan = planReadings(resolved);
    const ordered = orderReadingsByPlan(plan, [{ id: '02-11-all-faithful-departed', ...doc }], { includeAlternatives: true });
    assert.equal(ordered.length, 1, date);
    assert.equal(massReadingSetsOf(ordered[0]).length, 3, date);
  }
});

test('the Readings screen hides legacy documents covered by a canonical one', () => {
  const docs = [
    { id: 'feast-palmsunday', ...after('feast-palmsunday') },
    { id: 'feast-palmsunday--A', ...after('feast-palmsunday--A') },
    { id: 'other', title: 'x' },
  ];
  assert.deepEqual(collapseCoveredDocuments(docs).map((doc) => doc.id), ['feast-palmsunday', 'other']);
  assert.deepEqual(collapseCoveredDocuments(docs.slice(1)).map((doc) => doc.id), ['feast-palmsunday--A', 'other'], 'without the canonical document the legacy one stays');
});

test('editor: linked legacy documents follow an edited set; unknown fields kept', () => {
  const canonical = after('feast-ascension');
  const draft = createSetsDraft(canonical);
  const gospelB = draft.sets[0].sections.find((section) => section.cycle === 'B');
  gospelB.comment = 'Новы загаловак';
  const updates = linkedProjectionUpdates(draft, [{ id: 'feast-ascension--B', ...after('feast-ascension--B'), custom: 1 }]);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].data.gospel.comment, 'Новы загаловак');
  assert.equal(updates[0].data.custom, 1);
  const legacy = setFromLegacy({ reading1: { bible: 'Ап 1, 1', text: 'Тэкст чытання' }, gospel: { bible: 'Ян 1, 1', text: 'Тэкст Евангелля' } });
  assert.deepEqual(legacy.sections.map((section) => section.kind), ['reading', 'gospel']);
});

test('reading HTML is sanitized', () => {
  assert.equal(sanitizeReadingHtml('<p onclick="x()">Тэкст <script>alert(1)</script><em>курсіў</em><a href="javascript:x">спасылка</a></p>'), '<p>Тэкст <em>курсіў</em>спасылка</p>');
  assert.equal(sanitizeReadingHtml('<span class="rubric evil">Р.</span>'), '<span class="rubric">Р.</span>');
  assert.equal(sanitizeReadingHtml('Просты тэкст'), 'Просты тэкст');
});

test('app-content contract: canonical set documents are valid, broken sets refused', () => {
  const docs = migration.changes.map((change) => ({ id: change.id, ...change.after }));
  assert.deepEqual(validateCollection('readings', docs), []);
  const broken = [{ id: 'x', massReadings: { schema: 1, sets: [{ id: 'a', label: 'Імша навячэр’я', sections: [] }] } }];
  assert.match(validateCollection('readings', broken)[0].reason, /no sections/);
  assert.equal(setLabelOf('ІМША'), 'Св. Імша');
  assert.equal(setLabelOf('ПРАЦЭСІЯ З ПАЛЬМАМІ'), 'Працэсія з пальмамі');
});

test('reference projection of a single set keeps the cycle Gospel of the legacy document', () => {
  const [set] = setsOf('feast-ascension');
  assert.equal(projectSetToLegacy(set, 'C').gospel.bible, 'Лк 24, 46–53');
  assert.equal(projectSetToLegacy(set, 'X').gospel.bible, 'Мц 28, 16–20', 'unknown cycle falls back to the first');
});
