/**
 * D-2: the stored Marian Common merges two sections of Volume III into one field: the main Common of the Blessed
 * Virgin Mary (for her feasts and memorials) and «УСПАМІН НАЙСВ. ПАННЫ МАРЫІ Ў СУБОТУ» (the optional Saturday
 * memorial of Ordinary Time, whose own texts and alternatives follow the main ones in the stored field).
 *
 * Nothing is deleted. For every field of that Common this module finds, in the stored blocks, the PREFIX that is
 * the main section of Volume III (the smallest prefix that contains ≥ 97 % of the words of the volume's main
 * section; the prefix must hold nothing else: ≥ 99 % of its words are the volume's) and stores that prefix as
 * `_mainSection[field]`. The assembler shows it for every celebration of the Common except the Saturday memorial
 * itself, which keeps the whole merged field. A field that cannot be split proven is not listed (it stays whole).
 */
import { comparableText } from './fields.mjs';
import { htmlToPlain, splitBlocks } from './html.mjs';
import { lcsLength, tokensOf } from './compare.mjs';

export const MAIN_SECTION_FIELD = '_mainSection';
/** Commons whose stored fields merge a main section with a Saturday memorial section. */
export const SATURDAY_COMMONS = Object.freeze(['blessed-virgin-mary']);

const RECALL = 0.97;
const PRECISION = 0.99;

const blocksOf = (value) => (Array.isArray(value) ? value : [value]).flatMap((item) => splitBlocks(item));
const isSpacer = (html) => /^\s*$/.test(htmlToPlain(html)) || /^\s*<hr\s*\/?>\s*$/i.test(html);

/** @returns {{ fields: Record<string,string>, report: object[] }} */
export function mainSectionsOf(corpus, commonId) {
  const base = corpus.base.get(commonId);
  const entry = corpus.volumes.III.commons.get(commonId);
  const fields = {};
  const report = [];
  if (!base || !entry) return { fields, report };
  for (const [field, units] of entry.fields) {
    const saturday = units.some((unit) => unit.section === 'saturday');
    const main = units.filter((unit) => unit.section !== 'saturday');
    const value = base[field];
    if (!saturday || !main.length || !value || (Array.isArray(value) && !value.length)) continue;
    const mainTokens = tokensOf(comparableText(main, null) || '');
    const blocks = blocksOf(value);
    const tokens = blocks.map((block) => tokensOf(htmlToPlain(block)));
    let result = null;
    for (let k = 1; k <= blocks.length; k += 1) {
      const prefix = tokens.slice(0, k).flat();
      if (!prefix.length) continue;
      const common = lcsLength(prefix, mainTokens);
      const recall = mainTokens.length ? common / mainTokens.length : 0;
      if (recall >= RECALL) { result = { k, recall, precision: common / prefix.length, words: prefix.length }; break; }
    }
    const row = { common: commonId, field, volumeMainWords: mainTokens.length, storedWords: tokens.flat().length };
    if (!result || result.precision < PRECISION) {
      report.push({ ...row, split: false, reason: result ? `the prefix holds words that the main section does not print (precision ${result.precision.toFixed(3)})` : 'the main section is not found as a prefix of the stored field' });
      continue;
    }
    let end = result.k;
    while (end > 0 && isSpacer(blocks[end - 1])) end -= 1;
    const html = blocks.slice(0, end).join('\n');
    if (html === (Array.isArray(value) ? value.join('\n') : value)) {
      report.push({ ...row, split: false, reason: 'the stored field is already the main section only' });
      continue;
    }
    fields[field] = html;
    report.push({ ...row, split: true, mainBlocks: end, storedBlocks: blocks.length, recall: Number(result.recall.toFixed(3)), precision: Number(result.precision.toFixed(3)) });
  }
  return { fields, report };
}
