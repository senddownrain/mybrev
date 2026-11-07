export const TEXT_ALIGNMENTS = Object.freeze(['start', 'justify']);
export const normalizeTextAlignment = value => TEXT_ALIGNMENTS.includes(value) ? value : 'start';
