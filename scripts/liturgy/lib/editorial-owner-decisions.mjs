/** The owner's exact local decisions from PR245 #issuecomment-6876995850.
 * No fuzzy replacement or cross-season lookup; a field remains atomic. */
import fs from 'node:fs';
import { parse } from 'node-html-parser';
import { expandEditorialResponsories, editorialHash } from './editorial-responsories.mjs';
import { liturgicalText } from '../../../src/utils/liturgicalSourceHtml.js';
const rules=JSON.parse(fs.readFileSync(new URL('../sources/editorial-owner-decisions-v4.json',import.meta.url)));
const bySignature=new Map(rules.scopes.flatMap(r=>[[r.signature,r],...(r.correctedSignature?[[r.correctedSignature,r]]:[])]));
const pHtml=(node,body)=>`<p${node.rawAttrs?' '+node.rawAttrs:''}><span style="color: #ff0000;">Н.</span> ${body}</p>`;
export function expandOwnerApprovedResponses(html,field,allow){
 const before=String(html||''),initial=expandEditorialResponsories(before,field),paragraphs=parse(before).querySelectorAll('p');
 const edits=[],caseIds=new Set(),allowed=new Set(allow),touched=[],repeatOverrides=new Map();
 for(const block of initial.blocks){
  const rule=bySignature.get(block.signature);if(!rule)continue;
  rule.caseIds.forEach(id=>caseIds.add(id));allowed.add(block.signature);
  if(rule.initialU)repeatOverrides.set(block.signature,[null,rule.tailBodyHtml,null]);
  // Explicit Cyrillic/Latin review: this exact mixed-script word affects
  // the copied responses. Fix it only inside its reviewed local K/N block.
  const patch=new Map();
  if(rule.correctMixedScriptSource){
   for(const index of [...block.sourceParagraphs,...block.targetParagraphs]){
    const node=paragraphs[index],old=before.slice(...node.range);
    if(old.includes('cказала'))patch.set(index,{value:old.replaceAll('cказала','сказала'),reason:'owner-required-graph-review; Latin c → Cyrillic с in local source/copy'});
   }
  }
  for(const failure of initial.exceptions.filter(e=>e.signature===block.signature).flatMap(e=>e.checks||[])){
   const node=paragraphs[failure.targetParagraph],original=liturgicalText(node.innerHTML).replace(/^Н\.\s*/u,'');
   if(!rule.allowedAbbreviations.includes(original))continue;
   let body=failure.expectedHtml;
   if(rule.initialU)body=body.replace(/^([\s]*)([ўЎ])/u,'$1У');
   if(rule.correctMixedScriptSource)body=body.replaceAll('cказала','сказала').replaceAll('Cказала','Сказала');
   patch.set(failure.targetParagraph,{value:pHtml(node,body),reason:'explicit-owner-reply-decision'});
  }
  for(const[index,change]of patch){const node=paragraphs[index],old=before.slice(...node.range);edits.push({start:node.range[0],end:node.range[1],beforeHtml:old,afterHtml:change.value,beforeSha256:editorialHash(old),afterSha256:editorialHash(change.value),paragraph:index,reason:change.reason,signature:block.signature,caseIds:rule.caseIds});}
  touched.push(rule);
 }
 const seeded=[...edits].sort((a,b)=>b.start-a.start).reduce((text,e)=>text.slice(0,e.start)+e.afterHtml+text.slice(e.end),before);
 // The corrected source K changes the signature by exactly one grapheme.
 for(const block of expandEditorialResponsories(seeded,field).blocks){if(touched.some(r=>r.correctedSignature===block.signature))allowed.add(block.signature);}
 const final=expandEditorialResponsories(seeded,field,{allow:allowed,repeatOverrides});
 if(final.status==='needs-editor')return {...final,value:before,edits:[],ownerEdits:[],ownerCaseIds:[...caseIds],heldOwnerProposals:edits};
 return {...final,status:before===final.value?'already-full':'safe-auto',ownerEdits:edits,ownerCaseIds:[...caseIds],stages:[{before,after:seeded,edits},{before:seeded,after:final.value,edits:final.edits}]};
}
