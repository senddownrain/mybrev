import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';

import {
  BIBLE_BOOKS,
  BIBLE_LANGUAGES,
  getBibleBook,
  getBibleSourceLabel,
  getParallelBibleBook,
} from '../src/constants/bible.js';
import { bibleVerseKey, normalizeBibleVerse } from '../src/utils/bible.js';
import { buildMixedCorpus } from '../scripts/bible/upload-bible-bel-firestore.mjs';

const readSeed = (name) => JSON.parse(
  zlib.gunzipSync(fs.readFileSync(new URL(`../scripts/bible/${name}`, import.meta.url))).toString('utf8'),
).books;
const MIXED = readSeed('bible_seed_bel_mixed.json.gz');
const CHARNIAUSKI = readSeed('bible_seed_bel_charniauski.json.gz');
const mixedBook = (id) => MIXED.find((book) => book.id === id);
const mixedVerse = (id, chapter, num) => {
  const verses = mixedBook(id).chapters[chapter - 1].map(normalizeBibleVerse);
  return verses.find((verse) => verse.num === num)?.text;
};

test('Bible catalogues contain the expected canon sizes', () => {
  assert.equal(BIBLE_BOOKS.bel.length, 73);
  assert.equal(BIBLE_BOOKS.ru.length, 73);
  assert.equal(BIBLE_BOOKS.bel.filter((book) => book.testament === 'new').length, 27);
  assert.equal(BIBLE_BOOKS.ru.filter((book) => book.testament === 'new').length, 27);
  assert.ok(BIBLE_BOOKS.bel.every((book) => book.shortName.length <= 6));
  assert.ok(BIBLE_BOOKS.ru.every((book) => book.shortName.length <= 6));
});

test('Belarusian catalogue keeps 46 OT books and 27 NT books starting at Matthew', () => {
  const bel = BIBLE_BOOKS.bel;
  assert.equal(bel.filter((book) => book.testament === 'old').length, 46);
  assert.equal(bel.filter((book) => book.testament === 'new').length, 27);
  assert.equal(bel.findIndex((book) => book.testament === 'new'), 46);
  assert.equal(bel[46].id, 'mt');
  assert.equal(getBibleBook('bel', 'rom').chapterCount, 16);
  assert.equal(getBibleBook('bel', 'gal').chapterCount, 6);
});

test('Belarusian metadata no longer claims the whole Bible is Chernyavski', () => {
  assert.equal(BIBLE_LANGUAGES.bel.translation, 'Беларуская Біблія');
  assert.doesNotMatch(BIBLE_LANGUAGES.bel.translation, /Чарняўск/);
  assert.equal(
    getBibleSourceLabel('bel', 'old'),
    'Стары Запавет · пераклад кс. Уладзіслава Чарняўскага MIC',
  );
  assert.equal(getBibleSourceLabel('bel', 'new'), 'Новы Запавет · пераклад ККББ, 2017');
  assert.equal(getBibleSourceLabel('ru', 'new'), 'Синодальный перевод');
});

test('mixed Belarusian seed: Chernyavski OT unchanged, Catholic.by NT with 27 books', async () => {
  assert.equal(MIXED.length, 73);
  const catalogue = BIBLE_BOOKS.bel.map((book) => book.id);
  assert.deepEqual(MIXED.map((book) => book.id), catalogue);
  MIXED.forEach((book) => {
    assert.equal(book.chapters.length, getBibleBook('bel', book.id).chapterCount, book.id);
  });
  const charniauski = new Map(CHARNIAUSKI.map((book) => [book.id, book]));
  MIXED.slice(0, 46).forEach((book) => assert.deepEqual(book, charniauski.get(book.id), book.id));
  MIXED.slice(46).forEach((book) => {
    assert.equal(book.name, charniauski.get(book.id).name);
    assert.equal(book.order, charniauski.get(book.id).order);
    book.chapters.flat().forEach((verse) => {
      assert.ok(Number.isInteger(verse.num) && verse.text.trim(), book.id);
    });
  });
  // The committed artifact is exactly what the build/upload script produces.
  assert.deepEqual(await buildMixedCorpus(), MIXED);
});

