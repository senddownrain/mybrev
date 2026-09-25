import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { buildCompendium, parseIndexPage, parsePartPage, COMPENDIUM_SOURCE_URL } from '../scripts/lib/compendium-parser.mjs';
import { scanLines } from '../scripts/lib/compendium-html.mjs';
import { validateCompendiumDataset } from '../src/utils/compendiumData.js';

const sourceDir = new URL('../scripts/compendium-source/', import.meta.url);
const readSource = (name) => readFileSync(new URL(name, sourceDir), 'utf8');
const dataset = JSON.parse(readFileSync(new URL('../src/data/compendium/compendium.json', import.meta.url), 'utf8'));
const questions = dataset.units.flatMap((unit) => unit.questions);
const collapse = (text) => text.replace(/\s+/g, ' ').trim();

function parseCachedSource() {
  const files = readdirSync(sourceDir);
  const index = parseIndexPage(readSource('3963-kampendyj-katekhizisa-katalitskaga-kastsjola.html'));
  const parts = index.parts.map((part) => parsePartPage(readSource(files.find((file) => file.startsWith(`${part.sourcePageId}-`))), part));
  return { index, parts };
}

test('committed dataset is exactly what the parser produces from the cached source', () => {
  const { index, parts } = parseCachedSource();
  const { dataset: rebuilt, report } = buildCompendium({ index, parts, previous: dataset });
  rebuilt.meta.updatedAt ??= dataset.meta.updatedAt;
  assert.deepEqual(rebuilt, dataset, 'Run `npm run compendium:build` after changing the parser or source cache.');
  // Only the creeds heading of Part I links to unnumbered text; it is intentionally absent.
  assert.deepEqual(report.unmatchedTocEntries.map((entry) => entry.title), ['Веру: Апостальскі сімвал веры і Нікейска-Канстанцінопальскі сімвал веры']);
  assert.deepEqual(report.skippedBlocks.map((block) => block.text.split('\n')[0]), ['Апостальскі сімвал веры', 'Хрост', 'Кніга Зыходу', 'Ойча наш']);
});

test('all 598 questions are present exactly once, in order, without gaps', () => {
  assert.deepEqual(validateCompendiumDataset(dataset), []);
  assert.equal(questions.length, 598);
  assert.deepEqual(questions.map((question) => question.number), Array.from({ length: 598 }, (_, index) => index + 1));
  assert.equal(new Set(questions.map((question) => question.id)).size, 598);
  assert.equal(questions[0].id, 'q001');
  assert.equal(questions.at(-1).id, 'q598');
  assert.equal(dataset.meta.questionCount, 598);
});

test('hierarchy follows the four official parts and their question ranges', () => {
  assert.deepEqual(dataset.parts.map((part) => part.title), ['ВЫЗНАННЕ ВЕРЫ', 'ЦЭЛЕБРАЦЫЯ ХРЫСЦІЯНСКАЙ ТАЯМНІЦЫ', 'ЖЫЦЦЕ Ў ХРЫСЦЕ', 'ХРЫСЦІЯНСКАЯ МАЛІТВА']);
  const range = (partNumber) => {
    const numbers = questions.filter((question) => dataset.units.find((unit) => unit.questions.includes(question)).partNumber === partNumber).map((question) => question.number);
    return [numbers[0], numbers.at(-1)];
  };
  assert.deepEqual([1, 2, 3, 4].map(range), [[1, 217], [218, 356], [357, 533], [534, 598]]);
  const unit = (id) => dataset.units.find((item) => item.id === id);
  assert.equal(unit('p2-s2-ch1').topics[0].title, 'САКРАМЭНТ ХРОСТУ');
  assert.equal(unit('p3-s2-ch2').topics[1].title, 'ПЯТАЯ ЗАПАВЕДЗЬ: НЕ ЗАБIВАЙ');
  assert.equal(unit('p2-s1-ch2').topics[0].parentTitle, 'ЦЭЛЕБРАЦЫЯ ЛIТУРГII КАСЦЁЛА');
  assert.ok(dataset.units.length >= 20 && dataset.units.length <= 40, 'tens of Firestore documents, not hundreds');
});

test('no introductory material or unnumbered texts leak into questions', () => {
  const allText = questions.map((question) => `${question.question}\n${question.answer}`).join('\n');
  for (const marker of ['Motu proprio', 'УВОДЗІНЫ', 'Symbolum', 'Credo in', 'Pater noster', 'Кніга Зыходу', 'Septem Ecclesiae']) {
    assert.ok(!allText.includes(marker), marker);
  }
  assert.equal(questions[0].question, 'Які Божы намер адносна чалавека?');
  assert.ok(questions.every((question) => question.cccRefs.length > 0));
});

test('question, answer and citation texts are verbatim source text', () => {
  const { index } = parseCachedSource();
  const sourceText = collapse(index.parts.map((part) => {
    const file = readdirSync(sourceDir).find((name) => name.startsWith(`${part.sourcePageId}-`));
    return scanLines(readSource(file)).map((line) => line.text).join(' ');
  }).join(' '));
  for (const question of questions) {
    assert.ok(sourceText.includes(collapse(`${question.number}. ${question.question}`)), `question ${question.number}`);
    for (const paragraph of question.answer.split(/\n+/)) assert.ok(sourceText.includes(collapse(paragraph)), `answer ${question.number}`);
    for (const citation of question.citations || []) assert.ok(sourceText.includes(collapse(citation.text)), `citation after ${question.number}`);
  }
});

test('source attribution and copyright notices are kept', () => {
  assert.equal(dataset.meta.sourceUrl, COMPENDIUM_SOURCE_URL);
  assert.equal(dataset.meta.sourceHost, 'Catholic.by');
  assert.equal(dataset.meta.sourceTitle, 'Кампендый Катэхізіса Каталіцкага Касцёла');
  assert.deepEqual(dataset.meta.copyright, ['© Copyright 2005 — Libreria Editrice Vaticana', '© Канферэнцыя Каталіцкіх Біскупаў у Беларусі, 2010']);
});

test('validator reports gaps, duplicates and broken order', () => {
  const clone = () => JSON.parse(JSON.stringify(dataset));
  const gap = clone();
  gap.units[3].questions.splice(1, 1);
  assert.ok(validateCompendiumDataset(gap).some((error) => /gap|expected number/i.test(error)));
  const duplicate = clone();
  duplicate.units[0].questions.push({ ...duplicate.units[0].questions[0] });
  assert.ok(validateCompendiumDataset(duplicate).length > 0);
  const intro = clone();
  intro.units[0].questions[0].answer = 'Motu proprio';
  assert.ok(validateCompendiumDataset(intro).some((error) => /introductory/.test(error)));
});
