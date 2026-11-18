#!/usr/bin/env node
/** Validate editor JSON against current source/reply SHA and emit a local plan.
 * Applying this plan and rebuilding is a subsequent owner-directed pass. */
import fs from 'node:fs';
import { parse } from 'node-html-parser';
import { editorialHash } from './lib/editorial-responsories.mjs';
const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--decisions'||args[2]!=='--out')throw Error('Usage: --decisions <json> --out <new-local-plan.json>; no database writes');
const queue=JSON.parse(fs.readFileSync('docs/audits/liturgical-common-texts-2026-11/v3/exceptions.json')),input=JSON.parse(fs.readFileSync(args[1]));
if(input.schema!==3||input.sourceRevision!==queue.sourceRevision||!Array.isArray(input.decisions))throw Error('Wrong decision schema/revision');
const records=[],seen=new Set();
for(const d of input.decisions){const row=queue.cases.find(r=>r.caseId===d.caseId),reply=row?.replies.find(r=>r.replyId===d.replyId);if(!row||!reply||seen.has(d.replyId))throw Error('Unknown/duplicate reply');seen.add(d.replyId);
 const html=row.field.split('.').reduce((v,k)=>v?.[k],JSON.parse(fs.readFileSync(row.file))),paragraph=parse(html).querySelectorAll('p')[reply.paragraph];
 if(editorialHash(html)!==d.fieldSha||d.fieldSha!==row.fieldSha||d.paragraph!==reply.paragraph||d.replySha!==reply.replySha||!paragraph||editorialHash(paragraph.toString())!==d.replySha)throw Error('Changed field/reply SHA; review again');
 if(!['accept-proposal','keep-abbreviation','custom-text','defer'].includes(d.status)||d.status!=='defer'&&(!d.reason||typeof d.reason!=='string'))throw Error('Missing explicit decision/reason');
 const escape=s=>s.replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;');
 if(d.status==='custom-text'&&(typeof d.text!=='string'||!d.text.trim()||/[\r\n]/u.test(d.text)))throw Error('Custom decision needs one explicit reply text');
 records.push({...d,file:row.file,field:row.field,beforeHtml:paragraph.toString(),proposedBodyHtml:d.status==='accept-proposal'?reply.proposedBodyHtml:d.status==='custom-text'?escape(d.text):null,fieldHeld:row.replies.some(r=>!input.decisions.some(x=>x.replyId===r.replyId&&x.status!=='defer'))});
}
if(fs.existsSync(args[3]))throw Error('Output exists; preserve prior decision plan');
fs.writeFileSync(args[3],JSON.stringify({schema:3,state:'validated-editor-decisions-local-plan',network:false,sourceRevision:input.sourceRevision,records,next:'Apply only complete fields by exact paragraph ranges; retain source proof and user decisions, regenerate offline, rebuild union plan, tests. No production authorization is implied.'},null,2)+'\n');
console.log(JSON.stringify({decisions:records.length,unresolvedReplies:queue.cases.flatMap(r=>r.replies).filter(r=>!records.some(d=>d.replyId===r.replyId&&d.status!=='defer')).length}));
