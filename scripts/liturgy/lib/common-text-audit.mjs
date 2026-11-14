import fs from 'node:fs';
import { expandApprovedEditorial } from './editorial-policy.mjs';
import { isTwoLineVersicle } from './manual-common-review.mjs';
import { expandAttestedResponsories, RESPONSORY_ATTESTATIONS } from './attested-responsories.mjs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from 'node-html-parser';
import { liturgicalText, normalizeReadingHtml, removeMatchingPsalmAntiphons } from '../../../src/utils/liturgicalSourceHtml.js';
import { OFFICE_CONTENT_FIELDS } from '../../../src/constants/officeFields.js';

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const fields = new Set(OFFICE_CONTENT_FIELDS);
export function sourceResponseEvidence(root) {
  const evidence = new Map();
  for (const file of fs.readdirSync(path.join(root, 'patchs/sources/common-seasons')).filter(f => f.endsWith('.txt')).sort()) {
    fs.readFileSync(path.join(root, 'patchs/sources/common-seasons', file), 'utf8').split(/\r?\n/u).forEach((line, index) => {
      const match = /^\s*[–•]\s*(.+)$/u.exec(line);
      if (!match) return;
      const key = liturgicalText(match[1]);
      evidence.set(key, [...(evidence.get(key) || []), { file: `patchs/sources/common-seasons/${file}`, line: index + 1 }]);
    });
  }
  return evidence;
}

/** All nested seasons/main sections/alternative objects and rules, without
 * inventing inherited fields. Arrays are traversed with their exact paths. */
export function inventoryDocument(doc, prefix = [], rows = []) {
  if (!doc || typeof doc !== 'object') return rows;
  for (const [key, value] of Object.entries(doc)) {
    const fieldPath = [...prefix, key];
    if (fields.has(key)) rows.push({ path: fieldPath, field: key, value, container: doc,
      rule: prefix.includes('_fieldRules') || (value && typeof value === 'object') });
    if (value && typeof value === 'object') inventoryDocument(value, fieldPath, rows);
  }
  return rows;
}

export function inspectField(row, evidence = new Map()) {
  if (typeof row.value !== 'string' || row.rule || !row.value.includes('<')) return [];
  const before = row.value, field = row.field;
  const findings = [];
  let after = before;
  if (/Ps[123]$/u.test(field)) {
    const antField = field.replace(/Ps([123])$/u, 'Ant$1');
    const prefix = field.replace(/Ps[123]$/u, '');
    // A single antiphon can surround three psalms, only when all are present.
    const single = [1, 2, 3].every(n => row.container[`${prefix}Ps${n}`])
      && !row.container[`${prefix}Ant2`] && !row.container[`${prefix}Ant3`];
    const ant = row.container[antField] || (single ? row.container[`${prefix}Ant1`] : '');
    after = removeMatchingPsalmAntiphons(before, ant);
    if (after !== before) findings.push({ type: 'redundant-closing-antiphon', confidence: 'high', status: 'auto-safe',
      evidence: [`same document: ${antField}`, 'entire labelled ending paragraph equals dedicated antiphon; no liturgical words added'] });
    const remaining = parse(after).querySelectorAll('p').filter(p => /^(?:[123]\s*)?ант\./iu.test(liturgicalText(p.toString())));
    if (remaining.length) findings.push({ type: 'embedded-antiphon-needs-context', confidence: 'unconfirmed', status: 'manual-review',
      evidence: ['unequal/multiple/absent dedicated antiphon or non-closing paragraph; retained'] });
  }
  if (/^(?:laudes|vesper1?|sext[123])R$|^officeOfReadings(?:R[12]|Vers)$/u.test(field)) {
    after = normalizeReadingHtml(after);
    if (after !== before) findings.push({ type: 'reading-heading-or-responsory-lines', confidence: 'high', status: 'auto-safe',
      evidence: ['typography and explicit К./Н. boundaries only; abbreviated words retained'] });
    const attested = expandAttestedResponsories(after);
    after = attested.value;
    if (attested.proofs.length) findings.push({type:'source-attested-full-responsory',confidence:'high',status:'reviewed',evidence:attested.proofs.map(id=>RESPONSORY_ATTESTATIONS.find(r=>r.id===id))});
    const editorial = expandApprovedEditorial(after, field);
    after = editorial.value;
    if (editorial.value !== attested.value) findings.push({type:'editorial-display-expansion',confidence:'high',status:'owner-authorized',evidence:editorial.stages||editorial.edits});
    const text = liturgicalText(after);
    const short = [...text.matchAll(/(?:^|\s)([КН])\.\s+(.+?)(?=\s+[КН]\.?(?:\s|$)|$)/gu)]
      .filter(m => (m[1] === 'Н' && m[2].split(/\s/u).length <= 3) || /^Хвала Айцу\.?$/u.test(m[2]));
    if (short.length && !isTwoLineVersicle(after, field)
      && !(editorial.kind && editorial.status !== 'needs-editor' && editorial.blocks.length)) findings.push({ type: 'abbreviated-responsory', confidence: 'unconfirmed', status: 'manual-review',
      excerpts: short.map(m => `${m[1]}. ${m[2]}`),
      evidence: ['printed volumes also abbreviate responses; no independently verified full Belarusian reply available; no expansion'] });
  }
  if (/Inter$/u.test(field)) {
    const root = parse(before), paragraphs = root.querySelectorAll('p');
    const proof = [];
    paragraphs.forEach((p, index) => {
      const text = liturgicalText(p.toString());
      if (index < 2 || !/^\p{Ll}/u.test(text) || !/[,;:]$/u.test(liturgicalText(paragraphs[index-1].toString()))) return;
      const refs = evidence.get(text);
      if (!refs) return;
      p.innerHTML = `<span style="color: #ff0000;">–</span> ${p.innerHTML}`;
      proof.push(...refs);
    });
    if (proof.length) {
      after = root.innerHTML;
      findings.push({ type: 'missing-response-dash', confidence: 'high', status: 'reviewed', evidence: proof });
    }
    if (paragraphs.some(p => p.querySelector('br'))) findings.push({ type: 'line-broken-intercessions', confidence: 'structural', status: 'unchanged',
      evidence: ['Web splits existing br boundaries; content and punctuation retained; Dart must port classification'] });
  }
  return findings.map(finding => ({ ...finding, originalHtml: before, proposedHtml: after,
    beforeSha256: sha256(before), afterSha256: sha256(after) }));
}

export function repairCommonDocument(doc, evidence) {
  const after = JSON.parse(JSON.stringify(doc)), candidates = [];
  for (const row of inventoryDocument(after)) {
    const found = inspectField(row, evidence);
    if (!found.length) continue;
    let owner = after, documentId = after._id || after.id;
    for (const key of row.path.slice(0,-1)) { owner = owner?.[key]; if(owner?._id || owner?.id) documentId = owner._id || owner.id; }
    candidates.push(...found.map(item => ({ ...(documentId ? {documentId} : {}), field: row.path.join('.'), path: row.path, ...item })));
    row.container[row.field] = found[0].proposedHtml;
  }
  return { after, candidates };
}
