#!/usr/bin/env node
/** Follow-up on the frozen PR #245 queue. No corpus audit or live reads. */
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { printedEvidence } from './lib/manual-review-print-evidence.mjs';
import { atPath, isTwoLineVersicle, reviewLongResponses, reviewAntiphon, reviewHash } from './lib/manual-common-review.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'docs/audits/liturgical-common-texts-2026-11');
const args = process.argv.slice(2);
if (args.some(arg => !['--write', '--check'].includes(arg))) throw Error('Only --write or --check; no network/apply phase.');
const seed = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(out, 'manual-review-baseline-245.json.gz'))));
const printEvidence=printedEvidence(root);
const reportFile=path.join(out,'manual-verification-first-pass.md');
const five=JSON.parse(fs.readFileSync(path.join(out,'five-reconstruction-candidates.json')));
const docs = new Map();
const read = file => { if (!docs.has(file)) docs.set(file, JSON.parse(fs.readFileSync(path.join(root, file)))); return docs.get(file); };
const records = seed.cases.map((item, index) => {
  const doc = read(item.file), originalHtml = atPath(doc, item.field), keys = item.field.split('.'), field = keys.pop();
  const container = keys.reduce((value, key) => value?.[key], doc);
  const record = { caseId: `PR245-${String(index + 1).padStart(3, '0')}`, ...item,
    source: { file: item.file, field: item.field, revision: 'dd1a20d4fdac8ea83e4e244728091077a5a1f9f2', sha256: reviewHash(originalHtml) },
    originalHtml, proposedHtml: originalHtml, verification: { sourceHashMatchesInitialQueue: reviewHash(originalHtml) === item.beforeSha256 } };
  if (!record.verification.sourceHashMatchesInitialQueue) throw Error(`Changed source ${item.file} ${item.field}`);
  if (item.type === 'abbreviated-responsory') {
    if (isTwoLineVersicle(originalHtml, field)) return { ...record, status: 'false-positive', confidence: 'high',
      classification: 'two-line-versicle',
      ...(item.file.endsWith('/common-texts/martyrs-many.json')&&['sext3R','_seasonalVariants.lent.sext3R'].includes(item.field)?{markerVerification:{reported:'К .',actual:'К.',requiresChange:false,reason:'The frozen PR source already has К.; no extra text/marker edit is needed.'}}:{}),
      decision: 'Remove from the abbreviated-responsory queue. Preserve both lines exactly; no doxology or four additional replies.',
      verification: { ...record.verification, result: 'passed', basis: ['field liturgical function', 'exactly K/N without short-responsory heading', 'submitted first-pass report, section A: 17 two-line cases'] } };
    const longResponses = /^officeOfReadingsR[12]$/u.test(field) ? reviewLongResponses(originalHtml) : [];
    const selected=five.cases.filter(c=>c.file===item.file&&c.field===item.field);
    const sourceVerified=item.file.endsWith('/common-texts/apostles.json')&&['vesper1R','vesperR'].includes(item.field);

    return { ...record, status: 'manual-review', confidence: longResponses.some(r => r.proposedReply) ? 'high-textual-only' : 'unconfirmed',
      classification: /^officeOfReadingsR[12]$/u.test(field) ? (longResponses.length ? 'long-responsory' : 'long-responsory-unresolved-structure') : 'short-responsory', longResponses,
      sourceStatus:sourceVerified?'source-verified-abbreviated':'canonical-source-preserved; full-display-readiness-unresolved',
      ...(sourceVerified?{transcriptionReferences:(item.excerpts||[]).map(text=>({text,sources:printEvidence.reply(text)}))}:{}),
      requestedReconstructions:selected.map(c=>({id:c.id,status:c.status,sourceVerification:c.sourceVerification,proofFile:'five-reconstruction-candidates.json',applied:false})),
      decision: longResponses.some(r => r.proposedReply) ? 'Exact existing-word continuation proposed per local repeat. The five submitted examples have separate checked copy proofs; no independent full-text attestation or editorial activation is inferred.' : 'Retain source. No unambiguous supported full response established.',
      verification: { ...record.verification, result: longResponses.some(r => r.proposedReply) ? 'literal-copy-proof-passed; liturgical-review-pending' : 'no-safe-reconstruction-established',
        noTextChanged: true } };
  }
  const antField = field.replace(/Ps([123])$/u, 'Ant$1'), dedicatedHtml = container[antField] ?? doc[antField] ?? '';
  const reviewed = reviewAntiphon(originalHtml, dedicatedHtml);
  const printSources={dedicated:printEvidence.antiphon(reviewed.separate),embedded:reviewed.embedded.map(p=>({text:p.text,sources:printEvidence.antiphon(p.text)}))};
  if(reviewed.classification==='printed-text-variant'&&(!printSources.dedicated.length||printSources.embedded.some(p=>!p.sources.length)))throw Error('Printed variant lacks transcription proof: '+item.file+' '+item.field);
  return { ...record, ...reviewed, dedicatedField: [...keys, antField].join('.'), dedicatedHtml, printedSources:printSources,
    verification: { ...record.verification, result: 'passed', noTextChanged: true,
      basis: ['complete ordered word comparison', 'HTML paragraph/alternative ownership', 'case, punctuation and cadence compared separately from lexical variants'] } };
});
const pending = records.filter(r => r.status === 'manual-review');
const counts = { requestedReconstructionsChecked:five.checked, verifiedSourceCopyCandidates:five.verifiedExactCopies, initial: records.length, falsePositives: records.filter(r => r.status === 'false-positive').length,
  twoLineVersicles: records.filter(r => r.classification === 'two-line-versicle').length,
  ownedAlternativeAntiphons: records.filter(r => r.classification === 'owned-alternative-antiphons').length,
  confirmed: records.filter(r => r.status === 'confirmed').length,
  formattingOnlyAntiphons: records.filter(r => r.classification === 'formatting-only').length,
  printedTextVariants: records.filter(r => r.classification === 'printed-text-variant').length,
  unresolvedFields: pending.length, existingWordProposals: records.reduce((n, r) => n + (r.longResponses?.filter(p => p.proposedReply).length || 0), 0),
  appliedReconstructions: 0, contentFieldsChanged: 0 };
