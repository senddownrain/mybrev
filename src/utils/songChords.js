import { getSongTags, songCategoryIds } from '../constants/songTags.js';

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const PITCH = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };
const CHORD = /^([A-Ha-h])([#♯b♭]?)(maj|min|sus|dim|aug|add|m|M|ø|°|\+|-)?(\d{0,2})(?:\([^\s()]*\))?(?:[#♯b♭]\d{1,2})*(?:\/([A-Ha-h])([#♯b♭]?))?$/;

function transposeRoot(root, accidental, steps, flats) {
  const offset = accidental === '#' || accidental === '♯' ? 1 : accidental === 'b' || accidental === '♭' ? -1 : 0;
  const notes = flats ? FLATS : SHARPS;
  return notes[((PITCH[root.toUpperCase()] + offset + steps) % 12 + 12) % 12];
}

export function transposeChord(chord, steps = 0, notation = 'lowercase', accidentalStyle = 'auto') {
  const match = chord.match(CHORD);
  if (!match) return chord;
  const [, root, accidental, quality = ''] = match;
  const minor = root === root.toLowerCase() || quality === 'm' || quality === 'min' || quality === '-';
  const flats = accidentalStyle === 'flats' || (accidentalStyle === 'auto' && /[b♭]/.test(accidental));
  let suffix = chord.slice(root.length + accidental.length);
  if (minor && /^(?:min|m(?!aj)|-)/.test(suffix)) suffix = suffix.replace(/^(?:min|m(?!aj)|-)/, '');
  suffix = suffix.replace(/\/([A-Ha-h])([#♯b♭]?)$/, (_, bass, bassAccidental) => `/${transposeRoot(bass, bassAccidental, steps, flats)}`);
  let note = transposeRoot(root, accidental, steps, flats);
  if (minor) note = notation === 'lowercase' ? note.toLowerCase() : `${note}m`;
  return note + suffix;
}

// Only transform complete chord runs. Words in the legacy chord column are lyrics,
// and must survive unchanged. Runs like DGea and D/F# are deliberately supported.
export function transposeChordLine(line, steps = 0, notation = 'lowercase', accidentalStyle = 'auto') {
  return line.replace(/[^\s[\],;|]+/g, (run) => {
    if (CHORD.test(run)) return transposeChord(run, steps, notation, accidentalStyle);
    const prefix = run.match(/^[(!]+/)?.[0] || '';
    const suffix = run.match(/[)!?.:]+$/)?.[0] || '';
    const middle = run.slice(prefix.length, suffix ? -suffix.length : undefined);
    if (CHORD.test(middle)) return prefix + transposeChord(middle, steps, notation, accidentalStyle) + suffix;
    const chords = middle.match(/[A-Ha-h][#♯b♭]?(?:(?:maj|min|sus|dim|aug|add|m|M)\d*|\d+)?(?:\([^\s()]*\))?(?:[#♯b♭]\d{1,2})*(?:\/[A-Ha-h][#♯b♭]?)?/g);
    if (!chords || chords.join('') !== middle || chords.some((chord) => !CHORD.test(chord))) return run;
    return prefix + chords.map((chord) => transposeChord(chord, steps, notation, accidentalStyle)).join(' ') + suffix;
  });
}

export function songLines(song = {}) {
  const lyrics = String(song.text || '').replace(/\r\n?/g, '\n').split('\n');
  const chords = String(song.chord || '').replace(/\r\n?/g, '\n').split('\n');
  return Array.from({ length: Math.max(lyrics.length, chords.length) }, (_, index) => ({ text: lyrics[index] || '', chord: chords[index] || '' }));
}

export function filterSongs(songs, { query = '', tags = [], favorites = [], favoritesOnly = false } = {}) {
  const needle = query.trim().toLocaleLowerCase();
  return songs.filter((song) => (!favoritesOnly || favorites.includes(song.id))
    && (!tags.length || tags.some((tag) => getSongTags(song).includes(tag)))
    && (!needle || [song.title, song.text, ...getSongTags(song)].some((value) => String(value || '').toLocaleLowerCase().includes(needle))))
    .sort((a, b) => Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)) || a.title.trim().localeCompare(b.title.trim(), 'be', { sensitivity: 'base' }));
}

export function normalizeSong(song) {
  return {
    title: String(song.title || '').trim(),
    text: String(song.text || '').replace(/\r\n?/g, '\n'),
    chord: String(song.chord || '').replace(/\r\n?/g, '\n'),
    tag: songCategoryIds(song.tag),
    tags: [...new Set((song.tags || []).map((tag) => String(tag).trim()).filter(Boolean))],
    source: String(song.source || '').trim(),
  };
}
