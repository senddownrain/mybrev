import { createHash } from 'node:crypto';
import { normalizeSong } from '../../src/utils/songChords.js';

export const SONG_SOURCE = 'Супольнасць "Мы разам" holysong.ru';

export function prepareSongs(payload) {
  const rows = payload.find?.((entry) => entry.type === 'table' && entry.name === 'sound_list')?.data || payload;
  if (!Array.isArray(rows)) throw new Error('Expected song rows or a phpMyAdmin sound_list export.');
  const occurrences = new Map();
  const ids = new Set();
  return rows.map((row, index) => {
    if (!row || typeof row.title !== 'string' || typeof row.text !== 'string' || (row.chord !== undefined && typeof row.chord !== 'string')) throw new Error(`Invalid song at row ${index + 1}.`);
    const song = normalizeSong({ ...row, source: SONG_SOURCE });
    if (!song.title || !song.text.trim()) throw new Error(`Missing title or text at row ${index + 1}.`);
    const hash = createHash('sha256').update(JSON.stringify([song.title, song.text, song.chord])).digest('hex').slice(0, 20);
    const occurrence = (occurrences.get(hash) || 0) + 1;
    occurrences.set(hash, occurrence);
    const id = row.id || `holysongs-${hash}${occurrence > 1 ? `-${occurrence}` : ''}`;
    if (typeof id !== 'string' || !id || id.includes('/')) throw new Error(`Invalid document ID at row ${index + 1}.`);
    if (ids.has(id)) throw new Error(`Duplicate document ID at row ${index + 1}.`);
    ids.add(id);
    return { id, ...song };
  });
}
