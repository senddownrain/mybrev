// Synthetic corpus (invented text, no book content) in the parser's blocks/runs shape.
const INK = '#231f20'; const RED = '#ed008c';
export const run = (text, extra = {}) => ({ text, color: INK, ...extra });
export const block = (type, text, extra = {}) => ({ type, text, alignment: 'left', indentLevel: 0, speaker: null, runs: extra.runs || [run(text)], sourceLoc: { pdfPage: 1, printedPage: 10 }, semantic: extra.semantic || null, readingOrder: 1 });

export function litanyEntry(id, title, { sourceId = 'litanies_novenas_chaplets_2024', kind = 'litany', status = 'complete', extra = [], saint = 'Юзафе' } = {}) {
  return { entryId: id, sourceId, title, sourcePrintedHeading: title, kind, type: kind, status, qaFlags: status === 'complete' ? [] : [{ severity: 'review', reason: 'fixture flag' }], crossReferences: [], source: {}, blocks: [
    block('heading', title, { semantic: { level: 1 }, runs: [run(title, { bold: true })] }),
    block('invocation', 'Кірые, элейсон,'),
    block('response', 'Хрыстэ, элейсон.', { runs: [run('Хрыстэ, элейсон.', { italic: true })], semantic: { role: 'people' } }),
    block('invocation', `Святы ${saint}, — маліся за нас.`, { runs: [run(`Святы ${saint}, `), run('— маліся за нас.', { italic: true })], semantic: { spaceBefore: true } }),
    block('invocation', 'Апекуне Святой Сям’і, — маліся за нас.', { runs: [run('Апекуне Святой Сям’і, '), run('— маліся за нас.', { italic: true })] }),
    block('rubric', 'Просьбы прамаўляе кантар.', { runs: [run('Просьбы прамаўляе кантар.', { color: RED })] }),
    block('dialogue', `К.: Святы ${saint},`, { speaker: 'К.', semantic: { label: 'К.:' } }),
    block('dialogue', 'Н.: маліся за нас.', { speaker: 'Н.' }),
    block('prayer', 'Молімся: Божа, дай нам заступніцтва.', { runs: [run('Молімся: ', { bold: true }), run('Божа, дай нам заступніцтва.')], semantic: { spaceBefore: true } }),
    block('paragraph', Array.from({ length: 24 }, (_, i) => `${id.replace(/\W/g, '')}слова${i}`).join(' ')), // unique filler so entries differ
    ...extra,
  ] };
}
export function corpusOf(entries) {
  const index = entries.map((entry) => ({ entryId: entry.entryId, sourceId: entry.sourceId, title: entry.title, kind: entry.kind, status: entry.status, pdfPageStart: 1, pdfPageEnd: 2, printedPageStart: 10, printedPageEnd: 11, members: entry.members || null }));
  return { index, readEntry: (meta) => entries.find((entry) => entry.entryId === meta.entryId), sourceHashes: { litanies_novenas_chaplets_2024: 'a'.repeat(64), our_father_weekly: 'b'.repeat(64), rite_penance: 'c'.repeat(64) } };
}
export const SOURCES = { sources: {
  litanies_novenas_chaplets_2024: { book: '«Прасіце і атрымаеце» (Мінск, 2024)', copyrightNotices: ['© Выдавецтва «Про Хрысто», 2024'] },
  our_father_weekly: { book: '«Ойча наш», 5-е выданне (Мінск, 2022)', copyrightNotices: ['© Камісія Божага Культу і Дысцыпліны Сакрамэнтаў, 2022'] },
  rite_penance: { book: '«Парадак пакаяння» (Мінск, 2016)', copyrightNotices: ['© Канферэнцыя Каталіцкіх Біскупаў Беларусі, 2016'] },
} };
