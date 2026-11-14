#!/usr/bin/env node
/** The five cases named in the supplied report, not a guessed selection. */
import fs from 'node:fs';
import { atPath, reviewLongResponses, buildLongResponseProposal, reviewHash } from './lib/manual-common-review.mjs';
import { printedEvidence } from './lib/manual-review-print-evidence.mjs';
const out='docs/audits/liturgical-common-texts-2026-11',report=out+'/manual-verification-first-pass.md',evidence=printedEvidence(process.cwd());
const selected=[
 ['01-06-sv-justin','officeOfReadingsR2','Н. Маё.'],
 ['03-07-sv-thomas-apostle','officeOfReadingsR2','Н. Вечнае.'],
 ['common-texts/blessed-virgin-mary','officeOfReadingsR2','Н. Яе беззаганнае.'],
 ['common-texts/office-for-dead','officeOfReadingsR2','Н. Бо калі.'],
 ['common-texts/church-dedication','officeOfReadingsR2','Н. Знемагае.'],
];
const cases=selected.map(([name,field,reply],index)=>{
 const file='patchs/feasts/'+name+'.json',originalHtml=atPath(JSON.parse(fs.readFileSync(file)),field),proposals=reviewLongResponses(originalHtml).filter(p=>p.originalReply===reply);
 if(proposals.length!==1)throw Error('Not a unique report case: '+name);
 const proposed=proposals[0],built=buildLongResponseProposal(originalHtml,proposed);
 const printSources=evidence.reply(proposed.lines[0]);
 const sourceHtml=[];
 if(name==='common-texts/office-for-dead'){
  const page='patchs/sources/lh-catholic-by/2026-11-02.html';
  if(fs.existsSync(page))sourceHtml.push({file:page,sha256:reviewHash(fs.readFileSync(page)),limitation:'Saved day source; this check does not attest a separately printed full final N.'});
 }
 return {id:'report-C-'+(index+1),file,field,sourceReport:{file:report,sha256:reviewHash(fs.readFileSync(report)),section:'C'},
  status:'candidate-for-source-preserving-expansion',sourceVerification:'existing-words-copy-verified',confidence:{textual:'high',independentFullReplyAttestation:false},
  originalHtml,proposedHtml:built.html,proposal:proposed,patch:built.range,beforeSha256:built.beforeSha256,afterSha256:built.afterSha256,
  printSources,otherSourceReferences:sourceHtml,
  verification:{uniqueMarkedRepeat:true,wholeWordPrefix:true,existingWordsOnly:proposed.copyProof.wordsFromOpeningOnly,
   otherSourceBytesUnchanged:built.html.slice(0,built.range.start)+originalHtml.slice(built.range.start,built.range.end)+built.html.slice(built.range.start+built.range.replacement.length)===originalHtml,
   alternativeCountUnchanged:(built.html.match(/data-alternative-title=|<hr\b/gu)||[]).length===(originalHtml.match(/data-alternative-title=|<hr\b/gu)||[]).length,
   printedTranscription:printSources.length?'matching opening response found':'proper/office-for-dead not covered by the three Common transcripts; canonical field remains the literal-copy source',
   applied:false,publishableAsAttestedFullText:false},
  decision:'Exact reconstruction proposal checked, not independently attested or activated. Preserve the current reading and every other variant; hold outside the publication subset.'};
});
if(cases.some(c=>!c.verification.otherSourceBytesUnchanged||!c.verification.alternativeCountUnchanged))throw Error('Unexpected source drift');
fs.writeFileSync(out+'/five-reconstruction-candidates.json',JSON.stringify({schema:1,sourceReport:report,checked:cases.length,verifiedExactCopies:cases.length,applied:0,cases},null,2)+'\n');
console.log(JSON.stringify({checked:cases.length,verifiedExactCopies:cases.length,applied:0,printMatches:cases.map(c=>({id:c.id,lines:c.printSources.length}))},null,2));