if (counts.initial !== counts.falsePositives + counts.confirmed + counts.unresolvedFields) throw Error('Queue accounting does not balance');
const output = { schema: 2, scope: 'Only the 500 frozen PR #245 manual cases; original audit was not repeated.',
  attachment: { available: true, file:'manual-verification-first-pass.md', sha256:reviewHash(fs.readFileSync(reportFile)), status:'Submitted report received and checked against the frozen sources. Its findings are evidence, not independent authorization or a photographed-book/full-response attestation.' },
  counts, cases: records };
const queue = { schema: 2, policy: 'Do not infer liturgical words. Closed cases and all per-case evidence are preserved in manual-review-followup.json.gz.',
  counts, closedCases: records.filter(r => r.status !== 'manual-review').map(r => ({caseId:r.caseId,file:r.file,field:r.field,status:r.status,classification:r.classification})), cases: pending.map(({originalHtml: _originalHtml, proposedHtml: _proposedHtml, longResponses, ...item}) => ({...item, evidenceRecord:'manual-review-followup.json.gz#'+item.caseId, proposalCount:(longResponses||[]).filter(p=>p.proposedReply).length})) };
if (args.includes('--write')) {
  fs.writeFileSync(path.join(out, 'manual-review-followup.json.gz'), zlib.gzipSync(JSON.stringify(output)+'\n',{level:9}));
  fs.writeFileSync(path.join(out, 'manual-review.json'), JSON.stringify(queue, null, 2) + '\n');
}
if (args.includes('--check')) {
  if (zlib.gunzipSync(fs.readFileSync(path.join(out, 'manual-review-followup.json.gz'))).toString() !== JSON.stringify(output) + '\n') throw Error('Follow-up report is stale');
  if (fs.readFileSync(path.join(out, 'manual-review.json'), 'utf8') !== JSON.stringify(queue, null, 2) + '\n') throw Error('Manual queue is stale');
}
console.log(JSON.stringify(counts, null, 2));