test('New Testament text is Catholic.by, not Chernyavski', () => {
  assert.equal(mixedVerse('mt', 1, 1), 'Кніга радаводу Езуса Хрыста, сына Давіда, сына Абрагама.');
  assert.equal(
    mixedVerse('jn', 1, 14),
    'Слова сталася целам і пасялілася між намі, і ўбачылі мы славу Ягоную, славу, якую мае ад Айца Адзінародны, поўны ласкі і праўды.',
  );
  assert.equal(
    mixedVerse('jn', 1, 17),
    'Бо Закон быў дадзены праз Майсея, а ласка і праўда сталіся праз Езуса Хрыста.',
  );
  assert.equal(
    mixedVerse('lk', 1, 1),
    'Паколькі ўжо многія імкнуліся скласці апавяданне пра падзеі, якія адбыліся сярод нас,',
  );
  assert.equal(mixedVerse('lk', 1, 28), 'Анёл, увайшоўшы да Яе, сказаў: «Вітай, поўная ласкі, Пан з Табою».');
  // Chernyavski readings must not leak into the NT.
  assert.doesNotMatch(mixedVerse('mt', 1, 1), /Ісуса/);
  assert.doesNotMatch(mixedVerse('lk', 1, 28), /Радуйся/);
  // …while the OT stays Chernyavski.
  assert.equal(mixedVerse('gn', 1, 1), 'Спачатку стварыў Бог неба і зямлю.');
});

test('Catholic.by NT keeps canonical verse numbers and clean text', () => {
  const nums = (id, chapter) => mixedBook(id).chapters[chapter - 1].map((verse) => verse.num);
  assert.ok(!nums('mt', 17).includes(21));
  assert.ok(nums('mt', 17).includes(22));
  assert.ok(!nums('jn', 5).includes(4));
  assert.equal(mixedVerse('jn', 5, 5)?.startsWith('Быў там адзін чалавек'), true);
  assert.ok(nums('mk', 7).includes(17));
  assert.deepEqual(nums('mk', 9).slice(-7), [42, 43, 45, 47, 48, 49, 50]);
  assert.ok(nums('lk', 20).includes(32));
  assert.ok(nums('1co', 15).includes(36));
  assert.deepEqual(nums('acts', 8).slice(34, 37), [35, 36, 38]);
  assert.equal(mixedBook('rom').chapters[6][0].num, 1);
  assert.equal(mixedVerse('mt', 1, 3), 'Юда нарадзіў Фарэса і Зару ад Тамар. Фарэс нарадзіў Эзрома; Эзром нарадзіў Арама,');
  assert.equal(mixedVerse('mt', 1, 17)?.endsWith('чатырнаццаць пакаленняў.'), true);
  assert.equal(mixedVerse('1pe', 5, 14), 'Прывітайце адзін аднаго пацалункам любові. Спакой усім вам, якія трываеце ў Хрысце.');
  for (const book of MIXED.slice(46)) {
    for (const verse of book.chapters.flat()) {
      assert.doesNotMatch(verse.text, /[A-Za-z]/, `${book.id}: Latin letters in "${verse.text}"`);
      assert.doesNotMatch(verse.text, /©|Канферэнцыя Каталіцкіх Біскупаў/, book.id);
      assert.doesNotMatch(verse.text, /\d/, `${book.id}: digits in "${verse.text}"`);
    }
  }
});

test('Belarusian catalogue follows the Chernyavski translation for the OT', () => {
  assert.equal(getBibleBook('bel', 'tob').chapterCount, 14);
  assert.equal(getBibleBook('bel', 'sir').chapterCount, 51);
  assert.equal(getBibleBook('bel', 'dn').chapterCount, 14);
  assert.equal(
    getParallelBibleBook('ru', 'wis', 'bel').id,
    'wis',
  );
});

test('Russian catalogue includes the supplied extended chapters', () => {
  assert.equal(getBibleBook('ru', 'dn').chapterCount, 14);
  assert.equal(getBibleBook('ru', 'ps').chapterCount, 151);
  assert.equal(getBibleBook('ru', 'bar').chapterCount, 6);
});

test('parallel language navigation maps different Firestore ids', () => {
  assert.equal(getParallelBibleBook('bel', 'jn', 'ru').id, 'jo');
  assert.equal(getParallelBibleBook('ru', 'act', 'bel').id, 'acts');
  assert.equal(getParallelBibleBook('bel', 'jon', 'ru').id, 'jn');
});

test('bottom navigation labels use language-specific abbreviations', () => {
  assert.equal(getBibleBook('bel', '1ti').shortName, '1 Цім');
  assert.equal(getBibleBook('ru', '1tm').shortName, '1 Тим');
});

test('verse normalisation supports both stored schemas', () => {
  assert.deepEqual(normalizeBibleVerse('Тэкст', 2), { num: 3, text: 'Тэкст' });
  assert.deepEqual(normalizeBibleVerse({ num: 7, text: 'Тэкст' }, 0), { num: 7, text: 'Тэкст' });
  assert.deepEqual(normalizeBibleVerse({ verse: 4, text: 'Текст' }, 0), { num: 4, text: 'Текст' });
});

test('highlight keys remain isolated by language and location', () => {
  assert.equal(bibleVerseKey('bel', 'gn', 1, 1), 'bel:gn:1:1');
  assert.notEqual(bibleVerseKey('bel', 'gn', 1, 1), bibleVerseKey('ru', 'gn', 1, 1));
});
