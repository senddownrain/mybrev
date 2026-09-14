import test from 'node:test';
import assert from 'node:assert/strict';
import { transposeChord, transposeChordLine, songLines, filterSongs } from '../src/utils/songChords.js';
import { prepareSongs, SONG_SOURCE } from '../scripts/lib/song-import.mjs';
import { readFile } from 'node:fs/promises';
import { getSongTags, songCategoryIds, TAGS_LIST } from '../src/constants/songTags.js';

test('transposes roots, lowercase minors, suffixes and slash bass independently', () => {
  assert.equal(transposeChord('e', 2), 'f#');
  assert.equal(transposeChord('Am7', 2, 'standard'), 'Bm7');
  assert.equal(transposeChord('D/F#', -2), 'C/E');
  assert.equal(transposeChord('B♭', 2), 'C');
  assert.equal(transposeChord('Gsus4', 1, 'standard', 'flats'), 'Absus4');
  assert.equal(transposeChord('H7', 1), 'C7');
  assert.equal(transposeChord('Cmaj7', 2), 'Dmaj7');
  assert.equal(transposeChord('F#m7b5', 2, 'standard'), 'G#m7b5');
  assert.equal(transposeChord('d', 0, 'standard'), 'Dm');
  assert.equal(transposeChord('C', -12), 'C');
  assert.equal(transposeChord('слова', 2), 'слова');
});
test('legacy compact progressions transpose but chorus words and punctuation survive', () => {
  assert.equal(transposeChordLine('DG ea D/F# (B♭ A7)', 2), 'E A f# b E/G# (C B7)');
  assert.equal(transposeChordLine('Adonai, Adonai!\n. (x2) ›', 3), 'Adonai, Adonai!\n. (x2) ›');
  assert.equal(transposeChordLine('C7(b9) Dm7(b5) (G C)', 2, 'standard'), 'D7(b9) Em7(b5) (A D)');
});
test('lyrics and chord columns keep blank lines and overflow chord rows', () => {
  assert.deepEqual(songLines({ text: 'Першы\r\n\r\nТрэці', chord: 'C\n\nG\nAm' }), [{ text: 'Першы', chord: 'C' }, { text: '', chord: '' }, { text: 'Трэці', chord: 'G' }, { text: '', chord: 'Am' }]);
});
test('song search, tags and favorites combine, with pinned songs first', () => {
  const songs = [{ id: '1', title: 'А', text: 'Надзея', tags: ['Дух'] }, { id: '2', title: 'Б', text: 'Надзея', tags: ['Марыя'] }, { id: '3', title: 'В', text: 'Любоў', tags: ['Дух'] }];
  assert.deepEqual(filterSongs(songs, { favorites: ['3'] }).map((song) => song.id), ['3', '1', '2']);
  assert.deepEqual(filterSongs(songs, { query: 'НАДЗЕЯ', tags: ['Дух'], favorites: ['1'], favoritesOnly: true }).map((song) => song.id), ['1']);
  assert.deepEqual(filterSongs(songs, { query: 'Марыя' }).map((song) => song.id), ['2']);
});
test('import preserves duplicate titles and rows with stable IDs and source on every song', () => {
  const rows = [{ title: 'А', text: '1', chord: 'C' }, { title: 'А', text: '2', chord: 'D' }, { title: 'А', text: '1', chord: 'C' }];
  const songs = prepareSongs([{ type: 'table', name: 'sound_list', data: rows }]);
  assert.equal(new Set(songs.map((song) => song.id)).size, 3);
  assert.ok(songs.every((song) => song.source === SONG_SOURCE));
  assert.deepEqual(prepareSongs(rows), songs);
  assert.deepEqual(prepareSongs(songs), songs);
  assert.throws(() => prepareSongs([{ title: 'Empty', text: '' }]));
  assert.throws(() => prepareSongs([{ id: 'same', title: 'А', text: '1' }, { id: 'same', title: 'Б', text: '2' }]), /Duplicate document ID/);
});
test('initial songbook contains all 447 songs, unique IDs, text, numeric categories and attribution', async () => {
  const songs = JSON.parse(await readFile(new URL('../src/data/songs.json', import.meta.url), 'utf8'));
  assert.equal(songs.length, 447);
  assert.equal(new Set(songs.map((song) => song.id)).size, 447);
  assert.ok(songs.every((song) => song.text.trim() && song.source === SONG_SOURCE && Array.isArray(song.tags)));
  assert.ok(songs.every((song) => song.tag.every((id) => TAGS_LIST.some((category) => category.id === id))));
  assert.equal(songs.filter((song) => song.tag.includes(10)).length, 11);
  assert.ok(songs.filter((song) => song.tag.includes(10)).every((song) => song.tags.includes('Часткі Імшы')));
  assert.equal(filterSongs(songs, { tags: ['Часткі Імшы'] }).length, 11);
  assert.deepEqual(getSongTags(songs.find((song) => song.title === 'LAUDATE OMNES GENTES')), ['Эўхарыстычныя']);
});
test('numeric export categories map to names for display, search and filters', () => {
  assert.deepEqual(songCategoryIds('2,3,4'), [2, 3, 4]);
  assert.deepEqual(songCategoryIds(6), [6]);
  assert.deepEqual(songCategoryIds(['1', 1, '9', 99, '', 'bad']), [1, 9]);
  assert.deepEqual(songCategoryIds(''), []);
  assert.equal(TAGS_LIST.length, 10);
  assert.deepEqual(prepareSongs([{ title: 'Святы', text: 'Святы, святы', tag: '10' }])[0].tag, [10]);
  const song = prepareSongs([{ title: 'Песня', text: 'Тэкст', tag: '2,3,4' }])[0];
  assert.deepEqual(song.tag, [2, 3, 4]);
  assert.deepEqual(getSongTags(song), ['Эўхарыстычныя', 'Праслаўленне', 'Пакланенне']);
  assert.equal(filterSongs([song], { query: 'пакланенне' }).length, 1);
  assert.equal(filterSongs([song], { tags: ['Эўхарыстычныя'] }).length, 1);
  assert.equal(filterSongs([song], { tags: ['Калядныя'] }).length, 0);
});
